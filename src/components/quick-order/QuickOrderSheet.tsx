import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Sparkles, Plus, Minus, Trash2, ShoppingCart, X, Loader2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/contexts/CartContext";
import { toLegacyProduct } from "@/types/product";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface QuickOrderSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ProductMatch {
  id: string;
  name: string;
  name_en: string | null;
  price: number;
  image: string | null;
  unit: string;
  category_id: string | null;
  is_active: boolean;
}

interface NoteItem {
  product: ProductMatch;
  qty: number;
}

const QuickOrderSheet = ({ open, onOpenChange }: QuickOrderSheetProps) => {
  const { t, lang } = useLanguage();
  const { addItem } = useCart();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState<NoteItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [open]);

  // Live AI search with debounce
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim() || query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const { data, error } = await supabase.functions.invoke("ai-quick-order", {
          body: { query: query.trim() },
        });
        if (error) throw error;
        setResults(data?.matches || []);
      } catch (e) {
        console.error(e);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const addToNote = (p: ProductMatch) => {
    setNote((prev) => {
      const existing = prev.find((n) => n.product.id === p.id);
      if (existing) {
        return prev.map((n) => (n.product.id === p.id ? { ...n, qty: n.qty + 1 } : n));
      }
      return [...prev, { product: p, qty: 1 }];
    });
    setQuery("");
    setResults([]);
    inputRef.current?.focus();
  };

  const updateQty = (id: string, delta: number) => {
    setNote((prev) =>
      prev
        .map((n) => (n.product.id === id ? { ...n, qty: n.qty + delta } : n))
        .filter((n) => n.qty > 0)
    );
  };

  const removeItem = (id: string) => {
    setNote((prev) => prev.filter((n) => n.product.id !== id));
  };

  const transferToCart = () => {
    if (note.length === 0) return;
    note.forEach((n) => {
      addItem(toLegacyProduct(n.product as any) as any, n.qty);
    });
    toast.success(t("تم نقل الطلب إلى السلة", "Transferred to cart"));
    setNote([]);
    onOpenChange(false);
    navigate("/cart");
  };

  const totalItems = note.reduce((s, n) => s + n.qty, 0);
  const totalPrice = note.reduce((s, n) => s + n.product.price * n.qty, 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[92vh] p-0 rounded-t-3xl overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="bg-gradient-to-l from-primary to-primary/80 text-primary-foreground p-4 pt-5 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="bg-white/20 backdrop-blur rounded-full p-2">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-heading font-bold text-lg leading-tight">
                  {t("الطلب السريع AI", "Quick Order AI")}
                </h2>
                <p className="text-xs opacity-90">
                  {t("اكتب اسم المنتج وسيقترح لك الذكاء الاصطناعي", "Type a product, AI suggests it")}
                </p>
              </div>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className="p-2 hover:bg-white/10 rounded-full transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Search input */}
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("مثال: زبادي 170 جرام، خبز، حليب...", "e.g. yogurt 170g, bread...")}
              className="w-full h-12 rounded-2xl bg-white text-foreground border-0 pr-11 pl-4 text-base placeholder:text-muted-foreground/60 focus:outline-none focus:ring-4 focus:ring-white/30"
            />
            {loading && (
              <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-primary animate-spin" />
            )}
          </div>
        </div>

        {/* Body: results + note side-by-side on landscape, stacked on mobile */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Results */}
          <div className="flex-1 overflow-y-auto p-3 bg-muted/30">
            {!query.trim() && note.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Sparkles className="h-12 w-12 mx-auto mb-3 text-primary/40" />
                <p className="text-sm font-medium">
                  {t("ابدأ بكتابة المنتجات التي تريدها", "Start typing products you want")}
                </p>
                <p className="text-xs mt-1">
                  {t("الذكاء الاصطناعي سيقترح أقرب الخيارات حتى لو الحجم مختلف", "AI suggests closest matches even with different sizes")}
                </p>
              </div>
            )}

            {query.trim() && !loading && results.length === 0 && (
              <div className="text-center py-6 text-muted-foreground text-sm">
                {t("لا توجد نتائج، جرب كلمة أخرى", "No results, try another word")}
              </div>
            )}

            <div className="space-y-2">
              {results.map((p) => (
                <button
                  key={p.id}
                  onClick={() => addToNote(p)}
                  className="w-full flex items-center gap-3 bg-background rounded-xl p-2.5 hover:bg-primary/5 hover:ring-2 hover:ring-primary/30 transition-all text-right"
                >
                  <img
                    src={p.image || "/placeholder.svg"}
                    alt={p.name}
                    className="w-14 h-14 rounded-lg object-cover bg-muted shrink-0"
                    loading="lazy"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm line-clamp-2">
                      {lang === "ar" ? p.name : p.name_en || p.name}
                    </p>
                    <p className="text-xs text-muted-foreground">{p.unit}</p>
                  </div>
                  <div className="text-left shrink-0">
                    <p className="font-bold text-primary text-sm">
                      {p.price} {t("ر.س", "SAR")}
                    </p>
                    <div className="bg-primary text-primary-foreground rounded-full p-1 mt-1 inline-flex">
                      <Plus className="h-3.5 w-3.5" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Note (paper-like list of selected items) */}
          {note.length > 0 && (
            <div className="border-t bg-background shrink-0 max-h-[40%] flex flex-col">
              <div className="px-4 py-2 border-b bg-amber-50/60 flex items-center justify-between">
                <p className="text-xs font-bold text-foreground">
                  📝 {t("ورقة طلبك", "Your note")} ({totalItems})
                </p>
                <p className="text-xs font-bold text-primary">
                  {totalPrice.toFixed(2)} {t("ر.س", "SAR")}
                </p>
              </div>
              <div className="overflow-y-auto p-2 space-y-1.5 flex-1">
                {note.map((n) => (
                  <div
                    key={n.product.id}
                    className="flex items-center gap-2 bg-muted/40 rounded-lg p-1.5"
                  >
                    <img
                      src={n.product.image || "/placeholder.svg"}
                      alt={n.product.name}
                      className="w-9 h-9 rounded object-cover shrink-0"
                    />
                    <p className="flex-1 text-xs font-medium line-clamp-1">
                      {lang === "ar" ? n.product.name : n.product.name_en || n.product.name}
                    </p>
                    <div className="flex items-center gap-1 bg-background rounded-full border">
                      <button
                        onClick={() => updateQty(n.product.id, -1)}
                        className="p-1 hover:bg-muted rounded-full"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="text-xs font-bold w-5 text-center">{n.qty}</span>
                      <button
                        onClick={() => updateQty(n.product.id, 1)}
                        className="p-1 hover:bg-muted rounded-full"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                    <button
                      onClick={() => removeItem(n.product.id)}
                      className="p-1 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer CTA */}
        <div className="border-t p-3 bg-background shrink-0">
          <button
            onClick={transferToCart}
            disabled={note.length === 0}
            className={cn(
              "w-full h-12 rounded-2xl font-bold text-base flex items-center justify-center gap-2 transition-all",
              note.length > 0
                ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/30"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
          >
            <ShoppingCart className="h-5 w-5" />
            {note.length === 0
              ? t("أضف منتجات أولاً", "Add products first")
              : t(`نقل إلى السلة (${totalItems})`, `Move to cart (${totalItems})`)}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default QuickOrderSheet;