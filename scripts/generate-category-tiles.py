"""
Generate unified Sanam category tiles (Ninja-like style) and upload to Supabase Storage.
Style: title on top, soft backdrop, curved bottom accent, 2–3 product cutouts, brand colors.
"""
from __future__ import annotations

import io
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

sys.stdout.reconfigure(encoding="utf-8")

URL = os.environ["SANAM_URL"].rstrip("/")
KEY = os.environ["SANAM_SERVICE"]
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36"
ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "scripts" / "generated-category-tiles"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Sanam brand
ORANGE = (236, 136, 36)
GREEN = (140, 188, 68)
BG = (246, 247, 249)
CURVE = (210, 230, 242)
W, H = 800, 800


def http_json(method: str, path: str, data=None, headers_extra=None):
    headers = {
        "apikey": KEY,
        "Authorization": f"Bearer {KEY}",
        "User-Agent": UA,
    }
    if headers_extra:
        headers.update(headers_extra)
    body = None
    if data is not None and not isinstance(data, (bytes, bytearray)):
        headers["Content-Type"] = "application/json"
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
    elif isinstance(data, (bytes, bytearray)):
        body = data
    req = urllib.request.Request(f"{URL}{path}", data=body, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=120) as resp:
        raw = resp.read()
        if not raw:
            return resp.status, None
        try:
            return resp.status, json.loads(raw.decode("utf-8"))
        except Exception:
            return resp.status, raw


def fetch_categories():
    _, cats = http_json(
        "GET",
        "/rest/v1/categories?select=id,slug,name,name_en,section,image&is_active=eq.true&order=sort_order&limit=500",
    )
    return cats or []


def fetch_product_images(category_id: str, limit: int = 4) -> list[str]:
    _, rows = http_json(
        "GET",
        f"/rest/v1/products?select=image&category_id=eq.{category_id}&is_active=eq.true&image=not.is.null&limit={limit}",
    )
    urls = []
    for r in rows or []:
        u = (r.get("image") or "").strip()
        if u.startswith("http"):
            urls.append(u)
    return urls


def download_image(url: str) -> Image.Image | None:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=25) as resp:
            data = resp.read()
        im = Image.open(io.BytesIO(data)).convert("RGBA")
        return im
    except Exception:
        return None


def whitish_to_alpha(im: Image.Image, thresh: int = 245) -> Image.Image:
    """Soft-remove near-white backgrounds from product photos (on a downscaled copy)."""
    im = im.copy()
    im.thumbnail((500, 500), Image.Resampling.LANCZOS)
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            if r >= thresh and g >= thresh and b >= thresh:
                px[x, y] = (r, g, b, 0)
            elif min(r, g, b) >= 230 and (max(r, g, b) - min(r, g, b)) <= 12:
                px[x, y] = (r, g, b, max(0, a - 180))
    return im


def fit_contain(im: Image.Image, box: tuple[int, int]) -> Image.Image:
    tw, th = box
    im = im.copy()
    im.thumbnail((tw, th), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    ox = (tw - im.size[0]) // 2
    oy = (th - im.size[1]) // 2
    canvas.paste(im, (ox, oy), im)
    return canvas


def load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        r"C:\Windows\Fonts\arial.ttf",
        r"C:\Windows\Fonts\tahoma.ttf",
        r"C:\Windows\Fonts\seguiemj.ttf",
        r"C:\Windows\Fonts\segoeui.ttf",
    ]
    for p in candidates:
        if Path(p).exists():
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()


def draw_title(draw: ImageDraw.ImageDraw, title: str, font: ImageFont.ImageFont):
    # Centered title near top
    max_w = W - 80
    # simple wrap by characters for Arabic
    lines = []
    cur = ""
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
    lines = lines[:2]
    y = 36
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=font)
        tw = bbox[2] - bbox[0]
        x = (W - tw) // 2
        # soft shadow
        draw.text((x + 1, y + 1), line, font=font, fill=(0, 0, 0, 40))
        draw.text((x, y), line, font=font, fill=(35, 40, 48, 255))
        y += (bbox[3] - bbox[1]) + 8


