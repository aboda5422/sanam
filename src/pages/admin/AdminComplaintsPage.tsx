import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { MessageSquare, Clock, CheckCircle, Loader2, Undo2 } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { applyBranchFilter } from "@/lib/branch-scope";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RETURN_STATUS_LABELS, type OrderReturnStatus } from "@/lib/order-returns";

type Complaint = Database["public"]["Tables"]["complaints"]["Row"];
type ComplaintStatus = Database["public"]["Enums"]["complaint_status"];

const statusMap: Record<ComplaintStatus, { label: string; color: string; icon: typeof Clock }> = {
  open: { label: "مفتوحة", color: "bg-red-100 text-red-800", icon: Clock },
  in_progress: { label: "قيد المعالجة", color: "bg-yellow-100 text-yellow-800", icon: Loader2 },
  resolved: { label: "تم الحل", color: "bg-green-100 text-green-800", icon: CheckCircle },
};

const AdminComplaintsPage = () => {
  const queryClient = useQueryClient();
  const { scopedBranchIds } = useAdminAuth();
  const [selected, setSelected] = useState<Complaint | null>(null);
  const [reply, setReply] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [refundAmount, setRefundAmount] = useState("");
  const [approvingReturn, setApprovingReturn] = useState(false);
  const [orderTotal, setOrderTotal] = useState<number | null>(null);
  const [linkedReturn, setLinkedReturn] = useState<any | null>(null);

  const { data: complaints, isLoading } = useQuery({
    queryKey: ["admin-complaints", scopedBranchIds],
    queryFn: async () => {
      let q = supabase.from("complaints").select("*").order("created_at", { ascending: false });
      q = applyBranchFilter(q, scopedBranchIds);
      const { data, error } = await q;
      if (error) throw error;
      return data as Complaint[];
    },
  });

  const openComplaint = async (c: Complaint) => {
    setSelected(c);
    setReply(c.admin_reply || "");
    setLinkedReturn(null);
    setOrderTotal(null);
    setRefundAmount("");
    if (c.order_id) {
      const [{ data: order }, { data: ret }] = await Promise.all([
        supabase.from("orders").select("id, total, order_number, payment_method").eq("id", c.order_id).maybeSingle(),
        supabase
          .from("order_returns" as any)
          .select("*")
          .eq("complaint_id", c.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (order) {
        setOrderTotal(Number(order.total));
        setRefundAmount(String(order.total));
      }
      setLinkedReturn(ret);
    }
  };

  const replyMutation = useMutation({
    mutationFn: async ({ id, reply, status }: { id: string; reply: string; status: ComplaintStatus }) => {
      const { error } = await supabase
        .from("complaints")
        .update({ admin_reply: reply, status, replied_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم إرسال الرد بنجاح");
      queryClient.invalidateQueries({ queryKey: ["admin-complaints"] });
      setSelected(null);
      setReply("");
    },
    onError: () => toast.error("حدث خطأ أثناء الرد"),
  });

  const approveReturn = async () => {
    if (!selected?.order_id) {
      toast.error("اربط الشكوى بطلب أولاً للموافقة على إرجاع");
      return;
    }
    const amt = Number(refundAmount);
    if (!amt || amt <= 0 || (orderTotal != null && amt > orderTotal)) {
      toast.error("مبلغ الاسترداد غير صالح");
      return;
    }
    setApprovingReturn(true);
    try {
      const { data, error } = await supabase.rpc("approve_order_return" as any, {
        p_complaint_id: selected.id,
        p_order_id: selected.order_id,
        p_refund_amount: amt,
        p_admin_note: reply || null,
      });
      if (error) throw error;
      toast.success("تمت الموافقة — مهمة استلام مرتجع متاحة للمندوبين");
      setLinkedReturn(data);
      queryClient.invalidateQueries({ queryKey: ["admin-complaints"] });
    } catch (e: any) {
      toast.error(e.message || "تعذر الموافقة على الإرجاع");
    } finally {
      setApprovingReturn(false);
    }
  };

  const retryRefund = async () => {
    if (!linkedReturn?.id) return;
    setApprovingReturn(true);
    try {
      const { data, error } = await supabase.functions.invoke("finalize-order-return", {
        body: { return_id: linkedReturn.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("تم تنفيذ الاسترداد");
      openComplaint(selected!);
    } catch (e: any) {
      toast.error(e.message || "فشل الاسترداد");
    } finally {
      setApprovingReturn(false);
    }
  };

  const filtered = complaints?.filter((c) =>
    filterStatus === "all" ? true : c.status === filterStatus
  );

  return (
    <AdminLayout title="إدارة الشكاوى والاستفسارات">
      <div className="flex items-center gap-3 mb-4">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="تصفية حسب الحالة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="open">مفتوحة</SelectItem>
            <SelectItem value="in_progress">قيد المعالجة</SelectItem>
            <SelectItem value="resolved">تم الحل</SelectItem>
          </SelectContent>
        </Select>
        <Badge variant="outline">{filtered?.length ?? 0} شكوى</Badge>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <div className="space-y-3">
          {filtered?.map((c) => {
            const st = statusMap[c.status];
            return (
              <div key={c.id} className="bg-card rounded-xl border p-4 hover:shadow-sm transition-shadow cursor-pointer" onClick={() => openComplaint(c)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-xs text-muted-foreground">
                        {c.type === "return" ? "طلب إرجاع" : c.type === "complaint" ? "شكوى" : "استفسار"} • {new Date(c.created_at).toLocaleDateString("ar-SA")}
                      </span>
                    </div>
                    <p className="text-sm line-clamp-2">{c.message}</p>
                  </div>
                  <Badge className={`${st.color} shrink-0`}>{st.label}</Badge>
                </div>
                {(c as any).image_urls?.length > 0 && (
                  <div className="flex gap-2 mt-2">
                    {(c as any).image_urls.map((url: string, i: number) => (
                      <img key={i} src={url} alt="" className="h-12 w-12 rounded object-cover border" />
                    ))}
                  </div>
                )}
                {c.admin_reply && (
                  <div className="mt-2 bg-muted/50 rounded-lg p-2 text-xs text-muted-foreground">
                    <span className="font-medium">الرد:</span> {c.admin_reply}
                  </div>
                )}
              </div>
            );
          })}
          {filtered?.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">لا توجد شكاوى</div>
          )}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>
              {selected?.type === "return" ? "طلب إرجاع" : selected?.type === "complaint" ? "شكوى" : "استفسار"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="bg-muted/30 rounded-lg p-3">
              <p className="text-sm">{selected?.message}</p>
              {(selected as any)?.image_urls?.length > 0 && (
                <div className="flex gap-2 mt-2">
                  {(selected as any).image_urls.map((url: string, i: number) => (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                      <img src={url} alt="" className="h-20 w-20 rounded object-cover border hover:opacity-80 transition" />
                    </a>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-2">
                {selected && new Date(selected.created_at).toLocaleString("ar-SA")}
              </p>
            </div>

            {linkedReturn && (
              <div className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm space-y-1">
                <p className="font-semibold text-teal-900 flex items-center gap-1">
                  <Undo2 className="h-4 w-4" /> مسار الإرجاع
                </p>
                <p>
                  الحالة:{" "}
                  {RETURN_STATUS_LABELS[(linkedReturn.status as OrderReturnStatus)] || linkedReturn.status}
                </p>
                <p>مبلغ الاسترداد: {Number(linkedReturn.refund_amount).toFixed(2)} ر.س</p>
                {linkedReturn.refund_error && (
                  <p className="text-destructive text-xs">{linkedReturn.refund_error}</p>
                )}
                {linkedReturn.status === "refund_failed" && (
                  <Button size="sm" variant="outline" onClick={retryRefund} disabled={approvingReturn}>
                    إعادة محاولة الاسترداد
                  </Button>
                )}
              </div>
            )}

            {selected?.order_id && !linkedReturn && (
              <div className="rounded-lg border p-3 space-y-2">
                <Label>موافقة إرجاع → مهمة مندوب ثم استرداد</Label>
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Label className="text-xs text-muted-foreground">مبلغ الاسترداد (ر.س)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min={0.01}
                      max={orderTotal ?? undefined}
                      value={refundAmount}
                      onChange={(e) => setRefundAmount(e.target.value)}
                    />
                  </div>
                  <Button onClick={approveReturn} disabled={approvingReturn} variant="secondary">
                    {approvingReturn ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4 ml-1" />}
                    موافقة إرجاع
                  </Button>
                </div>
                {orderTotal != null && (
                  <p className="text-xs text-muted-foreground">إجمالي الطلب: {orderTotal.toFixed(2)} ر.س</p>
                )}
              </div>
            )}

            <Textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="اكتب ردك هنا..."
              rows={4}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => selected && replyMutation.mutate({ id: selected.id, reply, status: "in_progress" })}
              disabled={!reply || replyMutation.isPending}
            >
              رد وأبقِ مفتوحة
            </Button>
            <Button
              onClick={() => selected && replyMutation.mutate({ id: selected.id, reply, status: "resolved" })}
              disabled={!reply || replyMutation.isPending}
            >
              {replyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "رد وأغلق"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminComplaintsPage;
