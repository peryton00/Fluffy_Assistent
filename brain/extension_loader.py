"""
Extension Loader
Dynamically loads and manages Fluffy extensions
"""

import json
import importlib
import sys
from pathlib import Path
from typing import Dict, Any, Optional


class ExtensionLoader:
    """Load and manage extensions"""
    
    def __init__(self):
        self.extensions_dir = Path(__file__).parent / "extensions"
        self.extensions = {}
        self._ensure_extensions_dir()
        self.load_all_extensions()
    
    def _ensure_extensions_dir(self):
        """Create extensions directory if it doesn't exist"""
        if not self.extensions_dir.exists():
            self.extensions_dir.mkdir(parents=True, exist_ok=True)
            print(f"[ExtensionLoader] Created extensions directory: {self.extensions_dir}")
    
    def load_all_extensions(self):
        """Load all extensions from extensions folder"""
        # Add extensions to Python path
        extensions_parent = str(self.extensions_dir.parent)
        if extensions_parent not in sys.path:
            sys.path.insert(0, extensions_parent)
        
        loaded_count = 0
        
        for ext_dir in self.extensions_dir.iterdir():
            if not ext_dir.is_dir():
                continue
            
            if ext_dir.name.startswith('__'):
                continue
            
            metadata_file = ext_dir / "metadata.json"
            if not metadata_file.exists():
                print(f"[ExtensionLoader] Skipping {ext_dir.name}: no metadata.json")
                continue
            
            try:
                # Load metadata
                metadata = json.loads(metadata_file.read_text())
                intent = metadata.get("intent", ext_dir.name)
                
                # Load handler
                handler_module = importlib.import_module(
                    f"extensions.{ext_dir.name}.handler"
                )
                handler = handler_module.get_handler()
                
                # Load validator
                validator_module = importlib.import_module(
                    f"extensions.{ext_dir.name}.validator"
                )
                validator = validator_module.get_validator()
                
                # Store extension
                self.extensions[intent] = {
                    "name": ext_dir.name,
                    "metadata": metadata,
                    "handler": handler,
                    "validator": validator
                }
                
                loaded_count += 1
                print(f"[ExtensionLoader] ✓ Loaded: {metadata.get('name', intent)}")
                
            except Exception as e:
                print(f"[ExtensionLoader] ✗ Failed to load {ext_dir.name}: {e}")
        
        if loaded_count > 0:
            print(f"[ExtensionLoader] Total extensions loaded: {loaded_count}")
        else:
            print(f"[ExtensionLoader] No extensions found in {self.extensions_dir}")
    
    def has_extension(self, intent: str) -> bool:
        """Check if extension exists for intent"""
        return intent in self.extensions
    
    def execute(self, command, validation) -> Dict[str, Any]:
        """Execute extension handler"""
        intent = command.intent.value if hasattr(command.intent, 'value') else str(command.intent)
        
        if intent not in self.extensions:
            return {
                "success": False,
                "message": f"Extension '{intent}' not found",
                "action": "error"
            }
        
        try:
            handler = self.extensions[intent]["handler"]
            result = handler.execute(command)
            return result
        except Exception as e:
            return {
                "success": False,
                "message": f"Extension error: {str(e)}",
                "action": "error"
            }
    
    def validate(self, command):
        """Validate using extension validator"""
        intent = command.intent.value if hasattr(command.intent, 'value') else str(command.intent)
        
        if intent not in self.extensions:
            return None
        
        try:
            validator = self.extensions[intent]["validator"]
            return validator.validate(command)
        except Exception as e:
            print(f"[ExtensionLoader] Validation error for {intent}: {e}")
            return None
    
    def get_patterns(self, intent: str) -> list:
        """Get regex patterns for intent"""
        if intent not in self.extensions:
            return []
        
        return self.extensions[intent]["metadata"].get("patterns", [])
    
    def get_all_patterns(self) -> Dict[str, list]:
        """Get all patterns from all extensions"""
        all_patterns = {}
        for intent, ext in self.extensions.items():
            patterns = ext["metadata"].get("patterns", [])
            if patterns:
                all_patterns[intent] = patterns
        return all_patterns
    
    def reload_extension(self, intent: str) -> bool:
        """Reload a specific extension"""
        if intent not in self.extensions:
            print(f"[ExtensionLoader] Extension '{intent}' not found")
            return False
        
        ext_name = self.extensions[intent]["name"]
        
        try:
            # Reload modules
            handler_module = f"extensions.{ext_name}.handler"
            validator_module = f"extensions.{ext_name}.validator"
            
            if handler_module in sys.modules:
                importlib.reload(sys.modules[handler_module])
            if validator_module in sys.modules:
                importlib.reload(sys.modules[validator_module])
            
            # Reload extension data
            self.load_all_extensions()
            
            print(f"[ExtensionLoader] ✓ Reloaded: {intent}")
            return True
            
        except Exception as e:
            print(f"[ExtensionLoader] ✗ Failed to reload {intent}: {e}")
            return False
    
    def list_extensions(self) -> list:
        """List all loaded extensions"""
        extensions_list = []
        for intent, ext in self.extensions.items():
            extensions_list.append({
                "intent": intent,
                "name": ext["metadata"].get("name", intent),
                "description": ext["metadata"].get("description", ""),
                "version": ext["metadata"].get("version", "1.0.0"),
                "patterns": ext["metadata"].get("patterns", [])
            })
        return extensions_list


# Global singleton
_extension_loader = None


def get_extension_loader() -> ExtensionLoader:
    """Get or create the global ExtensionLoader instance"""
    global _extension_loader
    if _extension_loader is None:
        _extension_loader = ExtensionLoader()
    return _extension_loader


# Test function
if __name__ == "__main__":
    print("=" * 70)
    print("Extension Loader - Test")
    print("=" * 70)
    
    loader = get_extension_loader()
    
    print(f"\n[Test] Extensions directory: {loader.extensions_dir}")
    print(f"[Test] Loaded extensions: {len(loader.extensions)}")
    
    if loader.extensions:
        print("\n[Test] Extension list:")
        for ext in loader.list_extensions():
            print(f"  - {ext['name']}: {ext['description']}")
            print(f"    Intent: {ext['intent']}")
            print(f"    Patterns: {ext['patterns']}")
    else:
        print("\n[Test] No extensions loaded (this is normal for first run)")
    
    print("\n" + "=" * 70)
    print("TEST COMPLETE")
    print("=" * 70)
