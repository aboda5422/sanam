import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
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
  Loader2, TrendingUp, DollarSign, ShoppingCart, CreditCard, Banknote, Download, CalendarIcon, Search,
  Truck, Building2, Wallet,
} from "lucide-react";
import { format, subDays, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";

import { useAdminAuth } from "@/hooks/useAdminAuth";
import { applyBranchFilter } from "@/lib/branch-scope";
import {
  COLLECTION_STATUS_BADGE,
  COLLECTION_STATUS_LABEL,
  SETTLEMENT_TYPE_BADGE,
  SETTLEMENT_TYPE_LABEL,
  isSalesRecognizedOrder,
  retailCollectionStatus,
  retailSettlementType,
  type CollectionStatusKey,
  type SettlementType,
} from "@/lib/collection-ledger-display";
import { commissionByOrder, driverWageExpenses, type SalesWalletTx } from "@/lib/sales-ledger";
import { downloadSalesExcel } from "@/lib/sales-excel";
import { toast } from "sonner";

type DateFilter = "today" | "week" | "month" | "custom";
type CustodyFilter = "all" | "with_driver" | "remitted";
type SettlementTypeFilter = "all" | SettlementType;
type CollectionStatusFilter = "all" | "collected" | "not_collected";

function isCashHeldByDriver(o: {
  status: string;
  payment_method: string;
  collected_amount: number | null;
  cash_settled_at?: string | null;
}) {
  return (
    o.status === "delivered" &&
    o.payment_method === "cash" &&
    Number(o.collected_amount || 0) > 0 &&
    !o.cash_settled_at
  );
}

function isCashRemitted(o: {
  status: string;
  payment_method: string;
  cash_settled_at?: string | null;
}) {
  return o.status === "delivered" && o.payment_method === "cash" && !!o.cash_settled_at;
}

type SalesOrder = {
  id: string;
  order_number: number | string;
  total: number;
  subtotal: number;
  delivery_fee: number;
  status: string;
  payment_method: string;
  payment_status: string;
  created_at: string;
  collected_amount: number | null;
  cash_settled_at?: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  driver_id: string | null;
  coupon_discount_amount?: number | null;
  coupon_delivery_waived?: number | null;
  coupon_code?: string | null;
  drivers: { full_name: string | null } | null;
};

type SalaryPayout = {
  id: string;
  driver_id: string;
  amount: number;
  period_note: string | null;
  created_at: string;
  drivers: { full_name: string | null } | { full_name: string | null }[] | null;
};

type LedgerLine = {
  key: string;
  kind: "revenue" | "expense";
  order: SalesOrder | null;
  driverName: string;
  amount: number;
  at: string;
  label: string;
};

function payoutDriverName(payout: SalaryPayout) {
  const embedded = payout.drivers;
  const row = Array.isArray(embedded) ? embedded[0] : embedded;
  return row?.full_name || "مندوب";
}

const AdminSalesPage = () => {
  const { scopedBranchIds } = useAdminAuth();
  const [searchParams] = useSearchParams();
  const periodFromUrl = searchParams.get("period");
  const initialDateFilter: DateFilter =
    periodFromUrl === "today" || periodFromUrl === "week" || periodFromUrl === "month"
      ? periodFromUrl
      : "month";
  const [dateFilter, setDateFilter] = useState<DateFilter>(initialDateFilter);
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [searchOrder, setSearchOrder] = useState("");
  const [custodyFilter, setCustodyFilter] = useState<CustodyFilter>("all");
  const [settlementTypeFilter, setSettlementTypeFilter] = useState<SettlementTypeFilter>("all");
  const [collectionStatusFilter, setCollectionStatusFilter] =
    useState<CollectionStatusFilter>("all");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin-sales-orders", scopedBranchIds],
    queryFn: async () => {
      // Do not select coupon_* here: those columns are not on the linked remote yet
      // and a missing column makes PostgREST fail the whole query → all KPIs read as 0.
      let q = supabase
        .from("orders")
        .select("id, order_number, total, subtotal, delivery_fee, status, payment_method, payment_status, created_at, collected_amount, cash_settled_at, customer_name, customer_phone, driver_id, drivers(full_name)")
        .order("created_at", { ascending: false });
      q = applyBranchFilter(q, scopedBranchIds);
      const [{ data: rows, error: ordersError }, payoutsRes] = await Promise.all([
        q,
        supabase
          .from("driver_salary_payouts")
          .select("id, driver_id, amount, period_note, created_at, drivers(full_name)")
          .order("created_at", { ascending: false }),
      ]);
      if (ordersError) throw ordersError;
      if (payoutsRes.error) throw payoutsRes.error;
      const orders = (rows || []) as unknown as SalesOrder[];
      const ids = orders.map((o) => o.id);
      const driverIds = [...new Set(orders.map((o) => o.driver_id).filter((id): id is string => !!id))];
      const txs: SalesWalletTx[] = [];
      for (let i = 0; i < ids.length; i += 80) {
        const { data: linked, error: linkedError } = await supabase
          .from("wallet_transactions")
          .select("order_id, driver_id, type, amount, notes, created_at")
          .in("order_id", ids.slice(i, i + 80))
          .in("type", ["commission", "settlement"]);
        if (linkedError) throw linkedError;
        txs.push(...((linked || []) as SalesWalletTx[]));
      }
      for (let i = 0; i < driverIds.length; i += 80) {
        const { data: remittances, error: remitError } = await supabase
          .from("wallet_transactions")
          .select("order_id, driver_id, type, amount, notes, created_at")
          .in("driver_id", driverIds.slice(i, i + 80))
          .eq("type", "settlement")
          .is("order_id", null);
        if (remitError) throw remitError;
        txs.push(...((remittances || []) as SalesWalletTx[]));
      }
      return { orders, txs, payouts: (payoutsRes.data || []) as SalaryPayout[] };
    },
  });

  const orders = data?.orders ?? [];
  const wageExpenses = useMemo(() => driverWageExpenses(orders, data?.txs ?? []), [orders, data?.txs]);
  const wages = useMemo(() => commissionByOrder(data?.txs ?? []), [data?.txs]);

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
    return orders.filter((o) => {
      const d = new Date(o.created_at);
      const inRange = isWithinInterval(d, { start: dateRange.from, end: dateRange.to });
      const matchSearch =
        !searchOrder ||
        String(o.order_number).includes(searchOrder) ||
        (o.customer_name && o.customer_name.includes(searchOrder)) ||
        (o.customer_phone && o.customer_phone.includes(searchOrder));
      const matchCustody =
        custodyFilter === "all" ||
        (custodyFilter === "with_driver" && isCashHeldByDriver(o)) ||
        (custodyFilter === "remitted" && isCashRemitted(o));
      const st = retailSettlementType(o.payment_method);
      const matchSettlementType =
        settlementTypeFilter === "all" || st === settlementTypeFilter;
      const cs = retailCollectionStatus(o);
      const matchCollectionStatus =
        collectionStatusFilter === "all" ||
        (collectionStatusFilter === "collected" && cs === "collected") ||
        (collectionStatusFilter === "not_collected" && cs === "not_collected");
      return (
        inRange &&
        matchSearch &&
        matchCustody &&
        matchSettlementType &&
        matchCollectionStatus
      );
    });
  }, [orders, dateRange, searchOrder, custodyFilter, settlementTypeFilter, collectionStatusFilter]);

  const orderFiltersOpen =
    custodyFilter === "all" && settlementTypeFilter === "all" && collectionStatusFilter === "all";

  const salaryInView = useMemo(() => {
    return (data?.payouts ?? []).filter((payout) => {
      const at = new Date(payout.created_at);
      if (!isWithinInterval(at, { start: dateRange.from, end: dateRange.to })) return false;
      if (!orderFiltersOpen) return false;
      if (!searchOrder) return true;
      const name = payoutDriverName(payout);
      return name.includes(searchOrder) || (payout.period_note || "").includes(searchOrder);
    });
  }, [data?.payouts, dateRange, searchOrder, orderFiltersOpen]);

  const ledgerLines = useMemo<LedgerLine[]>(() => {
    const blocks: { at: number; lines: LedgerLine[] }[] = [];
    for (const order of filteredOrders) {
      const driverName = (order.drivers as { full_name?: string | null } | null)?.full_name || "—";
      const lines: LedgerLine[] = [];
      // إيراد فقط للطلبات المعترف بها (كاش مسلّم، أو إلكتروني مدفوع + مسلّم)
      if (isSalesRecognizedOrder(order)) {
        lines.push({
          key: `rev-${order.id}`,
          kind: "revenue",
          order,
          driverName,
          amount: Number(order.total),
          at: order.created_at,
          label: "إيراد الطلب",
        });
      }
      const expense = wageExpenses.get(order.id);
      if (expense && expense.amount > 0) {
        lines.push({
          key: `exp-${order.id}`,
          kind: "expense",
          order,
          driverName,
          amount: expense.amount,
          at: expense.at || order.cash_settled_at || order.created_at,
          label: expense.label,
        });
      }
      if (lines.length) blocks.push({ at: new Date(order.created_at).getTime(), lines });
    }
    for (const payout of salaryInView) {
      const note = payout.period_note?.trim();
      blocks.push({
        at: new Date(payout.created_at).getTime(),
        lines: [
          {
            key: `salary-${payout.id}`,
            kind: "expense",
            order: null,
            driverName: payoutDriverName(payout),
            amount: Number(payout.amount),
            at: payout.created_at,
            label: note ? `راتب — ${note}` : "راتب مندوب",
          },
        ],
      });
    }
    return blocks.sort((a, b) => b.at - a.at).flatMap((block) => block.lines);
  }, [filteredOrders, wageExpenses, salaryInView]);

  const stats = useMemo(() => {
    const recognized = filteredOrders.filter((o) => isSalesRecognizedOrder(o));
    const totalRevenue = recognized.reduce((s, o) => s + Number(o.total), 0);
    const totalDeliveryFees = recognized.reduce((s, o) => s + Number(o.delivery_fee), 0);
    const driverCashPending = recognized
      .filter((o) => isCashHeldByDriver(o))
      .reduce((s, o) => s + Math.max(0, Number(o.collected_amount || o.total) - (wages.get(o.id) || 0)), 0);
    const driverCashCollected = recognized
      .filter((o) => isCashRemitted(o))
      .reduce((s, o) => s + Math.max(0, Number(o.collected_amount || o.total) - (wageExpenses.get(o.id)?.amount || 0)), 0);
    const electronicTotal = recognized
      .filter((o) => retailSettlementType(o.payment_method) === "electronic")
      .reduce((s, o) => s + Number(o.total), 0);
    const totalCouponDiscount = recognized.reduce(
      (s, o) => s + Number((o as any).coupon_discount_amount || 0) + Number((o as any).coupon_delivery_waived || 0),
      0,
    );
    let driverDeliveryShare = 0;
    let appDeliveryShare = 0;
    for (const order of recognized) {
      const fee = Math.max(0, Number(order.delivery_fee) || 0);
      const wage = Math.min(fee, wages.get(order.id) || 0);
      driverDeliveryShare += wage;
      appDeliveryShare += fee - wage;
    }
    const salaryDisbursed = salaryInView.reduce((s, payout) => s + Number(payout.amount || 0), 0);
    const wageDisbursed = recognized.reduce((s, o) => s + (wageExpenses.get(o.id)?.amount || 0), 0);
    const disbursed = wageDisbursed + salaryDisbursed;
    const transferOrders = filteredOrders.filter((o) => retailSettlementType(o.payment_method) === "transfer").length;
    const transferTotal = recognized
      .filter((o) => retailSettlementType(o.payment_method) === "transfer")
      .reduce((s, o) => s + Number(o.total), 0);
    const cashOrderCount = filteredOrders.filter((o) => retailSettlementType(o.payment_method) === "cash").length;
    const electronicOrderCount = filteredOrders.filter(
      (o) => retailSettlementType(o.payment_method) === "electronic",
    ).length;
    return {
      totalRevenue,
      totalDeliveryFees,
      driverDeliveryShare,
      appDeliveryShare,
      balance: totalRevenue - disbursed,
      disbursed,
      wageDisbursed,
      salaryDisbursed,
      cashOnHand: electronicTotal + transferTotal + driverCashCollected - salaryDisbursed,
      cashOrderCount,
      electronicOrderCount,
      transferOrders,
      driverCashPending,
      driverCashCollected,
      electronicTotal,
      transferTotal,
      totalOrders: filteredOrders.length,
      deliveredCount: recognized.length,
      totalCouponDiscount,
    };
  }, [filteredOrders, wageExpenses, wages, salaryInView]);

  const exportExcel = () => {
    const periodLabels: Record<DateFilter, string> = {
      today: "اليوم",
      week: "هذا الأسبوع",
      month: "هذا الشهر",
      custom: "فترة مخصصة",
    };
    downloadSalesExcel({
      periodLabel: periodLabels[dateFilter],
      from: dateRange.from,
      to: dateRange.to,
      stats,
      movements: ledgerLines.map((line) => {
        const order = line.order;
        const expense = line.kind === "expense";
        const settlement = order ? retailSettlementType(order.payment_method) : null;
        const collection = order ? retailCollectionStatus(order) : null;
        return {
          at: line.at,
          kind: expense ? "خرج" as const : "دخل" as const,
          description: line.label,
          orderNumber: order ? String(order.order_number) : "—",
          customer: order?.customer_name || "—",
          driver: line.driverName,
          income: expense ? 0 : line.amount,
          expense: expense ? line.amount : 0,
          payMethod: settlement ? SETTLEMENT_TYPE_LABEL[settlement] : "راتب",
          status: expense ? "تم الصرف" : collection ? COLLECTION_STATUS_LABEL[collection] : "—",
        };
      }),
    });
    toast.success("تم تنزيل ملف إكسل للحسابات");
  };

  if (isLoading) {
    return (
      <AdminLayout title="الحسابات والمبيعات">
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      </AdminLayout>
    );
  }

  if (isError) {
    return (
      <AdminLayout title="الحسابات والمبيعات">
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-destructive">
          تعذر تحميل الحسابات{error instanceof Error ? `: ${error.message}` : ""}
        </div>
      </AdminLayout>
    );
  }

  const relatedPeriod = dateFilter === "today" || dateFilter === "week" ? dateFilter : "all";
  const collectionLinks = {
    drivers: `/admin/collections?tab=retail-drivers&period=${relatedPeriod}`,
  };

  const money = (amount: number) => `${amount.toFixed(2)} ر.س`;

  const renderStat = (card: {
    title: string;
    value: string;
    hint?: string;
    lines?: { label: string; value: string }[];
    icon: typeof DollarSign;
    color: string;
    to?: string;
  }) => {
    const inner = (
      <Card className={cn("h-full", card.to && "hover:shadow-md hover:border-primary/40 cursor-pointer transition-shadow")}>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
          <card.icon className={`h-4 w-4 ${card.color}`} />
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xl font-bold" dir={card.value.includes(" / ") ? "ltr" : undefined}>{card.value}</p>
          {card.hint ? <p className="text-[11px] leading-relaxed text-muted-foreground">{card.hint}</p> : null}
          {card.lines?.length ? (
            <div className="space-y-1 border-t pt-2">
              {card.lines.map((line) => (
                <div key={line.label} className="flex items-start justify-between gap-2 text-xs">
                  <span className="min-w-0 leading-snug text-muted-foreground">{line.label}</span>
                  <span dir="ltr" className="shrink-0 font-semibold tabular-nums whitespace-nowrap">{line.value}</span>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>
    );
    if (!card.to) return <div key={card.title}>{inner}</div>;
    return (
      <Link key={card.title} to={card.to} className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
        {inner}
      </Link>
    );
  };

  const resultCards = [
    { title: "إجمالي الإيرادات", value: money(stats.totalRevenue), hint: "ما دفعه العملاء في الطلبات المكتملة", icon: DollarSign, color: "text-green-600" },
    {
      title: "رسوم التوصيل",
      value: money(stats.totalDeliveryFees),
      hint: "من قيمة الطلبات المكتملة",
      icon: Truck,
      color: "text-orange-600",
      lines: [
        { label: "للمناديب", value: money(stats.driverDeliveryShare) },
        { label: "للتطبيق", value: money(stats.appDeliveryShare) },
      ],
    },
    {
      title: "إجمالي المنصرف",
      value: money(stats.disbursed),
      hint: "ما خرج فعلاً من الحساب",
      icon: Banknote,
      color: "text-rose-700",
      lines: [
        { label: "مصروفات نسب المناديب", value: money(stats.wageDisbursed) },
        { label: "مصروفات رواتب المناديب", value: money(stats.salaryDisbursed) },
      ],
    },
    { title: "الرصيد", value: money(stats.balance), hint: "الإيرادات ناقص المنصرف الفعلي", icon: TrendingUp, color: "text-emerald-700" },
  ];

  const cashCards = [
    {
      title: "دفع إلكتروني",
      value: money(stats.electronicTotal),
      hint: stats.transferTotal > 0 ? `تحويل بنكي: ${money(stats.transferTotal)}` : "وصل إلى البنك مع الطلب",
      icon: CreditCard,
      color: "text-indigo-600",
    },
    {
      title: "نقد محصّل من المناديب",
      value: money(stats.driverCashCollected),
      hint: "ما سلّمه المندوب بعد خصم أجره",
      icon: Building2,
      color: "text-emerald-600",
      to: collectionLinks.drivers,
    },
    {
      title: "نقد بانتظار التحصيل",
      value: money(stats.driverCashPending),
      hint: "ما زال مع المندوب، بعد خصم أجره",
      icon: Truck,
      color: "text-blue-600",
      to: collectionLinks.drivers,
    },
    { title: "خصومات القسائم", value: money(stats.totalCouponDiscount), hint: "مخصومة أصلاً من الإيراد", icon: Banknote, color: "text-rose-600" },
    { title: "الرصيد الحالي", value: money(stats.cashOnHand), hint: "ما وصل للبنك وللمحصل بعد خصم الرواتب المصروفة. لا يشمل النقد الذي ما زال مع المندوب", icon: Wallet, color: "text-emerald-600" },
  ];

  const orderCards = [
    { title: "إجمالي الطلبات", value: String(stats.totalOrders), hint: "كل الطلبات في الفترة", icon: ShoppingCart, color: "text-primary" },
    { title: "الطلبات المكتملة", value: String(stats.deliveredCount), hint: "كاش مسلّم، أو إلكتروني مدفوع ومسلّم", icon: ShoppingCart, color: "text-green-600" },
    {
      title: "نوع الطلبات",
      value: `${stats.cashOrderCount} / ${stats.electronicOrderCount}`,
      hint: "كاش / دفع إلكتروني",
      icon: CreditCard,
      color: "text-amber-600",
      lines: stats.transferOrders > 0 ? [{ label: "تحويل", value: String(stats.transferOrders) }] : undefined,
    },
  ];

  return (
    <AdminLayout title="الحسابات والمبيعات">
      <p className="text-sm text-muted-foreground mb-4">
        كل سطر إيراد هو قيمة الطلب. المنصرف إما أجر خُصم عند التسوية أو راتب صُرف من تبويب الأجور. نوع السداد وحالة التحصيل مرتبطان بـ{" "}
        <Link to="/admin/collections" className="text-primary underline-offset-2 hover:underline">
          مركز التحصيل
        </Link>{" "}
        — النقد مع المناديب يُستلم من تبويب مناديب التجزئة.
      </p>
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

        <Button size="sm" variant="outline" onClick={exportExcel} className="mr-auto">
          <Download className="ml-1 h-4 w-4" />تصدير إكسل
        </Button>
      </div>

      <div className="space-y-6 mb-6">
        <section>
          <h2 className="text-sm font-semibold">النتيجة</h2>
          <p className="text-xs text-muted-foreground mb-2 text-right">ما دخل من الطلبات المكتملة، وما خُصم منه أجراً أو راتباً.</p>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">{resultCards.map(renderStat)}</div>
        </section>
        <section>
          <h2 className="text-sm font-semibold">التحصيل والنقد</h2>
          <p className="text-xs text-muted-foreground mb-2 text-right">أين المال الآن: في البنك، عند المحصل، أو ما زال مع المندوب.</p>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">{cashCards.map(renderStat)}</div>
        </section>
        <section>
          <h2 className="text-sm font-semibold">الطلبات</h2>
          <p className="text-xs text-muted-foreground mb-2 text-right">حجم العمل في الفترة، وعدد الكاش مقابل الدفع الإلكتروني.</p>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">{orderCards.map(renderStat)}</div>
        </section>
      </div>

      {/* Filters for details table */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="بحث برقم الطلب أو اسم العميل..." value={searchOrder} onChange={(e) => setSearchOrder(e.target.value)} className="pr-9" />
        </div>
        <Select value={custodyFilter} onValueChange={(v) => setCustodyFilter(v as CustodyFilter)}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="الحالة" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الطلبات</SelectItem>
            <SelectItem value="with_driver">لم يتم التحصيل (نقد)</SelectItem>
            <SelectItem value="remitted">تم التحصيل</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={settlementTypeFilter}
          onValueChange={(v) => setSettlementTypeFilter(v as SettlementTypeFilter)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="نوع السداد" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل أنواع السداد</SelectItem>
            <SelectItem value="cash">{SETTLEMENT_TYPE_LABEL.cash}</SelectItem>
            <SelectItem value="transfer">{SETTLEMENT_TYPE_LABEL.transfer}</SelectItem>
            <SelectItem value="electronic">{SETTLEMENT_TYPE_LABEL.electronic}</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={collectionStatusFilter}
          onValueChange={(v) => setCollectionStatusFilter(v as CollectionStatusFilter)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="حالة التحصيل" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل حالات التحصيل</SelectItem>
            <SelectItem value="collected">{COLLECTION_STATUS_LABEL.collected}</SelectItem>
            <SelectItem value="not_collected">{COLLECTION_STATUS_LABEL.not_collected}</SelectItem>
          </SelectContent>
        </Select>
        <Badge variant="outline">{ledgerLines.length} عملية</Badge>
      </div>

      {/* Orders detail table */}
      <div className="bg-card rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-right p-3 font-medium">#</th>
                <th className="text-right p-3 font-medium">العملية</th>
                <th className="text-right p-3 font-medium">اسم العميل</th>
                <th className="text-right p-3 font-medium">الجوال</th>
                <th className="text-right p-3 font-medium">المبلغ</th>
                <th className="text-right p-3 font-medium">التوصيل</th>
                <th className="text-right p-3 font-medium">قسيمة</th>
                <th className="text-right p-3 font-medium">الأثر</th>
                <th className="text-center p-3 font-medium">نوع السداد</th>
                <th className="text-center p-3 font-medium">حالة التحصيل</th>
                <th className="text-right p-3 font-medium">المندوب</th>
                <th className="text-right p-3 font-medium">التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {ledgerLines.length === 0 ? (
                <tr><td colSpan={12} className="p-8 text-center text-muted-foreground">لا توجد عمليات في الفترة المحددة</td></tr>
              ) : (
                ledgerLines.map((line) => {
                  const o = line.order;
                  const st = o ? retailSettlementType(o.payment_method) : null;
                  const cs: CollectionStatusKey | null = o ? retailCollectionStatus(o) : null;
                  const expense = line.kind === "expense";
                  return (
                    <tr
                      key={line.key}
                      className={cn(
                        "border-b last:border-0",
                        expense ? "bg-rose-50/70 hover:bg-rose-50" : "hover:bg-muted/10",
                      )}
                    >
                      <td className="p-3 font-medium">{o ? o.order_number : "—"}</td>
                      <td className="p-3">
                        <Badge className={expense ? "bg-rose-100 text-rose-800 hover:bg-rose-100" : "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"}>
                          {expense ? "منصرف" : "إيراد"}
                        </Badge>
                        <p className="mt-1 text-[11px] text-muted-foreground">{line.label}</p>
                      </td>
                      <td className="p-3">{o?.customer_name || "—"}</td>
                      <td className="p-3 text-muted-foreground">{expense || !o ? "—" : o.customer_phone || "—"}</td>
                      <td className="p-3">{expense ? `${line.amount.toFixed(2)} ر.س` : `${Number(o?.subtotal || 0).toFixed(2)} ر.س`}</td>
                      <td className="p-3">{expense || !o ? "—" : `${Number(o.delivery_fee).toFixed(2)} ر.س`}</td>
                      <td className="p-3 text-rose-700">
                        {expense || !o
                          ? "—"
                          : Number((o as any).coupon_discount_amount || 0) > 0 ||
                            Number((o as any).coupon_delivery_waived || 0) > 0
                            ? `−${(
                                Number((o as any).coupon_discount_amount || 0) +
                                Number((o as any).coupon_delivery_waived || 0)
                              ).toFixed(2)}`
                            : "—"}
                      </td>
                      <td className={cn("p-3 font-bold", expense && "text-rose-700")}>
                        <span dir="ltr">{expense ? `−${line.amount.toFixed(2)}` : line.amount.toFixed(2)}</span> ر.س
                      </td>
                      <td className="p-3 text-center">
                        {st ? (
                          <Badge variant="outline" className={SETTLEMENT_TYPE_BADGE[st]}>
                            {SETTLEMENT_TYPE_LABEL[st]}
                          </Badge>
                        ) : (
                          <Badge variant="outline">راتب</Badge>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        {expense ? (
                          <Badge className="bg-rose-100 text-rose-800 border-0 hover:bg-rose-100">تم الصرف</Badge>
                        ) : cs ? (
                          <Badge className={COLLECTION_STATUS_BADGE[cs]}>
                            {COLLECTION_STATUS_LABEL[cs]}
                          </Badge>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="p-3">{line.driverName}</td>
                      <td className="p-3 text-muted-foreground text-xs">{format(new Date(line.at), "yyyy/MM/dd HH:mm")}</td>
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
