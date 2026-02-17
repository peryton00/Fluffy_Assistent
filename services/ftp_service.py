"""
FTP Server Service for Fluffy
Provides secure file sharing over local network with activity logging
"""

import os
import sys
import socket
import secrets
import string
import threading
import json
import time
from datetime import datetime
from typing import Optional, Dict, List, Any
from pyftpdlib.authorizers import DummyAuthorizer
from pyftpdlib.handlers import FTPHandler
from pyftpdlib.servers import FTPServer

# Add parent directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

# Global server state
_server: Optional[FTPServer] = None
_server_thread: Optional[threading.Thread] = None
_server_lock = threading.Lock()
_current_password: Optional[str] = None
_current_ip: Optional[str] = None
_is_running = False
_connected_clients: List[Dict[str, Any]] = []
_transfer_sessions: Dict[str, Dict[str, Any]] = {}  # Track active transfers per client IP
_speed_calc_thread: Optional[threading.Thread] = None
_speed_calc_running = False

# Configuration
FTP_PORT = 2121
FTP_USERNAME = "fluffy"
PASSIVE_PORTS = (60000, 65535)
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHARED_DIR = os.path.join(PROJECT_ROOT, "FluffyShared")
LOG_FILE = os.path.join(PROJECT_ROOT, "services", "logs", "ftp_logs.json")

# Ensure shared directory exists
os.makedirs(SHARED_DIR, exist_ok=True)
os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)


def get_local_ip() -> str:
    """
    Detect local network IP address.
    
    Returns:
        Local IP address string (e.g., "192.168.1.100")
    """
    try:
        # Create a socket to determine local IP
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        # Connect to a public DNS server (doesn't actually send data)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        return local_ip
    except Exception as e:
        print(f"⚠️ Failed to detect local IP: {e}")
        return "127.0.0.1"


def generate_secure_password(length: int = 16) -> str:
    """
    Generate a cryptographically secure random password.
    
    Args:
        length: Password length (default: 16)
    
    Returns:
        Random numeric password (digits only)
    """
    alphabet = string.digits  # Use only numbers: 0-9
    password = ''.join(secrets.choice(alphabet) for _ in range(length))
    return password


def resolve_hostname(ip: str) -> str:
    """
    Resolve IP address to hostname using reverse DNS lookup.
    
    Args:
        ip: IP address to resolve
    
    Returns:
        Hostname if successful, otherwise returns the IP address
    """
    try:
        hostname, _, _ = socket.gethostbyaddr(ip)
        return hostname
    except (socket.herror, socket.gaierror, OSError):
        # Fallback to IP if resolution fails
        return ip


def format_speed(bytes_per_sec: float) -> str:
    """
    Format transfer speed in human-readable format.
    
    Args:
        bytes_per_sec: Speed in bytes per second
    
    Returns:
        Formatted string (e.g., "1.2 MB/s", "850 KB/s")
    """
    if bytes_per_sec < 1024:
        return f"{bytes_per_sec:.0f} B/s"
    elif bytes_per_sec < 1024 * 1024:
        return f"{bytes_per_sec / 1024:.1f} KB/s"
    else:
        return f"{bytes_per_sec / (1024 * 1024):.1f} MB/s"


def log_activity(event: str, client_ip: Optional[str] = None, 
                 filename: Optional[str] = None, details: Optional[Dict] = None):
    """
    Log FTP activity to JSON file.
    
    Args:
        event: Event type (server_started, client_connected, file_uploaded, etc.)
        client_ip: Client IP address (if applicable)
        filename: Filename (if applicable)
        details: Additional details dictionary
    """
    try:
        # Read existing logs
        if os.path.exists(LOG_FILE):
            with open(LOG_FILE, 'r', encoding='utf-8') as f:
                logs = json.load(f)
        else:
            logs = []
        
        # Create log entry
        log_entry = {
            "timestamp": datetime.now().isoformat(),
            "event": event
        }
        
        if client_ip:
            log_entry["client_ip"] = client_ip
        if filename:
            log_entry["filename"] = filename
        if details:
            log_entry["details"] = details
        
        # Append and save
        logs.append(log_entry)
        
        # Keep only last 500 entries to prevent file bloat
        if len(logs) > 500:
            logs = logs[-500:]
        
        with open(LOG_FILE, 'w', encoding='utf-8') as f:
            json.dump(logs, f, indent=2)
    
    except Exception as e:
        print(f"❌ Failed to log activity: {e}")


