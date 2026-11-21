"""Image preprocessing: a line-for-line copy of the notebook pipeline.

Notebook source of truth (cells 34 and 36):

    IMG_SIZE = (180, 256)
    image = tf.io.read_file(path)
    image = tf.image.decode_image(image, channels=3, expand_animations=False)
    image.set_shape([None, None, 3])
    image = tf.image.resize(image, IMG_SIZE)
    image = tf.cast(image, tf.float32) / 255.0

The saved MobileNetV2 model contains `layers.Rescaling(2.0, offset=-1.0)`
as its first layer, so the model must receive pixels in [0, 1].
We must NOT call `mobilenet_v2.preprocess_input` here, because that would
rescale twice.

Labels (cell 32): Happiness = 0, Sadness = 1.
Decision rule (cell 74): `probabilities > 0.5` -> 1 (Sadness).
"""
from __future__ import annotations

import io
from dataclasses import dataclass

from PIL import Image, ImageOps, UnidentifiedImageError

IMG_HEIGHT = 180
IMG_WIDTH = 256
IMG_SIZE = (IMG_HEIGHT, IMG_WIDTH)  # tf.image.resize takes (height, width)

CLASS_NAMES = ("Happiness", "Sadness")  # index == label id
THRESHOLD = 0.5

ALLOWED_UPLOAD_FORMATS = {"PNG", "JPEG", "WEBP", "BMP", "GIF"}


class InvalidImageError(ValueError):
    """Raised for files that are not acceptable images."""


# --------------------------------------------------------------------------
# 1. The notebook pipeline (needs TensorFlow; imported lazily)
# --------------------------------------------------------------------------
def notebook_preprocess(raw_bytes: bytes):
    """Return a float32 tensor of shape (180, 256, 3) with values in [0, 1].

    Identical to the notebook's `load_image`, except that it starts from the
    file's bytes instead of a path (tf.io.read_file just returns those bytes).
    """
    import tensorflow as tf

    image = tf.io.decode_image(raw_bytes, channels=3, expand_animations=False)
    image.set_shape([None, None, 3])
    image = tf.image.resize(image, IMG_SIZE)
    image = tf.cast(image, tf.float32) / 255.0
    return image


# --------------------------------------------------------------------------
# 2. Upload sanitising (pure Pillow, runs before the notebook pipeline)
# --------------------------------------------------------------------------
def sanitize_upload(raw_bytes: bytes, max_pixels: int) -> bytes:
    """Validate an uploaded image and return clean PNG bytes.

    Why this step exists:
    * `decode_image(channels=3)` silently DROPS the alpha channel. A drawing
      exported from a browser canvas has a transparent background, which
      would become BLACK. We composite onto opaque white first.
    * Phone photos store rotation in EXIF; we apply it so the model sees the
      drawing the way the visitor sees it.
    * Re-encoding strips all metadata (EXIF / GPS) and rejects files that are
      not really images, whatever their extension says.

    Gallery images from KIDO do NOT go through this function: they are fed
    to `notebook_preprocess` byte-for-byte, exactly as in the notebook.
    """
    if not raw_bytes:
        raise InvalidImageError("The file is empty.")

    try:
        with Image.open(io.BytesIO(raw_bytes)) as probe:
            fmt = (probe.format or "").upper()
            width, height = probe.size
            probe.verify()  # structural check; the object is unusable afterwards
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError) as exc:
        raise InvalidImageError("This file is not a readable image.") from exc

    if fmt not in ALLOWED_UPLOAD_FORMATS:
        raise InvalidImageError(
            f"Unsupported image format ({fmt or 'unknown'}). Use PNG, JPEG or WEBP."
        )
    if width * height > max_pixels:
        raise InvalidImageError("The image is too large. Please use a smaller picture.")
    if width < 16 or height < 16:
        raise InvalidImageError("The image is too small to analyse.")

    try:
        with Image.open(io.BytesIO(raw_bytes)) as img:
            img.seek(0)  # first frame of an animated GIF/WEBP (expand_animations=False)
            img = ImageOps.exif_transpose(img)
            img = flatten_on_white(img)
            out = io.BytesIO()
            img.save(out, format="PNG")  # lossless, metadata-free
            return out.getvalue()
    except (OSError, ValueError) as exc:
        raise InvalidImageError("This image could not be decoded.") from exc


def flatten_on_white(img: Image.Image) -> Image.Image:
    """Composite any transparency onto an opaque white background -> RGB."""
    has_alpha = img.mode in ("RGBA", "LA") or (
        img.mode == "P" and "transparency" in img.info
    )
    if has_alpha:
        rgba = img.convert("RGBA")
        background = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
        background.alpha_composite(rgba)
        return background.convert("RGB")
    return img.convert("RGB")


# --------------------------------------------------------------------------
# 3. Interpreting the model output
# --------------------------------------------------------------------------
@dataclass(frozen=True)
class Interpretation:
    label: str
    label_id: int
    sadness_score: float
    happiness_score: float
    band: str          # "clear", "leaning" or "uncertain"
    band_text: str


def interpret(p: float) -> Interpretation:
    """Map the sigmoid output p (= Sadness score) to a label and a plain-language band.

    The band describes how far p is from the 0.5 threshold. It is NOT a
    probability that the prediction is correct.
    """
    p = float(p)
    if not 0.0 <= p <= 1.0:
        raise ValueError(f"Model output {p} is outside [0, 1]")

    label_id = 1 if p > THRESHOLD else 0  # same rule as the notebook
    distance = abs(p - THRESHOLD)
    if distance < 0.10:
        band, text = "uncertain", "The model is undecided. This drawing sits close to the boundary."
    elif distance < 0.25:
        band, text = "leaning", f"The model leans towards {CLASS_NAMES[label_id]}."
    else:
        band, text = "clear", f"The model points clearly towards {CLASS_NAMES[label_id]}, which still does not guarantee it is right."

    return Interpretation(
        label=CLASS_NAMES[label_id],
        label_id=label_id,
        sadness_score=round(p, 6),
        happiness_score=round(1.0 - p, 6),
        band=band,
        band_text=text,
    )
