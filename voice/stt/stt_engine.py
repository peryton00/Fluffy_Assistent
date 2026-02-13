"""
Speech-to-Text Engine using Vosk
Provides offline speech recognition with real-time transcription
"""

import os
import sys
import json
import queue
import threading
from pathlib import Path
from typing import Optional, Callable

try:
    import vosk
    import sounddevice as sd
    import numpy as np
    VOSK_AVAILABLE = True
except ImportError as e:
    print(f"[STT] Warning: {e}", file=sys.stderr)
    print("[STT] Install with: pip install vosk sounddevice", file=sys.stderr)
    VOSK_AVAILABLE = False


class STTEngine:
    """
    Offline Speech-to-Text engine using Vosk
    
    Features:
    - Real-time audio capture using sounddevice
    - Streaming recognition with partial results
    - Thread-safe audio processing
    """
    def __init__(self, model_path: Optional[str] = None):
        """
        Initialize STT engine
        
        Args:
            model_path: Path to Vosk model directory. If None, uses default location.
        """
        self.project_root = Path(__file__).parent.parent.parent
        self.model_path = model_path or self._get_default_model_path()
        
        self.model = None
        self.recognizer = None
        self.stream = None
        
        self.is_listening = False
        self.transcription = ""
        self.audio_queue = queue.Queue()
        self.listen_thread = None
        
        # Audio settings
        self.sample_rate = 16000
        self.chunk_size = 4000
        
        self._initialize_model()
    
    def _get_default_model_path(self) -> Path:
        """Get default Vosk model path"""
        # Check for small English model first
        default_models = [
            self.project_root / "assets" / "vosk" / "models" / "vosk-model-small-en-us-0.15",
            self.project_root / "assets" / "vosk" / "models" / "vosk-model-en-us-0.22",
            self.project_root / "assets" / "vosk" / "models" / "vosk-model-en-us-0.22-lgraph",
        ]
        
        for model_path in default_models:
            if model_path.exists():
                return model_path
        
        # Return first path as default (will fail gracefully if not exists)
        return default_models[0]
    
    def _initialize_model(self):
        """Initialize Vosk model and recognizer"""
        if not VOSK_AVAILABLE:
            print("[STT] Vosk not available. Skipping model initialization.")
            return
        
        if not self.model_path.exists():
            print(f"[STT] Model not found at: {self.model_path}")
            print("[STT] Please download a Vosk model and place it in assets/vosk/models/")
            print("[STT] Download from: https://alphacephei.com/vosk/models")
            return
        
        try:
            print(f"[STT] Loading Vosk model from: {self.model_path}")
            self.model = vosk.Model(str(self.model_path))
            self.recognizer = vosk.KaldiRecognizer(self.model, self.sample_rate)
            self.recognizer.SetWords(True)  # Enable word-level timestamps
            print("[STT] Model loaded successfully")
        except Exception as e:
            print(f"[STT] Failed to load model: {e}")
            self.model = None
            self.recognizer = None
    
    def is_available(self) -> bool:
        """Check if STT is available and ready"""
        return VOSK_AVAILABLE and self.model is not None and self.recognizer is not None
    
    def start_listening(self, callback: Optional[Callable[[str], None]] = None):
        """
        Start listening to microphone input
        
        Args:
            callback: Optional callback function called with each transcription update
        """
        if not self.is_available():
            print("[STT] Cannot start listening: STT not available")
            return False
        
        if self.is_listening:
            print("[STT] Already listening")
            return False
        
        try:
            self.is_listening = True
            self.transcription = ""
            
            # Start listening thread
            self.listen_thread = threading.Thread(target=self._listen_loop, args=(callback,), daemon=True)
            self.listen_thread.start()
            
            # Start sounddevice stream
            self.stream = sd.InputStream(
                samplerate=self.sample_rate,
                channels=1,
                dtype='int16',
                blocksize=self.chunk_size,
                callback=self._audio_callback
            )
            self.stream.start()
            
            print("[STT] Started listening")
            return True
            
        except Exception as e:
            print(f"[STT] Failed to start listening: {e}")
            self._cleanup_audio()
            return False
    
    def _audio_callback(self, indata, frames, time, status):
        """sounddevice callback for audio stream"""
        if status:
            print(f"[STT] Audio status: {status}")
        if self.is_listening:
            # Convert numpy array to bytes
            self.audio_queue.put(bytes(indata))
    
    def _listen_loop(self, callback: Optional[Callable[[str], None]]):
        """Main listening loop (runs in separate thread)"""
        print("[STT] Listen loop started")
        
        while self.is_listening:
            try:
                # Get audio data from queue
                data = self.audio_queue.get(timeout=0.5)
                
                # Process audio with Vosk
                if self.recognizer.AcceptWaveform(data):
                    # Final result (end of phrase)
                    result = json.loads(self.recognizer.Result())
                    text = result.get("text", "")
                    
                    if text:
                        self.transcription += text + " "
                        print(f"[STT] Final: {text}")
                        
                        if callback:
                            callback(self.transcription.strip())
                else:
                    # Partial result (ongoing speech)
                    partial = json.loads(self.recognizer.PartialResult())
                    partial_text = partial.get("partial", "")
                    
                    if partial_text:
                        # Update with partial + final
                        current = self.transcription + partial_text
                        print(f"[STT] Partial: {partial_text}")
                        
                        if callback:
                            callback(current.strip())
                            
            except queue.Empty:
                continue
            except Exception as e:
                print(f"[STT] Error in listen loop: {e}")
                break
        
        print("[STT] Listen loop ended")
    
    def stop_listening(self):
        """Stop listening to microphone"""
        if not self.is_listening:
            return
        
        print("[STT] Stopping listening")
        self.is_listening = False
        
        # Wait for listen thread to finish
        if self.listen_thread and self.listen_thread.is_alive():
            self.listen_thread.join(timeout=2.0)
        
        # Get final result
        if self.recognizer:
            try:
                final_result = json.loads(self.recognizer.FinalResult())
                final_text = final_result.get("text", "")
                if final_text:
                    self.transcription += final_text
            except Exception as e:
                print(f"[STT] Error getting final result: {e}")
        
        self._cleanup_audio()
        print("[STT] Stopped listening")
    
    def _cleanup_audio(self):
        """Clean up audio resources"""
        if self.stream:
            try:
                self.stream.stop()
                self.stream.close()
            except Exception as e:
                print(f"[STT] Error closing stream: {e}")
            self.stream = None
        
        # Clear queue
        while not self.audio_queue.empty():
            try:
                self.audio_queue.get_nowait()
            except queue.Empty:
                break
    
    def get_transcription(self) -> str:
        """Get current transcription text"""
        return self.transcription.strip()
    
    def clear_transcription(self):
        """Clear current transcription"""
        self.transcription = ""
    
    def get_status(self) -> dict:
        """Get current STT status"""
        return {
            "available": self.is_available(),
            "listening": self.is_listening,
            "transcription": self.get_transcription(),
            "model_loaded": self.model is not None,
            "model_path": str(self.model_path) if self.model_path else None
        }
    
    def __del__(self):
        """Cleanup on deletion"""
        if self.is_listening:
            self.stop_listening()


# Singleton instance
_stt_engine_instance: Optional[STTEngine] = None


def get_stt_engine() -> STTEngine:
    """Get or create singleton STT engine instance"""
    global _stt_engine_instance
    if _stt_engine_instance is None:
        _stt_engine_instance = STTEngine()
    return _stt_engine_instance


# Test function
def test_stt():
    """Test STT engine with microphone input"""
    print("=== Vosk STT Test ===")
    
    engine = STTEngine()
    
    if not engine.is_available():
        print("STT not available. Please check:")
        print("1. Vosk is installed: pip install vosk")
        print("2. sounddevice is installed: pip install sounddevice")
        print("3. Model is downloaded to assets/vosk/models/")
        return
    
    print("STT engine ready!")
    print("Starting microphone test...")
    print("Speak now (will record for 10 seconds)...")
    
    def on_transcription(text):
        print(f"\rTranscription: {text}", end="", flush=True)
    
    engine.start_listening(callback=on_transcription)
    
    # Listen for 10 seconds
    import time
    time.sleep(10)
    
    engine.stop_listening()
    
    print(f"\n\nFinal transcription: {engine.get_transcription()}")
    print("Test complete!")


if __name__ == "__main__":
    test_stt()
