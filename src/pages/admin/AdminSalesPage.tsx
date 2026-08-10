import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import {
  Loader2, TrendingUp, DollarSign, ShoppingCart, CreditCard, Banknote, BarChart3, Download, CalendarIcon, Search,
} from "lucide-react";
import { format, subDays, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";
import { ar } from "date-fns/locale";

type DateFilter = "today" | "week" | "month" | "custom";

const AdminSalesPage = () => {
  const [dateFilter, setDateFilter] = useState<DateFilter>("month");
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [searchOrder, setSearchOrder] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");

  const { data: orders, isLoading } = useQuery({
    queryKey: ["admin-sales-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, total, subtotal, delivery_fee, status, payment_method, created_at, collected_amount, customer_name, customer_phone, driver_id, drivers(full_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const dateRange = useMemo(() => {
    const now = new Date();
    switch (dateFilter) {
      case "today":
        return { from: startOfDay(now), to: endOfDay(now) };
      case "week":
        return { from: startOfWeek(now, { weekStartsOn: 6 }), to: endOfWeek(now, { weekStartsOn: 6 }) };
      case "month":
        return { from: startOfMonth(now), to: endOfMonth(now) };
      case "custom":
        return { from: customFrom ? startOfDay(customFrom) : subDays(now, 30), to: customTo ? endOfDay(customTo) : endOfDay(now) };
    }
  }, [dateFilter, customFrom, customTo]);

  const filteredOrders = useMemo(() => {
    if (!orders) return [];
    return orders.filter((o) => {
      const d = new Date(o.created_at);
      const inRange = isWithinInterval(d, { start: dateRange.from, end: dateRange.to });
      const matchSearch = !searchOrder || 
        String(o.order_number).includes(searchOrder) || 
        (o.customer_name && o.customer_name.includes(searchOrder)) ||
        (o.customer_phone && o.customer_phone.includes(searchOrder));
      const matchStatus = statusFilter === "all" || o.status === statusFilter;
      const matchPayment = paymentFilter === "all" || o.payment_method === paymentFilter;
      return inRange && matchSearch && matchStatus && matchPayment;
    });
  }, [orders, dateRange, searchOrder, statusFilter, paymentFilter]);

  const stats = useMemo(() => {
    const delivered = filteredOrders.filter((o) => o.status === "delivered");
    const totalRevenue = delivered.reduce((s, o) => s + Number(o.total), 0);
    const totalDeliveryFees = delivered.reduce((s, o) => s + Number(o.delivery_fee), 0);
    const totalCollected = delivered.reduce((s, o) => s + Number(o.collected_amount), 0);
    const cashOrders = delivered.filter((o) => o.payment_method === "cash").length;
    const cardOrders = delivered.filter((o) => o.payment_method !== "cash").length;
    const avgOrderValue = delivered.length > 0 ? totalRevenue / delivered.length : 0;
    return {
      totalRevenue, totalDeliveryFees, totalCollected, cashOrders, cardOrders, avgOrderValue,
      totalOrders: filteredOrders.length, deliveredCount: delivered.length,
    };
  }, [filteredOrders]);

  const exportCSV = () => {
    if (!filteredOrders.length) return;
    const headers = ["رقم الطلب", "اسم العميل", "الجوال", "المبلغ", "رسوم التوصيل", "الإجمالي", "طريقة الدفع", "الحالة", "المندوب", "التاريخ"];
    const statusMap: Record<string, string> = { pending: "معلق", assigned: "معيّن", preparing: "تحضير", on_the_way: "في الطريق", delivered: "تم التوصيل", cancelled: "ملغي" };
    const rows = filteredOrders.map((o) => [
      o.order_number,
      o.customer_name || "—",
      o.customer_phone || "—",
      Number(o.subtotal).toFixed(2),
      Number(o.delivery_fee).toFixed(2),
      Number(o.total).toFixed(2),
      o.payment_method === "cash" ? "كاش" : "شبكة",
      statusMap[o.status] || o.status,
      (o.drivers as any)?.full_name || "—",
      format(new Date(o.created_at), "yyyy-MM-dd HH:mm"),
    ]);
    const bom = "\uFEFF";
    const csv = bom + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sales_${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) return <AdminLayout title="الحسابات والمبيعات"><div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></AdminLayout>;

  const cards = [
    { title: "إجمالي الإيرادات", value: `${stats.totalRevenue.toFixed(2)} ر.س`, icon: DollarSign, color: "text-green-600" },
    { title: "متوسط قيمة الطلب", value: `${stats.avgOrderValue.toFixed(2)} ر.س`, icon: BarChart3, color: "text-purple-600" },
    { title: "رسوم التوصيل", value: `${stats.totalDeliveryFees.toFixed(2)} ر.س`, icon: Banknote, color: "text-orange-600" },
    { title: "إجمالي الطلبات", value: `${stats.totalOrders}`, icon: ShoppingCart, color: "text-primary" },
    { title: "الطلبات المكتملة", value: `${stats.deliveredCount}`, icon: ShoppingCart, color: "text-green-600" },
    { title: "طلبات كاش", value: `${stats.cashOrders}`, icon: Banknote, color: "text-yellow-600" },
    { title: "طلبات شبكة", value: `${stats.cardOrders}`, icon: CreditCard, color: "text-indigo-600" },
    { title: "المبالغ المحصلة", value: `${stats.totalCollected.toFixed(2)} ر.س`, icon: TrendingUp, color: "text-blue-600" },
  ];

  const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    pending: { label: "معلق", variant: "secondary" },
    assigned: { label: "معيّن", variant: "outline" },
    preparing: { label: "تحضير", variant: "outline" },
    on_the_way: { label: "في الطريق", variant: "default" },
    delivered: { label: "تم التوصيل", variant: "default" },
    cancelled: { label: "ملغي", variant: "destructive" },
  };

  return (
    <AdminLayout title="الحسابات والمبيعات">
      {/* Date filter tabs */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {(["today", "week", "month", "custom"] as DateFilter[]).map((f) => {
          const labels: Record<DateFilter, string> = { today: "اليوم", week: "هذا الأسبوع", month: "هذا الشهر", custom: "مخصص" };
          return (
            <Button key={f} size="sm" variant={dateFilter === f ? "default" : "outline"} onClick={() => setDateFilter(f)}>
              {labels[f]}
            </Button>
          );
        })}

        {dateFilter === "custom" && (
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("w-[140px] text-right", !customFrom && "text-muted-foreground")}>
                  <CalendarIcon className="ml-1 h-4 w-4" />
                  {customFrom ? format(customFrom, "yyyy/MM/dd") : "من تاريخ"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={customFrom} onSelect={setCustomFrom} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
            <span className="text-sm text-muted-foreground">إلى</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("w-[140px] text-right", !customTo && "text-muted-foreground")}>
                  <CalendarIcon className="ml-1 h-4 w-4" />
                  {customTo ? format(customTo, "yyyy/MM/dd") : "إلى تاريخ"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={customTo} onSelect={setCustomTo} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
        )}

        <Button size="sm" variant="outline" onClick={exportCSV} className="mr-auto">
          <Download className="ml-1 h-4 w-4" />تصدير CSV
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-6">
        {cards.map((c) => (
          <Card key={c.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{c.title}</CardTitle>
              <c.icon className={`h-4 w-4 ${c.color}`} />
            </CardHeader>
            <CardContent><p className="text-xl font-bold">{c.value}</p></CardContent>
          </Card>
        ))}
      </div>

      {/* Filters for details table */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="بحث برقم الطلب أو اسم العميل..." value={searchOrder} onChange={(e) => setSearchOrder(e.target.value)} className="pr-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[130px]"><SelectValue placeholder="الحالة" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            <SelectItem value="pending">معلق</SelectItem>
            <SelectItem value="assigned">معيّن</SelectItem>
            <SelectItem value="preparing">تحضير</SelectItem>
            <SelectItem value="on_the_way">في الطريق</SelectItem>
            <SelectItem value="delivered">تم التوصيل</SelectItem>
            <SelectItem value="cancelled">ملغي</SelectItem>
          </SelectContent>
        </Select>
        <Select value={paymentFilter} onValueChange={setPaymentFilter}>
          <SelectTrigger className="w-[120px]"><SelectValue placeholder="الدفع" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="cash">كاش</SelectItem>
            <SelectItem value="card">شبكة</SelectItem>
          </SelectContent>
        </Select>
        <Badge variant="outline">{filteredOrders.length} عملية</Badge>
      </div>

      {/* Orders detail table */}
      <div className="bg-card rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-right p-3 font-medium">#</th>
                <th className="text-right p-3 font-medium">اسم العميل</th>
                <th className="text-right p-3 font-medium">الجوال</th>
                <th className="text-right p-3 font-medium">المبلغ</th>
                <th className="text-right p-3 font-medium">التوصيل</th>
                <th className="text-right p-3 font-medium">الإجمالي</th>
                <th className="text-center p-3 font-medium">الدفع</th>
                <th className="text-center p-3 font-medium">الحالة</th>
                <th className="text-right p-3 font-medium">المندوب</th>
                <th className="text-right p-3 font-medium">التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length === 0 ? (
                <tr><td colSpan={10} className="p-8 text-center text-muted-foreground">لا توجد عمليات في الفترة المحددة</td></tr>
              ) : (
                filteredOrders.map((o) => {
                  const st = statusMap[o.status] || { label: o.status, variant: "outline" as const };
                  return (
                    <tr key={o.id} className="border-b last:border-0 hover:bg-muted/10">
                      <td className="p-3 font-medium">{o.order_number}</td>
                      <td className="p-3">{o.customer_name || "—"}</td>
                      <td className="p-3 text-muted-foreground">{o.customer_phone || "—"}</td>
                      <td className="p-3">{Number(o.subtotal).toFixed(2)} ر.س</td>
                      <td className="p-3">{Number(o.delivery_fee).toFixed(2)} ر.س</td>
                      <td className="p-3 font-bold">{Number(o.total).toFixed(2)} ر.س</td>
                      <td className="p-3 text-center">
                        <Badge variant="outline">{o.payment_method === "cash" ? "كاش" : "شبكة"}</Badge>
                      </td>
                      <td className="p-3 text-center">
                        <Badge variant={st.variant}>{st.label}</Badge>
                      </td>
                      <td className="p-3">{(o.drivers as any)?.full_name || "—"}</td>
                      <td className="p-3 text-muted-foreground text-xs">{format(new Date(o.created_at), "yyyy/MM/dd HH:mm")}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminSalesPage;
