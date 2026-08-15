import { useEffect, useMemo, useState } from "react";
import { Wallet, Truck, Star, Loader2, CalendarIcon, BadgeCheck, ScrollText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar as DatePicker } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
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

type DateFilter = "today" | "week" | "month" | "custom";

type DeliveredOrder = {
  collected_amount: number | null;
  delivered_at: string | null;
};

type WalletTx = {
  id: string;
  amount: number;
  notes: string | null;
  created_at: string;
  type: string;
};

function isWageTx(tx: WalletTx) {
  if (tx.type === "commission") return true;
  return tx.type === "settlement" && (tx.notes || "").includes("أجور التوصيل");
}

function wageKindLabel(tx: WalletTx) {
  if (tx.type === "commission") return "أجر توصيلة";
  return "سداد";
}

function isCashSettlement(tx: WalletTx) {
  if (tx.type !== "settlement") return false;
  const notes = tx.notes || "";
  return !notes.includes("أجور التوصيل");
}

function settlementMethodLabel(notes: string | null) {
  const n = notes || "";
  if (n.includes("شبكة") || n.includes("تحويل")) return "شبكة";
  return "كاش";
}

const filterLabels: Record<DateFilter, string> = {
  today: "يومي",
  week: "أسبوعي",
  month: "شهري",
  custom: "مخصص",
};

const periodTitles: Record<DateFilter, string> = {
  today: "إحصائيات اليوم",
  week: "إحصائيات هذا الأسبوع",
  month: "إحصائيات هذا الشهر",
  custom: "إحصائيات الفترة المحددة",
};

