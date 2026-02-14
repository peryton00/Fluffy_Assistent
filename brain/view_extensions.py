"""
Extension Manager - View Fluffy's Self-Improvements
Shows all extensions Fluffy has created for herself
"""

import json
from pathlib import Path
from datetime import datetime

print("=" * 70)
print("🧠 FLUFFY'S SELF-IMPROVEMENTS")
print("=" * 70)

extensions_dir = Path(__file__).parent / "extensions"

if not extensions_dir.exists():
    print("\n❌ No extensions directory found")
    print("Fluffy hasn't created any self-improvements yet!")
    exit()

# Get all extensions
extensions = [d for d in extensions_dir.iterdir() if d.is_dir() and not d.name.startswith('__')]

if not extensions:
    print("\n📦 No extensions found yet")
    print("Fluffy will create extensions here when she learns new capabilities!")
    exit()

print(f"\n📦 Total Extensions: {len(extensions)}")
print("=" * 70)

for i, ext_dir in enumerate(sorted(extensions), 1):
    print(f"\n[{i}] {ext_dir.name.upper()}")
    print("-" * 70)
    
    # Read metadata
    metadata_file = ext_dir / "metadata.json"
    if metadata_file.exists():
        metadata = json.loads(metadata_file.read_text())
        
        print(f"📝 Description: {metadata.get('description', 'N/A')}")
        print(f"📅 Created: {metadata.get('created', 'N/A')[:19]}")
        print(f"🔧 Version: {metadata.get('version', 'N/A')}")
        print(f"👤 Author: {metadata.get('author', 'N/A')}")
        
        # Show patterns
        patterns = metadata.get('patterns', [])
        if patterns:
            print(f"🎯 Command Patterns:")
            for pattern in patterns:
                print(f"   • {pattern}")
        
        # Show parameters
        params = metadata.get('parameters', {})
        if params:
            print(f"⚙️  Parameters:")
            for param, desc in params.items():
                print(f"   • {param}: {desc}")
    
    # Show files
    files = list(ext_dir.iterdir())
    print(f"📁 Files: {len(files)}")
    for file in sorted(files):
        if file.is_file():
            size = file.stat().st_size
            print(f"   • {file.name} ({size} bytes)")

print("\n" + "=" * 70)
print("📍 LOCATION")
print("=" * 70)
print(f"\nAll extensions are stored in:")
print(f"  {extensions_dir}")
print(f"\nYou can:")
print(f"  • View the code in each extension folder")
print(f"  • Delete an extension by deleting its folder")
print(f"  • Modify extensions manually if needed")

print("\n" + "=" * 70)
print("💡 HOW IT WORKS")
print("=" * 70)
print("""
When you ask Fluffy to do something she can't do:
1. She detects the missing capability
2. Uses AI to generate the code
3. Creates a new extension in this folder
4. Loads it automatically
5. Executes your command!

All without modifying her core code! 🎉
""")

print("=" * 70)
