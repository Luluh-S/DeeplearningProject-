"""API tests with FastAPI's TestClient.

They replace the real model with a tiny stand-in object so the HTTP layer can
be tested without TensorFlow. This checks routing and game rules only. It
does NOT test the real model (use scripts/parity_test.py for that).

Skipped automatically when FastAPI/httpx are not installed.
"""
from __future__ import annotations

import io
import json

import pytest

pytest.importorskip("fastapi")
pytest.importorskip("httpx")
from fastapi.testclient import TestClient  # noqa: E402
from PIL import Image  # noqa: E402

import app.main as main  # noqa: E402
from app.gallery import Gallery  # noqa: E402


class StubModel:
    """Test double: returns a fixed score. Never used by the real app."""
    loaded = True
    error = None
    tf_version = keras_version = "stub"

    def __init__(self, score):
        self.score = score
        self.calls = []

    def load(self):
        return True

    def predict_one(self, raw):
        self.calls.append(raw)
        return self.score


@pytest.fixture()
def client(tmp_path, monkeypatch):
    images = tmp_path / "images"
    images.mkdir()
    arts = []
    for i in range(10):
        Image.new("RGB", (64, 45), "white").save(images / f"g{i:03d}.png")
        arts.append({"id": f"g{i:03d}", "image": f"images/g{i:03d}.png",
                     "label": "Sadness" if i % 2 else "Happiness", "cached_model_score": 0.9})
    (tmp_path / "manifest.json").write_text(json.dumps({"source": "unit test", "artworks": arts}))
    g = Gallery(tmp_path)
    monkeypatch.setattr(main, "gallery", g)
    stub = StubModel(0.8)
    monkeypatch.setattr(main, "model", stub)
    monkeypatch.setattr(main.gallery, "load", lambda: Gallery.load(g))
    with TestClient(main.app) as c:
        c.stub = stub
        yield c


def test_session_hides_labels(client):
    r = client.post("/api/gallery/session").json()
    assert r["rounds"] == 10
    text = json.dumps(r)
    assert "Happiness" not in text and "Sadness" not in text


def test_reveal_flow(client):
    s = client.post("/api/gallery/session").json()
    art = s["artworks"][0]["id"]
    r = client.post("/api/gallery/reveal", json={"session_id": s["session_id"], "artwork_id": art, "human_choice": "Happiness"})
    assert r.status_code == 200
    body = r.json()
    assert body["ai"]["label"] == "Sadness" and body["ai"]["source"] == "live"
    assert body["human"]["correct"] == (body["original_label"] == "Happiness")
    assert body["ai"]["correct"] == (body["original_label"] == "Sadness")
    # second answer for the same round is refused
    r2 = client.post("/api/gallery/reveal", json={"session_id": s["session_id"], "artwork_id": art, "human_choice": "Sadness"})
    assert r2.status_code == 409


def test_human_choice_never_reaches_model(client):
    s = client.post("/api/gallery/session").json()
    for i, choice in enumerate(["Happiness", "Sadness"]):
        client.post("/api/gallery/reveal", json={"session_id": s["session_id"], "artwork_id": s["artworks"][i]["id"], "human_choice": choice})
    # the model received only image bytes
    assert all(isinstance(c, bytes) and c.startswith(b"\x89PNG") for c in client.stub.calls)


def test_predict_rejects_non_images(client):
    r = client.post("/api/predict", files={"file": ("x.png", b"hello", "image/png")})
    assert r.status_code == 415


def test_predict_ok(client):
    buf = io.BytesIO()
    Image.new("RGBA", (256, 180), (0, 0, 0, 0)).save(buf, format="PNG")
    r = client.post("/api/predict", files={"file": ("d.png", buf.getvalue(), "image/png")})
    assert r.status_code == 200
    assert r.json()["label"] == "Sadness" and r.json()["stored"] is False


def test_image_endpoint_rejects_unknown_ids(client):
    assert client.get("/api/gallery/image/..%2Fmanifest").status_code == 404
    assert client.get("/api/gallery/image/zzz").status_code == 404