const DriverEarningsPage = () => {
  const { loading: authLoading, driverId } = useDriverAuth();
  const [driver, setDriver] = useState<any>(null);
  const [orders, setOrders] = useState<DeliveredOrder[]>([]);
  const [settlements, setSettlements] = useState<WalletTx[]>([]);
  const [wageLog, setWageLog] = useState<WalletTx[]>([]);
  const [walletBalance, setWalletBalance] = useState(0);
  const [dateFilter, setDateFilter] = useState<DateFilter>("today");
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [logOpen, setLogOpen] = useState(false);
  const [wageLogOpen, setWageLogOpen] = useState(false);

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
        .select("collected_amount, delivered_at")
        .eq("driver_id", driverId)
        .eq("status", "delivered");

      setOrders((data || []) as DeliveredOrder[]);

      const { data: wallet } = await supabase
        .from("driver_wallet")
        .select("balance")
        .eq("driver_id", driverId)
        .maybeSingle();
      setWalletBalance(Number(wallet?.balance || 0));

      const { data: txs } = await supabase
        .from("wallet_transactions")
        .select("id, amount, notes, created_at, type")
        .eq("driver_id", driverId)
        .in("type", ["settlement", "commission"])
        .order("created_at", { ascending: false });
      const all = (txs || []) as WalletTx[];
      setSettlements(all.filter(isCashSettlement));
      setWageLog(all.filter(isWageTx));
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
    }
  }, [dateFilter, customFrom, customTo]);

  const periodStats = useMemo(() => {
    const rows = orders.filter((o) => {
      if (!o.delivered_at) return false;
      return isWithinInterval(new Date(o.delivered_at), { start: dateRange.from, end: dateRange.to });
    });
    const collections = rows.reduce((s, o) => s + Number(o.collected_amount || 0), 0);
    const deliveries = rows.length;
    const fee = Number(driver?.per_delivery_fee || 0);
    const periodWage = driver?.pay_type === "per_order" ? deliveries * fee : 0;
    const periodSettlements = settlements.filter((tx) =>
      isWithinInterval(new Date(tx.created_at), { start: dateRange.from, end: dateRange.to }),
    );
    const settledAmount = periodSettlements.reduce((s, tx) => s + Number(tx.amount || 0), 0);
    return { collections, deliveries, periodWage, periodSettlements, settledAmount };
  }, [orders, dateRange, driver, settlements]);

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
      <div className="p-4 md:p-6 max-w-lg mx-auto space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {(["today", "week", "month", "custom"] as DateFilter[]).map((f) => (
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

        <Card>
          <CardContent className="p-4 space-y-4">
            <h3 className="font-heading font-bold">{periodTitles[dateFilter]}</h3>

            {driver?.pay_type === "per_order" && (
              <div className="rounded-xl border bg-emerald-50/60 p-3 space-y-2">
                <p className="text-sm font-medium">أجر التوصيل من المتجر</p>
                <p className="text-xs text-muted-foreground">
                  {Number(driver.per_delivery_fee || 0).toFixed(2)} ر.س عن كل توصيلة مكتملة
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">أجر الفترة</span>
                  <span className="font-bold">{periodStats.periodWage.toFixed(2)} ر.س</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">المستحق غير المسدد</span>
                  <span className="font-bold text-lg">{Number(driver.unpaid_delivery_pay || 0).toFixed(2)} ر.س</span>
                </div>
                <p className="text-[11px] text-muted-foreground">يُصفَّر الرصيد غير المسدد عند سداد الإدارة</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full bg-white/80"
                  onClick={() => setWageLogOpen(true)}
                  disabled={wageLog.length === 0}
                >
                  <ScrollText className="h-4 w-4 ml-1" />
                  سجل الأجر
                  {wageLog.length > 0 ? ` (${wageLog.length})` : ""}
                </Button>
                {wageLog.length === 0 && (
                  <p className="text-[11px] text-muted-foreground">لا توجد حركات أجر مسجّلة بعد</p>
                )}
              </div>
            )}

            <div className="rounded-xl border bg-amber-50/70 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <BadgeCheck className="h-4 w-4 text-amber-700" />
                <p className="text-sm font-medium">تسوية التحصيل مع الفرع</p>
              </div>
              <p className="text-xs text-muted-foreground">يثبت استلام مدير الفرع للمبالغ النقدية التي حصّلتها كاش</p>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">نقد لا يزال بحوزتك</span>
                <span className="font-bold">{walletBalance.toFixed(2)} ر.س</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">تم تسويته في الفترة</span>
                <span className="font-bold text-lg">{periodStats.settledAmount.toFixed(2)} ر.س</span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full bg-white/80"
                onClick={() => setLogOpen(true)}
                disabled={settlements.length === 0}
              >
                <ScrollText className="h-4 w-4 ml-1" />
                سجل التسوية
                {settlements.length > 0 ? ` (${settlements.length})` : ""}
              </Button>
              {settlements.length === 0 && (
                <p className="text-[11px] text-muted-foreground">لا توجد تسويات مسجّلة بعد</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Dialog open={wageLogOpen} onOpenChange={setWageLogOpen}>
          <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto" dir="rtl">
            <DialogHeader>
              <DialogTitle>سجل الأجر</DialogTitle>
            </DialogHeader>
            {wageLog.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">لا توجد حركات أجر بعد</p>
            ) : (
              <div className="space-y-2">
                {wageLog.map((tx) => (
                  <div key={tx.id} className="rounded-xl border p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold">{Number(tx.amount).toFixed(2)} ر.س</span>
                      <span className={`text-xs rounded-full px-2 py-0.5 ${
                        tx.type === "commission"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-blue-100 text-blue-800"
                      }`}>
                        {wageKindLabel(tx)}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {new Date(tx.created_at).toLocaleString("ar-SA", {
                        weekday: "long",
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    {tx.notes && (
                      <p className="text-xs text-muted-foreground">{tx.notes}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={logOpen} onOpenChange={setLogOpen}>
          <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto" dir="rtl">
            <DialogHeader>
              <DialogTitle>سجل التسوية</DialogTitle>
            </DialogHeader>
            {settlements.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">لا توجد تسويات بعد</p>
            ) : (
              <div className="space-y-2">
                {settlements.map((tx) => (
                  <div key={tx.id} className="rounded-xl border p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold">{Number(tx.amount).toFixed(2)} ر.س</span>
                      <span className="text-xs rounded-full bg-amber-100 text-amber-800 px-2 py-0.5">
                        {settlementMethodLabel(tx.notes)}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {new Date(tx.created_at).toLocaleString("ar-SA", {
                        weekday: "long",
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    {tx.notes && (
                      <p className="text-xs text-muted-foreground">{tx.notes}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DriverLayout>
  );
};

export default DriverEarningsPage;
