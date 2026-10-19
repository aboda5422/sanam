"""Generate all Sanam category tiles via OpenAI Images API (approved sample style)."""
from __future__ import annotations

import base64
import io
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import numpy as np
from openai import OpenAI
from PIL import Image

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[1]
PROMPTS = ROOT / "scripts" / "category-tile-prompts.json"
OUT_DIR = ROOT / "scripts" / "generated-category-tiles-v2"
OUT_DIR.mkdir(parents=True, exist_ok=True)
SAMPLES = ROOT / "samples" / "category-tiles"

# Reuse approved samples for matching categories
APPROVED = {
    "daily-eggs": SAMPLES / "01-dairy-eggs.png",
    "drinks-tea": SAMPLES / "02-tea.png",
    "daily-fruits": SAMPLES / "03-fruits.png",
}

MODEL = os.environ.get("SANAM_TILE_MODEL", "gpt-image-1")
SIZE = "1024x1024"
MAX_WORKERS = 4


def strip_orange_line(im: Image.Image) -> Image.Image:
    a = np.array(im.convert("RGB"))
    h, w, _ = a.shape
    y1, y2 = int(h * 0.05), int(h * 0.20)
    region = a[y1:y2].copy()
    r, g, b = region[:, :, 0].astype(int), region[:, :, 1].astype(int), region[:, :, 2].astype(int)
    orange = (r > 170) & (g > 70) & (g < 200) & (b < 130) & (r > g + 25) & (r > b + 35)
    mask = orange.copy()
    for dy in (-2, -1, 0, 1, 2, 3):
        mask |= np.roll(orange, dy, axis=0)
    if mask.any():
        region[mask] = [248, 248, 248]
        a[y1:y2] = region
    return Image.fromarray(a)


def save_webp(im: Image.Image, path: Path) -> None:
    im = strip_orange_line(im).convert("RGB")
    im.save(path, format="WEBP", quality=86, method=4)


def gen_one(client: OpenAI, item: dict) -> tuple[str, str]:
    slug = item["slug"]
    out = OUT_DIR / f"{slug}.webp"
    if out.exists() and out.stat().st_size > 8000:
        return slug, "skip"

    approved = APPROVED.get(slug)
    if approved and approved.exists():
        save_webp(Image.open(approved), out)
        return slug, "approved"

    prompt = item["prompt"]
    last_err = None
    for attempt in range(3):
        try:
            # Prefer gpt-image-1; fall back to dall-e-3
            try:
                resp = client.images.generate(
                    model=MODEL,
                    prompt=prompt,
                    size=SIZE,
                    quality="high",
                )
            except Exception:
                resp = client.images.generate(
                    model="dall-e-3",
                    prompt=prompt,
                    size=SIZE,
                    quality="hd",
                    style="natural",
                )
            data = resp.data[0]
            if getattr(data, "b64_json", None):
                raw = base64.b64decode(data.b64_json)
            elif getattr(data, "url", None):
                import urllib.request

                with urllib.request.urlopen(data.url, timeout=60) as r:
                    raw = r.read()
            else:
                raise RuntimeError("no image payload")
            im = Image.open(io.BytesIO(raw))
            save_webp(im, out)
            return slug, "ok"
        except Exception as e:
            last_err = e
            time.sleep(2 + attempt * 2)
    return slug, f"FAIL {last_err}"


def main():
    items = json.loads(PROMPTS.read_text(encoding="utf-8"))
    client = OpenAI()
    print(f"items={len(items)} model={MODEL} out={OUT_DIR}", flush=True)

    # Seed approved first
    for slug, path in APPROVED.items():
        if path.exists():
            save_webp(Image.open(path), OUT_DIR / f"{slug}.webp")
            print(f"seed {slug}", flush=True)

    done = 0
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futs = {pool.submit(gen_one, client, it): it["slug"] for it in items}
        for fut in as_completed(futs):
            done += 1
            slug, status = fut.result()
            print(f"{done}/{len(items)} {slug} {status}", flush=True)

    ok = sum(1 for p in OUT_DIR.glob("*.webp") if p.stat().st_size > 8000)
    print(f"DONE files={ok}", flush=True)


if __name__ == "__main__":
    main()
