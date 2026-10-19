import { useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Loader2,
  Plus,
  Minus,
  Trash2,
  Search,
  Banknote,
  CreditCard,
  Printer,
  ShoppingCart,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { CashierSession } from "@/hooks/useCashierAuth";
import {
  cartTotals,
  formatPosError,
  posLineKey,
  type PosCartLine,
} from "@/lib/pos";
import { printReceipt, receiptBridgePayload } from "@/lib/pos-receipt";
import { BRAND } from "@/lib/brand";
import {
  baseQtyForSale,
  formatDualStock,
  hasDualUnit,
  unitListPrice,
  unitSellPrice,
  type SellUnit,
} from "@/lib/product-units";

/** The unit whose barcode was scanned is the one that gets sold. */
function sellUnitForScan(
  row: { barcode?: string | null; alt_barcode?: string | null; units_per_pack?: number | null; alt_unit?: string | null },
  code: string,
): SellUnit {
  const trimmed = code.trim();
  if (!trimmed || !hasDualUnit(row)) return "primary";
  if (row.alt_barcode && String(row.alt_barcode) === trimmed) return "alt";
  return "primary";
}

/** Why this product's cart lines cannot take more stock, or null when they fit. */
function stockShortage(
  lines: PosCartLine[],
  productId: string,
  extra?: { key: string; add: number },
): string | null {
  const group = lines.filter((l) => l.product_id === productId);
  if (!group.length) return null;
  const pack = group[0].units_per_pack;
  if (!(Number(pack) > 1)) return null;
  const stock = Number(group[0].stock_quantity) || 0;
  const used = group.reduce((sum, l) => {
    const qty = extra && posLineKey(l) === extra.key ? l.quantity + extra.add : l.quantity;
    return sum + baseQtyForSale(pack, l.sell_unit || "primary", qty);
  }, 0);
  if (used <= stock) return null;
  const primary = group[0].unit;
  const alt = group[0].alt_unit;
  const avail = primary && alt ? formatDualStock(stock, pack, primary, alt) : String(stock);
  const name = group[0].name.replace(/\s*\([^)]*\)\s*$/, "");
  return `المخزون غير كافٍ للمنتج ${name}: المطلوب ${used} والمتاح ${avail}`;
}

type Ctx = { session: CashierSession };

type OpenShift = {
  id: string;
  branch_id: string;
  station_id: string;
  station_name?: string;
  branch_name?: string;
};

type PayMethod = "cash" | "card" | "mixed";

type PersistedCart = {
  cart: PosCartLine[];
  discount: number;
  payMethod: PayMethod;
  cashReceived: string;
};

function cartStorageKey(userId: string, shiftId: string) {
  return `sanam-pos-cart:${userId}:${shiftId}`;
}

function parsePayMethod(v: unknown): PayMethod {
  if (v === "card" || v === "mixed") return v;
  return "cash";
}

