"""
Backward-compatibility shim for brain.self_improver -> brain.extensions.self_improver
"""
from brain.extensions.self_improver import SelfImprover, get_self_improver

__all__ = ["SelfImprover", "get_self_improver"]