def get_logs(limit: int = 50) -> List[Dict[str, Any]]:
    """
    Retrieve recent FTP activity logs.
    
    Args:
        limit: Maximum number of logs to return
    
    Returns:
        List of log entries (most recent first)
    """
    try:
        if os.path.exists(LOG_FILE):
            with open(LOG_FILE, 'r', encoding='utf-8') as f:
                logs = json.load(f)
            # Return most recent logs first
            return logs[-limit:][::-1]
        return []
    except Exception as e:
        print(f"❌ Failed to read logs: {e}")
        return []


def clear_logs():
    """Clear all FTP activity logs."""
    try:
        with open(LOG_FILE, 'w', encoding='utf-8') as f:
            json.dump([], f)
        print("✓ FTP logs cleared")
    except Exception as e:
        print(f"❌ Failed to clear logs: {e}")


def calculate_speeds():
    """Background thread to calculate transfer speeds every second."""
    global _connected_clients, _transfer_sessions, _speed_calc_running
    
    while _speed_calc_running:
        current_time = time.time()
        
        for client in _connected_clients:
            client_ip = client["ip"]
            if client_ip not in _transfer_sessions:
                continue
            
            session = _transfer_sessions[client_ip]
            
            # Calculate upload speed
            if session["upload_start"] and session["upload_bytes"] > 0:
                elapsed = current_time - session["upload_start"]
                if elapsed > 0:
                    client["current_upload_speed"] = session["upload_bytes"] / elapsed
            else:
                client["current_upload_speed"] = 0
            
            # Calculate download speed
            if session["download_start"] and session["download_bytes"] > 0:
                elapsed = current_time - session["download_start"]
                if elapsed > 0:
                    client["current_download_speed"] = session["download_bytes"] / elapsed
            else:
                client["current_download_speed"] = 0
        
        time.sleep(1)  # Update every second


