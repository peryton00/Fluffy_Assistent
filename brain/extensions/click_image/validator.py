"""
Click Image (click_image) - Validator
"""

try:
    from brain.action_validator import ValidationResult, SafetyLevel
except ImportError:
    from action_validator import ValidationResult, SafetyLevel

class ClickImageValidator:
    """Validate Click Image operations"""

    def validate(self, command):
        return None

def get_validator():
    return ClickImageValidator()
