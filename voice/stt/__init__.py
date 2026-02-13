"""
STT (Speech-to-Text) module for Fluffy Assistant
Provides offline speech recognition using Vosk
"""

from .stt_engine import STTEngine, get_stt_engine

__all__ = ['STTEngine', 'get_stt_engine']
