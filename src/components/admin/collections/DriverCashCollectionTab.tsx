import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Printer, ScrollText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { canSettleDriverCashAtHub } from "@/lib/staff-access";
import { supabase } from "@/integrations/supabase/client";
import {
  DATE_PERIOD_OPTIONS,
  DEFAULT_WHOLESALE_PERIOD,
  datePeriodRange,
  isoInRange,
  type DatePeriod,
} from "@/lib/date-period-filter";
import { openDriverCashSupplyReceiptPrint } from "@/lib/driver-cash-supply-receipt-print";
import { emptyDriverPosition, loadDriverOpenPositions, type DriverOpenPosition } from "@/lib/driver-open-position";

type DriverChannel = "wholesale" | "retail";

type WalletTx = {
  id: string;
  amount: number;
  notes: string | null;
  created_at: string;
  type: string;
  driver_id: string;
  drivers?: { full_name?: string | null; phone?: string | null } | null;
};

function isCashSettlement(tx: Pick<WalletTx, "type" | "notes">) {
  const notes = tx.notes || "";
  return tx.type === "settlement" && !notes.includes("أجور التوصيل") && !notes.includes("صرف أجر");
}

function settlementMethodLabel(notes: string | null) {
  const n = notes || "";
  if (n.includes("شبكة") || n.includes("تحويل")) return "شبكة";
  return "كاش";
}

function PeriodFilters({
  period,
  onPeriodChange,
  customFrom,
  customTo,
  onCustomFrom,
  onCustomTo,
}: {
  period: DatePeriod;
  onPeriodChange: (p: DatePeriod) => void;
  customFrom: string;
  customTo: string;
  onCustomFrom: (v: string) => void;
  onCustomTo: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">الفترة</Label>
        <Select value={period} onValueChange={(v) => onPeriodChange(v as DatePeriod)}>
          <SelectTrigger className="w-32 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DATE_PERIOD_OPTIONS.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {period === "custom" && (
        <>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">من</Label>
            <Input type="date" className="h-9 w-36" value={customFrom} onChange={(e) => onCustomFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">إلى</Label>
            <Input type="date" className="h-9 w-36" value={customTo} onChange={(e) => onCustomTo(e.target.value)} />
          </div>
        </>
      )}
    </div>
  );
}

async function resolveCollectorName(userId: string | null | undefined) {
  if (!userId) return null;
  const { data } = await supabase.from("profiles").select("full_name").eq("user_id", userId).maybeSingle();
  return data?.full_name?.trim() || null;
}

