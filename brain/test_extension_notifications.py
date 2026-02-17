"""
Test Extension Notification System
Verifies error tracking and extension loading
"""

import sys
from pathlib import Path

# Add brain to path
sys.path.insert(0, str(Path(__file__).parent))

from extension_loader import get_extension_loader


def test_error_tracking():
    """Test that load errors are tracked correctly"""
    print("=" * 70)
    print("Extension Notification System - Test")
    print("=" * 70)
    
    loader = get_extension_loader()
    
    print(f"\n📊 Extension Loading Summary:")
    print(f"  Total loaded: {len(loader.extensions)}")
    print(f"  Failed to load: {len(loader.load_errors)}")
    
    # Show successfully loaded extensions
    if loader.extensions:
        print(f"\n✅ Successfully Loaded Extensions:")
        for intent, ext_data in loader.extensions.items():
            name = ext_data['metadata'].get('name', intent)
            desc = ext_data['metadata'].get('description', 'No description')
            print(f"  • {name}")
            print(f"    Intent: {intent}")
            print(f"    Description: {desc[:60]}...")
    
    # Show failed extensions with errors
    if loader.load_errors:
        print(f"\n❌ Failed Extensions:")
        for ext_name, error in loader.load_errors.items():
            print(f"  • {ext_name}")
            print(f"    Error: {error}")
    else:
        print(f"\n✅ All extensions loaded successfully - no errors!")
    
    # Test get_last_load_error method
    print(f"\n🔍 Testing get_last_load_error() method:")
    
    # Test with a failed extension (if any)
    if loader.load_errors:
        test_intent = list(loader.load_errors.keys())[0]
        error = loader.get_last_load_error(test_intent)
        print(f"  Extension: {test_intent}")
        print(f"  Error: {error}")
    
    # Test with a non-existent extension
    error = loader.get_last_load_error("nonexistent_extension")
    print(f"  Extension: nonexistent_extension")
    print(f"  Error: {error}")
    
    print("\n" + "=" * 70)
    print("TEST COMPLETE")
    print("=" * 70)
    
    # Return status for automated testing
    return {
        "total_extensions": len(loader.extensions),
        "failed_extensions": len(loader.load_errors),
        "all_passed": len(loader.load_errors) == 0
    }


if __name__ == "__main__":
    result = test_error_tracking()
    
    # Exit with appropriate code
    exit_code = 0 if result["all_passed"] else 1
    
    if result["all_passed"]:
        print("\n✅ All tests passed!")
    else:
        print(f"\n⚠️  {result['failed_extensions']} extension(s) failed to load")
    
    sys.exit(exit_code)
