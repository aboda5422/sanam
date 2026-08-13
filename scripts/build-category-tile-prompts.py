"""Build prompt catalog for Sanam category tiles (approved sample style)."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "scripts" / "category-tile-manifest.json"
STORE = ROOT / "src" / "data" / "store-data.ts"
OUT = ROOT / "scripts" / "category-tile-prompts.json"

# Soft bottom glow (~15%) by section — Sanam-friendly, quiet
GLOW = {
    "offers": "soft warm peach-orange glow",
    "daily": "soft light green glow",
    "pantry": "soft warm cream-beige glow",
    "drinks": "soft light blue glow",
    "snacks": "soft light blue glow",
    "health": "soft mint green glow",
    "makeup": "soft blush pink glow",
    "perfumes": "soft lavender glow",
    "beauty": "soft blush pink glow",
    "home": "soft cool grey-blue glow",
    "electronics": "soft cool grey glow",
    "baby": "soft pastel mint glow",
    "pets": "soft warm sand glow",
    "toys": "soft sky blue glow",
    "stationery": "soft pale yellow glow",
    "pharmacy": "soft mint green glow",
}

# Hero subject: 1 product that fills the frame, or 2 famous brands side-by-side
SUBJECTS: dict[str, str] = {
    "latest-offers": "two promotional grocery items side by side: a branded juice bottle and a snack pack with red SALE feel, filling lower half",
    "daily-cheese": "ONE large block/wedge of cheese and a small cheese pack beside it, filling the frame generously",
    "daily-fish": "ONE whole fresh fish and a few fillets as a single neat seafood still-life, NO plate",
    "daily-herbs": "a generous bunch of fresh green herbs (parsley, mint, coriander) tied together, filling the frame",
    "daily-dairy": "ONE large milk bottle and ONE yogurt cup side by side, famous grocery dairy look, filling lower half",
    "daily-eggs": "ONE large cardboard egg tray packed with white eggs filling most of the lower two-thirds of the frame",
    "daily-vegetables": "a rich freestanding pile of fresh vegetables (tomato, cucumber, pepper, lettuce) with NO bowl/plate",
    "daily-poultry": "raw fresh chicken pieces neatly arranged as ONE subject, supermarket quality, NO plate clutter",
    "daily-fresh-juices": "TWO fresh juice bottles side by side, clear labels, filling lower half",
    "daily-fruits": "a generous freestanding pile of many fresh fruits with NO bowl/plate: grapes apples oranges bananas strawberries kiwi",
    "daily-meat": "fresh red meat cuts arranged as one neat butcher still-life, filling frame",
    "daily-seafood": "shrimp and seafood pieces as one neat pile, NO plate",
    "daily-chilled": "ONE chilled dairy/juice carton and a yogurt, cold grocery look",
    "daily-ready-meals": "ONE ready meal tray and a sandwich pack side by side",
    "pantry-ice-cream": "TWO ice cream tubs/pops side by side, famous dessert brands look",
    "pantry-rice": "ONE large rice bag standing upright filling the frame",
    "pantry-frozen-fish": "ONE frozen fish pack filling the frame",
    "pantry-world-foods": "TWO international pantry jars/packs side by side",
    "pantry-frozen-fries-sides": "ONE frozen fries bag filling the frame",
    "pantry-pulses": "ONE large lentils/beans bag filling the frame",
    "pantry-spices": "TWO spice jars side by side",
    "pantry-pizza": "ONE frozen pizza box filling the frame",
    "pantry-tuna": "TWO tuna cans side by side",
    "pantry-frozen-vegetables": "ONE frozen vegetables bag filling the frame",
    "pantry-flour": "ONE flour bag standing upright filling the frame",
    "pantry-frozen-poultry": "ONE frozen chicken pack filling the frame",
    "pantry-oils": "TWO cooking oil bottles side by side (sunflower/olive)",
    "pantry-sugar": "ONE sugar pack filling the frame",
    "pantry-ghee": "ONE ghee tin filling the frame",
    "pantry-soups": "TWO soup cans/cartons side by side",
    "pantry-chips-snacks": "TWO famous chip bags side by side (e.g. Lay's style)",
    "pantry-sauces": "TWO sauce bottles side by side (ketchup/mayonnaise)",
    "pantry-frozen-meat": "ONE frozen meat pack filling the frame",
    "pantry-pickles": "TWO pickle jars side by side",
    "pantry-jam-honey": "ONE jam jar and ONE honey jar side by side",
    "pantry-frozen-pastry": "ONE frozen pastry pack filling the frame",
    "pantry-pasta": "TWO pasta packs side by side",
    "pantry-canned-food": "TWO canned food cans side by side",
    "pantry-other": "TWO pantry grocery packs side by side",
    "pantry-breakfast": "ONE cereal box and ONE oats pack side by side",
    "pantry-ready-meals": "ONE ready meal pack filling the frame",
    "drinks-tea": "TWO famous tea boxes side by side: classic yellow Lipton Yellow Label and red Rabea tea, filling lower half",
    "drinks-concentrates": "TWO juice concentrate bottles/cartons side by side",
    "drinks-juices": "TWO famous juice cartons side by side filling lower half",
    "drinks-coffee": "TWO coffee packs/jars side by side",
    "drinks-hot-drinks": "ONE hot chocolate tin and ONE powdered drink pack side by side",
    "drinks-energy-drinks": "TWO energy drink cans side by side (Red Bull style)",
    "drinks-soft-drinks": "TWO soft drink bottles/cans side by side (Coca-Cola and Pepsi style)",
    "drinks-water": "TWO mineral water bottles side by side filling lower half",
    "snacks-biscuits": "TWO famous biscuit packs side by side (Oreo style)",
    "snacks-dates": "ONE dates box filling the frame",
    "snacks-toast": "ONE toast/rusk pack filling the frame",
    "snacks-sweets": "ONE open baklava tin and ONE chocolate candy container side by side on soft glow, no clutter",
    "snacks-bread": "fresh bakery bread loaves as one neat pile, NO plate",
    "snacks-chocolate": "TWO famous chocolate bars side by side (KitKat/Snickers style)",
    "snacks-croissant": "fresh croissants as one neat pile, NO plate",
    "snacks-cake": "ONE packaged cake and ONE cake slice box side by side",
    "snacks-pastries": "assorted pastries as one neat pile, NO plate",
    "snacks-nuts": "a generous freestanding pile of mixed nuts with NO bowl",
    "makeup-cosmetics": "TWO makeup products side by side (lipstick and foundation)",
    "beauty-men-s-shaving": "ONE shaving foam and ONE razor pack side by side",
    "beauty-women-s-shaving": "ONE women shaving product and ONE cream side by side",
    "beauty-perfumes": "TWO perfume bottles side by side, elegant",
    "beauty-skin-care": "TWO skincare bottles/jars side by side",
    "beauty-hair-care": "TWO hair care bottles side by side",
    "beauty-face-care": "TWO face cream jars side by side",
    "beauty-conditioner": "ONE conditioner bottle filling the frame",
    "beauty-shampoo": "TWO shampoo bottles side by side",
    "beauty-soap": "TWO soap bars/packs side by side",
    "beauty-body-wash": "TWO body wash bottles side by side",
    "beauty-toothbrushes": "TWO toothbrush packs side by side",
    "beauty-deodorants": "TWO deodorant sticks/sprays side by side",
    "beauty-toothpaste": "TWO toothpaste tubes side by side",
    "home-storage": "TWO storage containers side by side",
    "home-cleaning-tools": "ONE mop/broom and cleaning cloths as one neat set",
    "home-kitchen-tools": "kitchen utensils as one neat set, NO clutter",
    "home-cups": "TWO cups/mugs side by side",
    "home-shopping-bags": "TWO reusable shopping bags side by side",
    "home-garbage-bags": "ONE garbage bags pack filling the frame",
    "home-sponges-brushes": "sponges and brushes as one neat cleaning set",
    "home-accessories": "TWO home accessory items side by side",
    "home-camping": "camping lantern and thermos as one neat set",
    "home-food-wrap-storage": "ONE cling film and ONE foil pack side by side",
    "home-bags": "TWO household bags side by side",
    "home-home-decor": "ONE decor item filling the frame tastefully",
    "home-flowers-plants": "ONE potted plant filling the frame",
    "home-grills": "ONE small grill/BBQ accessory filling the frame",
    "home-plates": "TWO plates side by side",
    "home-charcoal": "ONE charcoal bag filling the frame",
    "home-garden-supplies": "garden tools/supplies as one neat set",
    "home-bathroom-essentials": "TWO bathroom essentials side by side",
    "home-air-fresheners": "TWO air freshener packs side by side",
    "home-insect-control": "ONE insect control spray/pack filling the frame",
    "home-men-clothing": "folded men clothing items as one neat stack",
    "home-women-clothing": "folded women clothing items as one neat stack",
    "home-tissues": "TWO tissue packs side by side",
    "home-floor-cleaners": "TWO floor cleaner bottles side by side",
    "home-bathroom-cleaners": "TWO bathroom cleaner bottles side by side",
    "home-kitchen-cleaners": "TWO kitchen cleaner bottles side by side",
    "home-laundry": "ONE detergent bottle and ONE softener side by side",
    "electronics-small-appliances": "ONE small kitchen appliance filling the frame",
    "electronics-phone-accessories": "phone case and charger as one neat set",
    "electronics-car-accessories": "TWO car accessory items side by side",
    "electronics-batteries": "TWO battery packs side by side",
    "electronics-mobiles": "ONE smartphone filling the frame",
    "electronics-smartwatches": "ONE smartwatch filling the frame",
    "electronics-headphones": "ONE headphones product filling the frame",
    "electronics-chargers": "TWO chargers/cables packs side by side",
    "electronics-cables": "TWO cable packs side by side",
    "electronics-car-fresheners": "TWO car freshener packs side by side",
    "electronics-car-cleaners": "TWO car cleaner bottles side by side",
    "baby-diapers": "ONE diaper pack filling the frame",
    "baby-baby-wipes": "TWO baby wipes packs side by side",
    "pets-pet-accessories": "pet bowl and toy as one neat set",
    "pets-cat-litter": "ONE cat litter bag filling the frame",
    "pets-cat-food": "TWO cat food packs/cans side by side",
    "toys-kids-toys": "TWO kids toys side by side",
    "toys-electronic-toys": "ONE electronic toy filling the frame",
    "toys-educational-toys": "educational toys as one neat set",
    "stationery-notebooks": "TWO notebooks side by side",
    "stationery-office-supplies": "office supplies as one neat set",
    "stationery-pens": "pens set filling the frame",
    "stationery-school-supplies": "school supplies kit as one neat set",
    "plastics-section": "plastic household items as one neat set",
    "charcoal-gas": "ONE charcoal bag and a small gas canister side by side",
    "cooking-tools": "cooking tools as one neat set",
    "summer-resort-goods": "summer beach/resort goods as one neat set",
    "cheese-pickles-weighed": "cheese and pickles weighed deli items as one neat still-life, NO plate clutter",
    "roastery-weighed": "roasted nuts/coffee weighed goods as one generous pile, NO bowl",
}


def parse_sections() -> dict[str, str]:
    text = STORE.read_text(encoding="utf-8")
    out: dict[str, str] = {}
    for m in re.finditer(
        r'\{ id: "(?P<id>[^"]+)", name: "(?P<name>[^"]+)", nameEn: "(?P<en>[^"]+)", icon: "[^"]+", image: "[^"]+", color: "[^"]+", section: "(?P<section>[^"]+)" \}',
        text,
    ):
        out[m.group("id")] = m.group("section")
    return out


def main():
    items = json.loads(MANIFEST.read_text(encoding="utf-8-sig"))
    sections = parse_sections()
    rows = []
    for it in items:
        slug = it["slug"]
        name = it["name"]
        section = sections.get(slug, "daily")
        glow = GLOW.get(section, "soft light grey-blue glow")
        subject = SUBJECTS.get(
            slug,
            f"ONE clear representative grocery product for category '{name}', filling lower half generously",
        )
        prompt = (
            f"Square supermarket category card UI, 1:1, clean modern grocery app like Ninja/Carrefour/Lulu. "
            f"Soft off-white background. Top center ONLY Arabic title \"{name}\" in bold black modern sans-serif — "
            f"absolutely NO orange line, NO underline, NO colored bar under the text. "
            f"Bottom ~15-20%: professional soft feathered {glow} semi-circular wash blending upward "
            f"(same treatment as premium supermarket category tiles). "
            f"Hero: {subject}. Soft realistic contact shadows only. "
            f"Products fill the lower area generously like a hero shot. "
            f"NO decorative shapes besides the soft bottom glow, NO frames, NO strong shadows, "
            f"NO random multi-product collage clutter, NO busy background. High resolution studio product photo."
        )
        rows.append(
            {
                "slug": slug,
                "name": name,
                "section": section,
                "glow": glow,
                "subject": subject,
                "prompt": prompt,
            }
        )
    OUT.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {OUT} count={len(rows)}")


if __name__ == "__main__":
    main()
