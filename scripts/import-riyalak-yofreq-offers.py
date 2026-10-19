"""Import Friday PDF offers into category ريالك يفرق + create weekly-offers."""
from __future__ import annotations

import json
import os
import sys
import uuid
import urllib.request
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

# Curated from عروض الجمعة 13-15 Aug 2026 PDF (OCR cleaned)
PRODUCTS: list[dict] = [
    # page 1 veggies
    {"name": "طماطم", "name_en": "Tomato", "price": 1.95, "unit": "كجم", "size_label": "1 كجم"},
    {"name": "باذنجان", "name_en": "Eggplant", "price": 1.95, "unit": "كجم", "size_label": "1 كجم"},
    {"name": "فلفل حار", "name_en": "Hot Pepper", "price": 1.95, "unit": "كجم", "size_label": "1 كجم"},
    {"name": "كيس ثوم", "name_en": "Garlic Bag", "price": 1.95, "unit": "كيس", "size_label": "كيس"},
    {"name": "ليمون زهير / خيار", "name_en": "Lemon / Cucumber", "price": 2.95, "unit": "كجم", "size_label": "1 كجم / كيس"},
    {"name": "خس أمريكي", "name_en": "Iceberg Lettuce", "price": 3.95, "unit": "كجم", "size_label": "1 كجم"},
    # page 2 fruits
    {"name": "أناناس", "name_en": "Pineapple", "price": 1.95, "unit": "كجم", "size_label": "1 كجم"},
    {"name": "عنب أسود", "name_en": "Black Grapes", "price": 2.95, "unit": "كجم", "size_label": "1 كجم"},
    {"name": "الموز / التفاح", "name_en": "Banana / Apple", "price": 4.95, "unit": "كجم", "size_label": "1 كجم"},
    {"name": "برتقال أفندي", "name_en": "Mandarin Orange", "price": 4.95, "unit": "كجم", "size_label": "1 كجم"},
    {"name": "مانجو مصري", "name_en": "Egyptian Mango", "price": 5.95, "unit": "كجم", "size_label": "1 كجم"},
    {"name": "رمان يمني", "name_en": "Yemeni Pomegranate", "price": 7.95, "unit": "كجم", "size_label": "1 كجم"},
    # page 3 deli/dry
    {"name": "حلاوة سادة / جبنة دنماركي / فيتا", "name_en": "Halva / Danish Cheese / Feta", "price": 4.95, "unit": "علبة", "size_label": "500 جم"},
    {"name": "عدس تركي حب", "name_en": "Turkish Whole Lentils", "price": 2.95, "unit": "كيس", "size_label": "500 جم"},
    {"name": "طرشي مصري حار", "name_en": "Egyptian Hot Pickles", "price": 5.95, "unit": "علبة", "size_label": "500 جم"},
    {"name": "بهارات مشكل حب أو مطحون", "name_en": "Mixed Spices", "price": 9.95, "unit": "كيس", "size_label": "500 جم"},
    {"name": "مكسرات تايلندي / دوار الشمس مالح", "name_en": "Thai Nuts / Salted Sunflower", "price": 7.95, "unit": "كيس", "size_label": "500 جم"},
    {"name": "دراجيه مشكل", "name_en": "Assorted Dragee", "price": 29.95, "unit": "كيس", "size_label": "500 جم"},
    # page 4
    {"name": "حليب المراعي كامل الدسم", "name_en": "Almarai Full Cream Milk", "price": 10.95, "unit": "كرتون", "size_label": "4×1 لتر"},
    {"name": "زيت حياة شفاف", "name_en": "Hayat Clear Oil", "price": 10.95, "unit": "زجاجة", "size_label": "1.5 لتر"},
    {"name": "صابون تايد أخضر / أزرق", "name_en": "Tide Detergent Green/Blue", "price": 39.95, "unit": "كيس", "size_label": "5 كجم"},
    {"name": "صدور دجاج داري", "name_en": "Dari Chicken Breast", "price": 31.95, "unit": "كيس", "size_label": "2 كجم"},
    {"name": "مناديل ساندي", "name_en": "Sandy Tissues", "price": 10.95, "unit": "كرتون", "size_label": "8×150 منديل"},
    {"name": "أرز أمريكي أبو سيوف", "name_en": "Abu Seyouf American Rice", "price": 31.95, "unit": "كيس", "size_label": "4.53 كجم"},
    # page 5
    {"name": "مكرونة المائدة", "name_en": "Al Maeda Pasta", "price": 10.95, "unit": "كيس", "size_label": "4 كجم"},
    {"name": "أرز صنو وايت", "name_en": "Sunwhite Rice", "price": 10.95, "unit": "كيس", "size_label": "1 كجم"},
    {"name": "فول مدمس الرابح", "name_en": "Al Rabeh Foul Medames", "price": 11.00, "unit": "كرتون", "size_label": "4×400 جم"},
    {"name": "أرز الشعلان", "name_en": "Al Shaalan Rice", "price": 16.95, "unit": "كيس", "size_label": "3 كجم"},
    {"name": "عسل فابوريتا طبيعي", "name_en": "Favorita Natural Honey", "price": 13.95, "unit": "علبة", "size_label": "500 جم"},
    {"name": "سكر ناعم السميري", "name_en": "Al Sumairi Soft Sugar", "price": 4.95, "unit": "كيس", "size_label": "5 كجم"},
    # page 6
    {"name": "برجر دجاج الكبير", "name_en": "Al Kabeer Chicken Burger", "price": 26.95, "unit": "كيس", "size_label": "1.2 كجم"},
    {"name": "استربس دجاج أمريكانا", "name_en": "Americana Chicken Strips", "price": 28.95, "unit": "كيس", "size_label": "750 جم"},
    {"name": "حليب سائل الطائي", "name_en": "Al Tai Liquid Milk", "price": 8.00, "unit": "كرتون", "size_label": "4×170 جم"},
    {"name": "جبنة موزريلا المراعي", "name_en": "Almarai Mozzarella", "price": 4.95, "unit": "علبة", "size_label": "180 جم"},
    {"name": "حليب مركز سائل المراعي", "name_en": "Almarai Evaporated Milk", "price": 7.50, "unit": "كرتون", "size_label": "6×170 جم"},
    {"name": "حليب مكثف كارب", "name_en": "Carob Condensed Milk", "price": 3.75, "unit": "علبة", "size_label": "2×390 جم"},
    # page 7
    {"name": "حليب بودرة سما", "name_en": "Sama Milk Powder", "price": 8.95, "unit": "علبة", "size_label": "900 جم"},
    {"name": "جبنة نادك", "name_en": "Nadec Cheese", "price": 14.95, "unit": "علبة", "size_label": "2×500 جم"},
    {"name": "تونة يجبي بزيت دوار الشمس", "name_en": "Yegebi Tuna in Sunflower Oil", "price": 9.00, "unit": "كرتون", "size_label": "3×160 جم"},
    {"name": "حليب بودرة المراعي", "name_en": "Almarai Milk Powder", "price": 79.95, "unit": "علبة", "size_label": "2.5 كجم"},
    {"name": "شبيه قشطة لونا سادة", "name_en": "Luna Cream Alternative Plain", "price": 10.95, "unit": "كرتون", "size_label": "4×155 جم"},
    {"name": "معجون طماطم لونا", "name_en": "Luna Tomato Paste", "price": 11.95, "unit": "كرتون", "size_label": "8×135 جم"},
    # page 8
    {"name": "كتشب تيفاني", "name_en": "Tiffany Ketchup", "price": 5.95, "unit": "زجاجة", "size_label": "500 جم"},
    {"name": "عصير نجوم التفاح المراعي", "name_en": "Almarai Apple Stars Juice", "price": 18.00, "unit": "كرتون", "size_label": "18×140 مل"},
    {"name": "مياه سما بيرما", "name_en": "Sama / Perma Water", "price": 3.99, "unit": "كرتون", "size_label": "200/330 مل"},
    {"name": "كرتون حليب المراعي متنوع", "name_en": "Almarai Mixed Milk Carton", "price": 7.95, "unit": "كرتون", "size_label": "18×150 مل"},
    {"name": "مياه الراين / أكوا لايف", "name_en": "Al Rayan / Aqua Life Water", "price": 12.95, "unit": "كرتون", "size_label": "40×330 مل"},
    {"name": "صلصة إتش بي أورجينال", "name_en": "HP Original Sauce", "price": 12.95, "unit": "زجاجة", "size_label": "450 جم"},
    # page 9
    {"name": "رقائق يولوز متنوعة", "name_en": "Yoloz Assorted Chips", "price": 4.99, "unit": "كيس", "size_label": "250 جم"},
    {"name": "بسكويت شاي تيشوب", "name_en": "Teashop Tea Biscuits", "price": 8.95, "unit": "كرتون", "size_label": "8×70 جم"},
    {"name": "علبة كوكيز شنكوز تيفاني", "name_en": "Tiffany Chunkos Cookies", "price": 4.00, "unit": "علبة", "size_label": "43 جم"},
    {"name": "سندوتش لواكر ويفر متنوع", "name_en": "Loacker Wafer Sandwich Assorted", "price": 10.95, "unit": "علبة", "size_label": "3×25 جم"},
    {"name": "أوريو الأصلي", "name_en": "Oreo Original", "price": 17.95, "unit": "علبة", "size_label": "24×36.8 جم"},
    {"name": "بسكويت ديلايتس تيفاني", "name_en": "Tiffany Delights Biscuits", "price": 10.95, "unit": "علبة", "size_label": "4×100 جم"},
    # page 10
    {"name": "عصير مصاص برتقال الربيع", "name_en": "Al Rabie Orange Ice Pop Juice", "price": 15.95, "unit": "كرتون", "size_label": "18×125 مل"},
    {"name": "نسكافيه كابتشينو", "name_en": "Nescafe Cappuccino", "price": 10.95, "unit": "علبة", "size_label": "7 ظروف"},
    {"name": "بسكويت شاي أولكر", "name_en": "Ulker Tea Biscuits", "price": 12.95, "unit": "كرتون", "size_label": "12×70 جم"},
    {"name": "السي كولا علب", "name_en": "LC Cola Cans", "price": 5.75, "unit": "كرتون", "size_label": "5×250 مل"},
    {"name": "شراب ميلاف متنوع", "name_en": "Milaf Drink Assorted", "price": 5.80, "unit": "كرتون", "size_label": "5×240 مل"},
    {"name": "علبة ويفر ريكو رنا", "name_en": "Rico Rana Wafer", "price": 10.95, "unit": "علبة", "size_label": "17.5 جم"},
    # page 11 cleaning
    {"name": "غسيل صحون فيري", "name_en": "Fairy Dishwashing Liquid", "price": 12.95, "unit": "زجاجة", "size_label": "1 لتر"},
    {"name": "غسيل صحون داك", "name_en": "Dac Dishwashing Liquid", "price": 12.95, "unit": "زجاجة", "size_label": "1+1 لتر مجاناً"},
    {"name": "منظف زجاج داك", "name_en": "Dac Glass Cleaner", "price": 10.95, "unit": "زجاجة", "size_label": "650 مل"},
    {"name": "مطهر داك لافندر أو ورد", "name_en": "Dac Disinfectant Lavender/Rose", "price": 5.95, "unit": "زجاجة", "size_label": "1.25 لتر"},
    # page 12 sweets
    {"name": "بسبوسة قشطة", "name_en": "Basbousa with Cream", "price": 9.95, "unit": "علبة", "size_label": "500 جم"},
    {"name": "معمول", "name_en": "Maamoul", "price": 9.95, "unit": "علبة", "size_label": "500 جم"},
    {"name": "كعك سكر", "name_en": "Sugar Cookies", "price": 9.95, "unit": "علبة", "size_label": "500 جم"},
    {"name": "كنافة بالجبن", "name_en": "Kunafa with Cheese", "price": 9.95, "unit": "علبة", "size_label": "500 جم"},
    {"name": "كوكيز متنوع", "name_en": "Assorted Cookies", "price": 9.95, "unit": "علبة", "size_label": "500 جم"},
    {"name": "تمرية بالسمسم", "name_en": "Tamriya with Sesame", "price": 7.95, "unit": "علبة", "size_label": "500 جم"},
]


