import { effectiveListPrice, effectiveSellPrice, type OfferChannel } from "@/lib/offer-channel";

/** Which physical unit is being sold or stocked. */
export type SellUnit = "primary" | "alt";

/** Where a discount lands when a product has two units. */
export type OfferUnitTarget = "primary" | "alt" | "both";

export type DualUnitFields = {
  price: number;
  original_price?: number | null;
  offer_channel?: string | null;
  offer_unit?: string | null;
  unit?: string | null;
  alt_unit?: string | null;
  alt_price?: number | null;
  alt_original_price?: number | null;
  alt_barcode?: string | null;
  alt_image?: string | null;
  units_per_pack?: number | null;
  barcode?: string | null;
  stock_quantity?: number | null;
};

export function hasDualUnit(p: {
  units_per_pack?: number | null;
  alt_unit?: string | null;
}): boolean {
  return Number(p.units_per_pack) > 1 && Boolean(String(p.alt_unit || "").trim());
}

/** Pieces removed from shared stock for this sale line. */
export function baseQtyForSale(
  unitsPerPack: number | null | undefined,
  sellUnit: SellUnit,
  qty: number,
): number {
  const pack = Number(unitsPerPack) || 0;
  const q = Number(qty) || 0;
  if (sellUnit === "primary" && pack > 1) return q * pack;
  return q;
}

export function splitBaseStock(stock: number, pack: number): { cartons: number; pieces: number } {
  const p = Math.max(2, Math.floor(Number(pack) || 0));
  const s = Math.max(0, Math.floor(Number(stock) || 0));
  return { cartons: Math.floor(s / p), pieces: s % p };
}

export function composeBaseStock(cartons: number, pieces: number, pack: number): number {
  const p = Math.max(2, Math.floor(Number(pack) || 0));
  return Math.max(0, Math.floor(Number(cartons) || 0)) * p + Math.max(0, Math.floor(Number(pieces) || 0));
}

/** Carton stock is in whole packs; piece stock is already loose pieces. */
export function mergeUnitStock(primaryStock: number, altStock: number, pack: number): number {
  return composeBaseStock(primaryStock, altStock, pack);
}

export function formatDualStock(
  stock: number,
  pack: number | null | undefined,
  primaryUnit: string,
  altUnit: string,
): string {
  if (!pack || pack <= 1) return String(Math.max(0, Math.floor(Number(stock) || 0)));
  const { cartons, pieces } = splitBaseStock(stock, pack);
  if (pieces === 0) return `${cartons} ${primaryUnit}`;
  return `${cartons} ${primaryUnit} و ${pieces} ${altUnit}`;
}

export function offerAppliesToUnit(
  offerUnit: string | null | undefined,
  sellUnit: SellUnit,
): boolean {
  const u = offerUnit || "primary";
  if (u === "both") return true;
  if (sellUnit === "alt") return u === "alt";
  return u === "primary";
}

export function unitPricePair(p: DualUnitFields, sellUnit: SellUnit) {
  const on = offerAppliesToUnit(p.offer_unit, sellUnit);
  if (sellUnit === "alt") {
    return {
      price: Number(p.alt_price) || 0,
      original_price: on ? (p.alt_original_price ?? null) : null,
      offer_channel: p.offer_channel ?? null,
    };
  }
  return {
    price: Number(p.price) || 0,
    original_price: on ? (p.original_price ?? null) : null,
    offer_channel: p.offer_channel ?? null,
  };
}

export function unitSellPrice(p: DualUnitFields, sellUnit: SellUnit, channel: "app" | "cashier"): number {
  return effectiveSellPrice(unitPricePair(p, sellUnit), channel);
}

export function unitListPrice(
  p: DualUnitFields,
  sellUnit: SellUnit,
  channel: "app" | "cashier",
): number | undefined {
  return effectiveListPrice(unitPricePair(p, sellUnit), channel);
}

function discountPrice(list: number, percent: number): number {
  return +((Number(list) || 0) * (1 - percent / 100)).toFixed(2);
}

/**
 * Price patch for an offer.
 * Single-unit products always discount the main price.
 * Dual-unit products discount only the chosen unit, and keep an existing offer on the other unit.
 */
export function applyUnitDiscount<T extends DualUnitFields>(
  p: T,
  discountPercent: number,
  channel: OfferChannel,
  target: OfferUnitTarget,
): {
  price?: number;
  original_price?: number | null;
  alt_price?: number | null;
  alt_original_price?: number | null;
  offer_channel: OfferChannel;
  offer_unit: OfferUnitTarget | null;
} {
  const dual = hasDualUnit(p);
  const chosen: OfferUnitTarget = dual ? target : "primary";
  const patch: {
    price?: number;
    original_price?: number | null;
    alt_price?: number | null;
    alt_original_price?: number | null;
    offer_channel: OfferChannel;
    offer_unit: OfferUnitTarget | null;
  } = {
    offer_channel: channel,
    offer_unit: dual ? chosen : null,
  };

  const touchPrimary = !dual || chosen === "primary" || chosen === "both";
  const touchAlt = dual && (chosen === "alt" || chosen === "both");

  if (touchPrimary) {
    const list = p.original_price != null && Number(p.original_price) > Number(p.price)
      ? Number(p.original_price)
      : Number(p.price);
    patch.original_price = list;
    patch.price = discountPrice(list, discountPercent);
  }

  if (touchAlt) {
    const list = p.alt_original_price != null && Number(p.alt_original_price) > Number(p.alt_price)
      ? Number(p.alt_original_price)
      : Number(p.alt_price);
    patch.alt_original_price = list;
    patch.alt_price = discountPrice(list, discountPercent);
  }

  if (dual && chosen === "primary" && p.alt_original_price != null && Number(p.alt_original_price) > Number(p.alt_price)) {
    patch.offer_unit = "both";
  }
  if (dual && chosen === "alt" && p.original_price != null && Number(p.original_price) > Number(p.price)) {
    patch.offer_unit = "both";
  }

  return patch;
}

export function clearUnitOffer(p: DualUnitFields): {
  price?: number;
  original_price: number | null;
  alt_price?: number | null;
  alt_original_price: number | null;
  offer_channel: null;
  offer_unit: null;
} {
  const unit = p.offer_unit || "primary";
  const patch: {
    price?: number;
    original_price: number | null;
    alt_price?: number | null;
    alt_original_price: number | null;
    offer_channel: null;
    offer_unit: null;
  } = {
    original_price: p.original_price ?? null,
    alt_original_price: p.alt_original_price ?? null,
    offer_channel: null,
    offer_unit: null,
  };

  if ((unit === "primary" || unit === "both") && p.original_price != null) {
    patch.price = Number(p.original_price);
    patch.original_price = null;
  }
  if ((unit === "alt" || unit === "both") && p.alt_original_price != null) {
    patch.alt_price = Number(p.alt_original_price);
    patch.alt_original_price = null;
  }
  return patch;
}
