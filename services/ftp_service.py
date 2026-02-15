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


class FluffyFTPHandler(FTPHandler):
    """Custom FTP handler with activity logging."""
    
    def on_connect(self):
        """Called when client connects."""
        client_ip = self.remote_ip
        print(f"📡 Client connecting from {client_ip}")
    
    def on_disconnect(self):
        """Called when client disconnects."""
        client_ip = self.remote_ip
        print(f"📡 Client disconnected: {client_ip}")
        log_activity("client_disconnected", client_ip=client_ip)
        
        # Remove from connected clients list
        global _connected_clients
        _connected_clients = [c for c in _connected_clients if c.get("ip") != client_ip]
    
    def on_login(self, username):
        """Called when client logs in successfully."""
        client_ip = self.remote_ip
        print(f"✓ Client logged in: {username} from {client_ip}")
        log_activity("client_connected", client_ip=client_ip, details={"username": username})
        
        # Add to connected clients list
        global _connected_clients
        _connected_clients.append({
            "ip": client_ip,
            "username": username,
            "connected_at": datetime.now().isoformat()
        })
    
    def on_file_received(self, file):
        """Called when file upload completes."""
        client_ip = self.remote_ip
        filename = os.path.basename(file)
        print(f"⬆️ File uploaded: {filename} from {client_ip}")
        log_activity("file_uploaded", client_ip=client_ip, filename=filename)
    
    def on_file_sent(self, file):
        """Called when file download completes."""
        client_ip = self.remote_ip
        filename = os.path.basename(file)
        print(f"⬇️ File downloaded: {filename} to {client_ip}")
        log_activity("file_downloaded", client_ip=client_ip, filename=filename)
    
    def on_incomplete_file_received(self, file):
        """Called when file upload is interrupted."""
        client_ip = self.remote_ip
        filename = os.path.basename(file)
        print(f"⚠️ Incomplete upload: {filename} from {client_ip}")
        log_activity("file_upload_incomplete", client_ip=client_ip, filename=filename)
    
    def on_incomplete_file_sent(self, file):
        """Called when file download is interrupted."""
        client_ip = self.remote_ip
        filename = os.path.basename(file)
        print(f"⚠️ Incomplete download: {filename} to {client_ip}")
        log_activity("file_download_incomplete", client_ip=client_ip, filename=filename)


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
    global _server, _server_thread, _current_password, _current_ip, _is_running, _connected_clients
    
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
    global _server, _server_thread, _current_password, _current_ip, _is_running, _connected_clients
    
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
