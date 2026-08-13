"""Generate Sanam category tiles locally from product image URLs in a JSON manifest."""
from __future__ import annotations

import io
import json
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from PIL import Image, ImageDraw

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "scripts" / "category-tile-manifest.json"
OUT_DIR = ROOT / "scripts" / "generated-category-tiles"
OUT_DIR.mkdir(parents=True, exist_ok=True)

ORANGE = (236, 136, 36)
GREEN = (140, 188, 68)
BG = (246, 247, 249)
CURVE = (210, 230, 242)
W, H = 800, 800
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"


def download_image(url: str) -> Image.Image | None:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "image/*,*/*"})
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = resp.read()
        return Image.open(io.BytesIO(data)).convert("RGBA")
    except Exception as e:
        print("  dl fail", url[:60], e, flush=True)
        return None


def whitish_to_alpha(im: Image.Image, thresh: int = 245) -> Image.Image:
    im = im.copy()
    im.thumbnail((480, 480), Image.Resampling.LANCZOS)
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            if r >= thresh and g >= thresh and b >= thresh:
                px[x, y] = (r, g, b, 0)
            elif min(r, g, b) >= 228 and (max(r, g, b) - min(r, g, b)) <= 14:
                px[x, y] = (r, g, b, max(0, a - 160))
    return im


def fit_contain(im: Image.Image, box: tuple[int, int]) -> Image.Image:
    tw, th = box
    im = im.copy()
    im.thumbnail((tw, th), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    canvas.paste(im, ((tw - im.size[0]) // 2, (th - im.size[1]) // 2), im)
    return canvas


def make_tile(product_imgs: list[Image.Image]) -> Image.Image:
    """Ninja-style tile: soft grey, brand washes, bottom curve. Title is HTML overlay."""
    base = Image.new("RGBA", (W, H), BG + (255,))
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    od.ellipse((-120, -180, 420, 360), fill=ORANGE + (18,))
    od.ellipse((480, -100, 980, 400), fill=GREEN + (16,))
    base = Image.alpha_composite(base, overlay)

    curve = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    cd = ImageDraw.Draw(curve)
    cd.ellipse((-200, H - 260, W + 200, H + 420), fill=CURVE + (255,))
    cd.arc((-200, H - 260, W + 200, H + 420), start=200, end=340, fill=ORANGE + (90,), width=6)
    base = Image.alpha_composite(base, curve)

    cleaned = [whitish_to_alpha(im) for im in product_imgs[:3]]
    if not cleaned:
        mark_path = ROOT / "src" / "assets" / "logo-mark-hires.png"
        if not mark_path.exists():
            mark_path = ROOT / "public" / "placeholder.png"
        if mark_path.exists():
            mark = fit_contain(Image.open(mark_path).convert("RGBA"), (360, 360))
            base.paste(mark, ((W - 360) // 2, 220), mark)
        return base.convert("RGB")

    if len(cleaned) == 1:
        p = fit_contain(cleaned[0], (520, 520))
        base.paste(p, ((W - 520) // 2, 140), p)
    elif len(cleaned) == 2:
        p1 = fit_contain(cleaned[0], (360, 420))
        p2 = fit_contain(cleaned[1], (360, 420))
        base.paste(p1, (40, 160), p1)
        base.paste(p2, (400, 180), p2)
    else:
        p1 = fit_contain(cleaned[0], (320, 380))
        p2 = fit_contain(cleaned[1], (320, 380))
        p3 = fit_contain(cleaned[2], (280, 320))
        base.paste(p1, (30, 150), p1)
        base.paste(p2, (450, 150), p2)
        base.paste(p3, (260, 320), p3)
    return base.convert("RGB")


def process_item(item: dict) -> str:
    slug = item["slug"]
    out = OUT_DIR / f"{slug}.webp"
    urls = item.get("images") or []
    imgs: list[Image.Image] = []
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = [pool.submit(download_image, u) for u in urls[:4]]
        for fut in as_completed(futures):
            im = fut.result()
            if im:
                imgs.append(im)
            if len(imgs) >= 3:
                break
    tile = make_tile(imgs[:3])
    tile.save(out, format="WEBP", quality=82, method=4)
    return slug


def main():
    items = json.loads(MANIFEST.read_text(encoding="utf-8-sig"))
    print("manifest", len(items), flush=True)
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = {pool.submit(process_item, item): i for i, item in enumerate(items, 1)}
        done = 0
        for fut in as_completed(futures):
            done += 1
            idx = futures[fut]
            try:
                slug = fut.result()
                print(f"{done}/{len(items)} {slug}", flush=True)
            except Exception as e:
                print(f"{done}/{len(items)} FAIL idx={idx} {e}", flush=True)
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
