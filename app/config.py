"""Runtime settings, read from environment variables.

Every setting has a sensible default so the app runs with no configuration.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent


def _path(name: str, default: Path) -> Path:
    value = os.getenv(name)
    return Path(value).resolve() if value else default


@dataclass(frozen=True)
class Settings:
    # Trained model exported from the notebook (export cell: final_model.save(...)).
    model_path: Path = _path("MODEL_PATH", ROOT_DIR / "model" / "final_model.keras")

    # Gallery manifest + images produced by scripts/build_gallery.py.
    gallery_dir: Path = _path("GALLERY_DIR", ROOT_DIR / "gallery")

    # Where the AI prediction in the challenge comes from:
    #   auto   -> live model if loaded, otherwise cached real predictions from the manifest
    #   live   -> live model only (error if the model is not loaded)
    #   cached -> cached real predictions only (safe demo mode)
    prediction_source: str = os.getenv("PREDICTION_SOURCE", "auto").lower()

    # Upload limits for the AI Art Studio.
    max_upload_bytes: int = int(os.getenv("MAX_UPLOAD_MB", "8")) * 1024 * 1024
    max_upload_pixels: int = int(os.getenv("MAX_UPLOAD_PIXELS", str(40_000_000)))

    # Challenge sessions are kept in memory only.
    rounds_per_game: int = int(os.getenv("ROUNDS_PER_GAME", "10"))
    session_ttl_seconds: int = int(os.getenv("SESSION_TTL_SECONDS", str(2 * 60 * 60)))
    max_sessions: int = int(os.getenv("MAX_SESSIONS", "5000"))

    static_dir: Path = ROOT_DIR / "static"


settings = Settings()

if settings.prediction_source not in {"auto", "live", "cached"}:
    raise ValueError("PREDICTION_SOURCE must be one of: auto, live, cached")