function loadPersistedCart(userId: string, shiftId: string): PersistedCart | null {
  try {
    const raw = localStorage.getItem(cartStorageKey(userId, shiftId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedCart;
    if (!Array.isArray(parsed?.cart)) return null;
    return {
      cart: parsed.cart.map((line) => ({ ...line, sell_unit: line.sell_unit || "primary" })),
      discount: Number(parsed.discount) || 0,
      payMethod: parsePayMethod(parsed.payMethod),
      cashReceived: typeof parsed.cashReceived === "string" ? parsed.cashReceived : "",
    };
  } catch {
    return null;
  }
}

function savePersistedCart(userId: string, shiftId: string, data: PersistedCart) {
  try {
    localStorage.setItem(cartStorageKey(userId, shiftId), JSON.stringify(data));
  } catch {
    /* ignore quota */
  }
}

function clearPersistedCart(userId: string, shiftId: string) {
  try {
    localStorage.removeItem(cartStorageKey(userId, shiftId));
  } catch {
    /* ignore */
  }
}

const CashierSellPage = () => {
  const { session } = useOutletContext<Ctx>();
  const scanRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<PosCartLine[]>([]);
  const [discount, setDiscount] = useState(0);
  const [payMethod, setPayMethod] = useState<PayMethod>("cash");
  const [cashReceived, setCashReceived] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastInvoice, setLastInvoice] = useState<string | null>(null);
  const [cartHydrated, setCartHydrated] = useState(false);

  const { data: openShift, isLoading: shiftLoading, refetch: refetchShift } = useQuery({
    queryKey: ["pos-open-shift", session.userId],
    queryFn: async (): Promise<OpenShift | null> => {
      const { data, error } = await supabase
        .from("pos_shifts")
        .select("id, branch_id, station_id, status")
        .eq("cashier_id", session.userId)
        .eq("status", "open")
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;

      const [{ data: station }, { data: branch }] = await Promise.all([
        supabase.from("pos_stations").select("name").eq("id", data.station_id).maybeSingle(),
        supabase.from("branches").select("name").eq("id", data.branch_id).maybeSingle(),
      ]);

      return {
        id: data.id,
        branch_id: data.branch_id,
        station_id: data.station_id,
        station_name: station?.name,
        branch_name: branch?.name,
      };
    },
  });

  const branchId = openShift?.branch_id;

  const { data: products = [], isFetching } = useQuery({
    queryKey: ["pos-products", branchId, query],
    enabled: !!branchId,
    queryFn: async () => {
      let q = supabase
        .from("catalog_branch_products" as "products")
        .select("id, name, barcode, price, original_price, offer_channel, offer_unit, stock_quantity, image, unit, alt_unit, alt_barcode, alt_price, alt_original_price, units_per_pack")
        .eq("branch_id", branchId!)
        .eq("is_active", true)
        .order("name")
        .limit(40);
      const term = query.trim();
      if (term) {
        q = q.or(`name.ilike.%${term}%,barcode.eq.${term},alt_barcode.eq.${term}`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  useEffect(() => {
    scanRef.current?.focus();
  }, [openShift?.id]);

  // Restore basket for this open shift (survives navigation / resize remounts)
  useEffect(() => {
    if (!openShift?.id) {
      setCartHydrated(false);
      return;
    }
    const saved = loadPersistedCart(session.userId, openShift.id);
    if (saved) {
      setCart(saved.cart);
      setDiscount(saved.discount);
      setPayMethod(saved.payMethod);
      setCashReceived(saved.cashReceived);
    } else {
      setCart([]);
      setDiscount(0);
      setPayMethod("cash");
      setCashReceived("");
    }
    setCartHydrated(true);
  }, [openShift?.id, session.userId]);

  useEffect(() => {
    if (!openShift?.id || !cartHydrated) return;
    if (cart.length === 0 && discount === 0 && !cashReceived) {
      clearPersistedCart(session.userId, openShift.id);
      return;
    }
    savePersistedCart(session.userId, openShift.id, {
      cart,
      discount,
      payMethod,
      cashReceived,
    });
  }, [cart, discount, payMethod, cashReceived, openShift?.id, session.userId, cartHydrated]);

  const clearCart = () => {
    setCart([]);
    setDiscount(0);
    setCashReceived("");
    setPayMethod("cash");
    if (openShift?.id) clearPersistedCart(session.userId, openShift.id);
  };

  const totals = useMemo(
    () =>
      cartTotals(
        cart,
        discount,
        session.features.tax_rate,
        session.features.prices_include_tax,
      ),
    [cart, discount, session.features],
  );

  const addProduct = (p: any, sellUnit: SellUnit = "primary") => {
    const unitPrice = unitSellPrice(p, sellUnit, "cashier");
    const label = sellUnit === "alt" ? (p.alt_unit || "حبة") : (p.unit || "");
    const barcode = sellUnit === "alt" ? (p.alt_barcode || p.barcode) : p.barcode;
    const key = posLineKey({ product_id: p.id, sell_unit: sellUnit });
    setCart((prev) => {
      const used = prev
        .filter((l) => l.product_id === p.id)
        .reduce((sum, l) => sum + baseQtyForSale(l.units_per_pack, l.sell_unit || "primary", l.quantity), 0);
      const nextBase = used + baseQtyForSale(p.units_per_pack, sellUnit, 1);
      const stock = Number(p.stock_quantity) || 0;
      if (hasDualUnit(p) && nextBase > stock) {
        toast.error(
          `المخزون غير كافٍ للمنتج ${p.name}: المتاح ${formatDualStock(stock, p.units_per_pack, p.unit || "الأولى", p.alt_unit || "الثانية")}`,
        );
        return prev;
      }
      const existing = prev.find((l) => posLineKey(l) === key);
      if (existing) {
        return prev.map((l) => (posLineKey(l) === key ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [
        ...prev,
        {
          product_id: p.id,
          sell_unit: sellUnit,
          unit_label: label,
          unit: p.unit ?? null,
          alt_unit: p.alt_unit ?? null,
          units_per_pack: p.units_per_pack ?? null,
          name: label ? `${p.name} (${label})` : p.name,
          barcode,
          unit_price: unitPrice,
          quantity: 1,
          discount: 0,
          stock_quantity: stock,
        },
      ];
    });
    setQuery("");
    scanRef.current?.focus();
  };

  const onScanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = query.trim();
    if (!code || !branchId) return;
    const { data } = await supabase
      .from("catalog_branch_products" as "products")
      .select("id, name, barcode, price, original_price, offer_channel, offer_unit, stock_quantity, unit, alt_unit, alt_barcode, alt_price, alt_original_price, units_per_pack")
      .eq("branch_id", branchId)
      .eq("is_active", true)
      .or(`barcode.eq.${code},alt_barcode.eq.${code}`)
      .limit(2);
    const rows = data || [];
    const hit =
      rows.find((p: any) => p.alt_barcode && String(p.alt_barcode) === code) ||
      rows.find((p: any) => p.barcode && String(p.barcode) === code);
    if (hit) {
      addProduct(hit, sellUnitForScan(hit, code));
      return;
    }
    if (products.length === 1) addProduct(products[0], sellUnitForScan(products[0], code));
    else toast.message("لم يُعثر على باركود مطابق — اختر من القائمة");
  };

  const checkout = async () => {
    if (!openShift) {
      toast.error("افتح وردية أولاً من تبويب الوردية");
      return;
    }
    if (!cart.length) {
      toast.error("السلة فارغة");
      return;
    }
    for (const productId of new Set(cart.map((l) => l.product_id))) {
      const shortage = stockShortage(cart, productId);
      if (shortage) {
        toast.error(shortage);
        return;
      }
    }
    let payments: { method: "cash" | "card"; amount: number }[];

    if (payMethod === "cash") {
      const received = Number(cashReceived || totals.total);
      if (received < totals.total) {
        toast.error("المبلغ المستلم أقل من الإجمالي");
        return;
      }
      payments = [{ method: "cash", amount: received }];
    } else if (payMethod === "card") {
      payments = [{ method: "card", amount: totals.total }];
    } else {
      const cashAmt = Number(cashReceived || 0);
      const cardAmt = Math.round((totals.total - cashAmt) * 100) / 100;
      if (!(cashAmt > 0) || !(cardAmt > 0)) {
        toast.error("حدد مبلغاً نقدياً أقل من الإجمالي لتغطية الباقي بالشبكة");
        return;
      }
      payments = [
        { method: "cash", amount: cashAmt },
        { method: "card", amount: cardAmt },
      ];
    }

    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("pos_create_sale" as any, {
        p_shift_id: openShift.id,
        p_items: cart.map((l) => ({
          product_id: l.product_id,
          quantity: l.quantity,
          unit_price: l.unit_price,
          discount: l.discount,
          sell_unit: l.sell_unit || "primary",
        })),
        p_payments: payments,
        p_discount_total: discount,
        p_coupon_code: null,
      });
      if (error) throw error;

      const result = data as {
        sale_id: string;
        invoice_number: string;
        total: number;
        subtotal: number;
        tax_total: number;
        discount_total: number;
        change: number;
      };

      setLastInvoice(result.invoice_number);
      const receipt = {
        storeName: BRAND.fullNameAr,
        branchName: openShift.branch_name || "",
        stationName: openShift.station_name || "",
        invoiceNumber: result.invoice_number,
        cashierName: session.fullName,
        createdAt: new Date().toLocaleString("ar-SA"),
        lines: cart.map((l) => ({
          name: l.name,
          qty: l.quantity,
          price: l.unit_price,
          total: l.unit_price * l.quantity - l.discount,
        })),
        subtotal: result.subtotal,
        taxTotal: result.tax_total,
        discountTotal: result.discount_total,
        total: result.total,
        payments,
        change: result.change,
        footer: session.features.receipt_footer,
        taxRate: session.features.tax_rate,
        crNumber: BRAND.crNumber,
      };

      printReceipt(receipt);
      // Expose bridge payload for local thermal agent
      (window as any).__sanamLastReceipt = receiptBridgePayload(receipt);

      toast.success(`تم البيع · ${result.invoice_number}`);
      clearCart();
      refetchShift();
      scanRef.current?.focus();
    } catch (err: any) {
      toast.error(formatPosError(err, "فشل إتمام البيع"));
    } finally {
      setBusy(false);
    }
  };

  if (shiftLoading) {
    return (
      <div className="p-10 flex justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!openShift) {
    return (
      <div className="max-w-lg mx-auto p-8 text-center space-y-4">
        <ShoppingCart className="h-12 w-12 mx-auto text-muted-foreground" />
        <h1 className="text-xl font-bold">لا توجد وردية مفتوحة</h1>
        <p className="text-muted-foreground text-sm">
          افتح وردية من تبويب «الوردية» واختر المحطة ومبلغ الافتتاح النقدي قبل بدء البيع.
        </p>
        <Button asChild>
          <a href="/cashier/shift">فتح الوردية</a>
        </Button>
      </div>
    );
  }

  return (
    <div className="grid lg:grid-cols-[1.2fr_0.8fr] gap-0 min-h-[calc(100vh-64px)]">
      {/* Catalog / scan */}
      <section className="p-4 border-l bg-white">
        <div className="flex items-center justify-between gap-2 mb-3 text-sm text-muted-foreground">
          <span>
            {openShift.branch_name} · {openShift.station_name}
          </span>
          {lastInvoice && <span className="text-xs">آخر فاتورة: {lastInvoice}</span>}
        </div>
        <form onSubmit={onScanSubmit} className="relative mb-4">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={scanRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="امسح الباركود أو ابحث بالاسم..."
            className="pr-10 h-12 text-base"
            dir="rtl"
            autoFocus
          />
        </form>
        {isFetching && (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2 max-h-[70vh] overflow-y-auto">
          {products.map((p) => {
            const row = p as any;
            const dual = hasDualUnit(row);
            const preferred = sellUnitForScan(row, query);
            const preferredLabel = preferred === "alt" ? (row.alt_unit || "حبة") : (row.unit || "");
            const sell = unitSellPrice(row, preferred, "cashier");
            const list = unitListPrice(row, preferred, "cashier");
            const other: SellUnit | null = dual ? (preferred === "primary" ? "alt" : "primary") : null;
            const otherLabel = other === "alt" ? (row.alt_unit || "حبة") : other === "primary" ? (row.unit || "") : "";
            const otherSell = other ? unitSellPrice(row, other, "cashier") : null;
            const otherList = other ? unitListPrice(row, other, "cashier") : undefined;
            const stockLabel = dual
              ? formatDualStock(Number(row.stock_quantity) || 0, Number(row.units_per_pack), row.unit || "كرتون", row.alt_unit || "حبة")
              : String(row.stock_quantity ?? 0);
            return (
            <div
              key={p.id}
              className="text-right rounded-xl border p-3 hover:border-primary hover:shadow-sm transition bg-[#fafbfa]"
            >
              <button type="button" className="w-full text-right" onClick={() => addProduct(row, preferred)}>
                <p className="font-medium text-sm line-clamp-2 min-h-[2.5rem]">{p.name}</p>
                <p className="text-primary font-bold mt-2" dir="ltr">
                  {sell.toFixed(2)} ر.س
                  {dual ? <span className="text-[11px] font-normal text-muted-foreground"> / {preferredLabel}</span> : null}
                </p>
                {list != null && list > sell && (
                  <p className="text-[11px] text-muted-foreground line-through" dir="ltr">
                    {list.toFixed(2)}
                  </p>
                )}
              </button>
              {other && otherSell != null && (
                <button
                  type="button"
                  className="mt-1 text-[12px] text-primary underline"
                  onClick={() => addProduct(row, other)}
                >
                  {otherLabel}: {otherSell.toFixed(2)} ر.س
                  {otherList != null && otherList > otherSell ? ` (${otherList.toFixed(2)})` : ""}
                </button>
              )}
              <p className="text-[11px] text-muted-foreground mt-1">
                مخزون: {stockLabel}
              </p>
            </div>
            );
          })}
        </div>
      </section>

      {/* Cart */}
      <section className="p-4 bg-[#14352C] text-white flex flex-col">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="font-bold text-lg flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-[#B4E87A]" />
            سلة البيع
          </h2>
          {cart.length > 0 && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-red-200 hover:text-red-100 hover:bg-white/10 h-8"
              onClick={clearCart}
            >
              إلغاء السلة
            </Button>
          )}
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto max-h-[45vh] mb-4">
          {cart.length === 0 && (
            <p className="text-white/60 text-sm">أضف منتجات بالبحث أو الباركود</p>
          )}
          {cart.map((l) => (
            <div key={posLineKey(l)} className="rounded-xl bg-white/10 p-3">
              <div className="flex justify-between gap-2">
                <p className="text-sm font-medium line-clamp-2">{l.name}</p>
                <button type="button" onClick={() => setCart((c) => c.filter((x) => posLineKey(x) !== posLineKey(l)))}>
                  <Trash2 className="h-4 w-4 text-red-300" />
                </button>
              </div>
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    className="h-8 w-8"
                    onClick={() =>
                      setCart((c) =>
                        c.map((x) =>
                          posLineKey(x) === posLineKey(l)
                            ? { ...x, quantity: Math.max(1, x.quantity - 1) }
                            : x,
                        ),
                      )
                    }
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="w-8 text-center" dir="ltr">
                    {l.quantity}
                  </span>
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    className="h-8 w-8"
                    onClick={() => {
                      const shortage = stockShortage(cart, l.product_id, { key: posLineKey(l), add: 1 });
                      if (shortage) {
                        toast.error(shortage);
                        return;
                      }
                      setCart((c) =>
                        c.map((x) =>
                          posLineKey(x) === posLineKey(l) ? { ...x, quantity: x.quantity + 1 } : x,
                        ),
                      );
                    }}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
                <p className="font-bold" dir="ltr">
                  {(l.unit_price * l.quantity - l.discount).toFixed(2)}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-2 border-t border-white/15 pt-3 text-sm">
          <div className="flex justify-between"><span>قبل الضريبة</span><span dir="ltr">{totals.subtotal.toFixed(2)}</span></div>
          <div className="flex justify-between"><span>الضريبة</span><span dir="ltr">{totals.tax_total.toFixed(2)}</span></div>
          <div className="flex items-center gap-2">
            <Label className="text-white/80 shrink-0">خصم</Label>
            <Input
              type="number"
              value={discount || ""}
              onChange={(e) => setDiscount(Number(e.target.value) || 0)}
              className="bg-white/10 border-white/20 text-white h-9"
              dir="ltr"
            />
          </div>
          <div className="flex justify-between text-lg font-bold text-[#B4E87A]">
            <span>الإجمالي</span>
            <span dir="ltr">{totals.total.toFixed(2)} ر.س</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-3">
          <Button
            type="button"
            variant={payMethod === "cash" ? "secondary" : "ghost"}
            className={payMethod === "cash" ? "" : "text-white hover:bg-white/10"}
            onClick={() => setPayMethod("cash")}
          >
            <Banknote className="h-4 w-4 ml-1" /> نقداً
          </Button>
          <Button
            type="button"
            variant={payMethod === "card" ? "secondary" : "ghost"}
            className={payMethod === "card" ? "" : "text-white hover:bg-white/10"}
            onClick={() => setPayMethod("card")}
          >
            <CreditCard className="h-4 w-4 ml-1" /> شبكة
          </Button>
          <Button
            type="button"
            variant={payMethod === "mixed" ? "secondary" : "ghost"}
            className={`px-1 text-xs sm:text-sm ${payMethod === "mixed" ? "" : "text-white hover:bg-white/10"}`}
            onClick={() => setPayMethod("mixed")}
          >
            <span className="inline-flex items-center">
              <Banknote className="h-3.5 w-3.5 ml-0.5" />
              <CreditCard className="h-3.5 w-3.5 ml-1" />
            </span>
            نقد وشبكة معاً
          </Button>
        </div>
        {payMethod === "cash" && (
          <Input
            type="number"
            placeholder="المبلغ المستلم"
            value={cashReceived}
            onChange={(e) => setCashReceived(e.target.value)}
            className="mt-2 bg-white/10 border-white/20 text-white"
            dir="ltr"
          />
        )}
        {payMethod === "mixed" && (
          <div className="mt-2 space-y-2">
            <Input
              type="number"
              placeholder="المبلغ النقدي"
              value={cashReceived}
              onChange={(e) => setCashReceived(e.target.value)}
              className="bg-white/10 border-white/20 text-white"
              dir="ltr"
            />
            <div className="flex justify-between text-sm text-white/80 px-1">
              <span>الشبكة</span>
              <span dir="ltr">
                {Math.max(0, Math.round((totals.total - Number(cashReceived || 0)) * 100) / 100).toFixed(2)} ر.س
              </span>
            </div>
          </div>
        )}

        <Button
          className="mt-4 h-12 text-base bg-[#B4E87A] text-[#14352C] hover:bg-[#c8f09a]"
          disabled={busy || !cart.length}
          onClick={checkout}
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin ml-2" /> : <Printer className="h-5 w-5 ml-2" />}
          إتمام البيع وطباعة الإيصال
        </Button>
      </section>
    </div>
  );
};

export default CashierSellPage;
