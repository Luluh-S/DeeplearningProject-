"""Browser walkthrough of the frontend (Playwright).

The /api/* calls are answered by Playwright route stubs so the UI can be tested
without TensorFlow. The stubs return FIXED test values; they test the interface
only, never the model. Screenshots go to tests/screenshots/.

    pip install playwright && playwright install chromium
    python tests/ui_smoke.py
"""
from __future__ import annotations

import functools
import http.server
import io
import json
import os
import re
import socketserver
import sys
import threading
from pathlib import Path

from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / "tests" / "screenshots"
SHOTS.mkdir(exist_ok=True)
N = 10


def fake_drawing(i: int) -> bytes:
    """Simple placeholder pictures for UI testing only (not KIDO images)."""
    img = Image.new("RGB", (512, 360), "white")
    d = ImageDraw.Draw(img)
    cols = ["#E2483D", "#3D7FD9", "#5FA35A", "#F5B83D", "#8C6BC8"]
    d.rectangle([150 + i * 4, 170, 330, 300], outline="#1F2A44", width=6)
    d.polygon([(140 + i * 4, 175), (240, 90), (345, 175)], outline=cols[i % 5], width=6)
    d.ellipse([400, 30 + i * 3, 470, 100 + i * 3], outline=cols[(i + 2) % 5], width=6)
    d.line([(20, 320), (500, 320)], fill="#5FA35A", width=6)
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


IMAGES = {f"g{i:03d}": fake_drawing(i) for i in range(N)}
LABELS = {f"g{i:03d}": ("Sadness" if i % 2 else "Happiness") for i in range(N)}
SCORES = {f"g{i:03d}": [0.12, 0.81, 0.46, 0.67, 0.30, 0.93, 0.58, 0.22, 0.71, 0.39][i] for i in range(N)}
answered: set[str] = set()
captured_upload: dict = {}


def handle(route, request):
    url = request.url
    path = re.sub(r"^https?://[^/]+", "", url).split("?")[0]
    if path == "/api/health":
        body = {"prediction_mode": "live", "model": {"loaded": True, "error": None},
                "gallery": {"size": N, "source": "UI test placeholders"}, "studio_available": True}
    elif path == "/api/gallery/session":
        answered.clear()
        body = {"session_id": "test", "rounds": N, "source": "UI test placeholders",
                "artworks": [{"id": k, "image_url": f"/api/gallery/image/{k}"} for k in IMAGES]}
    elif path.startswith("/api/gallery/image/"):
        return route.fulfill(status=200, content_type="image/png", body=IMAGES[path.rsplit("/", 1)[1]])
    elif path == "/api/gallery/reveal":
        req = json.loads(request.post_data)
        aid = req["artwork_id"]
        if aid in answered:
            return route.fulfill(status=409, content_type="application/json", body='{"error":"already answered"}')
        answered.add(aid)
        p = SCORES[aid]
        ai = "Sadness" if p > 0.5 else "Happiness"
        body = {"artwork_id": aid, "human": {"label": req["human_choice"], "correct": req["human_choice"] == LABELS[aid]},
                "ai": {"label": ai, "sadness_score": p, "happiness_score": 1 - p, "band": "clear", "source": "live",
                       "correct": ai == LABELS[aid]}, "original_label": LABELS[aid]}
    elif path == "/api/predict":
        data = request.post_data_buffer
        start = data.find(b"\x89PNG")
        captured_upload["png"] = data[start:data.rfind(b"IEND") + 8] if start >= 0 else b""
        body = {"label": "Happiness", "sadness_score": 0.274, "happiness_score": 0.726, "band": "leaning",
                "band_text": "The model leans towards Happiness.", "threshold": 0.5, "source": "live", "stored": False}
    else:
        return route.fulfill(status=404, body="")
    route.fulfill(status=200, content_type="application/json", body=json.dumps(body))


def serve() -> int:
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass

    handler = functools.partial(Quiet, directory=str(ROOT))
    httpd = socketserver.TCPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd.server_address[1]


def play_game(page, shoot_prefix: str, pick=lambda i: "Happiness" if i % 3 else "Sadness"):
    page.click("#startChallenge")
    page.wait_for_selector("#stage:not([hidden])")
    for i in range(N):
        page.wait_for_selector("#frame.is-shown")
        # label must not be visible before answering
        assert page.inner_text("#truthValue") in ("?", ""), "label leaked before answer"
        assert "مخفي" in page.inner_text("#artTheme")
        if i == 0:
            page.wait_for_timeout(900)
            page.screenshot(path=str(SHOTS / f"{shoot_prefix}_02_round.png"))
        page.click(f'.choice[data-choice="{pick(i)}"]')
        assert page.is_enabled("#lockAnswer")
        page.click("#lockAnswer")
        page.wait_for_selector("#truth.is-revealed")
        page.wait_for_selector("#nextArtwork:not([disabled])")
        if i == 0:
            page.wait_for_timeout(500)
            page.screenshot(path=str(SHOTS / f"{shoot_prefix}_03_reveal.png"))
        page.click("#nextArtwork")
    page.wait_for_selector("#room-verdict:not([hidden])")
    page.wait_for_timeout(3200)
    page.screenshot(path=str(SHOTS / f"{shoot_prefix}_04_verdict.png"), full_page=True)


