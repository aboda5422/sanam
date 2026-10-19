/** Phase 2 unified catalog helpers (shared product + per-branch overlay). */

export const CATALOG_BRANCH_PRODUCT_SELECT =
  "id, catalog_id, legacy_product_id, name, name_en, price, original_price, image, category_id, unit, description, is_active, is_featured, sort_order, barcode, brand, origin_country, size_label, product_form, gallery_urls, extra_label, stock_quantity, cost_price, branch_id, external_id, offer_channel, alt_unit, alt_barcode, alt_image, units_per_pack, alt_price, alt_original_price, offer_unit, created_at";

export const CATALOG_BRANCH_VIEW = "catalog_branch_products" as const;
