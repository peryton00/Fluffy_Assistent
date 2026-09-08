"""
Model Registry Module
Maintains registered models, scans on-disk weights, and verifies hardware compatibility.
"""

import json
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from brain.ai.hardware.capabilities import HardwareCapabilities, AcceleratorType
from brain.ai.models.definition import ModelDefinition
from brain.ai.models.metadata import ModelCapability, ModelFormat, ModelRequirements


class ModelRegistry:
    """
    Central repository for discovered and registered AI models.
    Supports dynamic registration and local storage directory scanning.
    """

    def __init__(self):
        self._models: Dict[str, ModelDefinition] = {}

    def register(self, model: ModelDefinition, overwrite: bool = True) -> None:
        """Register a model definition."""
        if model.model_id in self._models and not overwrite:
            raise ValueError(f"Model '{model.model_id}' is already registered.")
        self._models[model.model_id] = model

    def unregister(self, model_id: str) -> bool:
        """Unregister a model definition."""
        if model_id in self._models:
            del self._models[model_id]
            return True
        return False

    def get(self, model_id: str) -> Optional[ModelDefinition]:
        """Get model definition by ID."""
        return self._models.get(model_id)

    def list_all(
        self,
        capability: Optional[ModelCapability] = None,
        model_format: Optional[ModelFormat] = None,
        installed_only: bool = False,
    ) -> List[ModelDefinition]:
        """List registered models with optional capability/format filters."""
        results = list(self._models.values())

        if capability is not None:
            results = [m for m in results if m.has_capability(capability)]

        if model_format is not None:
            results = [m for m in results if m.format == model_format]

        if installed_only:
            results = [m for m in results if m.is_installed]

        return results

    def is_compatible(
        self,
        model_id: str,
        hardware: HardwareCapabilities,
    ) -> Tuple[bool, str]:
        """
        Evaluate if a model's requirements are satisfied by the given hardware profile.
        Returns (is_compatible: bool, reason: str).
        """
        model = self.get(model_id)
        if not model:
            return False, f"Model '{model_id}' not found in registry."

        # Reference models are test fixtures that do not allocate physical weights
        if model.provider == "reference":
            return True, "Reference test model is always compatible."

        req = model.requirements

        # Check system RAM
        if hardware.memory.available_gb < req.min_ram_gb:
            return False, (
                f"Insufficient available RAM: {hardware.memory.available_gb:.1f} GB available, "
                f"{req.min_ram_gb:.1f} GB required."
            )

        # Check VRAM if GPU is explicitly required
        if req.min_vram_gb > 0:
            if not hardware.has_gpu or hardware.total_vram_gb < req.min_vram_gb:
                return False, (
                    f"Insufficient VRAM: {hardware.total_vram_gb:.1f} GB available, "
                    f"{req.min_vram_gb:.1f} GB required."
                )

        # Check specific accelerator requirement
        if req.preferred_accelerator and req.preferred_accelerator != AcceleratorType.CPU:
            if hardware.primary_accelerator != req.preferred_accelerator:
                # Soft check: if fallback to CPU is acceptable, we still return true with notice
                return True, (
                    f"Model prefers {req.preferred_accelerator.value} but system uses "
                    f"{hardware.primary_accelerator.value}. Fallback possible."
                )

        return True, "Hardware requirements satisfied."

    def scan_directory(self, models_dir: Path) -> int:
        """
        Scan a local filesystem directory for model files and sidecar manifests.
        Returns the number of models discovered/registered.
        """
        if not models_dir.exists() or not models_dir.is_dir():
            return 0

        discovered_count = 0

        # 1. Scan for manifest files (*.manifest.json or model_manifest.json)
        for manifest_path in models_dir.glob("**/*.json"):
            if manifest_path.name.endswith(".manifest.json") or manifest_path.name == "model_manifest.json":
                try:
                    with open(manifest_path, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    model = self._parse_manifest_json(data, manifest_path.parent)
                    if model:
                        self.register(model)
                        discovered_count += 1
                except Exception:
                    # Ignore invalid JSON manifest files
                    pass

        # 2. Scan for raw model files (GGUF, ONNX, etc.)
        for file_path in models_dir.iterdir():
            if file_path.is_file():
                ext = file_path.suffix.lower()
                fmt = None
                if ext == ".gguf":
                    fmt = ModelFormat.GGUF
                elif ext == ".onnx":
                    fmt = ModelFormat.ONNX
                elif ext == ".safetensors":
                    fmt = ModelFormat.SAFETENSORS

                if fmt is not None:
                    model_id = file_path.stem
                    if model_id not in self._models:
                        model = ModelDefinition(
                            model_id=model_id,
                            display_name=file_path.stem.replace("-", " ").replace("_", " ").title(),
                            provider="local",
                            format=fmt,
                            file_path=str(file_path),
                            is_installed=True,
                            capabilities=[ModelCapability.TEXT_GENERATION, ModelCapability.CHAT],
                            requirements=ModelRequirements(min_ram_gb=4.0),
                        )
                        self.register(model)
                        discovered_count += 1

        return discovered_count

    def _parse_manifest_json(self, data: dict, base_dir: Path) -> Optional[ModelDefinition]:
        """Parse a model definition from a dictionary."""
        model_id = data.get("model_id")
        if not model_id:
            return None

        caps = [
            ModelCapability(c) for c in data.get("capabilities", ["text_generation", "chat"])
            if c in ModelCapability._value2member_map_
        ]

        fmt_val = data.get("format", "gguf")
        fmt = ModelFormat(fmt_val) if fmt_val in ModelFormat._value2member_map_ else ModelFormat.CUSTOM

        req_data = data.get("requirements", {})
        req = ModelRequirements(
            min_ram_gb=float(req_data.get("min_ram_gb", 2.0)),
            min_vram_gb=float(req_data.get("min_vram_gb", 0.0)),
            quantization=req_data.get("quantization"),
        )

        file_rel = data.get("file_path")
        file_path = str(base_dir / file_rel) if file_rel else None

        return ModelDefinition(
            model_id=model_id,
            display_name=data.get("display_name", model_id),
            provider=data.get("provider", "local"),
            model_family=data.get("model_family", "unknown"),
            version=data.get("version", "1.0.0"),
            parameter_count=data.get("parameter_count", "unknown"),
            quantization=data.get("quantization", "none"),
            context_length=int(data.get("context_length", 4096)),
            capabilities=caps,
            requirements=req,
            format=fmt,
            file_path=file_path,
            is_installed=True if file_path and Path(file_path).exists() else False,
            metadata=data.get("metadata", {}),
        )


# Global singleton instance
_model_registry: Optional[ModelRegistry] = None


def get_model_registry() -> ModelRegistry:
    """Get or create the global ModelRegistry instance."""
    global _model_registry
    if _model_registry is None:
        _model_registry = ModelRegistry()
    return _model_registry
