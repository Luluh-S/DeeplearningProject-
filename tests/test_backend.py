"""Unit tests that need only Pillow (no TensorFlow, no model).

    python -m pytest tests -q
"""
from __future__ import annotations

import io
import json
from pathlib import Path

import pytest
from PIL import Image

from app.gallery import Gallery, GalleryError, SessionStore
from app.preprocessing import (
    CLASS_NAMES,
    IMG_SIZE,
    InvalidImageError,
    interpret,
    sanitize_upload,
)

MAX_PIXELS = 40_000_000


def png_bytes(img: Image.Image, fmt: str = "PNG") -> bytes:
    buf = io.BytesIO()
    img.save(buf, format=fmt)
    return buf.getvalue()


# ------------------------------------------------------------ preprocessing
def test_notebook_constants():
    assert IMG_SIZE == (180, 256)              # (height, width) as in the notebook
    assert CLASS_NAMES == ("Happiness", "Sadness")  # Happiness=0, Sadness=1


def test_interpret_threshold_matches_notebook():
    # notebook: (probabilities > 0.5).astype(int)
    assert interpret(0.5).label == "Happiness"
    assert interpret(0.5000001).label == "Sadness"
    assert interpret(0.0).label == "Happiness"
    assert interpret(1.0).label == "Sadness"
    r = interpret(0.73)
    assert r.label_id == 1 and r.sadness_score == pytest.approx(0.73) and r.happiness_score == pytest.approx(0.27)


def test_interpret_bands():
    assert interpret(0.55).band == "uncertain"
    assert interpret(0.32).band == "leaning"
    assert interpret(0.95).band == "clear"
    with pytest.raises(ValueError):
        interpret(1.2)


def test_transparent_canvas_becomes_white_not_black():
    # A browser canvas export: transparent background with one red stroke.
    img = Image.new("RGBA", (256, 180), (0, 0, 0, 0))
    for x in range(50, 100):
        img.putpixel((x, 90), (220, 40, 40, 255))
    clean = Image.open(io.BytesIO(sanitize_upload(png_bytes(img), MAX_PIXELS)))
    assert clean.mode == "RGB"
    assert clean.getpixel((5, 5)) == (255, 255, 255)   # background is WHITE
    assert clean.getpixel((60, 90)) == (220, 40, 40)   # drawing kept


def test_jpeg_and_webp_accepted():
    img = Image.new("RGB", (300, 200), (10, 120, 200))
    for fmt in ("JPEG", "WEBP"):
        out = Image.open(io.BytesIO(sanitize_upload(png_bytes(img, fmt), MAX_PIXELS)))
        assert out.size == (300, 200) and out.format == "PNG"


def test_exif_orientation_applied():
    img = Image.new("RGB", (300, 200), "white")
    exif = Image.Exif()
    exif[0x0112] = 6  # rotate 90°
    buf = io.BytesIO()
    img.save(buf, format="JPEG", exif=exif)
    out = Image.open(io.BytesIO(sanitize_upload(buf.getvalue(), MAX_PIXELS)))
    assert out.size == (200, 300)
    assert not out.getexif()  # metadata stripped


@pytest.mark.parametrize("payload", [b"", b"not an image at all", b"%PDF-1.4 fake"])
def test_invalid_files_rejected(payload):
    with pytest.raises(InvalidImageError):
        sanitize_upload(payload, MAX_PIXELS)


def test_too_many_pixels_rejected():
    img = Image.new("RGB", (2000, 2000), "white")
    with pytest.raises(InvalidImageError):
        sanitize_upload(png_bytes(img), max_pixels=1_000_000)


def test_unsupported_format_rejected():
    img = Image.new("RGB", (64, 64), "white")
    with pytest.raises(InvalidImageError):
        sanitize_upload(png_bytes(img, "TIFF"), MAX_PIXELS)


# ------------------------------------------------------------ gallery & sessions
@pytest.fixture()
def gallery_dir(tmp_path: Path) -> Path:
    images = tmp_path / "images"
    images.mkdir()
    artworks = []
    for i in range(12):
        label = CLASS_NAMES[i % 2]
        name = f"g{i:03d}.png"
        Image.new("RGB", (64, 45), "white").save(images / name)
        artworks.append({"id": f"g{i:03d}", "image": f"images/{name}", "label": label,
                         "cached_model_score": 0.2 if i % 3 else 0.8})
    (tmp_path / "manifest.json").write_text(json.dumps({"source": "test", "artworks": artworks}))
    return tmp_path


def test_gallery_loads(gallery_dir):
    g = Gallery(gallery_dir)
    g.load()
    assert g.size == 12 and g.cached_count == 12 and g.error is None


def test_gallery_rejects_path_traversal(gallery_dir):
    m = json.loads((gallery_dir / "manifest.json").read_text())
    m["artworks"][0]["image"] = "../../etc/passwd"
    (gallery_dir / "manifest.json").write_text(json.dumps(m))
    with pytest.raises(ValueError):
        Gallery(gallery_dir).load()


def test_gallery_rejects_bad_label(gallery_dir):
    m = json.loads((gallery_dir / "manifest.json").read_text())
    m["artworks"][0]["label"] = "Angry"
    (gallery_dir / "manifest.json").write_text(json.dumps(m))
    with pytest.raises(ValueError):
        Gallery(gallery_dir).load()


def test_missing_images_are_skipped(gallery_dir):
    (gallery_dir / "images" / "g000.png").unlink()
    g = Gallery(gallery_dir)
    g.load()
    assert g.size == 11


def test_session_unique_balanced(gallery_dir):
    g = Gallery(gallery_dir)
    g.load()
    store = SessionStore(ttl_seconds=60, max_sessions=10)
    for _ in range(25):
        s = store.create(g, 10)
        assert len(s.artwork_ids) == 10
        assert len(set(s.artwork_ids)) == 10          # each drawing once per session
        labels = [g.get(i).label for i in s.artwork_ids]
        assert labels.count("Happiness") == 5         # balanced mix


def test_session_rules(gallery_dir):
    g = Gallery(gallery_dir)
    g.load()
    store = SessionStore(ttl_seconds=60, max_sessions=10)
    s = store.create(g, 10)
    art = s.artwork_ids[0]
    outside = next(i for i in g.artworks if i not in s.artwork_ids)

    with pytest.raises(GalleryError) as e:
        store.validate_answer(s.id, art, "Angry")
    assert e.value.status == 422
    with pytest.raises(GalleryError) as e:
        store.validate_answer(s.id, outside, "Happiness")
    assert e.value.status == 403
    with pytest.raises(GalleryError) as e:
        store.validate_answer("nope", art, "Happiness")
    assert e.value.status == 410

    store.record_answer(s.id, art, "Sadness")
    with pytest.raises(GalleryError) as e:   # answer is locked: no second try
        store.record_answer(s.id, art, "Happiness")
    assert e.value.status == 409


def test_small_gallery_uses_all_images(gallery_dir):
    g = Gallery(gallery_dir)
    g.load()
    s = SessionStore(60, 10).create(g, 50)
    assert len(s.artwork_ids) == 12
