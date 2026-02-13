"""
Test TTS chunking behavior with different sentence lengths
"""

from voice import speak_custom
import time

print("=" * 60)
print("TTS CHUNKING TEST")
print("=" * 60)

# Test 1: Short sentence (4 words) - should NOT be chunked
print("\n[Test 1] Short sentence (4 words):")
print("Text: 'Boss, this is fluffy'")
print("Expected: Single chunk, no delay")
speak_custom("Boss, this is fluffy")
time.sleep(2)

# Test 2: Exactly 6 words - should NOT be chunked
print("\n[Test 2] Exactly 6 words:")
print("Text: 'Hello Boss, Fluffy is ready to serve'")
print("Expected: Single chunk, no delay")
speak_custom("Hello Boss, Fluffy is ready to serve")
time.sleep(2)

# Test 3: 7 words - WILL be chunked at punctuation
print("\n[Test 3] 7 words (exceeds threshold):")
print("Text: 'Hello Boss, Fluffy is ready to serve you'")
print("Expected: May split at comma")
speak_custom("Hello Boss, Fluffy is ready to serve you")
time.sleep(3)

# Test 4: Long sentence - will be chunked
print("\n[Test 4] Long sentence (15+ words):")
print("Text: 'Welcome back master peryton. Fluffy is getting ready to serve you with all available features and capabilities'")
print("Expected: Multiple chunks")
speak_custom("Welcome back master peryton. Fluffy is getting ready to serve you with all available features and capabilities")
time.sleep(5)

print("\n" + "=" * 60)
print("TEST COMPLETE")
print("=" * 60)
print("\nSummary:")
print("- Short sentences (≤6 words) are now processed as single chunks")
print("- No delays for short messages like 'Boss, this is fluffy'")
print("- Longer sentences still use smart chunking for better flow")
