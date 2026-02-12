import subprocess
import tempfile
import os
import sys
import winsound
import queue
import concurrent.futures
from pathlib import Path
from threading import Thread, Lock


class PiperSpeaker:
    """
    Low-level Piper TTS wrapper with Multi-Buffer Parallel Pipeline.
    Generates multiple chunks simultaneously using a ThreadPoolExecutor.
    """
    
    def __init__(self):
        self.project_root = Path(__file__).parent.parent.parent.absolute()
        self.piper_exe = self.project_root / "assets" / "piper" / "piper.exe"
        self.model_path = self.project_root / "assets" / "piper" / "models" / "en_US-ljspeech-high.onnx"
        
        self.speech_queue = queue.Queue()
        self.enabled = self._validate_setup()
        
        if self.enabled:
            # Persistent consumer thread for sequential playback
            self.consumer_thread = Thread(target=self._playback_consumer, daemon=True)
            self.consumer_thread.start()
            
            # Thread pool for parallel generation (4 workers for high-volume)
            self.executor = concurrent.futures.ThreadPoolExecutor(max_workers=4)
    
    def _validate_setup(self) -> bool:
        """Validate Piper installation."""
        if not self.piper_exe.exists():
            print(f"[Voice] ERROR: Piper executable not found at {self.piper_exe}", file=sys.stderr)
            return False
        
        if not self.model_path.exists():
            print(f"[Voice] ERROR: Piper model not found at {self.model_path}", file=sys.stderr)
            return False
            
        print(f"[Voice] Piper TTS initialized (4-Worker Multi-Buffer)", file=sys.stderr)
        return True
    
    def _generate_chunk_sync(self, text: str) -> Path:
        """
        Synchronous generation of a single chunk. 
        Designed to be run in the ThreadPool.
        """
        if not text or not text.strip():
            return None
            
        try:
            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
                temp_wav = Path(tmp.name)
            
            cmd = [
                str(self.piper_exe),
                "--model", str(self.model_path),
                "--output_file", str(temp_wav)
            ]
            result = subprocess.run(
                cmd,
                input=text.encode('utf-8'),
                capture_output=True,
                timeout=20,
                creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0
            )
            
            if result.returncode == 0 and temp_wav.exists():
                return temp_wav
            else:
                if temp_wav.exists(): os.unlink(temp_wav)
                return None
        except Exception as e:
            print(f"[Voice] Chunk Gen Error: {e}", file=sys.stderr)
            return None

    def _playback_consumer(self):
        """Sequential playback thread (Consumer)."""
        while True:
            try:
                # Blocks until a WAV file is ready in the queue
                msg = self.speech_queue.get()
                if msg is None: break
                
                wav_path, original_text = msg
                
                if wav_path and wav_path.exists():
                    winsound.PlaySound(str(wav_path), winsound.SND_FILENAME)
                    try:
                        wav_path.unlink() # Cleanup after playing
                    except: pass
                
                self.speech_queue.task_done()
            except Exception as e:
                print(f"[Voice] Playback Error: {e}", file=sys.stderr)

    def speak_stream(self, chunks_iterable):
        """
        LLM-Ready Streaming Pipeline.
        Accepts an iterable of chunks (e.g. from an LLM generator).
        Processes chunks as they arrive without waiting for the full list.
        """
        if not self.enabled: return

        def stream_feeder():
            # Process chunks as they arrive from the iterator
            for chunk in chunks_iterable:
                if not chunk: continue
                
                # Submit to pool and wait for THIS specific chunk
                # We use a small look-ahead or just parallelize single arrivals
                future = self.executor.submit(self._generate_chunk_sync, chunk)
                
                def queue_when_ready(f, c):
                    try:
                        wp = f.result()
                        if wp:
                            self.speech_queue.put((wp, c))
                    except Exception as ex:
                        print(f"[Voice] Stream Gen Error: {ex}", file=sys.stderr)
                
                # We don't block the feeder, just spawn a waiter for each arrival
                Thread(target=queue_when_ready, args=(future, chunk), daemon=True).start()

        Thread(target=stream_feeder, daemon=True).start()

    def speak_pipeline(self, chunks: list):
        """
        Multi-buffer pipeline (Producer + Feeder).
        Immediately submits all chunks to parallel workers.
        """
        if not self.enabled: return

        def feeder():
            # Submit all chunks to the pool immediately for parallel work
            futures = [self.executor.submit(self._generate_chunk_sync, chunk) for chunk in chunks]
            
            # Collect results in order and feed the playback queue
            for i, future in enumerate(futures):
                try:
                    wav_path = future.result()
                    if wav_path:
                        self.speech_queue.put((wav_path, chunks[i]))
                except Exception as e:
                    print(f"[Voice] Future Result Error: {e}", file=sys.stderr)

        # Run feeder in a background thread to keep caller responsive
        Thread(target=feeder, daemon=True).start()

    def speak(self, text: str, blocking: bool = False):
        """Single text speak wrapper (using pipeline)."""
        if not text: return
        self.speak_pipeline([text])
        if blocking:
            self.speech_queue.join()


# Global singleton instance
_speaker_instance = None

def get_speaker() -> PiperSpeaker:
    """Get or create the global PiperSpeaker instance."""
    global _speaker_instance
    if _speaker_instance is None:
        _speaker_instance = PiperSpeaker()
        if not _speaker_instance.enabled:
            _speaker_instance = None
    return _speaker_instance
