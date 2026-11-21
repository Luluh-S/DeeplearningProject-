# =============================================================================
# PASTE THIS INTO A NEW CELL AT THE END OF Deep_Learning_project.ipynb
# (after the export cell, where final_model is saved).
#
# It records what the NOTEBOOK predicts for the first 64 test images, using the
# notebook's own `final_model`, `test_paths` and `create_dataset` pipeline.
# scripts/parity_test.py then checks that the web app produces the same numbers.
# =============================================================================
import json
import numpy as np
import tensorflow as tf

N_PARITY = 64
parity_paths = test_paths[:N_PARITY]
parity_labels = test_labels[:N_PARITY]

parity_ds = create_dataset(parity_paths, parity_labels)          # same pipeline as training/eval
parity_probs = final_model.predict(parity_ds, verbose=0).ravel()  # sigmoid = Sadness score

reference = {
    "tensorflow": tf.__version__,
    "keras": keras.__version__,
    "threshold": 0.5,
    "class_names": class_names,
    "items": [
        {
            # path relative to the test folder, e.g. "Happiness/xxxx.png"
            "relpath": f"{p.parent.name}/{p.name}",
            "label_id": int(y),
            "notebook_score": float(prob),
            "notebook_pred": int(prob > 0.5),
        }
        for p, y, prob in zip(parity_paths, parity_labels, parity_probs)
    ],
}

with open("parity_reference.json", "w") as f:
    json.dump(reference, f, indent=2)

print("Saved parity_reference.json with", len(reference["items"]), "items")
print("TensorFlow", tf.__version__, "| Keras", keras.__version__, "← use these versions in requirements.txt")
print("Test folder:", EMOTION_DIR / "test")
