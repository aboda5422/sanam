import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import {
  canViewCashierCashCollectionTab,
  canViewDriverCashCollectionTab,
} from "@/lib/staff-access";
import { supabase } from "@/integrations/supabase/client";
import {
  DATE_PERIOD_OPTIONS,
  DEFAULT_WHOLESALE_PERIOD,
  datePeriodRange,
  isoInRange,
  rangeIsoBounds,
  type DatePeriod,
} from "@/lib/date-period-filter";
import { openDriverCashSupplyReceiptPrint } from "@/lib/driver-cash-supply-receipt-print";
import { openCashierCashSupplyReceiptPrint } from "@/lib/cashier-cash-supply-receipt-print";
import { openCollectionRegistryStatementPrint } from "@/lib/collection-registry-print";

export type RegistrySource = "all" | "retail_drivers" | "cashier";

const SOURCE_META: Record<
  Exclude<RegistrySource, "all">,
  { label: string; filterLabel: string }
> = {
  retail_drivers: { label: "المناديب", filterLabel: "المناديب" },
  cashier: { label: "كاشير POS", filterLabel: "تحصيل الكاش من الكاشير" },
};

export type RegistryEntry = {
  id: string;
  source: Exclude<RegistrySource, "all">;
  occurredAt: string;
  amount: number;
  partyLabel: string;
  partyKey: string;
  detail: string | null;
  receiptRef: string;
  channel?: "retail";
  driverPhone?: string | null;
  cashierMeta?: {
    branchName?: string | null;
    stationName?: string | null;
    shiftOpenedAt?: string | null;
    shiftStatus?: string | null;
  };
};

function isCashDriverSettlement(type: string, notes: string | null) {
  return type === "settlement" && !(notes || "").includes("أجور التوصيل");
}

async function resolveProfileName(userId: string | null | undefined) {
  if (!userId) return null;
  const { data } = await supabase.from("profiles").select("full_name").eq("user_id", userId).maybeSingle();
  return data?.full_name?.trim() || null;
}

