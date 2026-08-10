"""Export store-data categories to JSON, then upsert via requests/urllib with browser UA."""
from __future__ import annotations

import json
import os
import pathlib
import re
import sys
import urllib.error
import urllib.request

sys.stdout.reconfigure(encoding="utf-8")

ROOT = pathlib.Path(__file__).resolve().parents[1]
STORE = ROOT / "src" / "data" / "store-data.ts"
OUT = ROOT / "scripts" / "ninja-categories.json"


def parse_categories() -> list[dict]:
    text = STORE.read_text(encoding="utf-8")
    m = re.search(
        r"export const categories: Category\[\] = \[(.*?)\];\s*\n\s*// ===== المنتجات",
        text,
        re.S,
    )
    if not m:
        raise SystemExit("Could not find categories array")
    pat = re.compile(
        r'\{\s*id:\s*"([^"]+)",\s*name:\s*"([^"]*)",\s*nameEn:\s*"([^"]*)",'
        r'\s*icon:\s*"([^"]*)",\s*image:\s*"([^"]+)",\s*color:\s*"([^"]+)",'
        r'\s*section:\s*"([^"]+)"\s*\}',
        re.S,
    )
    cats = pat.findall(m.group(1))
    rows = []
    for i, (cid, name, name_en, _icon, image, _color, section) in enumerate(cats, start=1):
        rows.append(
            {
                "slug": cid,
                "name": name,
                "name_en": name_en,
                "image": image,
                "section": section,
                "sort_order": i,
                "is_active": True,
            }
        )
    return rows


def http_json(method: str, url: str, headers: dict, data: dict | list | None = None):
    body = None if data is None else json.dumps(data).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="replace")
        raise SystemExit(f"HTTP {e.code} {url}: {err}") from e


def main() -> None:
    rows = parse_categories()
    OUT.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    print("exported", len(rows), "->", OUT)

    url = os.environ["SANAM_URL"].rstrip("/")
    key = os.environ["SANAM_SERVICE"]
    base_headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=representation",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    }

    total = 0
    for i in range(0, len(rows), 25):
        batch = rows[i : i + 25]
        status, data = http_json(
            "POST",
            f"{url}/rest/v1/categories?on_conflict=slug",
            base_headers,
            batch,
        )
        n = len(data or [])
        total += n
        print(f"batch {i // 25 + 1}: status={status} upserted={n}")

    custom = [
        {
            "slug": "plastics-section",
            "name": "قسم البلاستيكات",
            "name_en": "Plastics",
            "section": "home",
            "sort_order": 200,
            "is_active": True,
        },
        {
            "slug": "charcoal-gas",
            "name": "قسم الفحم والغاز",
            "name_en": "Charcoal & Gas",
            "section": "home",
            "sort_order": 201,
            "is_active": True,
        },
        {
            "slug": "roastery-weighed",
            "name": "قسم المحمصة (بالميزان)",
            "name_en": "Roastery (By Weight)",
            "section": "pantry",
            "sort_order": 202,
            "is_active": True,
        },
        {
            "slug": "cheese-pickles-weighed",
            "name": "قسم الأجبان والمخللات (بالميزان)",
            "name_en": "Cheese & Pickles (By Weight)",
            "section": "daily",
            "sort_order": 203,
            "is_active": True,
        },
        {
            "slug": "cooking-tools",
            "name": "قسم أدوات الطهي",
            "name_en": "Cooking Tools",
            "section": "home",
            "sort_order": 204,
            "is_active": True,
        },
        {
            "slug": "summer-resort-goods",
            "name": "قسم خردوات المصيف",
            "name_en": "Summer Resort Goods",
            "section": "home",
            "sort_order": 205,
            "is_active": True,
        },
    ]
    status, data = http_json(
        "POST",
        f"{url}/rest/v1/categories?on_conflict=slug",
        base_headers,
        custom,
    )
    print("custom", status, len(data or []))

    get_headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "User-Agent": base_headers["User-Agent"],
    }
    status, allc = http_json(
        "GET",
        f"{url}/rest/v1/categories?select=slug,image,section&is_active=eq.true&order=sort_order",
        get_headers,
    )
    print("active", len(allc or []))
    print("with image", sum(1 for c in (allc or []) if c.get("image")))
    print("with section", sum(1 for c in (allc or []) if c.get("section")))


if __name__ == "__main__":
    main()
