import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import {
  ArrowRight,
  Camera,
  Check,
  Loader2,
  MessageCircle,
  ScanBarcode,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { prepProgress } from "@/lib/preparer";
import type { PreparerSession } from "@/hooks/usePreparerAuth";
import { Capacitor } from "@capacitor/core";

const PreparerOrderDetailPage = () => {
  const { id } = useParams();
  const session = useOutletContext<PreparerSession>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [barcode, setBarcode] = useState("");
  const [busy, setBusy] = useState(false);
  const [productDialog, setProductDialog] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [chatOpen, setChatOpen] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const { data: o } = await supabase
      .from("orders")
      .select("id, order_number, status, customer_note, notes, preparer_id, branch_id, created_at")
      .eq("id", id)
      .maybeSingle();
    if (!o) {
      setLoading(false);
      return;
    }
    const { data: its } = await supabase
      .from("order_items")
      .select("*")
      .eq("order_id", id)
      .order("created_at");
    setOrder(o);
    setItems(its || []);
    setLoading(false);
  }, [id]);

  const loadMessages = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from("order_messages" as any)
      .select("*")
      .eq("order_id", id)
      .order("created_at", { ascending: true });
    setMessages((data as any) || []);
  }, [id]);

  useEffect(() => {
    load();
    loadMessages();
    const ch = supabase
      .channel(`preparer-order-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `id=eq.${id}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items", filter: `order_id=eq.${id}` }, () => load())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "order_messages", filter: `order_id=eq.${id}` }, () => loadMessages())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [id, load, loadMessages]);

  const ensureClaimed = async () => {
    if (!order || !id) return;
    if (order.status === "preparing" && order.preparer_id === session.userId) return;
    if (order.status === "preparing" && order.preparer_id && order.preparer_id !== session.userId) {
      throw new Error("هذا الطلب مستلم من محضّر آخر");
    }
    if (order.status !== "pending" && order.status !== "preparing") {
      throw new Error("الطلب ليس في مرحلة التحضير");
    }
    if (order.status === "pending" || !order.preparer_id) {
      const { error } = await supabase.rpc("preparer_claim_order" as any, {
        p_order_id: id,
      });
      if (error) throw error;
      await load();
    }
  };

  const markItem = async (itemId: string, qty?: number) => {
    setBusy(true);
    try {
      await ensureClaimed();
      const { data, error } = await supabase.rpc("preparer_mark_item" as any, {
        p_order_item_id: itemId,
        p_prepared_qty: qty ?? null,
      });
      if (error) throw error;
      const res = data as any;
      toast.success(res?.all_done ? "اكتمل تحضير الطلب — متاح للمندوبين" : "تم تحديث الصنف");
      await load();
      if (res?.all_done) navigate("/preparer");
    } catch (e: any) {
      toast.error(e.message || "تعذر التحديث");
    } finally {
      setBusy(false);
    }
  };

  const applyBarcode = async (code: string) => {
    const cleaned = code.trim();
    if (!cleaned) return;
    try {
      await ensureClaimed();
    } catch (e: any) {
      toast.error(e.message || "تعذر استلام الطلب");
      return;
    }
    const match = items.find(
      (i) => (i.barcode && String(i.barcode) === cleaned) || String(i.id) === cleaned,
    );
    if (!match) {
      // try product barcode lookup among items with product_id
      const withPid = items.filter((i) => i.product_id && i.prepared_qty < i.quantity);
      if (withPid.length) {
        const { data: prods } = await supabase
          .from("products")
          .select("id, barcode, alt_barcode")
          .in(
            "id",
            withPid.map((i) => i.product_id),
          )
          .or(`barcode.eq.${cleaned},alt_barcode.eq.${cleaned}`);
        const hit = prods?.[0];
        if (hit) {
          const item = items.find((i) => i.product_id === hit.id && i.prepared_qty < i.quantity);
          if (item) {
            setBarcode("");
            await markItem(item.id);
            return;
          }
        }
      }
      toast.error("الباركود لا يطابق أي صنف في هذا الطلب");
      return;
    }
    if (match.prepared_qty >= match.quantity) {
      toast.message("هذا الصنف مكتمل مسبقاً");
      return;
    }
    setBarcode("");
    await markItem(match.id);
  };

  const scanNative = async () => {
    try {
      if (!Capacitor.isNativePlatform()) {
        toast.message("أدخل الباركود يدوياً أو استخدم كاميرا الجهاز من حقل الإدخال");
        return;
      }
      // TODO(capacitor-native): عند بناء/توزيع تطبيق Capacitor الأصلي، أضف ماسح باركود أصلي
      // (مثل @capacitor-mlkit/barcode-scanning أو capacitor-barcode-scanner) واستبدل هذا المسار
      // بـ scan → applyBarcode(result) مباشرة بدل الاعتماد على الإدخال اليدوي/الكاميرا فقط.
      const { Camera } = await import("@capacitor/camera");
      // Fallback مؤقت: فتح الكاميرا للمراجعة البصرية؛ الإدخال اليدوي يبقى الأساس حتى تثبيت الماسح
      await Camera.requestPermissions({ permissions: ["camera"] });
      toast.message("صوّر/اقرأ الباركود ثم أدخله في الحقل، أو اضغط إضافة على الصنف");
    } catch (e: any) {
      toast.error(e.message || "تعذر فتح الكاميرا");
    }
  };

  const openProduct = async (item: any) => {
    if (!item.product_id) {
      setProductDialog(item);
      return;
    }
    const { data } = await supabase
      .from("products")
      .select("id, name, name_en, description, image, barcode, unit, price")
      .eq("id", item.product_id)
      .maybeSingle();
    setProductDialog({ ...item, product: data });
  };

  const sendMessage = async () => {
    const body = msg.trim();
    if (!body || !id) return;
    const { error } = await supabase.from("order_messages" as any).insert({
      order_id: id,
      sender_id: session.userId,
      sender_role: "preparer",
      body,
    });
    if (error) toast.error(error.message);
    else {
      setMsg("");
      loadMessages();
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }
  if (!order) {
    return <p className="text-center text-muted-foreground">الطلب غير موجود</p>;
  }

  const progress = prepProgress(items);

  return (
    <div className="space-y-4 max-w-lg mx-auto">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/preparer">
            <ArrowRight className="h-4 w-4" /> رجوع
          </Link>
        </Button>
        <Button variant="outline" size="sm" onClick={() => setChatOpen(true)}>
          <MessageCircle className="h-4 w-4 ml-1" /> دردشة العميل
        </Button>
      </div>

      <Card>
        <CardContent className="p-4 space-y-2">
          <p className="text-3xl font-black">طلب #{order.order_number}</p>
          <p className="text-sm text-muted-foreground">
            {order.status === "ready"
              ? "جاهز للمندوب"
              : order.status === "preparing"
                ? "جاري التحضير"
                : order.status}
          </p>
          {order.customer_note && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm">
              <span className="font-semibold">ملاحظة العميل: </span>
              {order.customer_note}
            </div>
          )}
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span>اكتمال التحضير</span>
              <span>
                {progress.done}/{progress.total} — {progress.percent}%
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${progress.percent}%` }} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-3 space-y-2">
          <p className="text-sm font-semibold flex items-center gap-2">
            <ScanBarcode className="h-4 w-4" /> مطابقة بالباركود
          </p>
          <div className="flex gap-2">
            <Input
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="أدخل أو الصق الباركود"
              dir="ltr"
              onKeyDown={(e) => {
                if (e.key === "Enter") applyBarcode(barcode);
              }}
            />
            <Button type="button" variant="outline" onClick={scanNative} title="كاميرا">
              <Camera className="h-4 w-4" />
            </Button>
            <Button type="button" disabled={busy} onClick={() => applyBarcode(barcode)}>
              مطابقة
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {items.map((item) => {
          const done = (item.prepared_qty || 0) >= item.quantity;
          const lockedByOther =
            order.status === "preparing" &&
            order.preparer_id &&
            order.preparer_id !== session.userId;
          const canMatch =
            !busy &&
            !done &&
            !lockedByOther &&
            (order.status === "pending" || order.status === "preparing");
          return (
            <Card key={item.id} className={done ? "opacity-70" : ""}>
              <CardContent className="p-3 flex gap-3 items-center">
                {item.product_image ? (
                  <img src={item.product_image} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="w-14 h-14 rounded-lg bg-muted shrink-0" />
                )}
                <button type="button" className="flex-1 min-w-0 text-right" onClick={() => openProduct(item)}>
                  <p className={`font-semibold text-sm ${done ? "line-through text-muted-foreground" : ""}`}>
                    {item.product_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.prepared_qty || 0}/{item.quantity}
                    {item.barcode ? ` · ${item.barcode}` : " · بدون باركود"}
                  </p>
                </button>
                {done ? (
                  <Button size="sm" variant="secondary" disabled className="shrink-0 gap-1">
                    <Check className="h-4 w-4" /> تم
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="shrink-0"
                    disabled={!canMatch}
                    title={
                      lockedByOther
                        ? "الطلب مع محضّر آخر"
                        : "مطابقة يدوية — يستلم الطلب تلقائياً إن لزم"
                    }
                    onClick={() => markItem(item.id)}
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "مطابقة"}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!productDialog} onOpenChange={(o) => !o && setProductDialog(null)}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>{productDialog?.product?.name || productDialog?.product_name}</DialogTitle>
          </DialogHeader>
          {(productDialog?.product?.image || productDialog?.product_image) && (
            <img
              src={productDialog?.product?.image || productDialog?.product_image}
              alt=""
              className="w-full max-h-48 object-contain rounded-lg"
            />
          )}
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {productDialog?.product?.description || "لا يوجد وصف إضافي"}
          </p>
          {productDialog?.product?.barcode && (
            <p className="text-xs dir-ltr" dir="ltr">
              باركود: {productDialog.product.barcode}
            </p>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={chatOpen} onOpenChange={setChatOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>دردشة حول الطلب #{order.order_number}</DialogTitle>
          </DialogHeader>
          <div className="max-h-64 overflow-y-auto space-y-2 border rounded-lg p-2 bg-muted/20">
            {messages.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-6">لا رسائل بعد</p>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                className={`text-sm rounded-lg px-3 py-2 max-w-[85%] ${
                  m.sender_role === "preparer" ? "bg-primary text-primary-foreground mr-auto" : "bg-background border ml-auto"
                }`}
              >
                <p className="text-[10px] opacity-70 mb-0.5">{m.sender_role}</p>
                {m.body}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="اكتب للعميل..." />
            <Button onClick={sendMessage}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            لا تظهر بيانات هاتف أو موقع العميل في هذه الواجهة — التواصل عبر الدردشة فقط.
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PreparerOrderDetailPage;
