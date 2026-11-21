"""Gallery manifest and challenge sessions.

Fairness rules enforced on the SERVER (the browser can't cheat):
* The original label is never sent before the visitor has locked an answer.
* The visitor's answer is recorded but never given to the model.
* Each artwork appears once per session; each round can be revealed once.
* Human and AI are scored against the same original dataset label.
"""
from __future__ import annotations

import json
import re
import secrets
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from .preprocessing import CLASS_NAMES

ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".bmp", ".gif"}


class GalleryError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


@dataclass(frozen=True)
class Artwork:
    id: str
    path: Path
    label: str                       # original dataset label: "Happiness" or "Sadness"
    cached_score: Optional[float]    # real model output saved by build_gallery.py
    source: str                      # e.g. "KIDO held-out test set"


class Gallery:
    def __init__(self, gallery_dir: Path):
        self.dir = Path(gallery_dir)
        self.images_dir = self.dir / "images"
        self.artworks: dict[str, Artwork] = {}
        self.meta: dict = {}
        self.error: Optional[str] = None

    def load(self) -> None:
        manifest = self.dir / "manifest.json"
        self.artworks, self.meta, self.error = {}, {}, None
        if not manifest.exists():
            self.error = "Gallery manifest not found. Run scripts/build_gallery.py (see README)."
            return
        try:
            data = json.loads(manifest.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            self.error = f"manifest.json is not valid JSON: {exc}"
            return

        self.meta = {k: v for k, v in data.items() if k != "artworks"}
        images_root = self.images_dir.resolve()
        for item in data.get("artworks", []):
            art_id = str(item.get("id", ""))
            label = item.get("label")
            if not ID_PATTERN.match(art_id):
                raise ValueError(f"Invalid artwork id in manifest: {art_id!r}")
            if label not in CLASS_NAMES:
                raise ValueError(f"Artwork {art_id}: label must be one of {CLASS_NAMES}, got {label!r}")
            path = (self.dir / item["image"]).resolve()
            if images_root not in path.parents or path.suffix.lower() not in IMAGE_SUFFIXES:
                raise ValueError(f"Artwork {art_id}: image must be inside gallery/images/")
            if not path.exists():
                continue  # tolerate removed images (e.g. dropped during manual review)
            score = item.get("cached_model_score")
            self.artworks[art_id] = Artwork(
                id=art_id,
                path=path,
                label=label,
                cached_score=None if score is None else float(score),
                source=item.get("source", self.meta.get("source", "Unknown source")),
            )
        if not self.artworks:
            self.error = "The gallery manifest lists no available images."

    @property
    def size(self) -> int:
        return len(self.artworks)

    @property
    def cached_count(self) -> int:
        return sum(1 for a in self.artworks.values() if a.cached_score is not None)

    def get(self, art_id: str) -> Artwork:
        if not ID_PATTERN.match(art_id or "") or art_id not in self.artworks:
            raise GalleryError("Artwork not found.", 404)
        return self.artworks[art_id]


@dataclass
class Session:
    id: str
    artwork_ids: list[str]
    created: float
    answers: dict[str, str] = field(default_factory=dict)


class SessionStore:
    """In-memory challenge sessions (no database, nothing written to disk)."""

    def __init__(self, ttl_seconds: int, max_sessions: int):
        self.ttl = ttl_seconds
        self.max = max_sessions
        self._sessions: dict[str, Session] = {}
        self._lock = threading.Lock()

    def _prune(self) -> None:
        now = time.time()
        expired = [k for k, s in self._sessions.items() if now - s.created > self.ttl]
        for k in expired:
            del self._sessions[k]
        while len(self._sessions) >= self.max:  # drop the oldest
            oldest = min(self._sessions.values(), key=lambda s: s.created)
            del self._sessions[oldest.id]

    def create(self, gallery: Gallery, rounds: int) -> Session:
        if gallery.size == 0:
            raise GalleryError(gallery.error or "The gallery is empty.", 503)
        ids = list(gallery.artworks)
        n = min(rounds, len(ids))
        chosen = _balanced_sample(gallery, n)
        with self._lock:
            self._prune()
            session = Session(id=secrets.token_urlsafe(16), artwork_ids=chosen, created=time.time())
            self._sessions[session.id] = session
        return session

    def get(self, session_id: str) -> Session:
        with self._lock:
            session = self._sessions.get(session_id or "")
            if session is None or time.time() - session.created > self.ttl:
                raise GalleryError("This game session has expired. Please start a new challenge.", 410)
            return session

    def _check(self, session_id: str, artwork_id: str, choice: str) -> Session:
        if choice not in CLASS_NAMES:
            raise GalleryError("Please choose Happiness or Sadness.", 422)
        session = self._sessions.get(session_id or "")
        if session is None or time.time() - session.created > self.ttl:
            raise GalleryError("This game session has expired. Please start a new challenge.", 410)
        if artwork_id not in session.artwork_ids:
            raise GalleryError("This artwork is not part of your game.", 403)
        if artwork_id in session.answers:
            raise GalleryError("This round has already been answered.", 409)
        return session

    def validate_answer(self, session_id: str, artwork_id: str, choice: str) -> None:
        """Check an answer without recording it (so a failed AI call can be retried)."""
        with self._lock:
            self._check(session_id, artwork_id, choice)

    def record_answer(self, session_id: str, artwork_id: str, choice: str) -> Session:
        with self._lock:
            session = self._check(session_id, artwork_id, choice)
            session.answers[artwork_id] = choice
            return session


def _balanced_sample(gallery: Gallery, n: int) -> list[str]:
    """Random sample that mixes both labels as evenly as the gallery allows.

    A purely random draw of 10 could easily be 8-vs-2; balancing keeps each
    game fair without revealing the order (the final list is shuffled).
    """
    rng = secrets.SystemRandom()
    by_label: dict[str, list[str]] = {name: [] for name in CLASS_NAMES}
    for art in gallery.artworks.values():
        by_label[art.label].append(art.id)
    for ids in by_label.values():
        rng.shuffle(ids)

    half = n // 2
    first, second = rng.sample(CLASS_NAMES, 2)
    take = {first: min(half + n % 2, len(by_label[first])), second: 0}
    take[second] = min(n - take[first], len(by_label[second]))
    take[first] = min(n - take[second], len(by_label[first]))  # top up if one class is short

    chosen = by_label[first][: take[first]] + by_label[second][: take[second]]
    rng.shuffle(chosen)
    return chosen