class FluffyFTPHandler(FTPHandler):
    """Custom FTP handler with activity logging and transfer speed tracking."""
    active_handlers = []
    
    def on_connect(self):
        """Called when client connects."""
        self.active_handlers.append(self)
        client_ip = self.remote_ip
        print(f"📡 Client connecting from {client_ip}")
    
    def handle_read_event(self):
        """Override to track upload data."""
        # Call parent implementation
        super().handle_read_event()
        
        # Track upload bytes
        client_ip = self.remote_ip
        if client_ip in _transfer_sessions and hasattr(self, 'data_channel') and self.data_channel:
            # Client is uploading
            pass  # Tracking happens in on_file_received
    
    def handle_write_event(self):
        """Override to track download data."""
        # Call parent implementation
        super().handle_write_event()
        
        # Track download bytes
        client_ip = self.remote_ip
        if client_ip in _transfer_sessions and hasattr(self, 'data_channel') and self.data_channel:
            # Client is downloading
            pass  # Tracking happens in on_file_sent
    
    def on_disconnect(self):
        """Called when client disconnects."""
        if self in self.active_handlers:
            self.active_handlers.remove(self)
            
        client_ip = self.remote_ip
        print(f"📡 Client disconnected: {client_ip}")
        log_activity("client_disconnected", client_ip=client_ip)
        
        # Remove from connected clients list and transfer sessions
        global _connected_clients, _transfer_sessions
        _connected_clients = [c for c in _connected_clients if c.get("ip") != client_ip]
        if client_ip in _transfer_sessions:
            del _transfer_sessions[client_ip]
    
    def on_login(self, username):
        """Called when client logs in successfully."""
        client_ip = self.remote_ip
        
        # Resolve hostname (with fallback to IP)
        hostname = resolve_hostname(client_ip)
        
        print(f"✓ Client logged in: {username} from {hostname} ({client_ip})")
        log_activity("client_connected", client_ip=client_ip, details={
            "username": username,
            "hostname": hostname
        })
        
        # Add to connected clients list with enhanced data
        global _connected_clients, _transfer_sessions
        _connected_clients.append({
            "ip": client_ip,
            "hostname": hostname,
            "username": username,
            "connected_at": datetime.now().isoformat(),
            "current_upload_speed": 0,
            "current_download_speed": 0,
            "total_uploaded": 0,
            "total_downloaded": 0,
            "active_transfer": None
        })
        
        # Initialize transfer session
        _transfer_sessions[client_ip] = {
            "upload_bytes": 0,
            "download_bytes": 0,
            "upload_start": None,
            "download_start": None,
            "current_file": None
        }
    
    def on_file_received(self, file):
        """Called when file upload completes."""
        client_ip = self.remote_ip
        filename = os.path.basename(file)
        file_size = os.path.getsize(file) if os.path.exists(file) else 0
        
        print(f"⬆️ File uploaded: {filename} ({file_size} bytes) from {client_ip}")
        log_activity("file_uploaded", client_ip=client_ip, filename=filename, details={
            "size_bytes": file_size
        })
        
        # Update total uploaded bytes
        global _connected_clients, _transfer_sessions
        for client in _connected_clients:
            if client["ip"] == client_ip:
                client["total_uploaded"] += file_size
                client["active_transfer"] = None
                client["current_upload_speed"] = 0
                break
        
        # Clear transfer session
        if client_ip in _transfer_sessions:
            _transfer_sessions[client_ip]["upload_bytes"] = 0
            _transfer_sessions[client_ip]["upload_start"] = None
            _transfer_sessions[client_ip]["current_file"] = None
    
    def on_incomplete_file_received(self, file):
        """Called when file upload starts or is in progress."""
        client_ip = self.remote_ip
        filename = os.path.basename(file)
        file_size = os.path.getsize(file) if os.path.exists(file) else 0
        
        # Track upload progress
        global _connected_clients, _transfer_sessions
        
        if client_ip in _transfer_sessions:
            session = _transfer_sessions[client_ip]
            
            # Start tracking if not already started
            if session["upload_start"] is None:
                session["upload_start"] = time.time()
                session["current_file"] = filename
                print(f"⬆️ Upload started: {filename} from {client_ip}")
            
            # Update bytes transferred
            session["upload_bytes"] = file_size
            
            # Update active transfer in client list
            for client in _connected_clients:
                if client["ip"] == client_ip:
                    client["active_transfer"] = filename
                    break
    
    def on_file_sent(self, file):
        """Called when file download completes."""
        client_ip = self.remote_ip
        filename = os.path.basename(file)
        file_size = os.path.getsize(file) if os.path.exists(file) else 0
        
        print(f"⬇️ File downloaded: {filename} ({file_size} bytes) to {client_ip}")
        log_activity("file_downloaded", client_ip=client_ip, filename=filename, details={
            "size_bytes": file_size
        })
        
        # Update total downloaded bytes
        global _connected_clients, _transfer_sessions
        for client in _connected_clients:
            if client["ip"] == client_ip:
                client["total_downloaded"] += file_size
                client["active_transfer"] = None
                client["current_download_speed"] = 0
                break
        
        # Clear transfer session
        if client_ip in _transfer_sessions:
            _transfer_sessions[client_ip]["download_bytes"] = 0
            _transfer_sessions[client_ip]["download_start"] = None
            _transfer_sessions[client_ip]["current_file"] = None
    
    def on_incomplete_file_sent(self, file):
        """Called when file download starts or is in progress."""
        client_ip = self.remote_ip
        filename = os.path.basename(file)
        file_size = os.path.getsize(file) if os.path.exists(file) else 0
        
        # Track download progress
        global _connected_clients, _transfer_sessions
        
        if client_ip in _transfer_sessions:
            session = _transfer_sessions[client_ip]
            
            # Start tracking if not already started
            if session["download_start"] is None:
                session["download_start"] = time.time()
                session["current_file"] = filename
                print(f"⬇️ Download started: {filename} to {client_ip}")
            
            # Update bytes transferred
            session["download_bytes"] = file_size
            
            # Update active transfer in client list
            for client in _connected_clients:
                if client["ip"] == client_ip:
                    client["active_transfer"] = filename
                    break
    



def _run_server():
    """Internal function to run FTP server in background thread."""
    global _server
    try:
        print(f"🚀 FTP server starting on {_current_ip}:{FTP_PORT}")
        _server.serve_forever()
    except Exception as e:
        print(f"❌ FTP server error: {e}")
    finally:
        print("🛑 FTP server thread terminated")


