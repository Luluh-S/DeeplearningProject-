"""Build the Human vs. Machine gallery from the KIDO held-out TEST set.

What it does
1. Picks a balanced random sample (default 20 Happiness + 20 Sadness) from the
   test folder used in the notebook: <EMOTION_DIR>/test/{Happiness,Sadness}.
2. Copies each image byte-for-byte into gallery/images/ under an anonymous id
   (g001.png, g002.jpg, ...). KIDO file names contain student ids, so the
   original names are NOT kept anywhere in the app, only a SHA-256 hash.
3. Writes gallery/manifest.json with the ORIGINAL dataset label of each image.
4. Optionally (--model) runs final_model.keras through the app's own inference
   pipeline and caches the real output score, for the safe demo mode.
5. Writes gallery/review.html, a contact sheet to check every image by eye
   (remove any drawing that shows a name or other personal information).

Usage
    python scripts/build_gallery.py --test-dir /path/to/KIDO/.../test \
        --per-class 20 --model model/final_model.keras

The test set must not be used to tune the model. The gallery is for display
only; game results are never fed back into training or model selection.
"""
from __future__ import annotations

import argparse
import hashlib
import html
import json
import random
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.preprocessing import CLASS_NAMES, interpret  # noqa: E402

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".bmp", ".gif"}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--test-dir", required=True, type=Path, help="KIDO test folder containing Happiness/ and Sadness/")
    ap.add_argument("--per-class", type=int, default=20, help="images per class (default 20)")
    ap.add_argument("--seed", type=int, default=2026)
    ap.add_argument("--out", type=Path, default=ROOT / "gallery")
    ap.add_argument("--model", type=Path, default=None, help="optional: final_model.keras to cache real predictions")
    ap.add_argument("--source", default="KIDO dataset, held-out test set")
    ap.add_argument("--force", action="store_true", help="overwrite an existing gallery")
    args = ap.parse_args()

    images_out = args.out / "images"
    if images_out.exists() and any(images_out.iterdir()):
        if not args.force:
            sys.exit(f"{images_out} is not empty. Use --force to rebuild the gallery.")
        shutil.rmtree(images_out)
    images_out.mkdir(parents=True, exist_ok=True)

    rng = random.Random(args.seed)
    picked: list[tuple[Path, str]] = []
    for label in CLASS_NAMES:
        folder = args.test_dir / label
        if not folder.is_dir():
            sys.exit(f"Folder not found: {folder}  (expected <test-dir>/{label}/)")
        files = sorted(p for p in folder.iterdir() if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS)
        if len(files) < args.per_class:
            sys.exit(f"Only {len(files)} images in {folder}, need {args.per_class}")
        picked += [(p, label) for p in rng.sample(files, args.per_class)]
    rng.shuffle(picked)  # ids must not reveal the label

    artworks = []
    for i, (src, label) in enumerate(picked, start=1):
        art_id = f"g{i:03d}"
        dest = images_out / f"{art_id}{src.suffix.lower()}"
        shutil.copyfile(src, dest)  # byte-for-byte: keeps notebook parity
        artworks.append({
            "id": art_id,
            "image": f"images/{dest.name}",
            "label": label,
            "label_id": CLASS_NAMES.index(label),
            "sha256": hashlib.sha256(dest.read_bytes()).hexdigest(),
            "cached_model_score": None,
            "cached_model_label": None,
        })

    meta_model = None
    if args.model:
        from app.inference import ModelService

        service = ModelService(args.model)
        if not service.load():
            sys.exit(f"Model could not be loaded: {service.error}")
        print(f"Model loaded (TensorFlow {service.tf_version}). Caching predictions…")
        for art in artworks:
            p = service.predict_one((args.out / art["image"]).read_bytes())
            art["cached_model_score"] = round(p, 6)
            art["cached_model_label"] = interpret(p).label
        meta_model = {"file": args.model.name, "tensorflow": service.tf_version, "keras": service.keras_version}
        correct = sum(a["cached_model_label"] == a["label"] for a in artworks)
        print(f"Model matches the dataset label on {correct}/{len(artworks)} gallery images "
              "(a small sample, not the test-set accuracy).")

    manifest = {
        "version": 1,
        "source": args.source,
        "created": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "selection": {"per_class": args.per_class, "seed": args.seed, "from": "test split"},
        "cached_predictions_model": meta_model,
        "note": "Labels are the original KIDO dataset labels. Cached scores, if present, are real "
                "sigmoid outputs of final_model.keras (Sadness score).",
        "artworks": artworks,
    }
    (args.out / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    write_review_sheet(args.out, artworks)
    print(f"Gallery written: {len(artworks)} images → {args.out}")
    print(f"Next: open {args.out / 'review.html'} and delete any image that shows personal information.")


def write_review_sheet(out: Path, artworks: list[dict]) -> None:
    cards = "\n".join(
        f'<figure><img src="{html.escape(a["image"])}" loading="lazy"><figcaption><b>{a["id"]}</b> · {a["label"]}'
        + (f' · model {a["cached_model_score"]:.3f}' if a["cached_model_score"] is not None else "")
        + "</figcaption></figure>"
        for a in artworks
    )
    (out / "review.html").write_text(f"""<!doctype html><meta charset="utf-8"><title>Gallery review</title>
<style>body{{font:14px system-ui;margin:24px;background:#FBF7EF}}main{{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px}}
figure{{margin:0;background:#fff;padding:8px;border-radius:8px}}img{{width:100%;aspect-ratio:256/180;object-fit:contain;background:#fff}}</style>
<h1>Gallery review: check every drawing</h1>
<p>Delete the image file of any drawing that shows a name, a face photo, a school or other personal information.
The app skips images that are missing. This page is for the team only and is not served by the app.</p>
<main>{cards}</main>""", encoding="utf-8")


if __name__ == "__main__":
    main()
