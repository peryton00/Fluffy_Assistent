"""
Voice Controller Module
Central TTS entry point with adaptive tone, dynamic phrasing, and conversational Guardian alerts.
"""
import sys
import time
import random
import re
from typing import Dict, Optional, List
from .tts.speaker import get_speaker


class VoiceController:
    """
    Central voice control system with adaptive tone and dynamic phrasing.
    Manages speech requests, rate limiting, and cooldowns.
    """
    
    def __init__(self):
        self.speaker = get_speaker()
        self.last_spoken: Dict[str, float] = {}  # message_key -> timestamp
        self.cooldown_seconds = 60  # Don't repeat same message within 60s
        self.enabled = self.speaker is not None
        
        if not self.enabled:
            print("[Voice] Voice system disabled (Piper not available)", file=sys.stderr)
    
    def speak_welcome(self):
        """Speak welcome message when Fluffy starts."""
        if not self.enabled:
            return
        
        message = "Welcome back master peryton. Fluffy is getting ready to serve you"
        message_key = "welcome"
        
        # Use speak_custom logic for consistency and parallel processing
        self.speak_custom(message, message_key=message_key, blocking=False)
    
    def _clean_process_name(self, process_name: str) -> str:
        """
        Remove .exe extension and capitalize process name for speech.
        """
        if process_name.lower().endswith('.exe'):
            process_name = process_name[:-4]
        return process_name.capitalize()
    
    def _choose_variation(self, level: str, calm_phrases: List[str], 
                         concerned_phrases: List[str], serious_phrases: List[str]) -> str:
        """
        Choose message variation based on severity level.
        """
        if level == "Warn":
            return random.choice(calm_phrases)
        elif level == "Recommend":
            return random.choice(concerned_phrases)
        else:  # Request Confirmation / Critical
            return random.choice(serious_phrases)
    
    def _build_guardian_message(self, verdict: dict, cpu: float = None, 
                                ram: float = None, network: float = None) -> str:
        """
        Build conversational Guardian alert message.
        """
        process = self._clean_process_name(verdict.get("process", "Unknown"))
        level = verdict.get("level", "")
        
        # CPU-based alerts
        if cpu is not None and cpu > 0:
            cpu_int = int(cpu)
            calm_cpu = [f"Boss, {process} is using {cpu_int} percent CPU. Is that expected?", f"{process} is taking {cpu_int} percent CPU."]
            concerned_cpu = [f"Boss, {process} reached {cpu_int} percent CPU. Higher than usual."]
            serious_cpu = [f"Boss, {process} is critically high at {cpu_int} percent CPU."]
            return self._choose_variation(level, calm_cpu, concerned_cpu, serious_cpu)
        
        # RAM-based alerts
        elif ram is not None and ram > 0:
            ram_int = int(ram)
            calm_ram = [f"Boss, {process} is using {ram_int} megabytes of RAM."]
            concerned_ram = [f"Memory for {process} is elevated at {ram_int} megabytes."]
            serious_ram = [f"{process} memory is critically high at {ram_int} megabytes."]
            return self._choose_variation(level, calm_ram, concerned_ram, serious_ram)
            
        # Fallback
        else:
            return f"Boss, I noticed an anomaly in {process}."
    
    def speak_guardian_alert(self, verdict: dict, cpu: float = None, 
                           ram: float = None, network: float = None):
        """
        Speak Guardian alert in conversational format.
        """
        if not self.enabled:
            return
        
        level = verdict.get("level", "")
        if level not in ["Warn", "Recommend", "Request Confirmation"]:
            return
        
        confidence = verdict.get("confidence", 0)
        if confidence < 0.6:
            return
        
        process = verdict.get("process", "Unknown")
        message = self._build_guardian_message(verdict, cpu, ram, network)
        message_key = f"guardian_{process}_{level}"
        
        self.speak_custom(message, message_key=message_key, blocking=False)
    
    def _split_text_hybrid(self, text: str) -> List[str]:
        """
        Split text into chunks using punctuation and word counts.
        """
        # 1. Split by natural punctuation
        sentences = re.split(r'([.!?\n,;]+)', text)
        parts = []
        for i in range(0, len(sentences)-1, 2):
            parts.append((sentences[i] + sentences[i+1]).strip())
        if len(sentences) % 2 == 1:
            parts.append(sentences[-1].strip())
        
        parts = [p for p in parts if p]
        
        final_chunks = []
        for part in parts:
            words = part.split()
            if len(words) > 12:
                for i in range(0, len(words), 8):
                    chunk = " ".join(words[i:i+8])
                    if chunk: final_chunks.append(chunk)
            else:
                final_chunks.append(part)
        return final_chunks

    def speak_custom(self, text: str, message_key: Optional[str] = None, blocking: bool = False):
        """
        Speak custom text with hybrid chunking and parallel pipeline.
        """
        if not self.enabled: return
        
        if message_key is not None and not self._should_speak(message_key):
            return

        chunks = self._split_text_hybrid(text)
        if not chunks: return

        self.speaker.speak_pipeline(chunks)
        if blocking:
            self.speaker.speech_queue.join()
    
    def speak_stream(self, chunks_iterable):
        """
        LLM-Ready Streaming Interface.
        """
        if not self.enabled: return
        self.speaker.speak_stream(chunks_iterable)

    def _should_speak(self, message_key: str) -> bool:
        """Check if message should be spoken based on cooldown."""
        now = time.time()
        last_time = self.last_spoken.get(message_key, 0)
        if now - last_time < self.cooldown_seconds:
            return False
        self.last_spoken[message_key] = now
        return True


# Global singleton instance
_voice_controller = None

def get_voice_controller() -> VoiceController:
    """Get or create the global VoiceController instance."""
    global _voice_controller
    if _voice_controller is None:
        _voice_controller = VoiceController()
    return _voice_controller


# Convenience functions
def speak_welcome():
    get_voice_controller().speak_welcome()

def speak_guardian_alert(verdict: dict, cpu: float = None, ram: float = None, network: float = None):
    get_voice_controller().speak_guardian_alert(verdict, cpu, ram, network)

def speak_custom(text: str, message_key: Optional[str] = None, blocking: bool = False):
    get_voice_controller().speak_custom(text, message_key, blocking)

def speak_stream(chunks_iterable):
    get_voice_controller().speak_stream(chunks_iterable)