def load_secrets():
    p = Path(os.environ.get("TEMP", "/tmp")) / "sanam-supabase-secrets.json"
    return json.loads(p.read_text(encoding="utf-8-sig"))


def api(method: str, url: str, key: str, body=None, prefer: str | None = None):
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept": "application/json",
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0",
    }
    if prefer:
        headers["Prefer"] = prefer
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=60) as resp:
        raw = resp.read().decode("utf-8")
        return json.loads(raw) if raw else None


def main():
    secrets = load_secrets()
    base = secrets["url"].rstrip("/")
    key = secrets["service_role"]

    # Resolve latest-offers image as fallback banner
    cats = api("GET", f"{base}/rest/v1/categories?select=id,slug,image&slug=eq.latest-offers", key) or []
    banner = (cats[0].get("image") if cats else None) or "/placeholder.png"

    new_cats = [
        {
            "name": "العروض الأسبوعية",
            "name_en": "Weekly Offers",
            "slug": "weekly-offers",
            "section": "offers",
            "image": banner,
            "is_active": True,
            "sort_order": 2,
        },
        {
            "name": "ريالك يفرق",
            "name_en": "Riyalak Yofreq",
            "slug": "riyalak-yofreq",
            "section": "offers",
            "image": banner,
            "is_active": True,
            "sort_order": 3,
        },
    ]

    for c in new_cats:
        existing = api("GET", f"{base}/rest/v1/categories?select=id,slug&slug=eq.{c['slug']}", key) or []
        if existing:
            print("category exists", c["slug"], existing[0]["id"])
            c["_id"] = existing[0]["id"]
        else:
            rows = api("POST", f"{base}/rest/v1/categories", key, c, prefer="return=representation")
            c["_id"] = rows[0]["id"]
            print("created category", c["slug"], c["_id"])

    riyal_id = next(c["_id"] for c in new_cats if c["slug"] == "riyalak-yofreq")

    # Clear previous riyalak products if re-run
    try:
        api("DELETE", f"{base}/rest/v1/products?category_id=eq.{riyal_id}", key, prefer="return=minimal")
        print("cleared old riyalak products")
    except Exception as e:
        print("clear skip", e)

    # Try match images from existing catalog by name substring
    all_prods = []
    # fetch in pages of 1000 is heavy; search per product instead

    rows = []
    for i, p in enumerate(PRODUCTS):
        image = "/placeholder.png"
        try:
            q = urllib.request.quote(p["name"][:12])
            found = api(
                "GET",
                f"{base}/rest/v1/products?select=image&name=ilike.*{q}*&image=not.is.null&limit=1",
                key,
            ) or []
            if found and found[0].get("image"):
                image = found[0]["image"]
        except Exception:
            pass

        rows.append(
            {
                "name": p["name"],
                "name_en": p["name_en"],
                "price": p["price"],
                "original_price": None,
                "image": image,
                "category_id": riyal_id,
                "unit": p["unit"],
                "description": f"عرض ريالك يفرق — ساري من 13 إلى 15 أغسطس 2026. {p.get('size_label') or ''}".strip(),
                "is_active": True,
                "is_featured": True,
                "sort_order": i + 1,
                "size_label": p.get("size_label"),
                "extra_label": "ريالك يفرق",
                "stock_quantity": 100,
            }
        )

    # insert in batches of 25
    for start in range(0, len(rows), 25):
        batch = rows[start : start + 25]
        api("POST", f"{base}/rest/v1/products", key, batch, prefer="return=minimal")
        print(f"inserted products {start+1}-{start+len(batch)}")

    print("DONE products=", len(rows), "riyal_id=", riyal_id)


if __name__ == "__main__":
    main()
