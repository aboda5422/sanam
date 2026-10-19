import { useMemo, useState } from "react";
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
import { canCollectPosCashAtHub } from "@/lib/staff-access";
import { applyBranchFilter } from "@/lib/branch-scope";
import { supabase } from "@/integrations/supabase/client";
import {
  DATE_PERIOD_OPTIONS,
  DEFAULT_DATE_PERIOD,
  datePeriodRange,
  isoInRange,
  type DatePeriod,
} from "@/lib/date-period-filter";
import { openCashierCashSupplyReceiptPrint } from "@/lib/cashier-cash-supply-receipt-print";

type ShiftRow = {
  id: string;
  branch_id: string;
  station_id: string;
  cashier_id: string;
  opened_at: string;
  closed_at: string | null;
  status: string;
  opening_cash: number;
  cash_collected_total: number;
  branches?: { name?: string | null } | null;
  pos_stations?: { name?: string | null; code?: string | null } | null;
};

type ShiftPaymentTotals = { cashSales: number; networkSales: number };

type ShiftWithPending = ShiftRow & {
  pending: number;
  cashSales: number;
  networkSales: number;
  /** opening + cash sales + network (full shift check total). */
  grandTotal: number;
};

type CollectionRow = {
  id: string;
  shift_id: string;
  amount: number;
  created_at: string;
  note: string | null;
  collected_by: string | null;
  cashier_id: string;
  branch_id: string;
  station_id: string;
  branches?: { name?: string | null } | null;
  pos_stations?: { name?: string | null } | null;
  cashSales?: number;
  networkSales?: number;
  openingCash?: number;
};

async function fetchShiftPaymentTotals(shiftIds: string[]) {
  const unique = [...new Set(shiftIds.filter(Boolean))];
  const map = new Map<string, ShiftPaymentTotals>();
  for (const id of unique) map.set(id, { cashSales: 0, networkSales: 0 });
  if (!unique.length) return map;

  const { data, error } = await supabase
    .from("pos_sales")
    .select("shift_id, status, pos_payments(method, amount)")
    .in("shift_id", unique)
    .eq("status", "completed");
  if (error) throw error;

  for (const sale of data || []) {
    const shiftId = (sale as { shift_id?: string }).shift_id;
    if (!shiftId) continue;
    const cur = map.get(shiftId) || { cashSales: 0, networkSales: 0 };
    const payments = ((sale as { pos_payments?: { method?: string; amount?: number }[] | null })
      .pos_payments || []) as { method?: string; amount?: number }[];
    for (const p of payments) {
      const amt = Number(p.amount || 0);
      if ((p.method || "") === "cash") cur.cashSales += amt;
      else cur.networkSales += amt; // card / transfer / other → شبكة
    }
    map.set(shiftId, cur);
  }
  return map;
}

