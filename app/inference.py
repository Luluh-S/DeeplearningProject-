"""Loads final_model.keras once and runs predictions.

TensorFlow is imported lazily so that the rest of the app (gallery, cached
predictions, the frontend) keeps working even when the model file is missing.
"""
from __future__ import annotations

import logging
import threading
from pathlib import Path
from typing import Optional, Sequence

from .preprocessing import IMG_HEIGHT, IMG_WIDTH, notebook_preprocess

log = logging.getLogger("little_minds.inference")


class ModelService:
    def __init__(self, model_path: Path):
        self.model_path = Path(model_path)
        self._model = None
        self._lock = threading.Lock()
        self.error: Optional[str] = None
        self.tf_version: Optional[str] = None
        self.keras_version: Optional[str] = None

    @property
    def loaded(self) -> bool:
        return self._model is not None

    def load(self) -> bool:
        """Load the model and check that its input/output match the notebook."""
        if not self.model_path.exists():
            self.error = f"Model file not found at {self.model_path.name}. See README → 'Connect the model'."
            log.warning(self.error)
            return False
        try:
            import numpy as np
            import tensorflow as tf
            from tensorflow import keras

            self.tf_version = tf.__version__
            self.keras_version = getattr(keras, "__version__", None)
            model = keras.models.load_model(self.model_path, compile=False)

            in_shape = tuple(model.input_shape[1:])
            out_shape = tuple(model.output_shape[1:])
            if in_shape != (IMG_HEIGHT, IMG_WIDTH, 3):
                raise RuntimeError(f"Unexpected model input shape {in_shape}; expected (180, 256, 3)")
            if out_shape != (1,):
                raise RuntimeError(f"Unexpected model output shape {out_shape}; expected (1,) sigmoid")

            # Warm-up so the first visitor does not wait for graph tracing.
            model.predict(np.zeros((1, IMG_HEIGHT, IMG_WIDTH, 3), dtype="float32"), verbose=0)
            self._model = model
            self.error = None
            log.info("Model loaded: %s (TF %s)", self.model_path.name, self.tf_version)
            return True
        except Exception as exc:  # noqa: BLE001 (report any loading problem to /api/health)
            self.error = f"Could not load model: {exc}"
            log.exception("Model loading failed")
            return False

    def predict_bytes(self, images: Sequence[bytes]) -> list[float]:
        """Return the sigmoid output p (Sadness score) for each encoded image."""
        if self._model is None:
            raise RuntimeError("Model is not loaded")
        import tensorflow as tf

        batch = tf.stack([notebook_preprocess(raw) for raw in images])
        with self._lock:  # Keras models are not guaranteed thread-safe
            probs = self._model.predict(batch, verbose=0)
        return [float(v) for v in probs.ravel()]

    def predict_one(self, raw: bytes) -> float:
        return self.predict_bytes([raw])[0]