def start_ftp_server(shared_dir: Optional[str] = None) -> Dict[str, Any]:
    """
    Start the FTP server.
    
    Args:
        shared_dir: Optional custom directory to share. If None, uses default SHARED_DIR.
    
    Returns:
        Dictionary with status, credentials, and server info
    """
    global _server, _server_thread, _current_password, _current_ip, _is_running, _connected_clients, _speed_calc_thread, _speed_calc_running
    
    with _server_lock:
        # Check if already running
        if _is_running:
            return {
                "success": False,
                "error": "FTP server is already running",
                "status": "running"
            }
        
        try:
            # Determine shared directory
            target_dir = shared_dir if shared_dir else SHARED_DIR
            
            # Validate directory exists and is accessible
            if not os.path.exists(target_dir):
                return {
                    "success": False,
                    "error": f"Directory does not exist: {target_dir}",
                    "status": "stopped"
                }
            
            if not os.path.isdir(target_dir):
                return {
                    "success": False,
                    "error": f"Path is not a directory: {target_dir}",
                    "status": "stopped"
                }
            
            # Check read/write permissions
            if not os.access(target_dir, os.R_OK | os.W_OK):
                return {
                    "success": False,
                    "error": f"Insufficient permissions for directory: {target_dir}",
                    "status": "stopped"
                }
            
            # Generate credentials
            _current_password = generate_secure_password(8)
            _current_ip = get_local_ip()
            
            # Setup authorizer
            authorizer = DummyAuthorizer()
            authorizer.add_user(
                FTP_USERNAME,
                _current_password,
                target_dir,  # Use selected directory
                perm="elradfmwMT"  # Full permissions
            )
            
            # Setup handler
            handler = FluffyFTPHandler
            handler.authorizer = authorizer
            handler.passive_ports = range(*PASSIVE_PORTS)
            
            # Create server
            _server = FTPServer((_current_ip, FTP_PORT), handler)
            _server.max_cons = 10  # Max 10 simultaneous connections
            _server.max_cons_per_ip = 3  # Max 3 connections per IP
            
            # Start server in background thread
            _server_thread = threading.Thread(target=_run_server, daemon=True)
            _server_thread.start()
            
            _is_running = True
            _connected_clients = []
            
            # Log activity
            log_activity("server_started", details={
                "ip": _current_ip,
                "port": FTP_PORT,
                "shared_dir": target_dir
            })
            
            print(f"✓ FTP server started successfully")
            print(f"  Address: ftp://{_current_ip}:{FTP_PORT}")
            print(f"  Username: {FTP_USERNAME}")
            print(f"  Password: {_current_password}")
            print(f"  Shared Directory: {target_dir}")
            
            # Start speed calculation thread
            _speed_calc_running = True
            _speed_calc_thread = threading.Thread(target=calculate_speeds, daemon=True)
            _speed_calc_thread.start()
            print("✓ Speed calculation thread started")
            
            return {
                "success": True,
                "status": "running",
                "ip": _current_ip,
                "port": FTP_PORT,
                "username": FTP_USERNAME,
                "password": _current_password,
                "shared_dir": target_dir,
                "url": f"ftp://{_current_ip}:{FTP_PORT}"
            }
        
        except OSError as e:
            if "address already in use" in str(e).lower():
                return {
                    "success": False,
                    "error": f"Port {FTP_PORT} is already in use. Another FTP server may be running.",
                    "status": "stopped"
                }
            else:
                return {
                    "success": False,
                    "error": f"Failed to start FTP server: {str(e)}",
                    "status": "stopped"
                }
        
        except Exception as e:
            print(f"❌ Failed to start FTP server: {e}")
            return {
                "success": False,
                "error": str(e),
                "status": "stopped"
            }


