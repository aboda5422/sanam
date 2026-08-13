"""
Local generator matching approved Sanam category tile samples:
- soft off-white background
- soft feathered bottom glow (~15-20%) by section
- 1–2 large hero products (not cluttered collage)
- Arabic title top (no orange line)
"""
from __future__ import annotations

import io
import json
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "scripts" / "category-tile-manifest.json"
PROMPTS = ROOT / "scripts" / "category-tile-prompts.json"
OUT = ROOT / "scripts" / "generated-category-tiles-v2"
SAMPLES = ROOT / "samples" / "category-tiles"
OUT.mkdir(parents=True, exist_ok=True)

W = H = 1024
BG = (248, 248, 249)
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36"

GLOW_RGB = {
    "offers": (255, 214, 180),
    "daily": (198, 230, 198),
    "pantry": (235, 224, 200),
    "drinks": (186, 220, 240),
    "snacks": (186, 220, 240),
    "health": (190, 230, 210),
    "makeup": (240, 210, 220),
    "perfumes": (220, 210, 235),
    "beauty": (240, 210, 220),
    "home": (210, 218, 228),
    "electronics": (210, 214, 220),
    "baby": (200, 230, 220),
    "pets": (230, 218, 198),
    "toys": (200, 220, 240),
    "stationery": (235, 230, 200),
    "pharmacy": (190, 230, 210),
}

APPROVED = {
    "daily-eggs": SAMPLES / "01-dairy-eggs.png",
    "drinks-tea": SAMPLES / "02-tea.png",
    "daily-fruits": SAMPLES / "03-fruits.png",
}


def download(url: str) -> Image.Image | None:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "image/*,*/*"})
        with urllib.request.urlopen(req, timeout=25) as resp:
            data = resp.read()
        return Image.open(io.BytesIO(data)).convert("RGBA")
    except Exception as e:
        print("  dl", url[:50], e, flush=True)
        return None


def whitish_to_alpha(im: Image.Image, thresh: int = 242) -> Image.Image:
    im = im.copy()
    im.thumbnail((720, 720), Image.Resampling.LANCZOS)
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            if r >= thresh and g >= thresh and b >= thresh:
                px[x, y] = (r, g, b, 0)
            elif min(r, g, b) >= 225 and (max(r, g, b) - min(r, g, b)) <= 12:
                px[x, y] = (r, g, b, max(0, a - 180))
    return im


