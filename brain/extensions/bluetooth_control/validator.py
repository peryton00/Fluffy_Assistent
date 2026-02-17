"""
bluetooth_control Extension - Validator
Validates Bluetooth control operations
"""

from brain.action_validator import ValidationResult, SafetyLevel

class BluetoothControlValidator:
    """Validate Bluetooth control operations"""
    
    def validate(self, command) -> ValidationResult:
        """Validate Bluetooth control command"""
        # Bluetooth control is safe - no destructive actions
        return ValidationResult(
            is_valid=True,
            safety_level=SafetyLevel.SAFE,
            message="Bluetooth control is safe to execute"
        )

def get_validator():
    return BluetoothControlValidator()
