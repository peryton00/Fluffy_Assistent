"""
Centralized AI Configuration for Fluffy AI Runtime.
Platform-independent, offline-first configuration with environment overrides.
"""

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional, Dict, Any

from brain.ai.config.paths import ApplicationDataPaths


@dataclass
class AIConfig:
    """
    Centralized configuration settings for the AI runtime and model execution.
    """
    models_dir: Path = field(default_factory=ApplicationDataPaths.get_models_dir)
    default_model_id: str = "default-local-model"
    preferred_backend: str = "auto"
    max_context_length: int = 8192
    default_max_tokens: int = 2048
    default_temperature: float = 0.7
    offline_mode: bool = True
    max_loaded_models: int = 1
    gpu_layers: int = -1       # -1 for all offloadable layers, 0 for CPU only
    threads: Optional[int] = None

    @classmethod
    def from_env(cls) -> "AIConfig":
        """Construct AIConfig from environment variables and platform defaults."""
        models_dir_env = os.getenv("FLUFFY_MODELS_DIR")
        models_dir = ApplicationDataPaths.get_models_dir(models_dir_env)

        default_model = os.getenv("FLUFFY_DEFAULT_MODEL", "default-local-model")
        preferred_backend = os.getenv("FLUFFY_AI_BACKEND", "auto").lower()

        context_limit = int(os.getenv("FLUFFY_MAX_CONTEXT", "8192"))
        max_tokens = int(os.getenv("FLUFFY_MAX_TOKENS", "2048"))
        temp = float(os.getenv("FLUFFY_TEMPERATURE", "0.7"))

        offline_val = os.getenv("FLUFFY_OFFLINE_MODE", "true").lower()
        offline_mode = offline_val in ("1", "true", "yes")

        gpu_layers = int(os.getenv("FLUFFY_GPU_LAYERS", "-1"))
        threads_val = os.getenv("FLUFFY_AI_THREADS")
        threads = int(threads_val) if threads_val else None

        return cls(
            models_dir=models_dir,
            default_model_id=default_model,
            preferred_backend=preferred_backend,
            max_context_length=context_limit,
            default_max_tokens=max_tokens,
            default_temperature=temp,
            offline_mode=offline_mode,
            gpu_layers=gpu_layers,
            threads=threads,
        )

    def to_dict(self) -> Dict[str, Any]:
        """Convert configuration to dictionary."""
        return {
            "models_dir": str(self.models_dir),
            "default_model_id": self.default_model_id,
            "preferred_backend": self.preferred_backend,
            "max_context_length": self.max_context_length,
            "default_max_tokens": self.default_max_tokens,
            "default_temperature": self.default_temperature,
            "offline_mode": self.offline_mode,
            "max_loaded_models": self.max_loaded_models,
            "gpu_layers": self.gpu_layers,
            "threads": self.threads,
        }


# Global singleton instance
_ai_config: Optional[AIConfig] = None


def get_ai_config() -> AIConfig:
    """Get or create the global AIConfig instance."""
    global _ai_config
    if _ai_config is None:
        _ai_config = AIConfig.from_env()
    return _ai_config


def set_ai_config(config: Optional[AIConfig]) -> None:
    """Override the global AIConfig instance (useful in tests)."""
    global _ai_config
    _ai_config = config
