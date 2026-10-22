import os
import traceback
from typing import Dict, Any

class SingSongHandler:
    def execute(self, command) -> Dict[str, Any]:
        """
        Returns a cheerful song as markdown.
        """
        try:
            # No parameters needed; just sing a static cheerful song.
            song_lines = [
                "🎵 La la la, bright as the sun,",
                "Every day’s a new adventure, let's have fun! 🎶",
                "",
                "🌟 Shine bright, keep smiling wide,",
                "Together we’ll dance on the tide! 🌊",
                "",
                "🎶 La la la, let the music play,",
                "Happy thoughts are here to stay! 🎉"
            ]
            # Join lines with newline characters
            song_md = "\\n".join(song_lines)
            return {
                "success": True,
                "message": song_md,
                "song": song_lines
            }
        except Exception as e:
            return {
                "success": False,
                "message": "Sorry, I couldn't sing the song right now.",
                "error_detail": traceback.format_exc()
            }

def get_handler() -> SingSongHandler:
    return SingSongHandler()

def get_validator():
    # No custom validation needed; return None to use default validator
    return None