function moneyCell(n: number, className = "") {
  return (
    <td className={`p-3 whitespace-nowrap tabular-nums ${className}`} dir="ltr">
      {n.toFixed(2)} ر.س
    </td>
  );
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

async function resolveProfileName(userId: string | null | undefined) {
  if (!userId) return null;
  const { data } = await supabase.from("profiles").select("full_name").eq("user_id", userId).maybeSingle();
  return data?.full_name?.trim() || null;
}

async function fetchCashierNames(ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map<string, string>();
  const { data } = await supabase.from("profiles").select("user_id, full_name").in("user_id", unique);
  const map = new Map<string, string>();
  for (const row of data || []) {
    if (row.user_id) map.set(row.user_id, row.full_name?.trim() || row.user_id.slice(0, 8));
  }
  return map;
}

export function CashierCashCollectionTab() {
  const { role, userId, scopedBranchIds } = useAdminAuth();
  const canCollect = canCollectPosCashAtHub(role);
  const qc = useQueryClient();
  const [shiftLog, setShiftLog] = useState<{ shiftId: string; label: string } | null>(null);
  const [period, setPeriod] = useState<DatePeriod>(DEFAULT_DATE_PERIOD);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const range = useMemo(
    () => datePeriodRange(period, customFrom, customTo),
    [period, customFrom, customTo],
  );

  const { data: pendingShifts = [], isLoading } = useQuery({
    queryKey: ["admin-pos-cash-pending-shifts", scopedBranchIds],
    queryFn: async () => {
      if (scopedBranchIds && scopedBranchIds.length === 0) return [];
      let sq = supabase
        .from("pos_shifts")
        .select(
          "id, branch_id, station_id, cashier_id, opened_at, closed_at, status, opening_cash, cash_collected_total, branches(name), pos_stations(name, code)",
        )
        .in("status", ["open", "closed"])
        .order("opened_at", { ascending: false })
        .limit(150);
      sq = applyBranchFilter(sq, scopedBranchIds);
      const { data: shifts, error } = await sq;
      if (error) throw error;
      const rows = (shifts || []) as unknown as ShiftRow[];
      const payMap = await fetchShiftPaymentTotals(rows.map((s) => s.id));
      const withPending = await Promise.all(
        rows.map(async (s) => {
          const { data: pending, error: pe } = await supabase.rpc("pos_shift_cash_pending" as any, {
            p_shift_id: s.id,
          });
          if (pe) throw pe;
          const pay = payMap.get(s.id) || { cashSales: 0, networkSales: 0 };
          const opening = Number(s.opening_cash || 0);
          return {
            ...s,
            pending: Number(pending || 0),
            cashSales: pay.cashSales,
            networkSales: pay.networkSales,
            grandTotal: opening + pay.cashSales + pay.networkSales,
          };
        }),
      );
      return withPending.filter((s) => s.pending > 0.009) as ShiftWithPending[];
    },
  });

  const cashierNameMap = useQuery({
    queryKey: ["admin-pos-cashier-names", pendingShifts.map((s) => s.cashier_id).join(",")],
    queryFn: () => fetchCashierNames(pendingShifts.map((s) => s.cashier_id)),
    enabled: pendingShifts.length > 0,
  });

  const { data: periodCollections = [], isLoading: collectionsLoading } = useQuery({
    queryKey: ["admin-pos-shift-cash-collections", period, customFrom, customTo, scopedBranchIds],
    queryFn: async () => {
      if (scopedBranchIds && scopedBranchIds.length === 0) return [];
      let cq = supabase
        .from("pos_shift_cash_collections" as any)
        .select(
          "id, shift_id, amount, created_at, note, collected_by, cashier_id, branch_id, station_id, branches(name), pos_stations(name)",
        )
        .order("created_at", { ascending: false })
        .limit(400);
      cq = applyBranchFilter(cq, scopedBranchIds);
      const { data, error } = await cq;
      if (error) throw error;
      const rows = ((data || []) as CollectionRow[]).filter((c) =>
        isoInRange(c.created_at, range.from, range.to),
      );
      if (!rows.length) return rows;

      const payMap = await fetchShiftPaymentTotals(rows.map((c) => c.shift_id));
      const shiftIds = [...new Set(rows.map((c) => c.shift_id))];
      const { data: shiftMeta } = await supabase
        .from("pos_shifts")
        .select("id, opening_cash")
        .in("id", shiftIds);
      const openingByShift = new Map(
        ((shiftMeta || []) as { id: string; opening_cash: number }[]).map((s) => [
          s.id,
          Number(s.opening_cash || 0),
        ]),
      );

      return rows.map((c) => {
        const pay = payMap.get(c.shift_id) || { cashSales: 0, networkSales: 0 };
        return {
          ...c,
          openingCash: openingByShift.get(c.shift_id) || 0,
          cashSales: pay.cashSales,
          networkSales: pay.networkSales,
        };
      });
    },
  });

  const periodCashierNames = useQuery({
    queryKey: [
      "admin-pos-period-cashier-names",
      periodCollections.map((c) => c.cashier_id).join(","),
    ],
    queryFn: () => fetchCashierNames(periodCollections.map((c) => c.cashier_id)),
    enabled: periodCollections.length > 0,
  });

  const { data: shiftLogRows = [], isLoading: shiftLogLoading } = useQuery({
    queryKey: ["admin-pos-shift-collections-log", shiftLog?.shiftId],
    enabled: !!shiftLog?.shiftId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pos_shift_cash_collections" as any)
        .select("id, amount, created_at, note, collected_by")
        .eq("shift_id", shiftLog!.shiftId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as { id: string; amount: number; created_at: string; note: string | null; collected_by: string | null }[];
    },
  });

  const periodTotal = useMemo(
    () => periodCollections.reduce((s, c) => s + Number(c.amount || 0), 0),
    [periodCollections],
  );

  /** Unique shifts in period collections — avoid double-counting opening/network. */
  const periodShiftBreakdown = useMemo(() => {
    const byShift = new Map<string, { opening: number; cash: number; network: number }>();
    for (const c of periodCollections) {
      if (byShift.has(c.shift_id)) continue;
      byShift.set(c.shift_id, {
        opening: Number(c.openingCash || 0),
        cash: Number(c.cashSales || 0),
        network: Number(c.networkSales || 0),
      });
    }
    let opening = 0;
    let cash = 0;
    let network = 0;
    for (const v of byShift.values()) {
      opening += v.opening;
      cash += v.cash;
      network += v.network;
    }
    return { opening, cash, network, grand: opening + cash + network };
  }, [periodCollections]);

  const printReceipt = async (opts: {
    cashierName: string;
    branchName?: string | null;
    stationName?: string | null;
    shiftOpenedAt?: string | null;
    shiftStatus?: string | null;
    amount: number;
    collectedAt: string;
    receiptRef?: string | null;
    openingCash?: number | null;
    cashSales?: number | null;
    networkSales?: number | null;
  }) => {
    try {
      const collectorName = await resolveProfileName(userId);
      await openCashierCashSupplyReceiptPrint({ ...opts, collectorName });
    } catch {
      toast.message("تم الاستلام — اسمح بالنوافذ المنبثقة لطباعة سند التوريد");
    }
  };

  const collectMutation = useMutation({
    mutationFn: async ({ shiftId }: { shiftId: string }) => {
      const shift = pendingShifts.find((s) => s.id === shiftId);
      if (
        scopedBranchIds?.length &&
        shift?.branch_id &&
        !scopedBranchIds.includes(shift.branch_id)
      ) {
        throw new Error("هذه الوردية خارج الفرع المحدد في الفلتر — لا يمكن خلط المسار المحاسبي بين الفروع");
      }
      const { data, error } = await supabase.rpc("collect_pos_shift_cash" as any, {
        p_shift_id: shiftId,
        p_amount: null,
        p_note: null,
      });
      if (error) throw error;
      return data as {
        collection_id?: string;
        amount?: number;
        pending_after?: number;
      };
    },
    onSuccess: async (data, vars) => {
      const amount = Number(data?.amount || 0);
      const shift = pendingShifts.find((s) => s.id === vars.shiftId);
      const cashierName =
        cashierNameMap.data?.get(shift?.cashier_id || "") ||
        shift?.cashier_id.slice(0, 8) ||
        "كاشير";
      toast.success(`تم استلام ${amount.toFixed(2)} ر.س من عهدة الكاشير`);
      qc.invalidateQueries({ queryKey: ["admin-pos-cash-pending-shifts"] });
      qc.invalidateQueries({ queryKey: ["admin-pos-shift-cash-collections"] });
      qc.invalidateQueries({ queryKey: ["admin-pos-shift-collections-log"] });
      qc.invalidateQueries({ queryKey: ["collection-registry"] });
      if (amount > 0 && shift) {
        await printReceipt({
          cashierName,
          branchName: shift.branches?.name,
          stationName: shift.pos_stations?.name || shift.pos_stations?.code,
          shiftOpenedAt: shift.opened_at,
          shiftStatus: shift.status,
          amount,
          collectedAt: new Date().toISOString(),
          receiptRef: data?.collection_id?.slice(0, 8).toUpperCase() || null,
          openingCash: Number(shift.opening_cash || 0),
          cashSales: shift.cashSales,
          networkSales: shift.networkSales,
        });
      }
    },
    onError: (e: { message?: string }) => toast.error(e.message || "فشل استلام النقد"),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const names = cashierNameMap.data || new Map<string, string>();
  const periodNames = periodCashierNames.data || new Map<string, string>();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
          المحصّل يراجع بالترتيب: <strong>العهدة</strong> (افتتاح الصندوق) ثم{" "}
          <strong>النقد</strong> (مبيعات كاش) ثم <strong>إيصالات الشبكة</strong> ثم{" "}
          <strong>المجموع</strong>. الاستلام يخص النقد فقط (عهدة + مبيعات نقد − ما سبق توريده)؛
          إيصالات الشبكة تُطابق ولا تُسلَّم نقداً.
          {!canCollect && " حسابك للعرض فقط — لا يملك صلاحية الاستلام."}
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
                <th className="text-right p-3 font-medium">الكاشير</th>
                <th className="text-right p-3 font-medium">الفرع / المحطة</th>
                <th className="text-right p-3 font-medium">الوردية</th>
                <th className="text-right p-3 font-medium">العهدة</th>
                <th className="text-right p-3 font-medium">نقد</th>
                <th className="text-right p-3 font-medium">شبكة</th>
                <th className="text-right p-3 font-medium">المجموع</th>
                <th className="text-right p-3 font-medium">نقد بانتظار الاستلام</th>
                <th className="text-center p-3 font-medium">سجل</th>
                <th className="text-center p-3 font-medium">استلام المحصل</th>
              </tr>
            </thead>
            <tbody>
              {pendingShifts.map((s) => {
                const cashierName = names.get(s.cashier_id) || s.cashier_id.slice(0, 8);
                const stationLabel =
                  s.pos_stations?.name || s.pos_stations?.code || s.station_id.slice(0, 8);
                const branchLabel = s.branches?.name || "—";
                const opening = Number(s.opening_cash || 0);
                return (
                  <tr key={s.id} className="border-b last:border-0 hover:bg-muted/10">
                    <td className="p-3 font-medium">{cashierName}</td>
                    <td className="p-3 text-muted-foreground text-xs">
                      {branchLabel}
                      <br />
                      {stationLabel}
                    </td>
                    <td className="p-3 text-xs">
                      <span className={s.status === "open" ? "text-emerald-700" : ""}>
                        {s.status === "open" ? "مفتوحة" : "مغلقة"}
                      </span>
                      <br />
                      {new Date(s.opened_at).toLocaleString("ar-SA")}
                    </td>
                    {moneyCell(opening, "text-sky-700")}
                    {moneyCell(s.cashSales)}
                    {moneyCell(s.networkSales, "text-violet-700")}
                    {moneyCell(s.grandTotal, "font-semibold")}
                    {moneyCell(s.pending, "font-bold text-amber-600")}
                    <td className="p-3 text-center">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-7 gap-1"
                        onClick={() =>
                          setShiftLog({
                            shiftId: s.id,
                            label: `${cashierName} — ${stationLabel}`,
                          })
                        }
                      >
                        <ScrollText className="h-3.5 w-3.5" />
                        سجل
                      </Button>
                    </td>
                    <td className="p-3 text-center">
                      {canCollect ? (
                        <Button
                          size="sm"
                          variant="default"
                          className="text-xs h-7"
                          disabled={collectMutation.isPending}
                          onClick={() => collectMutation.mutate({ shiftId: s.id })}
                        >
                          استلام النقد
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!pendingShifts.length && (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-muted-foreground">
                    لا توجد ورديات بعهدة نقد بانتظار الاستلام
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {pendingShifts.length > 0 && canCollect ? (
        <p className="text-xs text-muted-foreground">
          {pendingShifts.length} وردية بعهدة نقد بانتظار الاستلام في مركز التحصيل.
        </p>
      ) : null}

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-sm">
            توريدات كاشير POS في الفترة ({periodCollections.length})
          </h3>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs sm:text-sm text-muted-foreground">
            <span>
              نقد مستلم: <strong className="text-foreground">{periodTotal.toFixed(2)}</strong>
            </span>
            <span>
              عهدة الورديات:{" "}
              <strong className="text-sky-700">{periodShiftBreakdown.opening.toFixed(2)}</strong>
            </span>
            <span>
              مبيعات نقد: <strong className="text-foreground">{periodShiftBreakdown.cash.toFixed(2)}</strong>
            </span>
            <span>
              شبكة:{" "}
              <strong className="text-violet-700">{periodShiftBreakdown.network.toFixed(2)}</strong>
            </span>
            <span>
              مجموع الورديات:{" "}
              <strong className="text-foreground">{periodShiftBreakdown.grand.toFixed(2)}</strong>
            </span>
          </div>
        </div>
        <div className="bg-card rounded-xl border overflow-hidden">
          {collectionsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : periodCollections.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              لا توجد توريدات في الفترة المحددة
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-right p-3 font-medium">الكاشير</th>
                    <th className="text-right p-3 font-medium">الفرع</th>
                    <th className="text-right p-3 font-medium">العهدة</th>
                    <th className="text-right p-3 font-medium">نقد</th>
                    <th className="text-right p-3 font-medium">شبكة</th>
                    <th className="text-right p-3 font-medium">المجموع</th>
                    <th className="text-right p-3 font-medium">نقد مُورَّد</th>
                    <th className="text-right p-3 font-medium">التاريخ</th>
                    <th className="text-center p-3 font-medium">سند التوريد</th>
                  </tr>
                </thead>
                <tbody>
                  {periodCollections.map((c) => {
                    const cashierName = periodNames.get(c.cashier_id) || c.cashier_id.slice(0, 8);
                    const opening = Number(c.openingCash || 0);
                    const cash = Number(c.cashSales || 0);
                    const network = Number(c.networkSales || 0);
                    const grand = opening + cash + network;
                    return (
                      <tr key={c.id} className="border-b last:border-0 hover:bg-muted/10">
                        <td className="p-3 font-medium">{cashierName}</td>
                        <td className="p-3 text-muted-foreground text-xs">
                          {c.branches?.name || "—"}
                          {c.pos_stations?.name ? ` · ${c.pos_stations.name}` : ""}
                        </td>
                        {moneyCell(opening, "text-sky-700")}
                        {moneyCell(cash)}
                        {moneyCell(network, "text-violet-700")}
                        {moneyCell(grand, "font-semibold")}
                        {moneyCell(Number(c.amount), "font-bold")}
                        <td className="p-3 text-muted-foreground text-xs">
                          {new Date(c.created_at).toLocaleString("ar-SA")}
                        </td>
                        <td className="p-3 text-center">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-7 gap-1"
                            onClick={() =>
                              void printReceipt({
                                cashierName,
                                branchName: c.branches?.name,
                                stationName: c.pos_stations?.name,
                                amount: Number(c.amount),
                                collectedAt: c.created_at,
                                receiptRef: c.id.slice(0, 8).toUpperCase(),
                                openingCash: opening,
                                cashSales: cash,
                                networkSales: network,
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

      <Dialog open={!!shiftLog} onOpenChange={(open) => !open && setShiftLog(null)}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>سجل توريدات الوردية — {shiftLog?.label}</DialogTitle>
          </DialogHeader>
          {shiftLogLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : !shiftLogRows.length ? (
            <p className="text-sm text-muted-foreground py-6 text-center">لا توجد توريدات مسجّلة بعد</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {shiftLogRows.map((row) => (
                <li
                  key={row.id}
                  className="rounded-lg border px-3 py-2 flex flex-wrap justify-between gap-2 items-center"
                >
                  <div>
                    <span className="font-medium">{Number(row.amount).toFixed(2)} ر.س</span>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(row.created_at).toLocaleString("ar-SA")}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs gap-1"
                    onClick={() => {
                      const shift = pendingShifts.find((s) => s.id === shiftLog?.shiftId);
                      const cashierName =
                        names.get(shift?.cashier_id || "") || shift?.cashier_id.slice(0, 8) || "كاشير";
                      void printReceipt({
                        cashierName,
                        branchName: shift?.branches?.name,
                        stationName: shift?.pos_stations?.name,
                        shiftOpenedAt: shift?.opened_at,
                        shiftStatus: shift?.status,
                        amount: Number(row.amount),
                        collectedAt: row.created_at,
                        receiptRef: row.id.slice(0, 8).toUpperCase(),
                        openingCash: shift ? Number(shift.opening_cash || 0) : null,
                        cashSales: shift?.cashSales,
                        networkSales: shift?.networkSales,
                      });
                    }}
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
