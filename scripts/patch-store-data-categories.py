"""Patch src/data/store-data.ts with generated categories + rename offers section."""
from __future__ import annotations

import json
import pathlib
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")

ROOT = pathlib.Path(__file__).resolve().parents[1]
STORE = ROOT / "src" / "data" / "store-data.ts"
GEN = ROOT / "scripts" / "generated-categories.json"

cats = json.loads(GEN.read_text(encoding="utf-8"))
text = STORE.read_text(encoding="utf-8")

text = text.replace(
    '{ id: "offers", title: "أفضل العروض", titleEn: "Best Offers" }',
    '{ id: "offers", title: "أحدث العروض", titleEn: "Latest Offers" }',
)

lines = ["export const categories: Category[] = ["]
for c in cats:
    img = c["image"].replace("\\", "/").replace('"', '\\"')
    name = c["name"].replace("\\", "\\\\").replace('"', '\\"')
    name_en = c["nameEn"].replace("\\", "\\\\").replace('"', '\\"')
    lines.append(
        f'  {{ id: "{c["id"]}", name: "{name}", nameEn: "{name_en}", icon: "{c["icon"]}", '
        f'image: "{img}", color: "{c["color"]}", section: "{c["section"]}" }},'
    )
lines.append("];")
new_block = "\n".join(lines)

# Replace categories array through products marker
pat = re.compile(
    r"export const categories: Category\[\] = \[.*?\];\s*\n\s*// ===== المنتجات",
    re.S,
)
if not pat.search(text):
    raise SystemExit("categories block not found")
text = pat.sub(new_block + "\n\n// ===== المنتجات", text)

# Keep a short products stub (homepage uses DB now for catalog items)
# Leave existing static products as-is or trim — HomeSections doesn't use them for listing products.
STORE.write_text(text, encoding="utf-8")
print("updated store-data.ts categories", len(cats))
