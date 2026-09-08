"""
Unit tests for SchemaValidator.
"""

import unittest
from brain.tools.validation import SchemaValidator


class TestSchemaValidator(unittest.TestCase):
    """Tests for parameter validation against JSON schema definitions."""

    def test_valid_parameters_pass(self):
        schema = {
            "type": "object",
            "required": ["filename", "size"],
            "properties": {
                "filename": {"type": "string", "minLength": 1},
                "size": {"type": "integer", "minimum": 0},
                "overwrite": {"type": "boolean"},
            },
        }
        params = {"filename": "test.txt", "size": 1024, "overwrite": True}
        valid, err = SchemaValidator.validate_parameters(params, schema)
        self.assertTrue(valid)
        self.assertIsNone(err)

    def test_missing_required_parameter_rejected(self):
        schema = {
            "type": "object",
            "required": ["mandatory_key"],
            "properties": {"mandatory_key": {"type": "string"}},
        }
        params = {"other_key": "val"}
        valid, err = SchemaValidator.validate_parameters(params, schema)
        self.assertFalse(valid)
        self.assertIn("Missing required parameter 'mandatory_key'", err)

    def test_wrong_parameter_type_rejected(self):
        schema = {
            "type": "object",
            "properties": {"count": {"type": "integer"}},
        }
        params = {"count": "not_an_integer"}
        valid, err = SchemaValidator.validate_parameters(params, schema)
        self.assertFalse(valid)
        self.assertIn("must be an integer", err)

    def test_enum_violation_rejected(self):
        schema = {
            "type": "object",
            "properties": {"action": {"type": "string", "enum": ["start", "stop", "restart"]}},
        }
        params = {"action": "delete_all"}
        valid, err = SchemaValidator.validate_parameters(params, schema)
        self.assertFalse(valid)
        self.assertIn("is not one of allowed enum values", err)


if __name__ == "__main__":
    unittest.main()
