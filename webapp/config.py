import json
import os
from pathlib import Path

_DEFAULTS_PATH = Path(__file__).parent.parent / "shared" / "defaults.json"
_LOCAL_CONFIG_PATH = Path(__file__).parent / "config.json"
_defaults: dict | None = None


def _load_defaults() -> dict:
    global _defaults
    if _defaults is None:
        _defaults = json.loads(_DEFAULTS_PATH.read_text())
    return _defaults


def get_config(key: str):
    """Get a config value. Resolution order: env var > config.json > defaults."""
    # 1. Env var: scoring.model -> CODEFLUENT_SCORING_MODEL
    env_key = "CODEFLUENT_" + key.upper().replace(".", "_")
    env_val = os.environ.get(env_key)
    if env_val is not None:
        default_val = _load_defaults().get(key)
        if isinstance(default_val, int):
            return int(env_val)
        if isinstance(default_val, float):
            return float(env_val)
        if isinstance(default_val, bool):
            return env_val.lower() in ("true", "1", "yes")
        return env_val

    # 2. Local config.json
    if _LOCAL_CONFIG_PATH.exists():
        overrides = json.loads(_LOCAL_CONFIG_PATH.read_text())
        if key in overrides:
            return overrides[key]

    # 3. Defaults
    d = _load_defaults()
    if key not in d:
        raise KeyError(f"Unknown config key: {key}")
    return d[key]


def get_display_config() -> dict:
    """Return all display.* config values."""
    return {k: get_config(k) for k in _load_defaults() if k.startswith("display.")}


def reset_config_cache() -> None:
    """For testing: reset cached defaults."""
    global _defaults
    _defaults = None
