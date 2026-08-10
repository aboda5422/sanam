import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Wallet, TrendingUp, Undo2, AlertCircle } from "lucide-react";

const paymentStatusMap: Record<string, { label: string; className: string }> = {
  pending: { label: "معلّق", className: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  paid: { label: "مدفوع", className: "bg-green-100 text-green-800 border-green-300" },
  failed: { label: "فاشل", className: "bg-red-100 text-red-800 border-red-300" },
  refunded: { label: "مسترد", className: "bg-purple-100 text-purple-800 border-purple-300" },
  cancelled: { label: "ملغي", className: "bg-gray-100 text-gray-800 border-gray-300" },
};

const methodLabel = (m: string) => {
  if (m === "cash") return "نقدي";
  if (m === "moyasar" || m === "online") return "إلكتروني";
  return m;
};

const AdminPaymentsPage = () => {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: payments, isLoading } = useQuery({
    queryKey: ["admin-payments", from, to, statusFilter],
    queryFn: async () => {
      let q = supabase
        .from("payments")
        .select("*, orders(order_number, customer_name, customer_phone)")
        .gte("created_at", `${from}T00:00:00`)
        .lte("created_at", `${to}T23:59:59`)
        .order("created_at", { ascending: false });
      if (statusFilter !== "all") q = q.eq("status", statusFilter as any);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const totals = (payments || []).reduce(
    (acc, p: any) => {
      if (p.status === "paid") {
        acc.paid += Number(p.amount || 0);
        acc.paidCount += 1;
      }
      if (p.status === "refunded") {
        acc.refunded += Number(p.refund_amount || p.amount || 0);
        acc.refundedCount += 1;
      }
      if (p.status === "failed") acc.failedCount += 1;
      return acc;
    },
    { paid: 0, refunded: 0, paidCount: 0, refundedCount: 0, failedCount: 0 }
  );

  return (
    <AdminLayout title="سجل المدفوعات">
      {/* KPI Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
              <Wallet className="h-5 w-5 text-green-700" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">إجمالي المدفوع</p>
              <p className="text-lg font-bold">{totals.paid.toFixed(2)} ر.س</p>
              <p className="text-[10px] text-muted-foreground">{totals.paidCount} عملية</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <Undo2 className="h-5 w-5 text-purple-700" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">إجمالي المسترد</p>
              <p className="text-lg font-bold">{totals.refunded.toFixed(2)} ر.س</p>
              <p className="text-[10px] text-muted-foreground">{totals.refundedCount} عملية</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-blue-700" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">صافي المبيعات</p>
              <p className="text-lg font-bold">{(totals.paid - totals.refunded).toFixed(2)} ر.س</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-red-100 flex items-center justify-center">
              <AlertCircle className="h-5 w-5 text-red-700" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">عمليات فاشلة</p>
              <p className="text-lg font-bold">{totals.failedCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 mb-4 bg-card p-3 rounded-xl border">
        <div>
          <Label className="text-xs">من تاريخ</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-[160px]" dir="ltr" />
        </div>
        <div>
          <Label className="text-xs">إلى تاريخ</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-[160px]" dir="ltr" />
        </div>
        <div>
          <Label className="text-xs">حالة الدفع</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              {Object.entries(paymentStatusMap).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Badge variant="outline" className="ml-auto">{payments?.length ?? 0} عملية</Badge>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <div className="bg-card rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-right p-3 font-medium">الطلب</th>
                  <th className="text-right p-3 font-medium">العميل</th>
                  <th className="text-right p-3 font-medium">المبلغ</th>
                  <th className="text-right p-3 font-medium">المسترد</th>
                  <th className="text-center p-3 font-medium">الطريقة</th>
                  <th className="text-center p-3 font-medium">الحالة</th>
                  <th className="text-right p-3 font-medium">التاريخ</th>
                  <th className="text-right p-3 font-medium">معرّف Moyasar</th>
                </tr>
              </thead>
              <tbody>
                {payments?.length === 0 && (
                  <tr><td colSpan={8} className="p-8 text-center text-muted-foreground text-sm">لا توجد مدفوعات في النطاق المحدد</td></tr>
                )}
                {payments?.map((p: any) => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-muted/10">
                    <td className="p-3 font-medium">#{p.orders?.order_number ?? "—"}</td>
                    <td className="p-3">
                      <p>{p.orders?.customer_name || "—"}</p>
                      <p className="text-xs text-muted-foreground">{p.orders?.customer_phone}</p>
                    </td>
                    <td className="p-3 font-medium">{Number(p.amount).toFixed(2)} ر.س</td>
                    <td className="p-3 text-purple-700">{p.refund_amount ? `${Number(p.refund_amount).toFixed(2)} ر.س` : "—"}</td>
                    <td className="p-3 text-center text-xs">{methodLabel(p.method)}</td>
                    <td className="p-3 text-center">
                      <Badge variant="outline" className={`text-[10px] ${paymentStatusMap[p.status]?.className || ""}`}>
                        {paymentStatusMap[p.status]?.label || p.status}
                      </Badge>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">{new Date(p.created_at).toLocaleString("ar-SA")}</td>
                    <td className="p-3 text-xs text-muted-foreground" dir="ltr">{p.moyasar_payment_id ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default AdminPaymentsPage;