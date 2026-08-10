"""Remove leftover black/dark fringe from Sanam logo PNGs (keeps brand colors)."""
from PIL import Image
import os

TARGETS = [
    "src/assets/logo-full.png",
    "src/assets/sanam-logo.png",
    "public/sanam-logo.png",
]


def clean(path: str) -> None:
    im = Image.open(path).convert("RGBA")
    px = im.load()
    w, h = im.size
    changed = 0

    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            lum = (r + g + b) / 3
            mx = max(r, g, b)
            mn = min(r, g, b)
            if lum <= 42 and (mx - mn) <= 35:
                px[x, y] = (0, 0, 0, 0)
                changed += 1
                continue
            if lum <= 55 and mx <= 50:
                px[x, y] = (0, 0, 0, 0)
                changed += 1
                continue
            if a < 230 and lum <= 60 and mx <= 70:
                px[x, y] = (0, 0, 0, 0)
                changed += 1

    for _ in range(3):
        to_clear = []
        for y in range(h):
            for x in range(w):
                r, g, b, a = px[x, y]
                if a == 0:
                    continue
                lum = (r + g + b) / 3
                if lum > 65:
                    continue
                for dy, dx in (
                    (-1, 0),
                    (1, 0),
                    (0, -1),
                    (0, 1),
                    (-1, -1),
                    (-1, 1),
                    (1, -1),
                    (1, 1),
                ):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] < 20:
                        to_clear.append((x, y))
                        break
        if not to_clear:
            break
        for x, y in to_clear:
            px[x, y] = (0, 0, 0, 0)
            changed += 1

    im.save(path, "PNG", optimize=True)
    print(path, "changed", changed, "bytes", os.path.getsize(path))


if __name__ == "__main__":
    for t in TARGETS:
        if os.path.exists(t):
            clean(t)