def main() -> int:
    port = serve()
    base = f"http://127.0.0.1:{port}/static/index.html"
    errors: list[str] = []
    exe = os.environ.get("CHROME_PATH")
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=exe) if exe else p.chromium.launch()

        # ---------------- desktop
        ctx = browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
        ctx.route(re.compile(r".*/api/.*"), handle)
        ctx.route(re.compile(r"https://fonts\.(googleapis|gstatic)\.com/.*"), lambda r, q: r.abort())
        page = ctx.new_page()
        page.on("console", lambda m: m.type == "error" and errors.append(m.text))
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(base + "#/")
        page.wait_for_timeout(3600)
        page.screenshot(path=str(SHOTS / "desktop_01_entrance.png"))
        assert page.inner_text("#statusPill") .strip() == "النموذج يعمل مباشرة"

        page.click("#enterGallery")
        page.wait_for_selector("#room-challenge:not([hidden])")
        play_game(page, "desktop")

        # verify scoreboard numbers against the stub data
        pick = lambda i: "Happiness" if i % 3 else "Sadness"
        exp_h = sum(pick(i) == LABELS[f"g{i:03d}"] for i in range(N))
        exp_a = sum(("Sadness" if SCORES[f"g{i:03d}"] > 0.5 else "Happiness") == LABELS[f"g{i:03d}"] for i in range(N))
        assert page.inner_text("#finalHuman") == str(exp_h), (page.inner_text("#finalHuman"), exp_h)
        assert page.inner_text("#finalAI") == str(exp_a), (page.inner_text("#finalAI"), exp_a)
        assert len(page.query_selector_all("#timeline li")) == N
        print(f"verdict ok: human {exp_h}/10, ai {exp_a}/10 → {page.inner_text('#winnerBanner')}")

        # replay works
        page.click("#replay")
        page.wait_for_selector("#stage:not([hidden])")
        page.wait_for_selector("#frame.is-shown")
        assert page.inner_text("#roundNow") == "01"

        # ---------------- studio: canvas drawing → analyze
        page.goto(base + "#/studio")
        page.click("#tabDraw")

        def stroke(points):
            page.query_selector("#sketchCanvas").scroll_into_view_if_needed()
            b = page.query_selector("#sketchCanvas").bounding_box()
            page.mouse.move(b["x"] + points[0][0], b["y"] + points[0][1]); page.mouse.down()
            for x, y in points[1:]:
                page.mouse.move(b["x"] + x, b["y"] + y)
            page.mouse.up()

        stroke([(80 + k * 12, 200 + (k % 6) * 8) for k in range(30)])
        page.click('.swatch[data-color="#3D7FD9"]')
        stroke([(300, 60), (330, 100), (360, 140)])
        page.click("#toolUndo")
        stroke([(420, 80), (460, 85), (500, 90)])
        assert page.is_enabled("#analyze")
        page.click("#analyze")
        page.wait_for_selector("#readingResult:not([hidden])")
        page.wait_for_timeout(1500)
        page.screenshot(path=str(SHOTS / "desktop_05_studio.png"))
        png = captured_upload.get("png", b"")
        img = Image.open(io.BytesIO(png)).convert("RGBA")
        assert img.size == (768, 540)
        assert img.getpixel((2, 2)) == (255, 255, 255, 255), "canvas export background must be opaque white"
        print("studio canvas export ok: opaque white PNG", img.size)

        # upload validation
        page.click("#tabUpload")
        page.set_input_files("#fileInput", files=[{"name": "x.gif", "mimeType": "image/gif", "buffer": b"GIF89a"}])
        assert "PNG أو JPEG أو WEBP" in page.inner_text("#studioError")
        page.set_input_files("#fileInput", files=[{"name": "d.png", "mimeType": "image/png", "buffer": IMAGES["g003"]}])
        page.wait_for_selector("#uploadPreview:not([hidden])")
        assert page.is_enabled("#analyze")

        # ---------------- behind
        page.goto(base + "#/behind")
        for _ in range(8):
            page.mouse.wheel(0, 900); page.wait_for_timeout(250)
        page.wait_for_timeout(1600)
        page.screenshot(path=str(SHOTS / "desktop_06_behind.png"), full_page=True)

        # ---------------- exhibition mode
        page.goto(base + "?fresh=1#/challenge")  # full reload → new game state
        page.click("#exhibitionToggle")
        page.click("#startChallenge")
        page.wait_for_selector("#frame.is-shown")
        page.keyboard.press("s")
        assert page.get_attribute('.choice[data-choice="Sadness"]', "aria-checked") == "true"
        page.keyboard.press("Enter")
        page.wait_for_selector("#truth.is-revealed")
        page.wait_for_timeout(700)
        page.screenshot(path=str(SHOTS / "desktop_07_exhibition.png"))
        ctx.close()

        # ---------------- mobile
        mctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        mctx.route(re.compile(r".*/api/.*"), handle)
        mctx.route(re.compile(r"https://fonts\.(googleapis|gstatic)\.com/.*"), lambda r, q: r.abort())
        m = mctx.new_page()
        m.on("pageerror", lambda e: errors.append(str(e)))
        m.goto(base + "#/")
        m.wait_for_timeout(3500)
        m.screenshot(path=str(SHOTS / "mobile_01_entrance.png"))
        m.goto(base + "#/challenge")
        play_game(m, "mobile")
        overflow = m.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1")
        assert not overflow, "horizontal overflow on mobile"
        m.goto(base + "#/studio")
        m.wait_for_timeout(600)
        m.screenshot(path=str(SHOTS / "mobile_05_studio.png"), full_page=True)
        mctx.close()
        browser.close()

    errors = [e for e in errors if "fonts.g" not in e and "ERR_FAILED" not in e]
    if errors:
        print("Console errors:", *errors, sep="\n  ")
        return 1
    print("UI smoke test passed. Screenshots in", SHOTS)
    return 0


if __name__ == "__main__":
    sys.exit(main())