def fit(im: Image.Image, box: tuple[int, int]) -> Image.Image:
    tw, th = box
    im = im.copy()
    im.thumbnail((tw, th), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    canvas.paste(im, ((tw - im.size[0]) // 2, (th - im.size[1]) // 2), im)
    return canvas


def soft_shadow(im: Image.Image, blur: int = 18, opacity: int = 70) -> Image.Image:
    alpha = im.split()[-1]
    sh = Image.new("RGBA", im.size, (0, 0, 0, 0))
    sh.putalpha(alpha.point(lambda a: int(a * opacity / 255)))
    sh = sh.filter(ImageFilter.GaussianBlur(blur))
    return sh


def load_font(size: int):
    for p in [
        r"C:\Windows\Fonts\arialbd.ttf",
        r"C:\Windows\Fonts\tahoma.ttf",
        r"C:\Windows\Fonts\segoeuib.ttf",
        r"C:\Windows\Fonts\arial.ttf",
    ]:
        if Path(p).exists():
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()


def draw_title(base: Image.Image, title: str) -> None:
    draw = ImageDraw.Draw(base)
    font = load_font(64)
    # wrap to 2 lines max
    max_w = W - 100
    lines, cur = [], ""
    for ch in title:
        test = cur + ch
        bbox = draw.textbbox((0, 0), test, font=font)
        if bbox[2] - bbox[0] <= max_w:
            cur = test
        else:
            if cur:
                lines.append(cur)
            cur = ch
    if cur:
        lines.append(cur)
    y = 48
    for line in lines[:2]:
        bbox = draw.textbbox((0, 0), line, font=font)
        x = (W - (bbox[2] - bbox[0])) // 2
        draw.text((x, y), line, font=font, fill=(28, 32, 38, 255))
        y += (bbox[3] - bbox[1]) + 10


def make_glow(section: str) -> Image.Image:
    color = GLOW_RGB.get(section, (200, 220, 235))
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    # soft semi-ellipse covering bottom ~18%
    d.ellipse((-180, int(H * 0.72), W + 180, H + 380), fill=(*color, 255))
    layer = layer.filter(ImageFilter.GaussianBlur(42))
    # reduce opacity overall
    r, g, b, a = layer.split()
    a = a.point(lambda v: int(v * 0.55))
    return Image.merge("RGBA", (r, g, b, a))


def compose(title: str, section: str, products: list[Image.Image]) -> Image.Image:
    base = Image.new("RGBA", (W, H), BG + (255,))
    glow = make_glow(section)
    base = Image.alpha_composite(base, glow)

    cleaned = [whitish_to_alpha(p) for p in products[:2]]
    cleaned = [c for c in cleaned if c is not None]

    if not cleaned:
        mark = ROOT / "public" / "favicon.png"
        if mark.exists():
            m = fit(Image.open(mark).convert("RGBA"), (360, 360))
            base.paste(m, ((W - 360) // 2, 320), m)
    elif len(cleaned) == 1:
        p = fit(cleaned[0], (700, 700))
        sh = soft_shadow(p)
        x, y = (W - 700) // 2, 240
        base.paste(sh, (x + 8, y + 18), sh)
        base.paste(p, (x, y), p)
    else:
        p1 = fit(cleaned[0], (460, 560))
        p2 = fit(cleaned[1], (460, 560))
        sh1, sh2 = soft_shadow(p1), soft_shadow(p2)
        base.paste(sh1, (48 + 6, 260 + 16), sh1)
        base.paste(sh2, (516 + 6, 260 + 16), sh2)
        base.paste(p1, (48, 260), p1)
        base.paste(p2, (516, 260), p2)

    draw_title(base, title)
    return base.convert("RGB")


def process(item: dict, section_by_slug: dict[str, str]) -> tuple[str, str]:
    slug = item["slug"]
    out = OUT / f"{slug}.webp"
    if out.exists() and out.stat().st_size > 8000 and slug in APPROVED:
        return slug, "approved-keep"
    approved = APPROVED.get(slug)
    if approved and approved.exists():
        im = Image.open(approved).convert("RGB").resize((W, H), Image.Resampling.LANCZOS)
        im.save(out, format="WEBP", quality=86, method=4)
        return slug, "approved"

    urls = item.get("images") or []
    imgs: list[Image.Image] = []
    with ThreadPoolExecutor(max_workers=3) as pool:
        futs = [pool.submit(download, u) for u in urls[:3]]
        for fut in as_completed(futs):
            im = fut.result()
            if im:
                imgs.append(im)
            if len(imgs) >= 2:
                break

    section = section_by_slug.get(slug, "daily")
    tile = compose(item["name"], section, imgs[:2])
    tile.save(out, format="WEBP", quality=86, method=4)
    return slug, "ok"


def main():
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8-sig"))
    prompts = {p["slug"]: p for p in json.loads(PROMPTS.read_text(encoding="utf-8"))}
    section_by_slug = {p["slug"]: p.get("section", "daily") for p in prompts.values()}
    print("manifest", len(manifest), flush=True)

    # Force regenerate all non-approved for new style
    for p in OUT.glob("*.webp"):
        if p.stem not in APPROVED:
            p.unlink(missing_ok=True)

    done = 0
    with ThreadPoolExecutor(max_workers=6) as pool:
        futs = {pool.submit(process, it, section_by_slug): it["slug"] for it in manifest}
        for fut in as_completed(futs):
            done += 1
            slug, status = fut.result()
            print(f"{done}/{len(manifest)} {slug} {status}", flush=True)
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
