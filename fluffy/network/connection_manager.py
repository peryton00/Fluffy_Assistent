"""
Connection Manager - Manages multiple connections to available instances

Tracks connection state, online/offline status, and latest data snapshots.
"""

import time
import threading
from typing import Dict, List, Optional
import uuid


class ConnectionManager:
    """Manages multiple simultaneous connections to available instances."""
    
    def __init__(self):
        self._connections: Dict[str, dict] = {}  # machine_id -> connection_info
        self._active_machine: Optional[str] = None
        self._lock = threading.Lock()
    
    def add_connection(self, ip: str, session_token: str, machine_name: str = None) -> str:
        """
        Add a new connection.
        
        Args:
            ip: IP address of the machine
            session_token: Session token from authentication
            machine_name: Optional machine name (will be updated from data)
            
        Returns:
            machine_id: Unique identifier for this connection
        """
        machine_id = str(uuid.uuid4())
        
        with self._lock:
            self._connections[machine_id] = {
                "machine_id": machine_id,
                "machine_name": machine_name or f"Machine-{ip}",
                "ip": ip,
                "status": "online",
                "last_seen": time.time(),
                "session_token": session_token,
                "data": None,
                "connected_at": time.time()
            }
            
            # Set as active if first connection
            if self._active_machine is None:
                self._active_machine = machine_id
            
            print(f"[ConnectionManager] Added connection: {machine_id} ({ip})")
        
        return machine_id
    
    def remove_connection(self, machine_id: str) -> bool:
        """
        Remove a connection.
        
        Args:
            machine_id: Machine identifier
            
        Returns:
            True if removed
        """
        with self._lock:
            if machine_id in self._connections:
                machine_name = self._connections[machine_id].get("machine_name", "unknown")
                del self._connections[machine_id]
                
                # Update active machine if needed
                if self._active_machine == machine_id:
                    # Set to first available connection or None
                    self._active_machine = next(iter(self._connections.keys()), None)
                
                print(f"[ConnectionManager] Removed connection: {machine_name}")
                return True
        
        return False
    
    def update_data(self, machine_id: str, data: dict):
        """
        Update monitoring data for a connection.
        
        Args:
            machine_id: Machine identifier
            data: Monitoring data
        """
        with self._lock:
            if machine_id in self._connections:
                self._connections[machine_id]["data"] = data
                self._connections[machine_id]["last_seen"] = time.time()
                
                # Update machine name if provided in data
                if "machine_name" in data:
                    self._connections[machine_id]["machine_name"] = data["machine_name"]
    
    def mark_offline(self, machine_id: str):
        """
        Mark a connection as offline.
        
        Args:
            machine_id: Machine identifier
        """
        with self._lock:
            if machine_id in self._connections:
                self._connections[machine_id]["status"] = "offline"
                print(f"[ConnectionManager] Marked offline: {machine_id}")
    
    def mark_online(self, machine_id: str):
        """
        Mark a connection as online.
        
        Args:
            machine_id: Machine identifier
        """
        with self._lock:
            if machine_id in self._connections:
                self._connections[machine_id]["status"] = "online"
                self._connections[machine_id]["last_seen"] = time.time()
                print(f"[ConnectionManager] Marked online: {machine_id}")
    
    def get_all_connections(self) -> List[dict]:
        """
        Get list of all connections.
        
        Returns:
            List of connection info dictionaries
        """
        with self._lock:
            return [
                {
                    "machine_id": conn["machine_id"],
                    "machine_name": conn["machine_name"],
                    "ip": conn["ip"],
                    "status": conn["status"],
                    "last_seen": conn["last_seen"],
                    "connected_at": conn.get("connected_at", 0)
                }
                for conn in self._connections.values()
            ]
    
    def get_connection(self, machine_id: str) -> Optional[dict]:
        """
        Get connection info for a specific machine.
        
        Args:
            machine_id: Machine identifier
            
        Returns:
            Connection info or None
        """
        with self._lock:
            return self._connections.get(machine_id)
    
    def get_connection_data(self, machine_id: str) -> Optional[dict]:
        """
        Get latest monitoring data for a machine.
        
        Args:
            machine_id: Machine identifier
            
        Returns:
            Monitoring data or None
        """
        with self._lock:
            conn = self._connections.get(machine_id)
            if conn:
                return conn.get("data")
        return None
    
    def switch_active(self, machine_id: str) -> bool:
        """
        Switch the active machine view.
        
        Args:
            machine_id: Machine identifier to switch to
            
        Returns:
            True if switched successfully
        """
        with self._lock:
            if machine_id in self._connections:
                self._active_machine = machine_id
                print(f"[ConnectionManager] Switched to: {machine_id}")
                return True
        return False
    
    def get_active_machine(self) -> Optional[str]:
        """Get the currently active machine ID."""
        with self._lock:
            return self._active_machine
    
    def get_active_data(self) -> Optional[dict]:
        """Get monitoring data for the currently active machine."""
        with self._lock:
            if self._active_machine:
                return self.get_connection_data(self._active_machine)
        return None
    
    def get_session_token(self, machine_id: str) -> Optional[str]:
        """
        Get session token for a machine.
        
        Args:
            machine_id: Machine identifier
            
        Returns:
            Session token or None
        """
        with self._lock:
            conn = self._connections.get(machine_id)
            if conn:
                return conn.get("session_token")
        return None
    
    def connection_count(self) -> int:
        """Get total number of connections."""
        with self._lock:
            return len(self._connections)


# Global singleton instance
_connection_manager: Optional[ConnectionManager] = None


def get_connection_manager() -> ConnectionManager:
    """Get the global ConnectionManager instance."""
    global _connection_manager
    if _connection_manager is None:
        _connection_manager = ConnectionManager()
    return _connection_manager
