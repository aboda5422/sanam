/** Where a product discount offer is visible / charged. */
export type OfferChannel = "app" | "cashier" | "both";

export type OfferPriced = {
  price: number;
  original_price?: number | null;
  offer_channel?: string | null;
};

export function hasOfferPrice(p: OfferPriced): boolean {
  return (
    p.original_price != null &&
    Number(p.original_price) > Number(p.price)
  );
}

/** True when this channel should show the discounted price / badge. */
export function offerAppliesToChannel(
  p: OfferPriced,
  channel: OfferChannel | "app" | "cashier",
): boolean {
  if (!hasOfferPrice(p)) return false;
  const ch = (p.offer_channel || "both") as OfferChannel;
  if (ch === "both") return true;
  return ch === channel;
}

/**
 * Price the customer/cashier pays on this channel.
 * If an offer exists but is for the other channel, charge the list (original) price.
 */
export function effectiveSellPrice(
  p: OfferPriced,
  channel: "app" | "cashier",
): number {
  if (offerAppliesToChannel(p, channel)) return Number(p.price) || 0;
  if (hasOfferPrice(p)) return Number(p.original_price) || 0;
  return Number(p.price) || 0;
}

/** List / strike-through price when offer applies on this channel; else undefined. */
export function effectiveListPrice(
  p: OfferPriced,
  channel: "app" | "cashier",
): number | undefined {
  if (!offerAppliesToChannel(p, channel)) return undefined;
  return Number(p.original_price!) || undefined;
}

/** Rewrite the primary-unit price for storefront display. Piece offers stay on alt_price. */
export function forAppChannelPrices<T extends OfferPriced>(p: T): T {
  const offerUnit = (p as { offer_unit?: string | null }).offer_unit;
  const primary: OfferPriced =
    offerUnit === "alt"
      ? { ...p, original_price: null }
      : p;
  const sell = effectiveSellPrice(primary, "app");
  const list = effectiveListPrice(primary, "app");
  return {
    ...p,
    price: sell,
    original_price: list ?? null,
  };
}

export function forAppProductPrices<T extends OfferPriced>(list: T[]): T[] {
  return list.map(forAppChannelPrices);
}
