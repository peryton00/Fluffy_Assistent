"""
Authentication Manager - Handles credentials, password hashing, and session management

Security features:
- Bcrypt password hashing
- UUID session tokens
- In-memory session storage
- Login attempt limiting (5 attempts per IP, 5-minute block)
"""

import bcrypt
import json
import os
import time
import uuid
from typing import Tuple, Optional, Dict

# Credentials file path
CREDENTIALS_PATH = os.path.join(os.path.dirname(__file__), "credentials.json")

# Login attempt limiting
MAX_LOGIN_ATTEMPTS = 5
BLOCK_DURATION = 300  # 5 minutes in seconds


class AuthManager:
    """Manages authentication, credentials, and sessions."""
    
    def __init__(self):
        self._sessions: Dict[str, dict] = {}  # token -> {username, created_at, last_seen}
        self._login_attempts: Dict[str, list] = {}  # ip -> [timestamp, timestamp, ...]
    
    @staticmethod
    def hash_password(password: str) -> str:
        """
        Hash a password using bcrypt.
        
        Args:
            password: Plain text password
            
        Returns:
            Hashed password as string
        """
        salt = bcrypt.gensalt()
        hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
        return hashed.decode('utf-8')
    
    @staticmethod
    def verify_password(password: str, password_hash: str) -> bool:
        """
        Verify a password against a hash.
        
        Args:
            password: Plain text password to verify
            password_hash: Stored password hash
            
        Returns:
            True if password matches
        """
        try:
            return bcrypt.checkpw(password.encode('utf-8'), password_hash.encode('utf-8'))
        except Exception as e:
            print(f"[AuthManager] Password verification error: {e}")
            return False
    
    def create_credentials(self, username: str, password: str) -> bool:
        """
        Create and save credentials to file.
        
        Args:
            username: Username
            password: Plain text password (will be hashed)
            
        Returns:
            True if successful
        """
        try:
            password_hash = self.hash_password(password)
            credentials = {
                "username": username,
                "password_hash": password_hash,
                "created_at": time.time()
            }
            
            with open(CREDENTIALS_PATH, 'w') as f:
                json.dump(credentials, f, indent=2)
            
            print(f"[AuthManager] Credentials created for user: {username}")
            return True
        except Exception as e:
            print(f"[AuthManager] Error creating credentials: {e}")
            return False
    
    def delete_credentials(self) -> bool:
        """
        Delete credentials file.
        
        Returns:
            True if successful or file doesn't exist
        """
        try:
            if os.path.exists(CREDENTIALS_PATH):
                os.remove(CREDENTIALS_PATH)
                print("[AuthManager] Credentials deleted")
            return True
        except Exception as e:
            print(f"[AuthManager] Error deleting credentials: {e}")
            return False
    
    def _load_credentials(self) -> Optional[dict]:
        """Load credentials from file."""
        if not os.path.exists(CREDENTIALS_PATH):
            return None
        
        try:
            with open(CREDENTIALS_PATH, 'r') as f:
                return json.load(f)
        except Exception as e:
            print(f"[AuthManager] Error loading credentials: {e}")
            return None
    
    def _check_login_attempts(self, ip: str) -> Tuple[bool, str]:
        """
        Check if IP is blocked due to too many login attempts.
        
        Returns:
            (allowed, reason) tuple
        """
        now = time.time()
        
        # Clean up old attempts
        if ip in self._login_attempts:
            self._login_attempts[ip] = [
                t for t in self._login_attempts[ip]
                if now - t < BLOCK_DURATION
            ]
        
        # Check if blocked
        attempts = self._login_attempts.get(ip, [])
        if len(attempts) >= MAX_LOGIN_ATTEMPTS:
            time_remaining = int(BLOCK_DURATION - (now - attempts[0]))
            return False, f"Too many login attempts. Try again in {time_remaining} seconds."
        
        return True, "OK"
    
    def _record_login_attempt(self, ip: str):
        """Record a failed login attempt."""
        if ip not in self._login_attempts:
            self._login_attempts[ip] = []
        self._login_attempts[ip].append(time.time())
    
    def authenticate(self, username: str, password: str, ip: str) -> Tuple[bool, str]:
        """
        Authenticate a user and create a session.
        
        Args:
            username: Username
            password: Plain text password
            ip: Client IP address
            
        Returns:
            (success, token_or_error) tuple
        """
        # Check login attempts
        allowed, reason = self._check_login_attempts(ip)
        if not allowed:
            return False, reason
        
        # Load credentials
        credentials = self._load_credentials()
        if not credentials:
            self._record_login_attempt(ip)
            return False, "Authentication failed: No credentials configured"
        
        # Verify username
        if credentials.get("username") != username:
            self._record_login_attempt(ip)
            return False, "Authentication failed: Invalid credentials"
        
        # Verify password
        if not self.verify_password(password, credentials.get("password_hash", "")):
            self._record_login_attempt(ip)
            return False, "Authentication failed: Invalid credentials"
        
        # Create session
        token = str(uuid.uuid4())
        self._sessions[token] = {
            "username": username,
            "ip": ip,
            "created_at": time.time(),
            "last_seen": time.time()
        }
        
        print(f"[AuthManager] Authentication successful for {username} from {ip}")
        return True, token
    
    def validate_session(self, token: str) -> bool:
        """
        Validate a session token.
        
        Args:
            token: Session token
            
        Returns:
            True if valid
        """
        if token in self._sessions:
            # Update last seen
            self._sessions[token]["last_seen"] = time.time()
            return True
        return False
    
    def revoke_session(self, token: str):
        """Revoke a session token."""
        if token in self._sessions:
            username = self._sessions[token].get("username", "unknown")
            del self._sessions[token]
            print(f"[AuthManager] Session revoked for {username}")
    
    def cleanup_sessions(self, max_age: int = 3600):
        """
        Clean up old sessions.
        
        Args:
            max_age: Maximum session age in seconds (default 1 hour)
        """
        now = time.time()
        expired = [
            token for token, session in self._sessions.items()
            if now - session["last_seen"] > max_age
        ]
        
        for token in expired:
            self.revoke_session(token)
        
        if expired:
            print(f"[AuthManager] Cleaned up {len(expired)} expired sessions")
    
    def get_active_sessions(self) -> int:
        """Get count of active sessions."""
        return len(self._sessions)


# Global singleton instance
_auth_manager = None


def get_auth_manager() -> AuthManager:
    """Get the global AuthManager instance."""
    global _auth_manager
    if _auth_manager is None:
        _auth_manager = AuthManager()
    return _auth_manager