export function CollectionRegistryTab() {
  const { role, userId, navPaths } = useAdminAuth();
  const canRetailDrivers = canViewDriverCashCollectionTab(role, "retail", navPaths);
  const canCashier = canViewCashierCashCollectionTab(role, navPaths);

  const [period, setPeriod] = useState<DatePeriod>(DEFAULT_WHOLESALE_PERIOD);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [source, setSource] = useState<RegistrySource>("all");
  const [partyKey, setPartyKey] = useState("all");
  const [partySearch, setPartySearch] = useState("");

  const range = useMemo(
    () => datePeriodRange(period, customFrom, customTo),
    [period, customFrom, customTo],
  );
  const { fromIso, toIso } = useMemo(
    () => rangeIsoBounds(range.from, range.to),
    [range.from, range.to],
  );

  const enabledSources = useMemo(
    () => ({
      retail_drivers: canRetailDrivers,
      cashier: canCashier,
    }),
    [canRetailDrivers, canCashier],
  );

  const { data: entries = [], isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["collection-registry", period, customFrom, customTo, enabledSources, fromIso, toIso],
    queryFn: async () => {
      const out: RegistryEntry[] = [];

      if (enabledSources.retail_drivers) {
        let wq = supabase
          .from("wallet_transactions")
          .select("id, amount, notes, created_at, type, driver_id, drivers(full_name, phone)")
          .eq("type", "settlement")
          .order("created_at", { ascending: false })
          .limit(800);
        if (fromIso) wq = wq.gte("created_at", fromIso);
        if (toIso) wq = wq.lte("created_at", toIso);
        const { data, error: qErr } = await wq;
        if (qErr) throw qErr;
        for (const tx of data || []) {
          if (!isCashDriverSettlement(tx.type, tx.notes)) continue;
          const noteText = tx.notes || "";
          // سجل التوريدات النقدية فقط — تسوية الشبكة ليست توريد كاش للمحصل
          if (noteText.includes("شبكة") || noteText.includes("تحويل")) continue;
          if (!isoInRange(tx.created_at, range.from, range.to)) continue;
          const name =
            (tx.drivers as { full_name?: string })?.full_name ||
            (tx.drivers as { phone?: string })?.phone ||
            tx.driver_id.slice(0, 8);
          out.push({
            id: `rd-${tx.id}`,
            source: "retail_drivers",
            occurredAt: tx.created_at,
            amount: Number(tx.amount),
            partyLabel: name,
            partyKey: tx.driver_id,
            detail: tx.notes,
            receiptRef: tx.id.slice(0, 8).toUpperCase(),
            channel: "retail",
            driverPhone: (tx.drivers as { phone?: string | null })?.phone,
          });
        }
      }

      if (enabledSources.cashier) {
        let cq = supabase
          .from("pos_shift_cash_collections")
          .select(
            "id, amount, created_at, note, cashier_id, branches(name), pos_stations(name)",
          )
          .order("created_at", { ascending: false })
          .limit(500);
        if (fromIso) cq = cq.gte("created_at", fromIso);
        if (toIso) cq = cq.lte("created_at", toIso);
        const { data, error } = await cq;
        if (error) {
          console.warn("[collection-registry] pos_shift_cash_collections", error.message);
        } else {
          const cashierIds = [...new Set((data || []).map((c) => c.cashier_id))];
          const nameMap = new Map<string, string>();
          if (cashierIds.length) {
            const { data: profiles } = await supabase
              .from("profiles")
              .select("user_id, full_name")
              .in("user_id", cashierIds);
            for (const p of profiles || []) {
              if (p.user_id) nameMap.set(p.user_id, p.full_name?.trim() || p.user_id.slice(0, 8));
            }
          }
          for (const c of data || []) {
            if (!isoInRange(c.created_at, range.from, range.to)) continue;
            const cashierName = nameMap.get(c.cashier_id) || c.cashier_id.slice(0, 8);
            out.push({
              id: `cs-${c.id}`,
              source: "cashier",
              occurredAt: c.created_at,
              amount: Number(c.amount),
              partyLabel: cashierName,
              partyKey: c.cashier_id,
              detail:
                c.note || [c.branches?.name, c.pos_stations?.name].filter(Boolean).join(" · ") || null,
              receiptRef: c.id.slice(0, 8).toUpperCase(),
              cashierMeta: {
                branchName: c.branches?.name,
                stationName: c.pos_stations?.name,
              },
            });
          }
        }
      }

      out.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
      return out;
    },
  });

  const sourceOptions = useMemo(() => {
    const opts: { id: RegistrySource; label: string }[] = [{ id: "all", label: "كل جهات التوريد" }];
    (Object.keys(SOURCE_META) as Exclude<RegistrySource, "all">[]).forEach((key) => {
      if (enabledSources[key]) opts.push({ id: key, label: SOURCE_META[key].filterLabel });
    });
    return opts;
  }, [enabledSources]);

  const entriesForPartyList = useMemo(() => {
    if (source === "all") return entries;
    return entries.filter((e) => e.source === source);
  }, [entries, source]);

  const partyOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of entriesForPartyList) {
      if (!map.has(e.partyKey)) map.set(e.partyKey, e.partyLabel);
    }
    return [...map.entries()]
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "ar"));
  }, [entriesForPartyList]);

  const filtered = useMemo(() => {
    let list = entries;
    if (source !== "all") list = list.filter((e) => e.source === source);
    if (partyKey !== "all") list = list.filter((e) => e.partyKey === partyKey);
    const q = partySearch.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (e) =>
          e.partyLabel.toLowerCase().includes(q) ||
          (e.detail || "").toLowerCase().includes(q) ||
          e.receiptRef.toLowerCase().includes(q),
      );
    }
    return list;
  }, [entries, source, partyKey, partySearch]);

  const subtotals = useMemo(() => {
    const sums: Partial<Record<Exclude<RegistrySource, "all">, number>> = {};
    for (const e of filtered) {
      sums[e.source] = (sums[e.source] || 0) + e.amount;
    }
    return (Object.keys(SOURCE_META) as Exclude<RegistrySource, "all">[])
      .filter((k) => (sums[k] || 0) > 0)
      .map((k) => ({ label: SOURCE_META[k].label, amount: sums[k] || 0 }));
  }, [filtered]);

  const grandTotal = useMemo(() => filtered.reduce((s, e) => s + e.amount, 0), [filtered]);

  const printRowReceipt = async (e: RegistryEntry) => {
    try {
      const collectorName = await resolveProfileName(userId);
      if (e.source === "retail_drivers") {
        await openDriverCashSupplyReceiptPrint({
          driverName: e.partyLabel,
          driverPhone: e.driverPhone,
          amount: e.amount,
          collectedAt: e.occurredAt,
          channel: "retail",
          collectorName,
          receiptRef: e.receiptRef,
        });
      } else if (e.source === "cashier") {
        await openCashierCashSupplyReceiptPrint({
          cashierName: e.partyLabel,
          branchName: e.cashierMeta?.branchName,
          stationName: e.cashierMeta?.stationName,
          shiftOpenedAt: e.cashierMeta?.shiftOpenedAt,
          shiftStatus: e.cashierMeta?.shiftStatus,
          amount: e.amount,
          collectedAt: e.occurredAt,
          collectorName,
          receiptRef: e.receiptRef,
        });
      }
    } catch {
      toast.message("تعذر فتح الإيصال — اسمح بالنوافذ المنبثقة");
    }
  };

  const printStatement = async () => {
    try {
      const printedBy = await resolveProfileName(userId);
      const sourceLabel =
        source === "all" ? "كل جهات التوريد" : SOURCE_META[source].filterLabel;
      const partyLabel =
        partyKey === "all"
          ? partySearch.trim() || "الكل"
          : partyOptions.find((p) => p.key === partyKey)?.label || partyKey;
      await openCollectionRegistryStatementPrint({
        period,
        customFrom,
        customTo,
        sourceFilterLabel: sourceLabel,
        partyFilterLabel: partyLabel,
        printedBy,
        rows: filtered.map((e) => ({
          occurredAt: e.occurredAt,
          sourceLabel: SOURCE_META[e.source].label,
          partyLabel: e.partyLabel,
          amount: e.amount,
          detail: e.detail,
          receiptRef: e.receiptRef,
        })),
        subtotals,
        grandTotal,
      });
    } catch {
      toast.message("تعذر طباعة الكشف — اسمح بالنوافذ المنبثقة");
    }
  };

  const onSourceChange = (v: RegistrySource) => {
    setSource(v);
    setPartyKey("all");
  };

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
        <p className="text-sm text-destructive font-medium">تعذر تحميل سجل التوريدات</p>
        <p className="text-xs text-muted-foreground">
          {(error as { message?: string })?.message || "خطأ غير معروف"}
        </p>
        <Button type="button" variant="outline" size="sm" disabled={isFetching} onClick={() => void refetch()}>
          {isFetching ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : null}
          إعادة المحاولة
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground leading-relaxed max-w-3xl">
        سجل موحّد لتوريدات مركز التحصيل في الفترة المحددة — للمطابقة وطباعة الكشوفات وإعادة طباعة
        سندات التوريد حسب جهة التوريد أو اسم المندوب / الكاشير.
      </p>

      <div className="flex flex-wrap items-end gap-2 p-3 rounded-xl border bg-muted/20">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">الفترة</Label>
          <Select value={period} onValueChange={(v) => setPeriod(v as DatePeriod)}>
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
              <Input type="date" className="h-9 w-36" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">إلى</Label>
              <Input type="date" className="h-9 w-36" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </div>
          </>
        )}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">جهة التوريد</Label>
          <Select value={source} onValueChange={(v) => onSourceChange(v as RegistrySource)}>
            <SelectTrigger className="w-48 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sourceOptions.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">الطرف (مندوب / كاشير)</Label>
          <Select value={partyKey} onValueChange={setPartyKey}>
            <SelectTrigger className="w-52 h-9">
              <SelectValue placeholder="الكل" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              {partyOptions.map((p) => (
                <SelectItem key={p.key} value={p.key}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 min-w-[140px] flex-1">
          <Label className="text-xs text-muted-foreground">بحث سريع</Label>
          <Input
            className="h-9"
            placeholder="اسم، مرجع، ملاحظة…"
            value={partySearch}
            onChange={(e) => setPartySearch(e.target.value)}
          />
        </div>
        <Button type="button" className="h-9 gap-1.5" onClick={() => void printStatement()}>
          <Printer className="h-4 w-4" />
          طباعة كشف
        </Button>
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <span>
          العمليات: <strong>{filtered.length}</strong>
        </span>
        <span>
          الإجمالي: <strong>{grandTotal.toFixed(2)} ر.س</strong>
        </span>
        {subtotals.map((s) => (
          <span key={s.label} className="text-muted-foreground">
            {s.label}: <strong className="text-foreground">{s.amount.toFixed(2)}</strong>
          </span>
        ))}
      </div>

      <div className="bg-card rounded-xl border overflow-hidden">
        {filtered.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">لا توجد توريدات مطابقة للفلاتر</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-right p-3 font-medium">التاريخ</th>
                  <th className="text-right p-3 font-medium">جهة التوريد</th>
                  <th className="text-right p-3 font-medium">الطرف</th>
                  <th className="text-right p-3 font-medium">تفاصيل</th>
                  <th className="text-right p-3 font-medium">المبلغ</th>
                  <th className="text-center p-3 font-medium">مرجع</th>
                  <th className="text-center p-3 font-medium">إيصال</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.id} className="border-b last:border-0 hover:bg-muted/10">
                    <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(e.occurredAt).toLocaleString("ar-SA")}
                    </td>
                    <td className="p-3">{SOURCE_META[e.source].label}</td>
                    <td className="p-3 font-medium">{e.partyLabel}</td>
                    <td className="p-3 text-xs text-muted-foreground max-w-[200px] truncate">{e.detail || "—"}</td>
                    <td className="p-3 font-bold whitespace-nowrap">{e.amount.toFixed(2)} ر.س</td>
                    <td className="p-3 text-center text-xs font-mono">{e.receiptRef}</td>
                    <td className="p-3 text-center">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1"
                        onClick={() => void printRowReceipt(e)}
                      >
                        <Printer className="h-3.5 w-3.5" />
                        طباعة
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
