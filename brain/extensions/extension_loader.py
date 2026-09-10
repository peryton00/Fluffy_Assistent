"""
Extension Loader
Dynamically loads and manages Fluffy extensions
"""

import json
import importlib
import sys
import re
from pathlib import Path
from typing import Dict, Any, Optional


class ExtensionLoader:
    """Load and manage extensions"""
    
    def __init__(self):
        # Anchor to brain/extensions directory
        self.extensions_dir = Path(__file__).resolve().parent
        self.registry_path = self.extensions_dir / "registry.json"
        self.extensions = {}
        self.load_errors = {}  # Track loading errors for better user feedback
        self._registry_cache = None
        self._registry_mtime = None
        self._ensure_extensions_dir()
        self.load_all_extensions()
    
    def _ensure_extensions_dir(self):
        """Create extensions directory if it doesn't exist"""
        if not self.extensions_dir.exists():
            self.extensions_dir.mkdir(parents=True, exist_ok=True)
            print(f"[ExtensionLoader] Created extensions directory: {self.extensions_dir}")
    
    def get_last_load_error(self, intent: str) -> str:
        """Get detailed error message for failed extension load"""
        return self.load_errors.get(intent, "Unknown error - check console logs")
    
    def load_all_extensions(self):
        """Load all extensions from extensions folder"""
        # Add project root to path for brain.xxx imports
        project_root = str(self.extensions_dir.parent.parent)
        if project_root not in sys.path:
            sys.path.insert(0, project_root)
        
        # Add brain to path for direct imports
        brain_dir = str(self.extensions_dir.parent)
        if brain_dir not in sys.path:
            sys.path.insert(0, brain_dir)
        
        loaded_count = 0
        
        for ext_dir in self.extensions_dir.iterdir():
            if not ext_dir.is_dir():
                continue
            
            if ext_dir.name.startswith('__') or ext_dir.name == '__pycache__':
                continue
            
            metadata_file = ext_dir / "metadata.json"
            if not metadata_file.exists():
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
                print(f"[ExtensionLoader] [OK] Loaded: {metadata.get('name', intent)}")
                
                # Clear any previous errors for this extension
                if intent in self.load_errors:
                    del self.load_errors[intent]
                
            except Exception as e:
                # Store detailed error for user feedback
                error_msg = f"{type(e).__name__}: {str(e)}"
                self.load_errors[ext_dir.name] = error_msg
                print(f"[ExtensionLoader] [ERROR] Failed to load {ext_dir.name}: {error_msg}")
        
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
        """Get regex patterns and triggers for intent"""
        if intent not in self.extensions:
            return []
        meta = self.extensions[intent]["metadata"]
        patterns = meta.get("patterns", [])
        triggers = meta.get("triggers", [])
        aliases = meta.get("aliases", [])
        combined = []
        for item in (patterns + triggers + aliases):
            if item and item not in combined:
                combined.append(item)
        return combined
    
    def get_all_patterns(self) -> Dict[str, list]:
        """Get all patterns from all extensions"""
        all_patterns = {}
        for intent in self.extensions:
            p = self.get_patterns(intent)
            if p:
                all_patterns[intent] = p
        return all_patterns

    def find_extension_for_command(self, text: str) -> Optional[str]:
        """
        Find an existing extension that satisfies the user command.
        Matches by:
          1. Exact or normalized intent name
          2. Regex triggers / patterns
          3. Exact phrase match in triggers/aliases
          4. Semantic keyword overlap
        """
        if not text:
            return None
        cleaned = text.strip().lower()
        cleaned_words = set(re.findall(r"\b[a-zA-Z0-9]+\b", cleaned))

        # 1. Exact intent match
        for intent in self.extensions:
            if intent.lower() == cleaned:
                return intent

        # 2. Pattern and Trigger matching
        for intent, ext in self.extensions.items():
            meta = ext.get("metadata", {})
            triggers = meta.get("triggers", []) + meta.get("patterns", []) + meta.get("aliases", [])
            for trig in triggers:
                if not trig:
                    continue
                trig_clean = trig.strip().lower()
                # Direct string equality or containment
                if trig_clean == cleaned or trig_clean in cleaned or cleaned in trig_clean:
                    return intent
                # Try regex matching
                try:
                    pattern = trig
                    if not pattern.startswith("(?i)"):
                        pattern = f"(?i){pattern}"
                    if re.search(pattern, cleaned):
                        return intent
                except re.error:
                    pass

        # 3. Intent token overlap (e.g. "scan bluetooth" matches "bluetooth_scan")
        for intent in self.extensions:
            intent_tokens = set(intent.lower().split("_"))
            if intent_tokens and intent_tokens.issubset(cleaned_words):
                return intent

        return None
    
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
            
            print(f"[ExtensionLoader] [OK] Reloaded: {intent}")
            return True
            
        except Exception as e:
            print(f"[ExtensionLoader] \u2717 Failed to reload {intent}: {e}")
            return False
    
    def load_registry(self) -> dict:
        """Load extension registry from JSON"""
        try:
            if not self.registry_path.exists():
                return {}
            current_mtime = self.registry_path.stat().st_mtime
            if self._registry_cache and self._registry_mtime == current_mtime:
                return self._registry_cache
            with open(self.registry_path, 'r', encoding='utf-8') as f:
                registry = json.load(f)
            self._registry_cache = registry
            self._registry_mtime = current_mtime
            return registry
        except Exception as e:
            print(f"[ExtensionLoader] Failed to load registry: {e}")
            return {}
    
    def save_registry(self, registry: dict):
        """Save registry to JSON file"""
        try:
            with open(self.registry_path, 'w', encoding='utf-8') as f:
                json.dump(registry, f, indent=2)
            self._registry_mtime = self.registry_path.stat().st_mtime
            self._registry_cache = registry
        except Exception as e:
            print(f"[ExtensionLoader] Failed to save registry: {e}")
    
    def refresh_extensions(self) -> list:
        """Hot-reload extensions from registry"""
        registry = self.load_registry()
        newly_loaded = []
        for intent, metadata in registry.items():
            if not metadata.get('enabled', True) or intent in self.extensions:
                continue
            ext_dir = self.extensions_dir / metadata['directory']
            if not ext_dir.exists():
                continue
            try:
                with open(ext_dir / "metadata.json", 'r', encoding='utf-8') as f:
                    ext_metadata = json.load(f)
                module_name = f"extensions.{metadata['directory']}.handler"
                if module_name in sys.modules:
                    importlib.reload(sys.modules[module_name])
                else:
                    sys.path.insert(0, str(self.extensions_dir.parent))
                    importlib.import_module(module_name)
                handler = sys.modules[module_name].get_handler()
                validator_module_name = f"extensions.{metadata['directory']}.validator"
                if validator_module_name in sys.modules:
                    importlib.reload(sys.modules[validator_module_name])
                else:
                    importlib.import_module(validator_module_name)
                validator = sys.modules[validator_module_name].get_validator()
                self.extensions[intent] = {
                    "handler": handler,
                    "validator": validator,
                    "metadata": ext_metadata,
                    "patterns": ext_metadata.get("patterns", []),
                    "description": ext_metadata.get("description", "")
                }
                newly_loaded.append(intent)
                print(f"[ExtensionLoader] [OK] Hot-loaded: {intent}")
            except Exception as e:
                print(f"[ExtensionLoader] [ERROR] Failed to hot-load {intent}: {e}")
                self.load_errors[intent] = str(e)
        return newly_loaded
    
    def register_extension(self, intent: str, metadata: dict) -> bool:
        """Add extension to registry and load it"""
        registry = self.load_registry()
        registry[intent] = metadata
        self.save_registry(registry)
        newly_loaded = self.refresh_extensions()
        return intent in newly_loaded
    
    def sync_registry(self) -> bool:
        """Scan extensions/ and update registry"""
        registry = self.load_registry()
        updated = False
        for ext_dir in self.extensions_dir.iterdir():
            if not ext_dir.is_dir() or ext_dir.name.startswith('_') or ext_dir.name == '__pycache__':
                continue
            meta_file = ext_dir / "metadata.json"
            if not meta_file.exists():
                continue
            try:
                with open(meta_file, 'r', encoding='utf-8') as f:
                    metadata = json.load(f)
                intent = metadata.get('intent', ext_dir.name)
                if intent not in registry:
                    registry[intent] = {
                        "name": metadata.get('name', intent),
                        "intent": intent,
                        "patterns": [p.replace('\\\\', '') for p in metadata.get('patterns', [])],
                        "description": metadata.get('description', ''),
                        "directory": ext_dir.name,
                        "created": metadata.get('created', ''),
                        "version": metadata.get('version', '1.0.0'),
                        "enabled": True,
                        "author": metadata.get('author', 'Unknown')
                    }
                    updated = True
                    print(f"[ExtensionLoader] Added {intent} to registry")
            except Exception as e:
                print(f"[ExtensionLoader] Failed to sync {ext_dir.name}: {e}")
        if updated:
            self.save_registry(registry)
        return updated
    
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
