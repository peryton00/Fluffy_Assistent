"""
brightness control (brightness_control) - Validator
"""

try:
    from brain.action_validator import ValidationResult, SafetyLevel
except ImportError:
    from action_validator import ValidationResult, SafetyLevel

class BrightnessControlValidator:
    """Validate brightness control operations"""

    def validate(self, command):
        return None

def get_validator():
    return BrightnessControlValidator()