def stop_ftp_server() -> Dict[str, Any]:
    """
    Stop the FTP server gracefully.
    
    Returns:
        Dictionary with status
    """
    global _server, _server_thread, _current_password, _current_ip, _is_running, _connected_clients, _speed_calc_thread, _speed_calc_running, _transfer_sessions
    
    with _server_lock:
        if not _is_running:
            return {
                "success": False,
                "error": "FTP server is not running",
                "status": "stopped"
            }
        
        try:
            print("🛑 Stopping FTP server...")
            
            # Close all connections gracefully
            if _server:
                _server.close_all()
            
            # Wait for thread to terminate (with timeout)
            if _server_thread and _server_thread.is_alive():
                _server_thread.join(timeout=5.0)
            
            # Clear credentials from memory
            _current_password = None
            _current_ip = None
            _server = None
            _server_thread = None
            _is_running = False
            _connected_clients = []
            _transfer_sessions = {}
            
            # Stop speed calculation thread
            _speed_calc_running = False
            if _speed_calc_thread and _speed_calc_thread.is_alive():
                _speed_calc_thread.join(timeout=2.0)
            _speed_calc_thread = None
            print("✓ Speed calculation thread stopped")
            
            # Log activity
            log_activity("server_stopped")
            
            print("✓ FTP server stopped successfully")
            
            return {
                "success": True,
                "status": "stopped",
                "message": "FTP server stopped and credentials cleared"
            }
        
        except Exception as e:
            print(f"❌ Error stopping FTP server: {e}")
            return {
                "success": False,
                "error": str(e),
                "status": "unknown"
            }


def disconnect_client(client_ip: str) -> Dict[str, Any]:
    """
    Disconnect a specific FTP client by IP address.
    
    Args:
        client_ip: IP address of the client to disconnect
    
    Returns:
        Dictionary with success status
    """
    global _server, _connected_clients, _transfer_sessions
    
    if not _is_running or not _server:
        return {
            "success": False,
            "error": "FTP server is not running"
        }
    
    try:
        # Find and close the client connection
        disconnected = False
        
        # Iterate through all active handlers
        for handler in list(FluffyFTPHandler.active_handlers):
            if hasattr(handler, 'remote_ip') and handler.remote_ip == client_ip:
                try:
                    handler.close()
                    disconnected = True
                    # The handler is removed from active_handlers in on_disconnect
                    print(f"🔌 Forcefully disconnected client: {client_ip}")
                except Exception as e:
                    print(f"⚠️ Error closing handler for {client_ip}: {e}")
        
        # Clean up client data
        _connected_clients = [c for c in _connected_clients if c.get("ip") != client_ip]
        if client_ip in _transfer_sessions:
            del _transfer_sessions[client_ip]
        
        # Log the disconnection
        log_activity("client_force_disconnected", client_ip=client_ip)
        
        if disconnected:
            return {
                "success": True,
                "message": f"Client {client_ip} disconnected successfully"
            }
        else:
            return {
                "success": False,
                "error": f"Client {client_ip} not found in active connections"
            }
    
    except Exception as e:
        print(f"❌ Error disconnecting client {client_ip}: {e}")
        return {
            "success": False,
            "error": str(e)
        }


def get_ftp_status() -> Dict[str, Any]:
    """
    Get current FTP server status.
    
    Returns:
        Dictionary with server status and info
    """
    global _is_running, _current_ip, _current_password, _connected_clients
    
    with _server_lock:
        if _is_running:
            return {
                "status": "running",
                "ip": _current_ip,
                "port": FTP_PORT,
                "username": FTP_USERNAME,
                "password": _current_password,
                "shared_dir": SHARED_DIR,
                "url": f"ftp://{_current_ip}:{FTP_PORT}",
                "connected_clients": len(_connected_clients),
                "clients": _connected_clients
            }
        else:
            return {
                "status": "stopped",
                "connected_clients": 0
            }


def get_connected_clients() -> List[Dict[str, Any]]:
    """
    Get list of currently connected clients.
    
    Returns:
        List of connected client info
    """
    global _connected_clients
    return _connected_clients.copy()


# Test functionality
if __name__ == "__main__":
    print("=== FTP Service Test ===")
    
    # Test password generation
    pwd = generate_secure_password()
    print(f"✓ Generated password: {pwd} (length: {len(pwd)})")
    
    # Test IP detection
    ip = get_local_ip()
    print(f"✓ Detected local IP: {ip}")
    
    # Test logging
    log_activity("test_event", client_ip="192.168.1.100", filename="test.txt")
    logs = get_logs(limit=5)
    print(f"✓ Logged activity: {len(logs)} entries")
    
    print("\n=== Manual Server Test ===")
    print("To test the server:")
    print("1. Run: python services/ftp_service.py")
    print("2. In Python console:")
    print("   >>> from services.ftp_service import start_ftp_server, stop_ftp_server, get_ftp_status")
    print("   >>> result = start_ftp_server()")
    print("   >>> print(result)")
    print("   >>> # Connect with FTP client")
    print("   >>> stop_ftp_server()")
