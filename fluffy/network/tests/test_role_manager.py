"""
Tests for role manager module
"""

import os
import sys
import unittest

# Add network module to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from role_manager import RoleManager, ROLE_STANDALONE, ROLE_AVAILABLE, ROLE_ADMIN


class TestRoleManager(unittest.TestCase):
    """Test role manager functionality."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.role_manager = RoleManager()
        self.config_path = os.path.join(os.path.dirname(__file__), '..', 'role_config.json')
    
    def tearDown(self):
        """Clean up after tests."""
        # Remove test config if it exists
        if os.path.exists(self.config_path):
            try:
                os.remove(self.config_path)
            except:
                pass
    
    def test_default_role(self):
        """Test default role is standalone."""
        self.assertEqual(self.role_manager.get_current_role(), ROLE_STANDALONE)
    
    def test_role_switching(self):
        """Test switching between roles."""
        # Switch to available
        success, msg = self.role_manager.set_role(ROLE_AVAILABLE)
        self.assertTrue(success)
        self.assertEqual(self.role_manager.get_current_role(), ROLE_AVAILABLE)
        
        # Switch back to standalone
        success, msg = self.role_manager.set_role(ROLE_STANDALONE)
        self.assertTrue(success)
        self.assertEqual(self.role_manager.get_current_role(), ROLE_STANDALONE)
        
        # Switch to admin
        success, msg = self.role_manager.set_role(ROLE_ADMIN)
        self.assertTrue(success)
        self.assertEqual(self.role_manager.get_current_role(), ROLE_ADMIN)
    
    def test_mutual_exclusivity(self):
        """Test mutual exclusivity between available and admin modes."""
        # Set to available
        self.role_manager.set_role(ROLE_AVAILABLE)
        
        # Try to switch to admin (should fail)
        can_switch, reason = self.role_manager.can_switch_to(ROLE_ADMIN)
        self.assertFalse(can_switch)
        self.assertIn("availability", reason.lower())
        
        # Switch to standalone first
        self.role_manager.set_role(ROLE_STANDALONE)
        
        # Now switch to admin
        self.role_manager.set_role(ROLE_ADMIN)
        
        # Try to switch to available (should fail)
        can_switch, reason = self.role_manager.can_switch_to(ROLE_AVAILABLE)
        self.assertFalse(can_switch)
        self.assertIn("admin", reason.lower())
    
    def test_invalid_role(self):
        """Test setting invalid role."""
        can_switch, reason = self.role_manager.can_switch_to("invalid_role")
        self.assertFalse(can_switch)
        self.assertIn("Invalid", reason)
    
    def test_role_persistence(self):
        """Test role persists across instances."""
        # Set role
        self.role_manager.set_role(ROLE_AVAILABLE)
        
        # Create new instance
        new_manager = RoleManager()
        
        # Should load saved role
        self.assertEqual(new_manager.get_current_role(), ROLE_AVAILABLE)


if __name__ == '__main__':
    unittest.main()
