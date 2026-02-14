"""
Backup Manager
Manages code backups before self-modification
"""

import os
import shutil
from datetime import datetime
from pathlib import Path
from typing import List, Optional


class BackupManager:
    """Manage code backups before self-modification"""
    
    def __init__(self, backup_root: Optional[str] = None):
        """
        Initialize backup manager
        
        Args:
            backup_root: Root directory for backups (default: brain/backups)
        """
        if backup_root is None:
            self.backup_root = Path(__file__).parent / "backups"
        else:
            self.backup_root = Path(backup_root)
        
        # Create backup directory if it doesn't exist
        self.backup_root.mkdir(parents=True, exist_ok=True)
    
    def create_backup(self, files: List[str], description: str = "") -> str:
        """
        Create timestamped backup of files
        
        Args:
            files: List of absolute file paths to backup
            description: Optional description of what's being backed up
            
        Returns:
            backup_id for rollback
        """
        # Generate backup ID
        backup_id = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_dir = self.backup_root / backup_id
        backup_dir.mkdir(parents=True, exist_ok=True)
        
        # Save metadata
        metadata = {
            "timestamp": datetime.now().isoformat(),
            "description": description,
            "files": []
        }
        
        # Copy each file
        for file_path in files:
            try:
                file_path = Path(file_path)
                
                if not file_path.exists():
                    print(f"[BackupManager] Warning: {file_path} does not exist, skipping")
                    continue
                
                # Create relative path structure in backup
                relative_path = file_path.name
                backup_file = backup_dir / relative_path
                
                # Copy file
                shutil.copy2(file_path, backup_file)
                
                metadata["files"].append({
                    "original": str(file_path),
                    "backup": str(backup_file),
                    "size": file_path.stat().st_size
                })
                
                print(f"[BackupManager] Backed up: {file_path.name}")
                
            except Exception as e:
                print(f"[BackupManager] Error backing up {file_path}: {e}")
        
        # Save metadata
        import json
        metadata_file = backup_dir / "metadata.json"
        metadata_file.write_text(json.dumps(metadata, indent=2))
        
        print(f"[BackupManager] Backup created: {backup_id}")
        print(f"[BackupManager] Location: {backup_dir}")
        
        return backup_id
    
    def rollback(self, backup_id: str) -> bool:
        """
        Restore from backup
        
        Args:
            backup_id: ID of backup to restore
            
        Returns:
            True if successful, False otherwise
        """
        backup_dir = self.backup_root / backup_id
        
        if not backup_dir.exists():
            print(f"[BackupManager] Error: Backup {backup_id} not found")
            return False
        
        # Load metadata
        import json
        metadata_file = backup_dir / "metadata.json"
        
        if not metadata_file.exists():
            print(f"[BackupManager] Error: Metadata not found for backup {backup_id}")
            return False
        
        metadata = json.loads(metadata_file.read_text())
        
        # Restore each file
        success = True
        for file_info in metadata["files"]:
            try:
                original_path = Path(file_info["original"])
                backup_path = Path(file_info["backup"])
                
                if not backup_path.exists():
                    print(f"[BackupManager] Warning: Backup file {backup_path} not found")
                    continue
                
                # Restore file
                shutil.copy2(backup_path, original_path)
                print(f"[BackupManager] Restored: {original_path.name}")
                
            except Exception as e:
                print(f"[BackupManager] Error restoring {file_info['original']}: {e}")
                success = False
        
        if success:
            print(f"[BackupManager] ✓ Rollback successful: {backup_id}")
        else:
            print(f"[BackupManager] ⚠ Rollback completed with errors: {backup_id}")
        
        return success
    
    def list_backups(self) -> List[Dict]:
        """List all available backups"""
        import json
        
        backups = []
        
        for backup_dir in sorted(self.backup_root.iterdir(), reverse=True):
            if not backup_dir.is_dir():
                continue
            
            metadata_file = backup_dir / "metadata.json"
            if not metadata_file.exists():
                continue
            
            try:
                metadata = json.loads(metadata_file.read_text())
                backups.append({
                    "id": backup_dir.name,
                    "timestamp": metadata.get("timestamp"),
                    "description": metadata.get("description"),
                    "file_count": len(metadata.get("files", []))
                })
            except Exception as e:
                print(f"[BackupManager] Error reading backup {backup_dir.name}: {e}")
        
        return backups
    
    def delete_backup(self, backup_id: str) -> bool:
        """Delete a backup"""
        backup_dir = self.backup_root / backup_id
        
        if not backup_dir.exists():
            print(f"[BackupManager] Backup {backup_id} not found")
            return False
        
        try:
            shutil.rmtree(backup_dir)
            print(f"[BackupManager] Deleted backup: {backup_id}")
            return True
        except Exception as e:
            print(f"[BackupManager] Error deleting backup {backup_id}: {e}")
            return False


# Global singleton
_backup_manager = None

def get_backup_manager() -> BackupManager:
    """Get or create the global BackupManager instance"""
    global _backup_manager
    if _backup_manager is None:
        _backup_manager = BackupManager()
    return _backup_manager


# Test function
if __name__ == "__main__":
    print("=" * 70)
    print("Backup Manager - Test")
    print("=" * 70)
    
    manager = get_backup_manager()
    
    # Test backup creation
    test_files = [
        str(Path(__file__).parent / "command_parser.py"),
        str(Path(__file__).parent / "command_executor.py"),
    ]
    
    print("\n[Test] Creating backup...")
    backup_id = manager.create_backup(test_files, "Test backup")
    
    print(f"\n[Test] Backup ID: {backup_id}")
    
    print("\n[Test] Listing backups...")
    backups = manager.list_backups()
    for backup in backups:
        print(f"  - {backup['id']}: {backup['description']} ({backup['file_count']} files)")
    
    print("\n[Test] Testing rollback...")
    success = manager.rollback(backup_id)
    print(f"  Rollback success: {success}")
    
    print("\n" + "=" * 70)
    print("TEST COMPLETE")
    print("=" * 70)
