"""
Unit tests for Fluffy Brain Memory Subsystem
"""
import unittest

from brain.memory.telemetry import BrainMemory
from brain.memory.conversation import ChatHistory
from brain.memory.session import SessionMemory, get_session_memory, reset_session_memory
from brain.memory.user import load_memory, save_memory, update_memory, get_preference, set_preference

# Test backward-compatibility shims
import brain.memory.session_memory as shim_session_mem
import brain.memory.long_term_memory as shim_long_term_mem
import brain.chat_history as shim_chat_hist
import brain.memory as shim_brain_mem


class TestMemorySubsystem(unittest.TestCase):

    def test_session_memory_operations(self):
        reset_session_memory()
        session = get_session_memory()
        self.assertFalse(session.has_pending_intent())
        
        session.set_pending_intent("kill_process")
        session.set_parameters({"process_name": "notepad.exe"})
        self.assertTrue(session.has_pending_intent())
        self.assertEqual(session.get_pending_intent(), "kill_process")
        self.assertEqual(session.get_parameters().get("process_name"), "notepad.exe")
        
        session.clear_pending_intent()
        self.assertFalse(session.has_pending_intent())

    def test_session_memory_shim(self):
        shim_session = shim_session_mem.get_session_memory()
        self.assertIsInstance(shim_session, SessionMemory)

    def test_telemetry_memory(self):
        mem = BrainMemory()
        mem.push_system_stats(45.0, 60.0)
        self.assertTrue(len(mem.system_history) == 1)

    def test_chat_history(self):
        hist = ChatHistory(data_dir="fluffy_data")
        session_id = hist.create_session()
        self.assertIsNotNone(session_id)
        saved = hist.save_message(session_id, {"role": "user", "content": "Hello Fluffy"})
        self.assertTrue(saved)
        loaded = hist.load_session(session_id)
        self.assertIsNotNone(loaded)
        self.assertTrue(len(loaded.get("messages", [])) >= 1)


if __name__ == "__main__":
    unittest.main()
