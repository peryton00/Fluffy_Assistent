import subprocess
import tempfile
import os
import sys
import time
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
        self.interrupt_flag = False
        self.interruption_counter = 0 # Increments on every interrupt
        self.enabled = self._validate_setup()
        
        if self.enabled:
            # Persistent consumer thread for sequential playback
            self.consumer_thread = Thread(target=self._playback_consumer, daemon=True)
            self.consumer_thread.start()
            
            # Thread pool for parallel generation (4 workers for high-volume)
            self.executor = concurrent.futures.ThreadPoolExecutor(max_workers=4)
    
    def _validate_setup(self) -> bool:
        """Validate that Piper executable and model exist."""
        if not self.piper_exe.exists():
            print(f"[Voice] Piper executable not found at {self.piper_exe}", file=sys.stderr)
            return False
        
        if not self.model_path.exists():
            print(f"[Voice] Piper model not found at {self.model_path}", file=sys.stderr)
            return False
        
        return True
    
    def _generate_chunk_sync(self, text: str):
        """Generate audio for a single chunk synchronously."""
        if not text.strip():
            return None
        
        try:
            # Create temp WAV file
            temp_wav = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
            temp_wav.close()
            wav_path = Path(temp_wav.name)
            
            # Run Piper
            result = subprocess.run(
                [str(self.piper_exe), "-m", str(self.model_path), "-f", str(wav_path)],
                input=text,
                text=True,
                capture_output=True,
                timeout=10
            )
            
            if result.returncode != 0:
                print(f"[Voice] Piper error: {result.stderr}", file=sys.stderr)
                return None
            
            return wav_path
        except Exception as e:
            print(f"[Voice] Generation error: {e}", file=sys.stderr)
            return None
    
    def _playback_consumer(self):
        """Consumer thread that plays WAV files sequentially."""
        while True:
            try:
                wav_path, chunk_text = self.speech_queue.get(timeout=1)
                
                # Check interrupt flag
                if self.interrupt_flag:
                    if wav_path and wav_path.exists():
                        try:
                            wav_path.unlink()
                        except:
                            pass
                    self.speech_queue.task_done()
                    continue
                
                # Play the audio
                if wav_path and wav_path.exists():
                    try:
                        winsound.PlaySound(str(wav_path), winsound.SND_FILENAME)
                    except Exception as e:
                        print(f"[Voice] Playback error: {e}", file=sys.stderr)
                    finally:
                        # Clean up WAV file
                        try:
                            wav_path.unlink()
                        except:
                            pass
                
                self.speech_queue.task_done()
            except queue.Empty:
                continue
            except Exception as e:
                print(f"[Voice] Consumer error: {e}", file=sys.stderr)


    def speak_stream(self, chunks_iterable):
        """
        LLM-Ready Streaming Pipeline.
        Accepts an iterable of chunks (e.g. from an LLM generator).
        Processes chunks as they arrive without waiting for the full list.
        """
        if not self.enabled: return

        # Capture current interruption state
        current_counter = self.interruption_counter

        def stream_feeder():
            # Process chunks as they arrive from the iterator
            for chunk in chunks_iterable:
                if not chunk: continue
                
                # Check for interruption
                if self.interruption_counter != current_counter:
                    return

                # Submit to pool and wait for THIS specific chunk
                # We use a small look-ahead or just parallelize single arrivals
                future = self.executor.submit(self._generate_chunk_sync, chunk)
                
                def queue_when_ready(f, c):
                    try:
                        wp = f.result()
                        # Check again
                        if self.interruption_counter != current_counter:
                            if wp and wp.exists():
                                try: wp.unlink()
                                except: pass
                            return
                            
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

        # Capture current interruption state
        current_counter = self.interruption_counter

        def feeder():
            # Submit all chunks to the pool immediately for parallel work
            futures = [self.executor.submit(self._generate_chunk_sync, chunk) for chunk in chunks]
            
            # Collect results in order and feed the playback queue
            for i, future in enumerate(futures):
                # Check for interruption before waiting or adding
                if self.interruption_counter != current_counter:
                    # Cancelled by new interrupt
                    return

                try:
                    wav_path = future.result()
                    
                    # Check again after generating
                    if self.interruption_counter != current_counter:
                         if wav_path and wav_path.exists():
                             try: wav_path.unlink()
                             except: pass
                         return

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

    def interrupt(self):
        """Stop all current and pending speech."""
        if not self.enabled: return
        
        # Increment counter to invalidate pending feeders
        self.interruption_counter += 1
        
        # Set flag to stop current playback loop
        self.interrupt_flag = True
        
        # 1. Stop current winsound playback immediately
        try:
            winsound.PlaySound(None, winsound.SND_PURGE)
        except: pass
        
        # 2. Clear the queue
        while not self.speech_queue.empty():
            try:
                msg = self.speech_queue.get_nowait()
                if msg:
                   wav_path, _ = msg
                   if wav_path and wav_path.exists():
                       try: wav_path.unlink()
                       except: pass
                self.speech_queue.task_done()
            except queue.Empty:
                break
        
        # Small sleep to ensure consumer thread sees the flag
        time.sleep(0.1)
        self.interrupt_flag = False
        print("[Voice] Speech interrupted and queue cleared.", file=sys.stderr)


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
