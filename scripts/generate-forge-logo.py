#!/usr/bin/env python3
"""Generate the Forge app mark through the workspace Gemini image API."""

import io
import os
import pathlib
import sys

from google import genai
from google.genai import types
from PIL import Image, ImageOps

ROOT = pathlib.Path(__file__).resolve().parents[2]
FORGE_ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = FORGE_ROOT / "public" / "forge-logo.png"
KEY_NAMES = ("GEMINI_API_KEY", "GOOGLE_AI_API_KEY", "GOOGLE_API_KEY", "GENAI_API_KEY")
MODELS = (
    [os.environ["GEMINI_IMAGE_MODEL"]]
    if os.environ.get("GEMINI_IMAGE_MODEL")
    else ["gemini-3.1-flash-image-preview", "gemini-2.5-flash-image"]
)

PROMPT = """
Use case: logo-brand
Asset type: square app icon used at 24px, 32px, and 1024px
Primary request: Create a distinct Forge logo as the entire square image.
Subject: One continuous bold geometric uppercase letter F. Use a single connected white shape with one vertical stem and two horizontal arms. It must read instantly as F at 24px.
Style: Pure flat vector-style mark with hard crisp edges and minimal geometry.
Color palette: Exactly two flat colors, solid violet #8E68B7 and solid white #FFFFFF.
Composition: Fill the complete 1:1 canvas with violet, edge to edge. Center one white F with even 22 percent padding. Do not draw a separate rounded app tile inside the canvas.
Constraints: Exactly one continuous F. No disconnected pieces. No other letters or words. No white outer margin. No gradients, lighting, shadows, glow, 3D, texture, border, outline, mockup, watermark, or decorative background.
""".strip()


def load_key() -> str:
    for env_file in (ROOT / "keys" / ".env",):
        if not env_file.exists():
            continue
        for line in env_file.read_text().splitlines():
            value = line.strip()
            for name in KEY_NAMES:
                if value.startswith(name + "="):
                    key = value.split("=", 1)[1].strip().strip('"').strip("'")
                    if key and key != "your_key_here":
                        return key
    for name in KEY_NAMES:
        if os.environ.get(name):
            return os.environ[name]
    sys.exit("No Gemini image key found in keys/.env or the environment.")


def extract_image(response) -> bytes | None:
    for candidate in response.candidates or []:
        for part in candidate.content.parts or []:
            data = getattr(getattr(part, "inline_data", None), "data", None)
            if data:
                return data
    return None


def save_variants(source: Image.Image) -> None:
    variants = (
        (192, FORGE_ROOT / "public" / "icons" / "icon-192.png"),
        (512, FORGE_ROOT / "public" / "icons" / "icon-512.png"),
        (512, FORGE_ROOT / "public" / "icons" / "maskable-icon-512.png"),
        (180, FORGE_ROOT / "src" / "app" / "apple-icon.png"),
    )
    for size, path in variants:
        source.resize((size, size), Image.Resampling.LANCZOS).save(path, "PNG", optimize=True)
    source.resize((64, 64), Image.Resampling.LANCZOS).save(
        FORGE_ROOT / "src" / "app" / "favicon.ico",
        "ICO",
    )


def main() -> None:
    client = genai.Client(api_key=load_key())
    config = types.GenerateContentConfig(
        response_modalities=["Image"],
        image_config=types.ImageConfig(aspect_ratio="1:1"),
    )
    last_error = "No image returned"
    for model in MODELS:
        try:
            response = client.models.generate_content(model=model, contents=[PROMPT], config=config)
            raw = extract_image(response)
            if not raw:
                last_error = f"{model}: no image returned"
                continue
            source = Image.open(io.BytesIO(raw)).convert("RGB")
            final = ImageOps.fit(source, (1024, 1024), method=Image.Resampling.LANCZOS)
            final.save(OUT, "PNG", optimize=True)
            save_variants(final)
            print(f"Saved {OUT} with {model}")
            return
        except Exception as error:  # noqa: BLE001
            last_error = f"{model}: {error}"
    sys.exit(last_error)


if __name__ == "__main__":
    main()
