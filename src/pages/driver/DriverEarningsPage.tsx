import { useEffect, useMemo, useState } from "react";
import { Wallet, Truck, Star, Loader2, CalendarIcon, FileDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar as DatePicker } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useDriverAuth } from "@/hooks/useDriverAuth";
import DriverLayout from "@/components/driver/DriverLayout";
import {
  format,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  isWithinInterval,
  subDays,
} from "date-fns";
import { buildOrderLedger, type LedgerOrder } from "@/lib/driver-order-ledger";
import { openDriverTransactionsPrint } from "@/lib/driver-transactions-print";
import { DRIVER_COLLECTIONS_HINT, DriverTransactionsTable } from "@/components/driver/DriverTransactionsTable";

type DateFilter = "all" | "today" | "week" | "month" | "custom";

type DeliveredOrder = LedgerOrder & {
  collected_amount: number | null;
};

type WalletTx = {
  id: string;
  order_id: string | null;
  amount: number;
  notes: string | null;
  created_at: string;
  type: string;
};

const filterLabels: Record<DateFilter, string> = {
  all: "الكل",
  today: "يومي",
  week: "أسبوعي",
  month: "شهري",
  custom: "مخصص",
};

const periodTitles: Record<DateFilter, string> = {
  all: "كل المعاملات",
  today: "معاملات اليوم",
  week: "معاملات هذا الأسبوع",
  month: "معاملات هذا الشهر",
  custom: "معاملات الفترة المحددة",
};

const DriverEarningsPage = () => {
  const { loading: authLoading, driverId } = useDriverAuth();
  const [driver, setDriver] = useState<any>(null);
  const [orders, setOrders] = useState<DeliveredOrder[]>([]);
  const [txs, setTxs] = useState<WalletTx[]>([]);
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  useEffect(() => {
    if (!driverId) return;

    const fetchData = async () => {
      const { data: driverData } = await supabase
        .from("drivers")
        .select("*")
        .eq("id", driverId)
        .single();

      if (driverData) setDriver(driverData);

      const { data } = await supabase
        .from("orders")
        .select("id, order_number, delivery_fee, total, payment_method, delivered_at, created_at, cash_settled_at, collected_amount")
        .eq("driver_id", driverId)
        .eq("status", "delivered");

      setOrders((data || []) as DeliveredOrder[]);

      const { data: txRows } = await supabase
        .from("wallet_transactions")
        .select("id, order_id, amount, notes, created_at, type")
        .eq("driver_id", driverId)
        .in("type", ["settlement", "commission"])
        .order("created_at", { ascending: false });
      setTxs((txRows || []) as WalletTx[]);
    };

    fetchData();

    const channel = supabase
      .channel(`driver-settlements-${driverId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wallet_transactions", filter: `driver_id=eq.${driverId}` },
        () => { fetchData(); },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "driver_wallet", filter: `driver_id=eq.${driverId}` },
        () => { fetchData(); },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [driverId]);

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
        return {
          from: customFrom ? startOfDay(customFrom) : startOfDay(subDays(now, 30)),
          to: customTo ? endOfDay(customTo) : endOfDay(now),
        };
      default:
        return { from: startOfDay(subDays(now, 3650)), to: endOfDay(now) };
    }
  }, [dateFilter, customFrom, customTo]);

  const ledger = useMemo(
    () => buildOrderLedger({
      orders,
      wages: txs.filter((tx) => tx.type === "commission").map((tx) => ({ order_id: tx.order_id, amount: tx.amount })),
    }),
    [orders, txs],
  );

  const periodStats = useMemo(() => {
    const inPeriod = (iso: string | null) =>
      dateFilter === "all" || (!!iso && isWithinInterval(new Date(iso), { start: dateRange.from, end: dateRange.to }));
    const rows = orders.filter((order) => inPeriod(order.delivered_at));
    const collections = rows.reduce((s, order) => s + Number(order.collected_amount || 0), 0);
    const periodLedger = ledger.filter((row) => inPeriod(row.at));
    return { collections, deliveries: rows.length, periodLedger };
  }, [orders, dateRange, dateFilter, ledger]);

  const exportTransactions = async () => {
    if (!periodStats.periodLedger.length) {
      toast.error("لا معاملات في هذه الفترة");
      return;
    }
    try {
      await openDriverTransactionsPrint({
        driverName: driver?.full_name || "مندوب",
        from: dateFilter === "all" ? "" : format(dateRange.from, "yyyy-MM-dd"),
        to: dateFilter === "all" ? "" : format(dateRange.to, "yyyy-MM-dd"),
        rows: periodStats.periodLedger,
        hideSiteShare: true,
      });
    } catch {
      toast.error("تعذر فتح ملف الطباعة. اسمح بالنوافذ المنبثقة ثم أعد المحاولة");
    }
  };

  if (authLoading) {
    return (
      <DriverLayout title="التحصيلات">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DriverLayout>
    );
  }

  return (
    <DriverLayout title="التحصيلات والإحصائيات">
      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {(["all", "today", "week", "month", "custom"] as DateFilter[]).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={dateFilter === f ? "default" : "outline"}
              onClick={() => setDateFilter(f)}
            >
              {filterLabels[f]}
            </Button>
          ))}
        </div>

        {dateFilter === "custom" && (
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("flex-1 text-right", !customFrom && "text-muted-foreground")}>
                  <CalendarIcon className="ml-1 h-4 w-4" />
                  {customFrom ? format(customFrom, "yyyy/MM/dd") : "من تاريخ"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <DatePicker mode="single" selected={customFrom} onSelect={setCustomFrom} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
            <span className="text-sm text-muted-foreground">إلى</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("flex-1 text-right", !customTo && "text-muted-foreground")}>
                  <CalendarIcon className="ml-1 h-4 w-4" />
                  {customTo ? format(customTo, "yyyy/MM/dd") : "إلى تاريخ"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <DatePicker mode="single" selected={customTo} onSelect={setCustomTo} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-3 text-center">
              <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center mx-auto mb-1.5">
                <Wallet className="h-4 w-4" />
              </div>
              <p className="text-[11px] text-muted-foreground mb-0.5">التحصيلات</p>
              <p className="text-base font-bold text-primary leading-tight">{periodStats.collections.toFixed(0)}</p>
              <p className="text-[10px] text-muted-foreground">ر.س</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-500 flex items-center justify-center mx-auto mb-1.5">
                <Truck className="h-4 w-4" />
              </div>
              <p className="text-[11px] text-muted-foreground mb-0.5">الطلبات</p>
              <p className="text-base font-bold text-primary leading-tight">{periodStats.deliveries}</p>
              <p className="text-[10px] text-muted-foreground">طلب</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="w-8 h-8 rounded-lg bg-yellow-50 text-yellow-500 flex items-center justify-center mx-auto mb-1.5">
                <Star className="h-4 w-4" />
              </div>
              <p className="text-[11px] text-muted-foreground mb-0.5">التقييم</p>
              <p className="text-base font-bold text-primary leading-tight">{Number(driver?.rating || 5).toFixed(1)}</p>
              <p className="text-[10px] text-muted-foreground">من 5</p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-heading font-bold">المعاملات</h3>
            <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => void exportTransactions()}>
              <FileDown className="h-3.5 w-3.5 ml-1" />
              تصدير PDF
            </Button>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{DRIVER_COLLECTIONS_HINT}</p>
          <p className="text-xs text-muted-foreground">{periodTitles[dateFilter]}</p>
          <DriverTransactionsTable rows={periodStats.periodLedger} hideSiteShare />
        </div>
      </div>
    </DriverLayout>
  );
};

export default DriverEarningsPage;
