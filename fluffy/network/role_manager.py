"""
Role Manager - Manages operational mode of Fluffy instance

Supports three mutually exclusive modes:
- standalone: Normal local monitoring only (default)
- available: Agent mode - allows other instances to monitor this machine
- admin: Controller mode - monitors other Fluffy instances
"""

import json
import os
from typing import Tuple

# Configuration file path
ROLE_CONFIG_PATH = os.path.join(os.path.dirname(__file__), "role_config.json")

# Valid roles
ROLE_STANDALONE = "standalone"
ROLE_AVAILABLE = "available"
ROLE_ADMIN = "admin"

VALID_ROLES = {ROLE_STANDALONE, ROLE_AVAILABLE, ROLE_ADMIN}


class RoleManager:
    """Manages the operational role of the Fluffy instance."""
    
    def __init__(self):
        self.current_role = self._load_role()
        self._server = None
        self._client = None
    
    def _load_role(self) -> str:
        """Load role from config file, default to standalone."""
        if os.path.exists(ROLE_CONFIG_PATH):
            try:
                with open(ROLE_CONFIG_PATH, 'r') as f:
                    config = json.load(f)
                    role = config.get("role", ROLE_STANDALONE)
                    if role in VALID_ROLES:
                        return role
            except Exception as e:
                print(f"[RoleManager] Error loading role config: {e}")
        return ROLE_STANDALONE
    
    def _save_role(self, role: str) -> bool:
        """Save role to config file."""
        try:
            config = {"role": role}
            with open(ROLE_CONFIG_PATH, 'w') as f:
                json.dump(config, f, indent=2)
            return True
        except Exception as e:
            print(f"[RoleManager] Error saving role config: {e}")
            return False
    
    def get_current_role(self) -> str:
        """Get the current operational role."""
        return self.current_role
    
    def can_switch_to(self, role: str) -> Tuple[bool, str]:
        """
        Check if switching to the specified role is allowed.
        
        Returns:
            (allowed, reason) tuple
        """
        if role not in VALID_ROLES:
            return False, f"Invalid role: {role}"
        
        if role == self.current_role:
            return True, "Already in this role"
        
        # Cleanup will handle stopping any running services
        return True, "Switch allowed"
    
    def set_role(self, role: str) -> Tuple[bool, str]:
        """
        Set the operational role.
        
        Returns:
            (success, message) tuple
        """
        # Validate
        can_switch, reason = self.can_switch_to(role)
        if not can_switch:
            return False, reason
        
        # Cleanup current services before switching
        if not self.cleanup_services():
            return False, "Failed to cleanup current services"
        
        # Update role
        old_role = self.current_role
        self.current_role = role
        
        # Persist
        if not self._save_role(role):
            # Rollback
            self.current_role = old_role
            return False, "Failed to save role configuration"
        
        print(f"[RoleManager] Role switched: {old_role} -> {role}")
        return True, f"Role changed to {role}"
    
    def cleanup_services(self) -> bool:
        """
        Cleanup services based on current role.
        
        Returns:
            True if cleanup successful
        """
        try:
            if self.current_role == ROLE_AVAILABLE:
                # Stop availability server if running
                if self._server and hasattr(self._server, 'stop'):
                    print("[RoleManager] Stopping availability server...")
                    self._server.stop()
                    self._server = None
            
            elif self.current_role == ROLE_ADMIN:
                # Disconnect all admin connections if any
                if self._client and hasattr(self._client, 'disconnect_all'):
                    print("[RoleManager] Disconnecting all admin connections...")
                    self._client.disconnect_all()
                    self._client = None
            
            return True
        except Exception as e:
            print(f"[RoleManager] Error during cleanup: {e}")
            return False
    
    def set_server(self, server):
        """Set reference to availability server for cleanup."""
        self._server = server
    
    def set_client(self, client):
        """Set reference to admin client for cleanup."""
        self._client = client


# Global singleton instance
_role_manager = None


def get_role_manager() -> RoleManager:
    """Get the global RoleManager instance."""
    global _role_manager
    if _role_manager is None:
        _role_manager = RoleManager()
    return _role_manager
