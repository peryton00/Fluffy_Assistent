"""
Tests for authentication module
"""

import os
import sys
import unittest
import tempfile

# Add network module to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from auth import AuthManager


class TestAuthManager(unittest.TestCase):
    """Test authentication manager functionality."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.auth_manager = AuthManager()
        # Use temp file for credentials
        self.original_creds_path = os.path.join(os.path.dirname(__file__), '..', 'credentials.json')
    
    def tearDown(self):
        """Clean up after tests."""
        # Remove test credentials if they exist
        if os.path.exists(self.original_creds_path):
            try:
                os.remove(self.original_creds_path)
            except:
                pass
    
    def test_password_hashing(self):
        """Test password hashing and verification."""
        password = "test_password_123"
        hashed = self.auth_manager.hash_password(password)
        
        # Hash should be different from password
        self.assertNotEqual(password, hashed)
        
        # Verification should succeed
        self.assertTrue(self.auth_manager.verify_password(password, hashed))
        
        # Wrong password should fail
        self.assertFalse(self.auth_manager.verify_password("wrong_password", hashed))
    
    def test_create_and_delete_credentials(self):
        """Test credential creation and deletion."""
        username = "test_user"
        password = "test_pass_123"
        
        # Create credentials
        success = self.auth_manager.create_credentials(username, password)
        self.assertTrue(success)
        self.assertTrue(os.path.exists(self.original_creds_path))
        
        # Delete credentials
        success = self.auth_manager.delete_credentials()
        self.assertTrue(success)
        self.assertFalse(os.path.exists(self.original_creds_path))
    
    def test_authentication(self):
        """Test authentication flow."""
        username = "test_user"
        password = "test_pass_123"
        ip = "192.168.1.100"
        
        # Create credentials
        self.auth_manager.create_credentials(username, password)
        
        # Authenticate with correct credentials
        success, token = self.auth_manager.authenticate(username, password, ip)
        self.assertTrue(success)
        self.assertIsInstance(token, str)
        self.assertTrue(len(token) > 0)
        
        # Validate session
        self.assertTrue(self.auth_manager.validate_session(token))
        
        # Revoke session
        self.auth_manager.revoke_session(token)
        self.assertFalse(self.auth_manager.validate_session(token))
        
        # Clean up
        self.auth_manager.delete_credentials()
    
    def test_login_attempt_limiting(self):
        """Test login attempt limiting."""
        username = "test_user"
        password = "test_pass_123"
        ip = "192.168.1.100"
        
        # Create credentials
        self.auth_manager.create_credentials(username, password)
        
        # Make 5 failed attempts
        for i in range(5):
            success, msg = self.auth_manager.authenticate(username, "wrong_password", ip)
            self.assertFalse(success)
        
        # 6th attempt should be blocked
        success, msg = self.auth_manager.authenticate(username, password, ip)
        self.assertFalse(success)
        self.assertIn("Too many", msg)
        
        # Clean up
        self.auth_manager.delete_credentials()


if __name__ == '__main__':
    unittest.main()
