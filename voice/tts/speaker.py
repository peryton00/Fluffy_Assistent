"""
Piper TTS Speaker Module
Handles low-level Piper TTS execution and audio playback.
"""
import subprocess
import tempfile
import os
import sys
import winsound
from pathlib import Path
from threading import Thread, Lock


class PiperSpeaker:
    """
    Low-level Piper TTS wrapper.
    Executes piper.exe, generates WAV files, and plays them.
    """
    
    def __init__(self):
        self.project_root = Path(__file__).parent.parent.parent.absolute()
        self.piper_exe = self.project_root / "assets" / "piper" / "piper.exe"
        self.model_path = self.project_root / "assets" / "piper" / "models" / "en_US-ljspeech-high.onnx"
        self.speech_lock = Lock()
        self._validate_setup()
    
    def _validate_setup(self):
        """Validate Piper installation."""
        if not self.piper_exe.exists():
            print(f"[Voice] ERROR: Piper executable not found at {self.piper_exe}", file=sys.stderr)
            print("[Voice] Please download Piper from: https://github.com/rhasspy/piper/releases", file=sys.stderr)
            raise FileNotFoundError(f"Piper executable missing: {self.piper_exe}")
        
        if not self.model_path.exists():
            print(f"[Voice] ERROR: Piper model not found at {self.model_path}", file=sys.stderr)
            print("[Voice] Please download en_US-ljspeech-high model", file=sys.stderr)
            raise FileNotFoundError(f"Piper model missing: {self.model_path}")
        
        print(f"[Voice] Piper TTS initialized successfully", file=sys.stderr)
        print(f"[Voice] Executable: {self.piper_exe}", file=sys.stderr)
        print(f"[Voice] Model: {self.model_path}", file=sys.stderr)
    
    def _generate_speech(self, text: str, output_wav: Path) -> bool:
        """
        Generate speech using Piper TTS.
        
        Args:
            text: Text to speak
            output_wav: Path to output WAV file
            
        Returns:
            True if successful, False otherwise
        """
        try:
            # Piper command: echo "text" | piper.exe --model model.onnx --output_file output.wav
            cmd = [
                str(self.piper_exe),
                "--model", str(self.model_path),
                "--output_file", str(output_wav)
            ]
            
            # Run Piper with text as stdin
            result = subprocess.run(
                cmd,
                input=text.encode('utf-8'),
                capture_output=True,
                timeout=10,
                creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0
            )
            
            if result.returncode != 0:
                print(f"[Voice] Piper execution failed: {result.stderr.decode('utf-8', errors='ignore')}", file=sys.stderr)
                return False
            
            if not output_wav.exists():
                print(f"[Voice] Piper did not generate output file", file=sys.stderr)
                return False
            
            return True
            
        except subprocess.TimeoutExpired:
            print(f"[Voice] Piper execution timed out", file=sys.stderr)
            return False
        except Exception as e:
            print(f"[Voice] Piper execution error: {e}", file=sys.stderr)
            return False
    
    def _play_wav(self, wav_path: Path):
        """
        Play WAV file using winsound.
        
        Args:
            wav_path: Path to WAV file
        """
        try:
            winsound.PlaySound(str(wav_path), winsound.SND_FILENAME)
        except Exception as e:
            print(f"[Voice] Audio playback error: {e}", file=sys.stderr)
    
    def speak(self, text: str, blocking: bool = False):
        """
        Speak text using Piper TTS.
        
        Args:
            text: Text to speak
            blocking: If True, wait for speech to complete. If False, speak in background.
        """
        if blocking:
            self._speak_sync(text)
        else:
            # Non-blocking: spawn thread
            thread = Thread(target=self._speak_sync, args=(text,), daemon=True)
            thread.start()
    
    def _speak_sync(self, text: str):
        """
        Synchronous speech execution.
        Generates WAV, plays it, and cleans up.
        """
        # Prevent overlapping speech
        if not self.speech_lock.acquire(blocking=False):
            print(f"[Voice] Speech already in progress, skipping: {text[:50]}...", file=sys.stderr)
            return
        
        temp_wav = None
        try:
            # Create temporary WAV file
            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
                temp_wav = Path(tmp.name)
            
            # Generate speech
            if not self._generate_speech(text, temp_wav):
                print(f"[Voice] Failed to generate speech for: {text[:50]}...", file=sys.stderr)
                return
            
            # Play audio
            self._play_wav(temp_wav)
            
        except Exception as e:
            print(f"[Voice] Speech error: {e}", file=sys.stderr)
        finally:
            # Cleanup
            if temp_wav and temp_wav.exists():
                try:
                    temp_wav.unlink()
                except Exception as e:
                    print(f"[Voice] Failed to delete temp file {temp_wav}: {e}", file=sys.stderr)
            
            self.speech_lock.release()


# Global singleton instance
_speaker_instance = None

def get_speaker() -> PiperSpeaker:
    """Get or create the global PiperSpeaker instance."""
    global _speaker_instance
    if _speaker_instance is None:
        try:
            _speaker_instance = PiperSpeaker()
        except FileNotFoundError as e:
            print(f"[Voice] Piper TTS not available: {e}", file=sys.stderr)
            _speaker_instance = None
    return _speaker_instance
