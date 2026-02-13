"""
Quick test script to verify TTS and STT setup
"""

print("=" * 60)
print("FLUFFY VOICE SYSTEM TEST")
print("=" * 60)

# Test 1: TTS
print("\n[1/3] Testing TTS (Text-to-Speech)...")
try:
    from voice import speak_custom
    print("✓ TTS module imported successfully")
    print("  Speaking test message...")
    speak_custom("Hello, this is a test of the text to speech system")
    print("✓ TTS test complete (check if you heard audio)")
except Exception as e:
    print(f"✗ TTS test failed: {e}")

# Test 2: STT Status
print("\n[2/3] Testing STT (Speech-to-Text) availability...")
try:
    from voice import get_stt_status
    status = get_stt_status()
    print(f"✓ STT module imported successfully")
    print(f"  Available: {status['available']}")
    print(f"  Model Loaded: {status['model_loaded']}")
    print(f"  Model Path: {status['model_path']}")
    print(f"  Listening: {status['listening']}")
    
    if status['available']:
        print("✓ STT is ready to use!")
    else:
        print("⚠ STT not available (check model installation)")
except Exception as e:
    print(f"✗ STT status check failed: {e}")

# Test 3: Voice Controller
print("\n[3/3] Testing Voice Controller...")
try:
    from voice import get_voice_controller
    vc = get_voice_controller()
    print(f"✓ Voice Controller initialized")
    print(f"  TTS Enabled: {vc.enabled}")
    print(f"  STT Enabled: {vc.stt_enabled}")
except Exception as e:
    print(f"✗ Voice Controller test failed: {e}")

print("\n" + "=" * 60)
print("TEST COMPLETE")
print("=" * 60)
print("\nNext steps:")
print("1. Start Fluffy Brain: python brain/listener.py")
print("2. Start Fluffy UI: npm run tauri dev")
print("3. Test TTS from Settings tab")
print("4. Test STT from Settings tab")
