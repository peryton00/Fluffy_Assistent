"""
Brightness Control Extension Handler for Fluffy
"""

from typing import Dict, Any

import screen_brightness_control as sbc


class BrightnessActionHandler:
    """Handle brightness control operations for Fluffy"""

    def execute(self, command) -> Dict[str, Any]:
        """
        Main execution entrypoint called by Fluffy.

        Args:
            command: Object containing:
              - command.intent: The intent string
              - command.parameters: Dict of parameters extracted by Fluffy

        Supported operations:
          - set_brightness
          - increase_brightness
          - decrease_brightness
          - get_brightness

        Returns:
            Dict containing:
              - success: bool
              - message: str
              - data: dict
        """

        params = getattr(command, "parameters", {}) or {}
        intent = getattr(command, "intent", "") or ""

        try:
            # Get current brightness
            if intent == "get_brightness":
                brightness = sbc.get_brightness()

                # screen_brightness_control can return a list
                if isinstance(brightness, list):
                    brightness = brightness[0]

                return {
                    "success": True,
                    "message": f"🔆 Current brightness is **{brightness}%**.",
                    "data": {
                        "status": "completed",
                        "brightness": brightness,
                        "operation": "get"
                    }
                }

            # Set brightness to a specific percentage
            if intent == "set_brightness":
                brightness = params.get("brightness")

                if brightness is None:
                    return {
                        "success": False,
                        "message": "Please specify a brightness level between 0 and 100.",
                        "data": {
                            "status": "invalid_parameters",
                            "params": params
                        }
                    }

                try:
                    brightness = int(brightness)
                except (TypeError, ValueError):
                    return {
                        "success": False,
                        "message": "Brightness must be a number between 0 and 100.",
                        "data": {
                            "status": "invalid_brightness",
                            "value": brightness
                        }
                    }

                # Keep brightness within valid range
                brightness = max(0, min(100, brightness))

                sbc.set_brightness(brightness)

                return {
                    "success": True,
                    "message": f"🔆 Brightness set to **{brightness}%**.",
                    "data": {
                        "status": "completed",
                        "brightness": brightness,
                        "operation": "set"
                    }
                }

            # Increase brightness
            if intent == "increase_brightness":
                amount = params.get("amount", 10)

                try:
                    amount = int(amount)
                except (TypeError, ValueError):
                    amount = 10

                amount = max(1, min(100, amount))

                current = sbc.get_brightness()

                if isinstance(current, list):
                    current = current[0]

                new_brightness = min(100, int(current) + amount)

                sbc.set_brightness(new_brightness)

                return {
                    "success": True,
                    "message": (
                        f"🔆 Brightness increased to "
                        f"**{new_brightness}%**."
                    ),
                    "data": {
                        "status": "completed",
                        "previous_brightness": current,
                        "brightness": new_brightness,
                        "amount": amount,
                        "operation": "increase"
                    }
                }

            # Decrease brightness
            if intent == "decrease_brightness":
                amount = params.get("amount", 10)

                try:
                    amount = int(amount)
                except (TypeError, ValueError):
                    amount = 10

                amount = max(1, min(100, amount))

                current = sbc.get_brightness()

                if isinstance(current, list):
                    current = current[0]

                new_brightness = max(0, int(current) - amount)

                sbc.set_brightness(new_brightness)

                return {
                    "success": True,
                    "message": (
                        f"🔆 Brightness decreased to "
                        f"**{new_brightness}%**."
                    ),
                    "data": {
                        "status": "completed",
                        "previous_brightness": current,
                        "brightness": new_brightness,
                        "amount": amount,
                        "operation": "decrease"
                    }
                }

            # Unknown intent
            return {
                "success": False,
                "message": f"Unsupported brightness operation: `{intent}`",
                "data": {
                    "status": "unsupported_intent",
                    "intent": intent,
                    "params": params
                }
            }

        except Exception as exc:
            return {
                "success": False,
                "message": f"Unable to control brightness: `{exc}`",
                "data": {
                    "status": "error",
                    "error": str(exc),
                    "intent": intent,
                    "params": params
                }
            }


def get_handler():
    """
    Factory function required by Fluffy to instantiate the handler.
    """
    return BrightnessActionHandler()