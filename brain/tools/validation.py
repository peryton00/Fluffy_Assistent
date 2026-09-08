"""
Tool Schema and Parameter Validation Engine
Validates incoming parameter dictionaries against ToolDefinition.input_schema.
"""

from typing import Dict, Any, Tuple, Optional, List


class SchemaValidator:
    """
    Validates parameter payloads against JSON Schema subset definitions.
    Prevents malformed, excessive, or wrong-typed inputs from reaching adapters.
    """

    @classmethod
    def validate_parameters(
        cls,
        parameters: Dict[str, Any],
        input_schema: Dict[str, Any],
    ) -> Tuple[bool, Optional[str]]:
        """
        Validate input parameters against a JSON schema.
        Returns (is_valid, error_message).
        """
        if not input_schema:
            return True, None

        schema_type = input_schema.get("type", "object")
        if schema_type == "object":
            if not isinstance(parameters, dict):
                return False, f"Expected object for parameters, got {type(parameters).__name__}."

            # Check required properties
            required_fields: List[str] = input_schema.get("required", [])
            for field in required_fields:
                if field not in parameters:
                    return False, f"Missing required parameter '{field}'."

            # Validate each defined property
            properties: Dict[str, Any] = input_schema.get("properties", {})
            additional_properties = input_schema.get("additionalProperties", True)

            for key, val in parameters.items():
                if key not in properties:
                    if additional_properties is False:
                        return False, f"Unknown parameter '{key}' is not allowed by schema."
                    continue

                prop_schema = properties[key]
                valid, err = cls._validate_value(val, prop_schema, key)
                if not valid:
                    return False, err

        return True, None

    @classmethod
    def _validate_value(cls, val: Any, schema: Dict[str, Any], field_name: str) -> Tuple[bool, Optional[str]]:
        """Validate an individual parameter against its schema."""
        expected_type = schema.get("type")
        if expected_type:
            if expected_type == "string":
                if not isinstance(val, str):
                    return False, f"Parameter '{field_name}' must be a string, got {type(val).__name__}."
                min_len = schema.get("minLength")
                if min_len is not None and len(val) < min_len:
                    return False, f"Parameter '{field_name}' length {len(val)} is below minimum length {min_len}."
                max_len = schema.get("maxLength")
                if max_len is not None and len(val) > max_len:
                    return False, f"Parameter '{field_name}' length exceeds maximum length {max_len}."
                if "enum" in schema and val not in schema["enum"]:
                    return False, f"Parameter '{field_name}' value '{val}' is not one of allowed enum values: {schema['enum']}."

            elif expected_type in ("integer", "int"):
                if not isinstance(val, int) or isinstance(val, bool):
                    return False, f"Parameter '{field_name}' must be an integer, got {type(val).__name__}."
                if "minimum" in schema and val < schema["minimum"]:
                    return False, f"Parameter '{field_name}' value {val} is below minimum {schema['minimum']}."
                if "maximum" in schema and val > schema["maximum"]:
                    return False, f"Parameter '{field_name}' value {val} exceeds maximum {schema['maximum']}."

            elif expected_type in ("number", "float"):
                if not isinstance(val, (int, float)) or isinstance(val, bool):
                    return False, f"Parameter '{field_name}' must be a number, got {type(val).__name__}."
                if "minimum" in schema and val < schema["minimum"]:
                    return False, f"Parameter '{field_name}' value {val} is below minimum {schema['minimum']}."
                if "maximum" in schema and val > schema["maximum"]:
                    return False, f"Parameter '{field_name}' value {val} exceeds maximum {schema['maximum']}."

            elif expected_type in ("boolean", "bool"):
                if not isinstance(val, bool):
                    return False, f"Parameter '{field_name}' must be a boolean, got {type(val).__name__}."

            elif expected_type in ("array", "list"):
                if not isinstance(val, list):
                    return False, f"Parameter '{field_name}' must be a list/array, got {type(val).__name__}."
                items_schema = schema.get("items")
                if items_schema and isinstance(items_schema, dict):
                    for i, item in enumerate(val):
                        valid, err = cls._validate_value(item, items_schema, f"{field_name}[{i}]")
                        if not valid:
                            return False, err

            elif expected_type == "object":
                if not isinstance(val, dict):
                    return False, f"Parameter '{field_name}' must be an object/dict, got {type(val).__name__}."

        return True, None