def make_tile(title: str, product_imgs: list[Image.Image]) -> Image.Image:
    base = Image.new("RGBA", (W, H), BG + (255,))
    draw = ImageDraw.Draw(base)

    # soft brand wash
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    od.ellipse((-120, -180, 420, 360), fill=ORANGE + (18,))
    od.ellipse((480, -100, 980, 400), fill=GREEN + (16,))
    base = Image.alpha_composite(base, overlay)
    draw = ImageDraw.Draw(base)

    # bottom curved accent (Ninja-like)
    curve = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    cd = ImageDraw.Draw(curve)
    cd.ellipse((-200, H - 260, W + 200, H + 420), fill=CURVE + (255,))
    # thin brand stripe on curve
    cd.arc((-200, H - 260, W + 200, H + 420), start=200, end=340, fill=ORANGE + (90,), width=6)
    base = Image.alpha_composite(base, curve)
    draw = ImageDraw.Draw(base)

    font = load_font(54)
    draw_title(draw, title, font)

    # product collage area
    cleaned = []
    for im in product_imgs[:3]:
        cleaned.append(whitish_to_alpha(im))

    if not cleaned:
        # brand mark fallback
        mark_path = ROOT / "src" / "assets" / "logo-mark-hires.png"
        if mark_path.exists():
            mark = Image.open(mark_path).convert("RGBA")
            mark = fit_contain(mark, (360, 360))
            base.paste(mark, ((W - 360) // 2, 260), mark)
        return base.convert("RGB")

    if len(cleaned) == 1:
        p = fit_contain(cleaned[0], (480, 480))
        base.paste(p, ((W - 480) // 2, 220), p)
    elif len(cleaned) == 2:
        p1 = fit_contain(cleaned[0], (340, 400))
        p2 = fit_contain(cleaned[1], (340, 400))
        base.paste(p1, (60, 240), p1)
        base.paste(p2, (400, 260), p2)
    else:
        p1 = fit_contain(cleaned[0], (300, 360))
        p2 = fit_contain(cleaned[1], (300, 360))
        p3 = fit_contain(cleaned[2], (260, 300))
        base.paste(p1, (40, 250), p1)
        base.paste(p2, (460, 250), p2)
        base.paste(p3, (270, 390), p3)

    return base.convert("RGB")


def upload_png(slug: str, img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format="WEBP", quality=82, method=4)
    data = buf.getvalue()
    path = f"categories/banners/{slug}.webp"
    # upsert
    try:
        http_json(
            "POST",
            f"/storage/v1/object/images/{path}",
            data=data,
            headers_extra={
                "Content-Type": "image/webp",
                "x-upsert": "true",
            },
        )
    except urllib.error.HTTPError as e:
        # try update
        if e.code not in (200, 201):
            http_json(
                "PUT",
                f"/storage/v1/object/images/{path}",
                data=data,
                headers_extra={"Content-Type": "image/webp", "x-upsert": "true"},
            )
    public = f"{URL}/storage/v1/object/public/images/{path}"
    return public


def main():
    cats = fetch_categories()
    print("categories", len(cats))
    updated = 0
    for i, cat in enumerate(cats, 1):
        slug = cat["slug"]
        name = cat["name"]
        # skip regenerating customs? still give them branded tiles
        urls = fetch_product_images(cat["id"], 4)
        imgs = []
        for u in urls:
            im = download_image(u)
            if im:
                imgs.append(im)
            if len(imgs) >= 3:
                break

        tile = make_tile(name, imgs)
        local = OUT_DIR / f"{slug}.webp"
        tile.save(local, format="WEBP", quality=82, method=4)
        public_url = upload_png(slug, tile)
        http_json(
            "PATCH",
            f"/rest/v1/categories?id=eq.{cat['id']}",
            {"image": public_url},
            headers_extra={"Content-Type": "application/json", "Prefer": "return=minimal"},
        )
        updated += 1
        if i % 10 == 0 or i == len(cats):
            print(f"  {i}/{len(cats)} updated={updated} last={slug}")
        time.sleep(0.05)

    # also refresh generated-categories.json images for store-data patch
    gen_path = ROOT / "scripts" / "generated-categories.json"
    if gen_path.exists():
        gen = json.loads(gen_path.read_text(encoding="utf-8"))
        # map slug->public url from local naming
        for c in gen:
            c["image"] = f"{URL}/storage/v1/object/public/images/categories/banners/{c['id']}.webp"
        gen_path.write_text(json.dumps(gen, ensure_ascii=False, indent=2), encoding="utf-8")
        print("refreshed generated-categories.json")

    print("DONE", updated)


# need urllib.parse
import urllib.parse  # noqa: E402

if __name__ == "__main__":
    main()
