"""Prediction parity test: web app pipeline vs. notebook.

Step 1 (in the notebook): run scripts/notebook_parity_cell.py → parity_reference.json
Step 2 (here):
    python scripts/parity_test.py --reference parity_reference.json \
        --test-dir /path/to/KIDO/.../test --model model/final_model.keras

Passes when every score matches within --tol (default 1e-4) and every
predicted label is identical. Exit code 0 = pass, 1 = mismatch.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.inference import ModelService  # noqa: E402
from app.preprocessing import interpret  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--reference", required=True, type=Path)
    ap.add_argument("--test-dir", required=True, type=Path)
    ap.add_argument("--model", type=Path, default=ROOT / "model" / "final_model.keras")
    ap.add_argument("--tol", type=float, default=1e-4)
    args = ap.parse_args()

    ref = json.loads(args.reference.read_text())
    service = ModelService(args.model)
    if not service.load():
        print(f"FAIL: model not loaded: {service.error}")
        return 1

    print(f"App:      TensorFlow {service.tf_version} | Keras {service.keras_version}")
    print(f"Notebook: TensorFlow {ref.get('tensorflow')} | Keras {ref.get('keras')}")
    if ref.get("tensorflow") and ref["tensorflow"] != service.tf_version:
        print("  note: versions differ, so small numeric differences are possible.\n")

    items = ref["items"]
    raw = []
    for it in items:
        path = args.test_dir / it["relpath"]
        if not path.exists():
            print(f"FAIL: missing image: {path}")
            return 1
        raw.append(path.read_bytes())

    app_scores = service.predict_bytes(raw)

    worst = 0.0
    label_mismatch = 0
    rows = []
    for it, s in zip(items, app_scores):
        diff = abs(s - it["notebook_score"])
        worst = max(worst, diff)
        app_pred = interpret(s).label_id
        same = app_pred == it["notebook_pred"]
        label_mismatch += not same
        rows.append((it["relpath"][-38:], it["notebook_score"], s, diff, same))

    print(f"{'image':40} {'notebook':>10} {'app':>10} {'|diff|':>10}  label")
    for name, nb, s, d, same in rows[:15]:
        print(f"{name:40} {nb:10.6f} {s:10.6f} {d:10.2e}  {'same' if same else 'DIFFERENT'}")
    if len(rows) > 15:
        print(f"… {len(rows) - 15} more")

    print(f"\nImages compared:      {len(rows)}")
    print(f"Max |score diff|:     {worst:.3e}  (tolerance {args.tol:g})")
    print(f"Label mismatches:     {label_mismatch}")
    ok = worst <= args.tol and label_mismatch == 0
    print("RESULT: PASS ✅" if ok else "RESULT: FAIL ❌  (see README → 'If the parity test fails')")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
