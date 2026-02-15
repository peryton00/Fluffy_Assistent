"""
Chat History Manager
Handles persistent storage and retrieval of chat conversations
"""

import json
import os
from datetime import datetime
from typing import List, Dict, Any, Optional
from pathlib import Path
import uuid


class ChatHistory:
    """Manages chat history with individual JSON files per session"""
    
    def __init__(self, data_dir: str = "data"):
        self.data_dir = Path(data_dir)
        self.sessions_dir = self.data_dir / "sessions"
        self.index_file = self.data_dir / "chat_index.json"
        
        # Ensure directories exist
        self.sessions_dir.mkdir(parents=True, exist_ok=True)
        self._ensure_index_file()
    
    def _ensure_index_file(self):
        """Create index file if it doesn't exist"""
        if not self.index_file.exists():
            self._save_index({"current_session_id": None})
    
    def _load_index(self) -> Dict[str, Any]:
        """Load index data"""
        try:
            if self.index_file.exists():
                with open(self.index_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            return {"current_session_id": None}
        except Exception as e:
            print(f"Error loading chat index: {e}")
            return {"current_session_id": None}
    
    def _save_index(self, data: Dict[str, Any]):
        """Save index data"""
        try:
            with open(self.index_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            print(f"Error saving chat index: {e}")

    def _get_session_path(self, session_id: str) -> Path:
        """Get path to a specific session file"""
        return self.sessions_dir / f"{session_id}.json"
    
    def _load_session_file(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Load a specific session file"""
        path = self._get_session_path(session_id)
        try:
            if path.exists():
                with open(path, 'r', encoding='utf-8') as f:
                    return json.load(f)
            return None
        except Exception as e:
            print(f"Error loading session {session_id}: {e}")
            return None
    
    def _save_session_file(self, session: Dict[str, Any]):
        """Save a specific session file"""
        path = self._get_session_path(session["id"])
        try:
            with open(path, 'w', encoding='utf-8') as f:
                json.dump(session, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"Error saving session {session['id']}: {e}")
    
    def create_session(self) -> str:
        """Create a new chat session"""
        session_id = str(uuid.uuid4())
        session = {
            "id": session_id,
            "created": datetime.now().isoformat(),
            "last_updated": datetime.now().isoformat(),
            "messages": []
        }
        
        self._save_session_file(session)
        
        index = self._load_index()
        index["current_session_id"] = session_id
        self._save_index(index)
        
        return session_id
    
    def get_current_session_id(self) -> Optional[str]:
        """Get the current active session ID"""
        index = self._load_index()
        return index.get("current_session_id")
    
    def set_current_session(self, session_id: str):
        """Set the current active session"""
        index = self._load_index()
        index["current_session_id"] = session_id
        self._save_index(index)
    
    def save_message(self, session_id: str, message: Dict[str, Any]) -> bool:
        """Save a message to a session"""
        session = self._load_session_file(session_id)
        if not session:
            print(f"Session {session_id} not found")
            return False
        
        # Add message
        session["messages"].append(message)
        session["last_updated"] = datetime.now().isoformat()
        
        self._save_session_file(session)
        return True
    
    def load_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Load a specific session"""
        return self._load_session_file(session_id)
    
    def list_sessions(self) -> List[Dict[str, Any]]:
        """List all sessions by scanning the directory"""
        sessions = []
        
        try:
            for file_path in self.sessions_dir.glob("*.json"):
                session_id = file_path.stem
                session = self._load_session_file(session_id)
                if session:
                    summary = {
                        "id": session["id"],
                        "created": session["created"],
                        "last_updated": session["last_updated"],
                        "message_count": len(session["messages"]),
                        "preview": self._get_session_preview(session)
                    }
                    sessions.append(summary)
        except Exception as e:
            print(f"Error listing sessions: {e}")
        
        # Sort by last_updated (most recent first)
        sessions.sort(key=lambda x: x["last_updated"], reverse=True)
        return sessions
    
    def _get_session_preview(self, session: Dict[str, Any]) -> str:
        """Get a preview of the session (first user message)"""
        for msg in session["messages"]:
            # Handle both new format (role/content) and legacy format (type/text)
            is_user = msg.get("role") == "user" or msg.get("type") == "user"
            if is_user:
                text = msg.get("content") or msg.get("text") or ""
                return text[:50] + "..." if len(text) > 50 else text
        return "New conversation"
    
    def delete_session(self, session_id: str) -> bool:
        """Delete a session file"""
        path = self._get_session_path(session_id)
        try:
            if path.exists():
                os.remove(path)
                
            # If deleted session was current, clear from index
            index = self._load_index()
            if index.get("current_session_id") == session_id:
                index["current_session_id"] = None
                self._save_index(index)
            
            return True
        except Exception as e:
            print(f"Error deleting session {session_id}: {e}")
            return False
    
    def search_messages(self, query: str) -> List[Dict[str, Any]]:
        """Search for messages across all session files"""
        results = []
        query_lower = query.lower()
        
        try:
            for file_path in self.sessions_dir.glob("*.json"):
                session = self._load_session_file(file_path.stem)
                if not session:
                    continue
                    
                for msg in session["messages"]:
                    # Search in both content and text fields
                    text = msg.get("content") or msg.get("text") or ""
                    if query_lower in text.lower():
                        results.append({
                            "session_id": session["id"],
                            "message": msg,
                            "session_created": session["created"]
                        })
        except Exception as e:
            print(f"Error searching sessions: {e}")
        
        return results


# Test function
def test_chat_history():
    """Test chat history functionality"""
    history = ChatHistory()
    
    print("=" * 60)
    print("CHAT HISTORY TEST")
    print("=" * 60)
    
    # Create a session
    session_id = history.create_session()
    print(f"\n✓ Created session: {session_id}")
    
    # Save some messages
    messages = [
        {"type": "user", "text": "open chrome", "timestamp": datetime.now().isoformat()},
        {"type": "fluffy", "text": "Launched chrome", "timestamp": datetime.now().isoformat(), "status": "success"},
        {"type": "user", "text": "close notepad", "timestamp": datetime.now().isoformat()},
        {"type": "fluffy", "text": "Closed notepad", "timestamp": datetime.now().isoformat(), "status": "success"},
    ]
    
    for msg in messages:
        history.save_message(session_id, msg)
    print(f"✓ Saved {len(messages)} messages")
    
    # List sessions
    sessions = history.list_sessions()
    print(f"\n✓ Found {len(sessions)} sessions")
    for s in sessions:
        print(f"  - {s['preview']} ({s['message_count']} messages)")
    
    # Load session
    loaded = history.load_session(session_id)
    print(f"\n✓ Loaded session with {len(loaded['messages'])} messages")
    
    # Search
    results = history.search_messages("chrome")
    print(f"\n✓ Search for 'chrome' found {len(results)} results")
    
    print("\n" + "=" * 60)


if __name__ == "__main__":
    test_chat_history()
