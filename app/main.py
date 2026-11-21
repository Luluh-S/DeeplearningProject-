"""FastAPI application: API + the static museum frontend, on one URL.

Run locally:   uvicorn app.main:app --reload --port 7860
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .config import settings
from .gallery import Gallery, GalleryError, SessionStore
from .inference import ModelService
from .preprocessing import (
    CLASS_NAMES,
    THRESHOLD,
    InvalidImageError,
    interpret,
    sanitize_upload,
)

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("little_minds")

model = ModelService(settings.model_path)
gallery = Gallery(settings.gallery_dir)
sessions = SessionStore(settings.session_ttl_seconds, settings.max_sessions)


@asynccontextmanager
async def lifespan(_: FastAPI):
    gallery.load()
    log.info("Gallery: %d artworks (%d with cached predictions)", gallery.size, gallery.cached_count)
    if settings.prediction_source != "cached":
        model.load()
    yield


app = FastAPI(title="Little Minds AI: Human vs. Machine", lifespan=lifespan, docs_url=None, redoc_url=None)


# ----------------------------------------------------------------- middleware
@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.exception_handler(GalleryError)
async def gallery_error_handler(_: Request, exc: GalleryError):
    return JSONResponse({"error": str(exc)}, status_code=exc.status)


def error(message: str, status: int) -> JSONResponse:
    return JSONResponse({"error": message}, status_code=status)


# ----------------------------------------------------------------- helpers
def ai_prediction_for(artwork) -> dict:
    """Real model prediction for a gallery artwork: live if possible, else cached."""
    mode = settings.prediction_source
    if mode in ("auto", "live") and model.loaded:
        # Gallery images go to the notebook pipeline byte-for-byte (no sanitising).
        p = model.predict_one(artwork.path.read_bytes())
        source = "live"
    elif mode in ("auto", "cached") and artwork.cached_score is not None:
        p = artwork.cached_score
        source = "cached"
    else:
        raise GalleryError(
            "The AI is not available: the model is not loaded and no cached prediction exists "
            "for this artwork. See README → 'Connect the model'.",
            503,
        )
    result = interpret(p)
    return {
        "label": result.label,
        "sadness_score": result.sadness_score,
        "happiness_score": result.happiness_score,
        "band": result.band,
        "source": source,
    }


# ----------------------------------------------------------------- API
@app.get("/api/health")
def health():
    if model.loaded:
        mode = "live"
    elif settings.prediction_source != "live" and gallery.cached_count:
        mode = "cached"
    else:
        mode = "offline"
    return {
        "status": "ok",
        "prediction_mode": mode,
        "prediction_source_setting": settings.prediction_source,
        "model": {
            "loaded": model.loaded,
            "file": settings.model_path.name,
            "error": model.error,
            "tensorflow": model.tf_version,
            "keras": model.keras_version,
        },
        "gallery": {
            "size": gallery.size,
            "cached_predictions": gallery.cached_count,
            "source": gallery.meta.get("source"),
            "error": gallery.error,
        },
        "classes": list(CLASS_NAMES),
        "threshold": THRESHOLD,
        "rounds_per_game": settings.rounds_per_game,
        "studio_available": model.loaded,
    }


@app.post("/api/gallery/session")
def new_session():
    session = sessions.create(gallery, settings.rounds_per_game)
    return {
        "session_id": session.id,
        "rounds": len(session.artwork_ids),
        "source": gallery.meta.get("source"),
        # Only opaque ids and image URLs, never labels or original file names.
        "artworks": [
            {"id": art_id, "image_url": f"/api/gallery/image/{art_id}"}
            for art_id in session.artwork_ids
        ],
    }


@app.get("/api/gallery/image/{art_id}")
def gallery_image(art_id: str):
    artwork = gallery.get(art_id)
    return FileResponse(artwork.path, headers={"Cache-Control": "private, max-age=3600"})


class RevealRequest(BaseModel):
    session_id: str
    artwork_id: str
    human_choice: str


@app.post("/api/gallery/reveal")
def reveal(body: RevealRequest):
    # 1. The visitor must have a valid, not-yet-answered round in this session.
    sessions.validate_answer(body.session_id, body.artwork_id, body.human_choice)
    artwork = gallery.get(body.artwork_id)

    # 2. AI prediction, computed from the image only; the human answer is never passed in.
    ai = ai_prediction_for(artwork)

    # 3. Lock the answer (each round can be revealed once), then score both
    #    against the same original dataset label.
    sessions.record_answer(body.session_id, body.artwork_id, body.human_choice)
    return {
        "artwork_id": artwork.id,
        "human": {"label": body.human_choice, "correct": body.human_choice == artwork.label},
        "ai": {**ai, "correct": ai["label"] == artwork.label},
        "original_label": artwork.label,
        "artwork_source": artwork.source,
    }


@app.post("/api/predict")
async def predict(file: UploadFile = File(...)):
    if not model.loaded:
        return error(
            "The AI Art Studio needs the live model, which is not loaded on this server.", 503
        )
    # Read at most limit+1 bytes so oversized files are rejected without loading them fully.
    raw = await file.read(settings.max_upload_bytes + 1)
    await file.close()
    if len(raw) > settings.max_upload_bytes:
        return error(f"File is larger than {settings.max_upload_bytes // (1024 * 1024)} MB.", 413)
    try:
        clean_png = sanitize_upload(raw, settings.max_upload_pixels)
    except InvalidImageError as exc:
        return error(str(exc), 415)
    finally:
        del raw  # nothing is stored; the bytes live only for this request

    p = model.predict_one(clean_png)
    result = interpret(p)
    return {
        "label": result.label,
        "sadness_score": result.sadness_score,
        "happiness_score": result.happiness_score,
        "band": result.band,
        "band_text": result.band_text,
        "threshold": THRESHOLD,
        "source": "live",
        "stored": False,
    }


# ----------------------------------------------------------------- frontend
app.mount("/static", StaticFiles(directory=settings.static_dir), name="static")


@app.get("/", include_in_schema=False)
def index():
    return FileResponse(settings.static_dir / "index.html", headers={"Cache-Control": "no-cache"})


@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    return FileResponse(settings.static_dir / "img" / "favicon.svg", media_type="image/svg+xml")
