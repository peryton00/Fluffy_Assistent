"""
LLM Client for Fluffy Assistant
Handles API communication with streaming support (Groq / OpenRouter)
"""

import requests
import json
from typing import Iterator, Optional, Dict, Any, List
from brain.ai.llm_config import get_config


class LLMClient:
    """Client for LLM API with streaming support"""
    
    def __init__(self):
        """Initialize the LLM client"""
        self.config = get_config()
        self.chat_endpoint = f"{self.config.base_url}/chat/completions"
    
    def chat(
        self,
        messages: List[Dict[str, str]],
        stream: bool = True,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None
    ) -> Iterator[str]:
        """
        Send a chat request to LLM API
        
        Args:
            messages: List of message dicts with 'role' and 'content'
            stream: Whether to stream the response
            temperature: Sampling temperature (0.0 to 2.0)
            max_tokens: Maximum tokens to generate
            
        Yields:
            Text chunks as they arrive from the API
        """
        # If provider is local / offline, delegate directly to the AIModelRuntime
        if self.config.provider in ("local", "offline"):
            from brain.ai.runtime.manager import get_runtime
            from brain.ai.runtime.interface import GenerationRequest
            
            # Format chat messages into prompt
            prompt_parts = []
            for msg in messages:
                role = msg.get("role", "user").capitalize()
                content = msg.get("content", "")
                prompt_parts.append(f"{role}: {content}")
            prompt_parts.append("Assistant:")
            full_prompt = "\n".join(prompt_parts)
            
            req = GenerationRequest(
                prompt=full_prompt,
                max_tokens=max_tokens or 2048,
                temperature=temperature,
            )
            runtime = get_runtime()
            if stream:
                for chunk in runtime.stream(req):
                    if chunk.delta:
                        yield chunk.delta
            else:
                resp = runtime.generate(req)
                yield resp.text
            return

        if not self.config.is_configured():
            yield "I'm not configured yet. Please set your API key in the .env file."
            return
        
        # Prepare request payload
        payload = {
            "model": self.config.model,
            "messages": messages,
            "stream": stream,
            "temperature": temperature,
        }
        
        if max_tokens:
            payload["max_tokens"] = max_tokens
        
        try:
            # Make streaming request
            response = requests.post(
                self.chat_endpoint,
                headers=self.config.get_headers(),
                json=payload,
                stream=stream,
                timeout=30
            )
            
            # Check for errors
            if response.status_code != 200:
                error_msg = f"API Error ({response.status_code}): {response.text}"
                print(f"[LLMClient] {error_msg}")
                yield f"I encountered an error: {response.status_code}. Please check your API key and try again."
                return
            
            if stream:
                # Process streaming response
                for line in response.iter_lines():
                    if not line:
                        continue
                    
                    line = line.decode('utf-8')
                    
                    # Skip empty lines and comments
                    if not line.strip() or line.startswith(':'):
                        continue
                    
                    # Parse SSE format: "data: {...}"
                    if line.startswith('data: '):
                        data_str = line[6:]  # Remove "data: " prefix
                        
                        # Check for end of stream
                        if data_str.strip() == '[DONE]':
                            break
                        
                        try:
                            data = json.loads(data_str)
                            
                            # Extract content from delta
                            if 'choices' in data and len(data['choices']) > 0:
                                delta = data['choices'][0].get('delta', {})
                                content = delta.get('content', '')
                                
                                if content:
                                    yield content
                        
                        except json.JSONDecodeError as e:
                            print(f"[LLMClient] JSON decode error: {e}")
                            continue
            else:
                # Non-streaming response
                data = response.json()
                if 'choices' in data and len(data['choices']) > 0:
                    content = data['choices'][0]['message']['content']
                    yield content
        
        except requests.exceptions.Timeout:
            yield "The request timed out. Please try again."
        
        except requests.exceptions.ConnectionError:
            yield "I couldn't connect to the AI service. Please check your internet connection."
        
        except Exception as e:
            error_msg = f"Unexpected error: {str(e)}"
            print(f"[LLMClient] {error_msg}")
            yield f"I encountered an unexpected error. Please try again later."
    
    def simple_query(self, user_message: str, system_prompt: Optional[str] = None) -> Iterator[str]:
        """Simple query interface for single-turn conversations"""
        messages = []
        
        if system_prompt:
            messages.append({
                "role": "system",
                "content": system_prompt
            })
        
        messages.append({
            "role": "user",
            "content": user_message
        })
        
        yield from self.chat(messages)
    
    def get_model_info(self) -> Dict[str, Any]:
        """Get information about the current model"""
        return {
            "model": self.config.model,
            "base_url": self.config.base_url,
            "configured": self.config.is_configured()
        }


# Global singleton instance
_client = None


def get_client() -> LLMClient:
    """Get or create the global LLMClient instance"""
    global _client
    if _client is None:
        _client = LLMClient()
    return _client
