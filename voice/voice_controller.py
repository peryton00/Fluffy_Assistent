"""
Voice Controller Module
Central TTS entry point with adaptive tone, dynamic phrasing, and conversational Guardian alerts.
"""
import sys
import time
import random
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
        
        message = "Fluffy Guardian is now active, boss."
        message_key = "welcome"
        
        # Check cooldown first
        now = time.time()
        last_time = self.last_spoken.get(message_key, 0)
        
        if now - last_time < self.cooldown_seconds:
            print(f"[Voice] Welcome message in cooldown, skipping", file=sys.stderr)
            return
        
        # Set timestamp IMMEDIATELY to prevent race condition
        self.last_spoken[message_key] = now
        
        print(f"[Voice] Speaking: {message}", file=sys.stderr)
        self.speaker.speak(message, blocking=False)
    
    def _clean_process_name(self, process_name: str) -> str:
        """
        Remove .exe extension and capitalize process name for speech.
        
        Args:
            process_name: Raw process name (e.g., "chrome.exe")
            
        Returns:
            Cleaned name (e.g., "Chrome")
        """
        if process_name.lower().endswith('.exe'):
            process_name = process_name[:-4]
        return process_name.capitalize()
    
    def _choose_variation(self, level: str, calm_phrases: List[str], 
                         concerned_phrases: List[str], serious_phrases: List[str]) -> str:
        """
        Choose message variation based on severity level.
        
        Tone mapping:
        - Warn: Calm, conversational, light questioning
        - Recommend: Slightly concerned, advisory
        - Critical/Request Confirmation: Serious, short, commanding
        
        Args:
            level: Alert level (Warn, Recommend, Request Confirmation)
            calm_phrases: List of calm tone phrases
            concerned_phrases: List of concerned tone phrases
            serious_phrases: List of serious tone phrases
            
        Returns:
            Randomly selected phrase matching the tone
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
        Build conversational Guardian alert message with adaptive tone and dynamic phrasing.
        
        Args:
            verdict: Guardian verdict dictionary
            cpu: CPU percentage (if available)
            ram: RAM in MB (if available)
            network: Network usage in KB/s (if available)
            
        Returns:
            Conversational alert message with appropriate tone
        """
        process = self._clean_process_name(verdict.get("process", "Unknown"))
        level = verdict.get("level", "")
        
        # Priority: CPU > RAM > Network > Fallback
        
        # CPU-based alerts
        if cpu is not None and cpu > 0:
            cpu_int = int(cpu)
            
            calm_cpu = [
                f"Boss, {process} is using {cpu_int} percent CPU. Is that expected?",
                f"Boss, {process} is currently at {cpu_int} percent CPU. Should I keep an eye on it?",
                f"{process} is taking {cpu_int} percent CPU. Is that usual?"
            ]
            
            concerned_cpu = [
                f"Boss, {process} has reached {cpu_int} percent CPU. That is higher than usual.",
                f"{process} is consuming {cpu_int} percent CPU. Do you want me to monitor it closely?",
                f"CPU usage for {process} is elevated at {cpu_int} percent."
            ]
            
            serious_cpu = [
                f"Boss, {process} is critically high at {cpu_int} percent CPU.",
                f"Immediate attention required. {process} is using {cpu_int} percent CPU.",
                f"Critical CPU alert. {process} at {cpu_int} percent."
            ]
            
            return self._choose_variation(level, calm_cpu, concerned_cpu, serious_cpu)
        
        # RAM-based alerts
        elif ram is not None and ram > 0:
            ram_int = int(ram)
            
            calm_ram = [
                f"Boss, {process} is consuming {ram_int} megabytes of memory. Is that usual?",
                f"{process} is using {ram_int} megabytes of RAM. Should I watch it?",
                f"Boss, {process} memory usage is at {ram_int} megabytes. Is that expected?"
            ]
            
            concerned_ram = [
                f"Memory usage for {process} is elevated at {ram_int} megabytes.",
                f"{process} has reached {ram_int} megabytes of memory. That is higher than normal.",
                f"Boss, {process} is consuming {ram_int} megabytes. Do you want me to monitor it?"
            ]
            
            serious_ram = [
                f"{process} memory usage is critically high at {ram_int} megabytes.",
                f"Critical memory alert. {process} at {ram_int} megabytes.",
                f"Boss, immediate attention. {process} memory is at {ram_int} megabytes."
            ]
            
            return self._choose_variation(level, calm_ram, concerned_ram, serious_ram)
        
        # Network-based alerts
        elif network is not None and network > 0:
            
            calm_network = [
                f"Boss, {process} is sending unusual network traffic. Is that expected?",
                f"{process} has elevated network activity. Should I keep watching?",
                f"Boss, {process} network usage looks unusual. Is that normal?"
            ]
            
            concerned_network = [
                f"Network activity from {process} is significantly elevated.",
                f"{process} is generating high network traffic. Do you want me to investigate?",
                f"Boss, {process} network usage is higher than usual."
            ]
            
            serious_network = [
                f"Critical network surge detected from {process}.",
                f"Immediate attention. {process} network activity is critically high.",
                f"Boss, critical alert. {process} network traffic is abnormal."
            ]
            
            return self._choose_variation(level, calm_network, concerned_network, serious_network)
        
        # Fallback for other anomalies
        else:
            calm_fallback = [
                f"Boss, something unusual is happening with {process}. Should I investigate?",
                f"{process} is showing unexpected behavior. Is that normal?",
                f"Boss, {process} has some unusual activity. Should I keep watching?"
            ]
            
            concerned_fallback = [
                f"{process} behavior is outside normal patterns. Do you want details?",
                f"Boss, {process} is acting differently than usual.",
                f"{process} has triggered an anomaly alert. Should I monitor it closely?"
            ]
            
            serious_fallback = [
                f"Critical anomaly detected in {process}.",
                f"Immediate attention required for {process}.",
                f"Boss, critical alert for {process}."
            ]
            
            return self._choose_variation(level, calm_fallback, concerned_fallback, serious_fallback)
    
    def speak_guardian_alert(self, verdict: dict, cpu: float = None, 
                           ram: float = None, network: float = None):
        """
        Speak Guardian alert in conversational format with adaptive tone.
        
        Args:
            verdict: Guardian verdict dictionary with keys:
                - level: Alert level (Observe, Inform, Warn, Recommend, Request Confirmation)
                - process: Process name
                - reason: Alert reason
                - risk_score: Risk score
                - confidence: Confidence level
            cpu: CPU percentage (optional)
            ram: RAM in MB (optional)
            network: Network usage in KB/s (optional)
        """
        if not self.enabled:
            return
        
        # Filter by level - only speak for serious alerts
        level = verdict.get("level", "")
        if level not in ["Warn", "Recommend", "Request Confirmation"]:
            return
        
        # Filter by confidence
        confidence = verdict.get("confidence", 0)
        if confidence < 0.6:
            return
        
        # Build conversational message with adaptive tone
        process = verdict.get("process", "Unknown")
        message = self._build_guardian_message(verdict, cpu, ram, network)
        
        # Create unique key for cooldown (process + level)
        message_key = f"guardian_{process}_{level}"
        
        # Check cooldown first
        now = time.time()
        last_time = self.last_spoken.get(message_key, 0)
        
        if now - last_time < self.cooldown_seconds:
            print(f"[Voice] Guardian alert in cooldown, skipping: {process}", file=sys.stderr)
            return
        
        # Set timestamp IMMEDIATELY to prevent race condition
        self.last_spoken[message_key] = now
        
        print(f"[Voice] Speaking Guardian alert ({level}): {message[:80]}...", file=sys.stderr)
        self.speaker.speak(message, blocking=False)
    
    def speak_custom(self, text: str, message_key: Optional[str] = None, blocking: bool = False):
        """
        Speak custom text with optional cooldown.
        
        Args:
            text: Text to speak
            message_key: Optional key for cooldown tracking. If None, always speaks.
            blocking: If True, wait for speech to complete
        """
        if not self.enabled:
            return
        
        if message_key is None or self._should_speak(message_key):
            print(f"[Voice] Speaking: {text[:80]}...", file=sys.stderr)
            self.speaker.speak(text, blocking=blocking)
    
    def _should_speak(self, message_key: str) -> bool:
        """
        Check if message should be spoken based on cooldown.
        
        Args:
            message_key: Unique identifier for this message
            
        Returns:
            True if message should be spoken, False if in cooldown
        """
        if not self.enabled:
            return False
        
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
    """Speak welcome message."""
    get_voice_controller().speak_welcome()


def speak_guardian_alert(verdict: dict, cpu: float = None, ram: float = None, network: float = None):
    """Speak Guardian alert with adaptive tone."""
    get_voice_controller().speak_guardian_alert(verdict, cpu, ram, network)


def speak_custom(text: str, message_key: Optional[str] = None, blocking: bool = False):
    """Speak custom text."""
    get_voice_controller().speak_custom(text, message_key, blocking)
