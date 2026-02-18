"""
Heartbeat Manager - Manages connection health monitoring

Tracks heartbeats for each connection and detects timeouts.
"""

import time
import threading
from typing import Dict, Optional


class HeartbeatManager:
    """Manages heartbeat tracking for network connections."""
    
    def __init__(self, timeout: int = 10):
        """
        Initialize heartbeat manager.
        
        Args:
            timeout: Heartbeat timeout in seconds (default 10)
        """
        self.timeout = timeout
        self._heartbeats: Dict[str, float] = {}  # connection_id -> last_heartbeat_time
        self._lock = threading.Lock()
    
    def start_heartbeat(self, connection_id: str):
        """
        Start tracking heartbeat for a connection.
        
        Args:
            connection_id: Unique connection identifier
        """
        with self._lock:
            self._heartbeats[connection_id] = time.time()
            print(f"[Heartbeat] Started tracking for {connection_id}")
    
    def update_heartbeat(self, connection_id: str):
        """
        Update heartbeat timestamp for a connection.
        
        Args:
            connection_id: Unique connection identifier
        """
        with self._lock:
            if connection_id in self._heartbeats:
                self._heartbeats[connection_id] = time.time()
    
    def check_timeout(self, connection_id: str) -> bool:
        """
        Check if a connection has timed out.
        
        Args:
            connection_id: Unique connection identifier
            
        Returns:
            True if connection has timed out
        """
        with self._lock:
            if connection_id not in self._heartbeats:
                return True  # Not tracked = timed out
            
            last_heartbeat = self._heartbeats[connection_id]
            elapsed = time.time() - last_heartbeat
            
            if elapsed > self.timeout:
                print(f"[Heartbeat] Connection {connection_id} timed out ({elapsed:.1f}s)")
                return True
            
            return False
    
    def stop_heartbeat(self, connection_id: str):
        """
        Stop tracking heartbeat for a connection.
        
        Args:
            connection_id: Unique connection identifier
        """
        with self._lock:
            if connection_id in self._heartbeats:
                del self._heartbeats[connection_id]
                print(f"[Heartbeat] Stopped tracking for {connection_id}")
    
    def get_all_connections(self) -> list:
        """Get list of all tracked connection IDs."""
        with self._lock:
            return list(self._heartbeats.keys())
    
    def get_last_heartbeat(self, connection_id: str) -> Optional[float]:
        """
        Get last heartbeat timestamp for a connection.
        
        Args:
            connection_id: Unique connection identifier
            
        Returns:
            Timestamp or None if not tracked
        """
        with self._lock:
            return self._heartbeats.get(connection_id)