export function DriverCashCollectionTab({ channel }: { channel: DriverChannel }) {
  const { role, userId } = useAdminAuth();
  const canSettle = canSettleDriverCashAtHub(role, channel);
  const qc = useQueryClient();
  const [log, setLog] = useState<{ driverId: string; name: string } | null>(null);
  const [period, setPeriod] = useState<DatePeriod>(DEFAULT_WHOLESALE_PERIOD);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const range = useMemo(
    () => datePeriodRange(period, customFrom, customTo),
    [period, customFrom, customTo],
  );

  const { data: wallets, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-wallets", channel],
    queryFn: async () => {
      const { data, error: qErr } = await supabase
        .from("driver_wallet")
        .select("*, drivers(phone, full_name, pay_type, unpaid_delivery_pay)")
        .order("created_at", { ascending: false });
      if (qErr) throw qErr;
      // مشروع سنام تجزئة فقط — لا يوجد عمود drivers.channel
      return data || [];
    },
  });

  const { data: periodSettlements = [], isLoading: settlementsLoading } = useQuery({
    queryKey: ["admin-driver-cash-settlements", channel, period, customFrom, customTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wallet_transactions")
        .select("id, amount, notes, created_at, type, driver_id, drivers(full_name, phone)")
        .eq("type", "settlement")
        .order("created_at", { ascending: false })
        .limit(400);
      if (error) throw error;
      return ((data || []) as WalletTx[]).filter(
        (tx) => isCashSettlement(tx) && isoInRange(tx.created_at, range.from, range.to),
      );
    },
  });

  const { data: openPositions = new Map<string, DriverOpenPosition>() } = useQuery({
    queryKey: ["driver-open-positions"],
    queryFn: loadDriverOpenPositions,
  });

  const withBalance = useMemo(
    () => (wallets || []).filter((w) => (openPositions.get(w.driver_id) || emptyDriverPosition()).cashDue > 0),
    [wallets, openPositions],
  );

  const periodTotal = useMemo(
    () => periodSettlements.reduce((s, tx) => s + Number(tx.amount || 0), 0),
    [periodSettlements],
  );

  const { data: logTxs, isLoading: logLoading } = useQuery({
    queryKey: ["admin-driver-wallet-log", log?.driverId, "cash", period, customFrom, customTo],
    enabled: !!log?.driverId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wallet_transactions")
        .select("id, amount, notes, created_at, type")
        .eq("driver_id", log!.driverId)
        .eq("type", "settlement")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data || []) as WalletTx[])
        .filter(isCashSettlement)
        .filter((tx) => isoInRange(tx.created_at, range.from, range.to));
    },
  });

  const printSupplyReceipt = async (opts: {
    driverName: string;
    driverPhone?: string | null;
    amount: number;
    collectedAt: string;
    receiptRef?: string | null;
  }) => {
    try {
      const collectorName = await resolveCollectorName(userId);
      await openDriverCashSupplyReceiptPrint({
        ...opts,
        channel,
        collectorName,
      });
    } catch {
      toast.message("تم التسوية — اسمح بالنوافذ المنبثقة لطباعة سند التوريد");
    }
  };

  const settleMutation = useMutation({
    mutationFn: async ({
      driverId,
      type,
    }: {
      driverId: string;
      driverName: string;
      driverPhone?: string | null;
      type: "cash" | "card";
    }) => {
      const { data, error } = await supabase.rpc("settle_driver_wallet", {
        p_driver_id: driverId,
        p_method: type,
      });
      if (error) throw error;
      return data as { amount?: number };
    },
    onSuccess: async (data, vars) => {
      const amount = Number(data?.amount || 0);
      toast.success(`تم استلام ${amount.toFixed(2)} ر.س من المندوب`);
      qc.invalidateQueries({ queryKey: ["admin-wallets"] });
      qc.invalidateQueries({ queryKey: ["admin-sales-orders"] });
      qc.invalidateQueries({ queryKey: ["admin-driver-cash-collections"] });
      qc.invalidateQueries({ queryKey: ["admin-collection-registry"] });
      qc.invalidateQueries({ queryKey: ["admin-kpi-stats"] });
      qc.invalidateQueries({ queryKey: ["admin-driver-wallet-log"] });
      qc.invalidateQueries({ queryKey: ["admin-driver-cash-settlements"] });
      qc.invalidateQueries({ queryKey: ["collection-registry"] });
      qc.invalidateQueries({ queryKey: ["driver-open-positions"] });
      qc.invalidateQueries({ queryKey: ["admin-driver-wages"] });
      if (amount > 0) {
        await printSupplyReceipt({
          driverName: vars.driverName,
          driverPhone: vars.driverPhone,
          amount,
          collectedAt: new Date().toISOString(),
        });
      }
    },
    onError: (e: { message?: string }) => toast.error(e.message || "فشل في التسوية"),
  });

  const payNetworkWage = useMutation({
    mutationFn: async (driverId: string) => {
      const { data, error } = await supabase.rpc("pay_driver_network_wages" as never, {
        p_driver_id: driverId,
      } as never);
      if (error) throw error;
      return data as { amount?: number };
    },
    onSuccess: (data) => {
      toast.success(`صُرف للمندوب ${Number(data?.amount || 0).toFixed(2)} ر.س أجر الشبكة`);
      qc.invalidateQueries({ queryKey: ["driver-open-positions"] });
      qc.invalidateQueries({ queryKey: ["admin-wallets"] });
      qc.invalidateQueries({ queryKey: ["admin-driver-wages"] });
      qc.invalidateQueries({ queryKey: ["admin-drivers"] });
    },
    onError: (e: { message?: string }) => toast.error(e.message || "تعذر صرف أجر الشبكة"),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 space-y-3 text-center">
        <p className="text-sm text-destructive font-medium">تعذر تحميل محافظ المناديب</p>
        <p className="text-xs text-muted-foreground">
          {(error as { message?: string })?.message || "خطأ غير معروف"}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
          إعادة المحاولة
        </Button>
      </div>
    );
  }

  const channelLabel = "المناديب";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
          الكاش: المحصل يستلم ما تبقى بعد أجر المندوب، لا كامل قيمة الطلب. الشبكة: قيمة الطلب وصلت البنك، ويظهر هنا أجر المندوب فقط ليُصرف له. التسوية في <strong>مركز التحصيل</strong>{" "}
          (محاسب / أدمن).
          {!canSettle && " حسابك للعرض فقط — لا يملك صلاحية التسوية."}
        </p>
        <PeriodFilters
          period={period}
          onPeriodChange={setPeriod}
          customFrom={customFrom}
          customTo={customTo}
          onCustomFrom={setCustomFrom}
          onCustomTo={setCustomTo}
        />
      </div>

      <div className="bg-card rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-right p-3 font-medium">المندوب</th>
                <th className="text-right p-3 font-medium">عليه للمحصل</th>
                <th className="text-right p-3 font-medium">له من الشبكة</th>
                <th className="text-right p-3 font-medium">إجمالي التحصيل</th>
                <th className="text-center p-3 font-medium">سجل</th>
                <th className="text-center p-3 font-medium">استلام المحصل</th>
              </tr>
            </thead>
            <tbody>
              {(wallets || []).map((w) => {
                const name =
                  (w.drivers as { full_name?: string; phone?: string })?.full_name ||
                  (w.drivers as { phone?: string })?.phone ||
                  "مندوب";
                const phone = (w.drivers as { phone?: string })?.phone;
                const pos = openPositions.get(w.driver_id) || { cashDue: 0, cardWage: 0 };
                return (
                  <tr key={w.id} className="border-b last:border-0 hover:bg-muted/10">
                    <td className="p-3 font-medium">{name}</td>
                    <td className="p-3 font-bold text-amber-600">
                      {pos.cashDue > 0 ? (
                        <Link
                          to={`/admin/drivers?tab=wallets&tx=${w.driver_id}`}
                          className="underline-offset-2 hover:underline"
                          title="تفاصيل المعاملات في الأجور"
                        >
                          {pos.cashDue.toFixed(2)} ر.س
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className={`p-3 font-bold ${pos.cardWage > 0 ? "text-emerald-700" : ""}`}>
                      {pos.cardWage > 0 ? `${pos.cardWage.toFixed(2)} ر.س` : "—"}
                    </td>
                    <td className="p-3">{Number(w.total_collected).toFixed(2)} ر.س</td>
                    <td className="p-3 text-center">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-7 gap-1"
                        onClick={() => setLog({ driverId: w.driver_id, name })}
                      >
                        <ScrollText className="h-3.5 w-3.5" />
                        سجل
                      </Button>
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        {canSettle && pos.cashDue > 0 ? (
                          <Button
                            size="sm"
                            variant="default"
                            className="text-xs h-7"
                            disabled={settleMutation.isPending}
                            onClick={() =>
                              settleMutation.mutate({
                                driverId: w.driver_id,
                                driverName: name,
                                driverPhone: phone,
                                type: "cash",
                              })
                            }
                          >
                            استلام {pos.cashDue.toFixed(2)}
                          </Button>
                        ) : null}
                        {canSettle && pos.cardWage > 0 ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-7"
                            disabled={payNetworkWage.isPending}
                            onClick={() => payNetworkWage.mutate(w.driver_id)}
                          >
                            صرف أجره {pos.cardWage.toFixed(2)}
                          </Button>
                        ) : null}
                        {pos.cashDue <= 0 && pos.cardWage <= 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!wallets?.length && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground">
                    لا توجد محافظ لهذا المسار
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {withBalance.length > 0 && canSettle ? (
        <p className="text-xs text-muted-foreground">
          {withBalance.length} مندوب لديهم نقد بانتظار الاستلام في {channelLabel}.
        </p>
      ) : null}

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-sm">توريدات النقد في الفترة ({periodSettlements.length})</h3>
          <p className="text-sm text-muted-foreground">
            الإجمالي: <strong>{periodTotal.toFixed(2)} ر.س</strong>
          </p>
        </div>
        <div className="bg-card rounded-xl border overflow-hidden">
          {settlementsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : periodSettlements.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              لا توجد تسويات نقد في الفترة المحددة
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-right p-3 font-medium">المندوب</th>
                    <th className="text-right p-3 font-medium">المبلغ</th>
                    <th className="text-right p-3 font-medium">التاريخ</th>
                    <th className="text-center p-3 font-medium">سند التوريد</th>
                  </tr>
                </thead>
                <tbody>
                  {periodSettlements.map((tx) => {
                    const name =
                      tx.drivers?.full_name || tx.drivers?.phone || tx.driver_id.slice(0, 8);
                    return (
                      <tr key={tx.id} className="border-b last:border-0 hover:bg-muted/10">
                        <td className="p-3 font-medium">{name}</td>
                        <td className="p-3 font-bold">{Number(tx.amount).toFixed(2)} ر.س</td>
                        <td className="p-3 text-muted-foreground text-xs">
                          {new Date(tx.created_at).toLocaleString("ar-SA")}
                        </td>
                        <td className="p-3 text-center">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-7 gap-1"
                            onClick={() =>
                              void printSupplyReceipt({
                                driverName: name,
                                driverPhone: tx.drivers?.phone,
                                amount: Number(tx.amount),
                                collectedAt: tx.created_at,
                                receiptRef: tx.id.slice(0, 8).toUpperCase(),
                              })
                            }
                          >
                            <Printer className="h-3.5 w-3.5" />
                            طباعة
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <Dialog open={!!log} onOpenChange={(open) => !open && setLog(null)}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>سجل تسوية النقد — {log?.name}</DialogTitle>
          </DialogHeader>
          {logLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : !logTxs?.length ? (
            <p className="text-sm text-muted-foreground py-6 text-center">لا توجد تسويات في هذه الفترة</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {logTxs.map((tx) => (
                <li
                  key={tx.id}
                  className="rounded-lg border px-3 py-2 flex flex-wrap justify-between gap-2 items-center"
                >
                  <div>
                    <span>{settlementMethodLabel(tx.notes)} · </span>
                    <span className="font-medium">{Number(tx.amount).toFixed(2)} ر.س</span>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(tx.created_at).toLocaleString("ar-SA")}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs gap-1"
                    onClick={() =>
                      void printSupplyReceipt({
                        driverName: log!.name,
                        amount: Number(tx.amount),
                        collectedAt: tx.created_at,
                        receiptRef: tx.id.slice(0, 8).toUpperCase(),
                      })
                    }
                  >
                    <Printer className="h-3 w-3" />
                    إيصال
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
