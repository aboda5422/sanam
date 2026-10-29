import { CATALOG_BRANCH_PRODUCT_SELECT, CATALOG_BRANCH_VIEW } from "@/lib/catalog";
import { toLegacyProduct, type Product } from "@/types/product";
import { supabase } from "@/integrations/supabase/client";
import type { Product as LegacyProduct } from "@/data/store-data";

export type RemappableCartItem = {
  product: Pick<LegacyProduct, "id" | "name" | "price"> & Partial<LegacyProduct>;
  quantity: number;
};

export type CartRemapNotice = {
  unavailable: { name: string; quantity: number }[];
  priceChanged: { name: string; oldPrice: number; newPrice: number; quantity: number }[];
  qtyReduced: { name: string; from: number; to: number }[];
};

export type CartRemapResult = {
  items: { product: LegacyProduct; quantity: number }[];
  notices: CartRemapNotice;
};

type CatalogBranchRow = Product & {
  catalog_id?: string | null;
  legacy_product_id?: string | null;
};

const PRICE_EPS = 0.009;

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

/** Move cart lines to another branch via shared catalog ids; drop/adjust missing or priced differently. */
export async function remapCartItemsToBranch(
  items: RemappableCartItem[],
  newBranchId: string,
): Promise<CartRemapResult> {
  const notices: CartRemapNotice = { unavailable: [], priceChanged: [], qtyReduced: [] };
  if (!items.length || !newBranchId) {
    return { items: [], notices };
  }

  const oldIds = [...new Set(items.map((i) => i.product.id).filter(Boolean))];

  const { data: maps, error: mapErr } = await supabase
    .from("product_id_map" as any)
    .select("legacy_product_id, canonical_product_id")
    .in("legacy_product_id", oldIds);
  if (mapErr) throw mapErr;

  const oldToCatalog = new Map<string, string>();
  for (const row of (maps || []) as { legacy_product_id: string; canonical_product_id: string }[]) {
    oldToCatalog.set(row.legacy_product_id, row.canonical_product_id);
  }
  for (const id of oldIds) {
    if (!oldToCatalog.has(id)) oldToCatalog.set(id, id);
  }

  const catalogIds = [...new Set([...oldToCatalog.values()])];
  const { data: rows, error: rowsErr } = await supabase
    .from(CATALOG_BRANCH_VIEW as any)
    .select(CATALOG_BRANCH_PRODUCT_SELECT)
    .eq("branch_id", newBranchId)
    .in("catalog_id", catalogIds);
  if (rowsErr) throw rowsErr;

  const byCatalog = new Map<string, CatalogBranchRow>();
  for (const row of (rows || []) as CatalogBranchRow[]) {
    const key = String(row.catalog_id || "");
    if (key) byCatalog.set(key, row);
  }

  const next: CartItem[] = [];
  for (const line of items) {
    const catalogId = oldToCatalog.get(line.product.id) || line.product.id;
    const match = byCatalog.get(catalogId);
    const name = line.product.name || "صنف";

    if (!match || match.is_active === false) {
      notices.unavailable.push({ name, quantity: line.quantity });
      continue;
    }

    const stock = match.stock_quantity;
    let qty = line.quantity;
    if (typeof stock === "number" && stock <= 0) {
      notices.unavailable.push({ name: match.name || name, quantity: line.quantity });
      continue;
    }
    if (typeof stock === "number" && stock < qty) {
      notices.qtyReduced.push({ name: match.name || name, from: qty, to: stock });
      qty = stock;
    }
    if (qty <= 0) {
      notices.unavailable.push({ name: match.name || name, quantity: line.quantity });
      continue;
    }

    const newPrice = roundMoney(Number(match.price) || 0);
    const oldPrice = roundMoney(Number(line.product.price) || 0);
    if (Math.abs(newPrice - oldPrice) > PRICE_EPS) {
      notices.priceChanged.push({
        name: match.name || name,
        oldPrice,
        newPrice,
        quantity: qty,
      });
    }

    next.push({
      product: toLegacyProduct(match) as LegacyProduct,
      quantity: qty,
    });
  }

  return { items: next, notices };
}

export function summarizeCartRemapNotices(notices: CartRemapNotice): string[] {
  const lines: string[] = [];
  if (notices.unavailable.length) {
    const names = notices.unavailable
      .slice(0, 3)
      .map((u) => u.name)
      .join("، ");
    const more = notices.unavailable.length > 3 ? ` و${notices.unavailable.length - 3} أخرى` : "";
    lines.push(`غير متوفر في الفرع الجديد: ${names}${more}`);
  }
  if (notices.priceChanged.length) {
    const sample = notices.priceChanged
      .slice(0, 2)
      .map((p) => `${p.name} (${p.oldPrice.toFixed(2)} → ${p.newPrice.toFixed(2)} ر.س)`)
      .join("؛ ");
    const more = notices.priceChanged.length > 2 ? ` و${notices.priceChanged.length - 2} أخرى` : "";
    lines.push(`تغير السعر: ${sample}${more}`);
  }
  if (notices.qtyReduced.length) {
    const sample = notices.qtyReduced
      .slice(0, 2)
      .map((q) => `${q.name} (${q.from} → ${q.to})`)
      .join("؛ ");
    const more = notices.qtyReduced.length > 2 ? ` و${notices.qtyReduced.length - 2} أخرى` : "";
    lines.push(`تم تقليل الكمية لتوفر المخزون: ${sample}${more}`);
  }
  return lines;
}
