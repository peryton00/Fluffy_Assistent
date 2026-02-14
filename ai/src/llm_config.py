"""
LLM Configuration Module
Supports multiple LLM providers: Groq (free) and OpenRouter
"""

import os
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv


class LLMConfig:
    """Configuration for LLM API (supports Groq and OpenRouter)"""
    
    def __init__(self):
        """Initialize configuration by loading from .env file"""
        # Load .env from project root
        project_root = Path(__file__).parent.parent.parent
        env_path = project_root / ".env"
        
        if env_path.exists():
            load_dotenv(env_path)
            print(f"[LLMConfig] Loaded configuration from {env_path}")
        else:
            print(f"[LLMConfig] Warning: .env file not found at {env_path}")
        
        # Determine provider
        self.provider = os.getenv("LLM_PROVIDER", "groq").lower()
        
        if self.provider == "groq":
            # Groq configuration
            self.api_key = os.getenv("GROQ_API_KEY", "")
            self.model = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
            self.base_url = os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1")
            self.site_url = None
            self.app_name = "Fluffy Assistant"
        else:
            # OpenRouter configuration
            self.api_key = os.getenv("OPENROUTER_API_KEY", "")
            self.model = os.getenv("OPENROUTER_MODEL", "openai/gpt-3.5-turbo")
            self.base_url = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
            self.site_url = os.getenv("OPENROUTER_SITE_URL", "http://localhost:5123")
            self.app_name = os.getenv("OPENROUTER_APP_NAME", "Fluffy Assistant")
        
        # Validate configuration
        self._validate()
    
    def _validate(self):
        """Validate that required configuration is present"""
        if not self.api_key:
            provider_name = "Groq" if self.provider == "groq" else "OpenRouter"
            key_name = "GROQ_API_KEY" if self.provider == "groq" else "OPENROUTER_API_KEY"
            url = "https://console.groq.com/keys" if self.provider == "groq" else "https://openrouter.ai/keys"
            
            print(f"[LLMConfig] ERROR: {key_name} not set in .env file")
            print(f"[LLMConfig] Please create a .env file with your {provider_name} API key")
            print(f"[LLMConfig] Get your key from: {url}")
        
        if not self.base_url:
            raise ValueError("Base URL must be set")
        
        if not self.model:
            raise ValueError("Model must be set")
    
    def is_configured(self) -> bool:
        """Check if API key is configured"""
        return bool(self.api_key)
    
    def get_headers(self) -> dict:
        """Get HTTP headers for API requests"""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        
        # Optional headers for OpenRouter analytics
        if self.provider == "openrouter":
            if self.site_url:
                headers["HTTP-Referer"] = self.site_url
            if self.app_name:
                headers["X-Title"] = self.app_name
        
        return headers
    
    def update_config(self, api_key: Optional[str] = None, model: Optional[str] = None, provider: Optional[str] = None) -> bool:
        """
        Update configuration and save to .env file
        
        Args:
            api_key: New API key (optional)
            model: New model name (optional)
            provider: New provider (groq or openrouter) (optional)
            
        Returns:
            True if successful, False otherwise
        """
        try:
            # Update in-memory values
            if provider is not None:
                self.provider = provider.lower()
            if api_key is not None:
                self.api_key = api_key
            if model is not None:
                self.model = model
            
            # Save to .env file
            project_root = Path(__file__).parent.parent.parent
            env_path = project_root / ".env"
            
            # Read existing .env or create new
            env_lines = []
            if env_path.exists():
                with open(env_path, 'r') as f:
                    env_lines = f.readlines()
            
            # Determine which keys to update based on provider
            if self.provider == "groq":
                key_prefix = "GROQ"
            else:
                key_prefix = "OPENROUTER"
            
            # Update or add configuration
            updated = {
                f'{key_prefix}_API_KEY': False,
                f'{key_prefix}_MODEL': False,
                'LLM_PROVIDER': False
            }
            
            for i, line in enumerate(env_lines):
                if line.startswith(f'{key_prefix}_API_KEY=') and api_key is not None:
                    env_lines[i] = f"{key_prefix}_API_KEY={self.api_key}\n"
                    updated[f'{key_prefix}_API_KEY'] = True
                elif line.startswith(f'{key_prefix}_MODEL=') and model is not None:
                    env_lines[i] = f"{key_prefix}_MODEL={self.model}\n"
                    updated[f'{key_prefix}_MODEL'] = True
                elif line.startswith('LLM_PROVIDER=') and provider is not None:
                    env_lines[i] = f"LLM_PROVIDER={self.provider}\n"
                    updated['LLM_PROVIDER'] = True
            
            # Add missing entries
            if api_key is not None and not updated[f'{key_prefix}_API_KEY']:
                env_lines.append(f"{key_prefix}_API_KEY={self.api_key}\n")
            if model is not None and not updated[f'{key_prefix}_MODEL']:
                env_lines.append(f"{key_prefix}_MODEL={self.model}\n")
            if provider is not None and not updated['LLM_PROVIDER']:
                env_lines.append(f"LLM_PROVIDER={self.provider}\n")
            
            # Write back to file
            with open(env_path, 'w') as f:
                f.writelines(env_lines)
            
            print(f"[LLMConfig] Configuration updated and saved to {env_path}")
            return True
            
        except Exception as e:
            print(f"[LLMConfig] Error updating configuration: {e}")
            return False
    
    def get_config_dict(self) -> dict:
        """Get current configuration as dictionary"""
        return {
            "provider": self.provider,
            "api_key": f"{self.api_key[:8]}..." if self.api_key else "NOT_SET",
            "api_key_configured": self.is_configured(),
            "model": self.model,
            "base_url": self.base_url,
        }
    
    def __repr__(self):
        """String representation (hiding API key)"""
        masked_key = f"{self.api_key[:8]}..." if self.api_key else "NOT_SET"
        return (
            f"LLMConfig(provider={self.provider}, model={self.model}, "
            f"api_key={masked_key}, "
            f"base_url={self.base_url})"
        )


# Global singleton instance
_config = None


def get_config() -> LLMConfig:
    """Get or create the global LLMConfig instance"""
    global _config
    if _config is None:
        _config = LLMConfig()
    return _config


# Test function
if __name__ == "__main__":
    print("=" * 60)
    print("LLM Configuration Test")
    print("=" * 60)
    
    config = get_config()
    print(f"\nConfiguration: {config}")
    print(f"Provider: {config.provider}")
    print(f"Is Configured: {config.is_configured()}")
    print(f"Model: {config.model}")
    print(f"Base URL: {config.base_url}")
    
    if config.is_configured():
        print("\n✓ Configuration loaded successfully!")
        print("\nHeaders (API key masked):")
        headers = config.get_headers()
        for key, value in headers.items():
            if key == "Authorization":
                print(f"  {key}: Bearer {config.api_key[:8]}...")
            else:
                print(f"  {key}: {value}")
    else:
        print("\n✗ API key not configured")
        provider_name = "Groq" if config.provider == "groq" else "OpenRouter"
        key_name = "GROQ_API_KEY" if config.provider == "groq" else "OPENROUTER_API_KEY"
        print(f"Please set {key_name} in your .env file")
    
    print("\n" + "=" * 60)
