import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Gauge, Loader2, Save, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { DEFAULT_DRIVER_LIMITS, DRIVER_LIMITS_KEY, type DriverLimits } from "@/lib/driver-limits";

export function useDriverLimitsSetting() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["store-settings", DRIVER_LIMITS_KEY],
    queryFn: async () => {
      const { data: row, error } = await supabase
        .from("store_settings")
        .select("value")
        .eq("key", DRIVER_LIMITS_KEY)
        .maybeSingle();
      if (error) throw error;
      return {
        ...DEFAULT_DRIVER_LIMITS,
        ...((row?.value as Partial<DriverLimits>) || {}),
      };
    },
  });

  const mutation = useMutation({
    mutationFn: async (value: DriverLimits) => {
      const { error } = await supabase
        .from("store_settings")
        .upsert({ key: DRIVER_LIMITS_KEY, value }, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["store-settings", DRIVER_LIMITS_KEY] });
      toast.success("تم حفظ تفعيل الحدود");
    },
    onError: () => toast.error("تعذر الحفظ"),
  });

  return {
    data: data ?? DEFAULT_DRIVER_LIMITS,
    isLoading,
    save: mutation.mutate,
    saving: mutation.isPending,
  };
}

type DriverRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
  max_active_orders?: number | null;
  max_cash_on_hand?: number | null;
  status?: string;
};

/** In-tab panel: global toggles, driver list, and per-driver limits (no extra launcher). */
export function DriverLimitsPanel({ drivers }: { drivers: DriverRow[] }) {
  const qc = useQueryClient();
  const { data: globalLimits, save: saveGlobal, saving: savingGlobal } = useDriverLimitsSetting();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<DriverRow | null>(null);
  const [maxOrders, setMaxOrders] = useState("4");
  const [maxCash, setMaxCash] = useState("1000");
  const [enforceForm, setEnforceForm] = useState<DriverLimits | null>(null);
  const enforce = enforceForm ?? globalLimits;

  const filtered = useMemo(() => {
    const q = search.trim();
    return (drivers || []).filter((d) => {
      if (!q) return true;
      return (d.full_name || "").includes(q) || (d.phone || "").includes(q);
    });
  }, [drivers, search]);

  const openDriver = (d: DriverRow) => {
    setSelected(d);
    setMaxOrders(String(d.max_active_orders ?? globalLimits.max_active_orders ?? 4));
    setMaxCash(String(d.max_cash_on_hand ?? globalLimits.max_cash_on_hand ?? 1000));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("اختر مندوباً");
      const { error } = await supabase
        .from("drivers")
        .update({
          max_active_orders: Math.max(1, Number(maxOrders) || 1),
          max_cash_on_hand: Math.max(0, Number(maxCash) || 0),
        })
        .eq("id", selected.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حفظ حدود المندوب");
      qc.invalidateQueries({ queryKey: ["admin-drivers"] });
      setSelected(null);
    },
    onError: (e: any) => toast.error(e.message || "فشل الحفظ"),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Gauge className="h-5 w-5 text-amber-600" />
            حدود الاستلام
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            إذا بلغ المندوب حد الطلبات النشطة، أو تجاوز النقد غير المسوّى حد المبلغ، يتوقف عن استلام طلبات جديدة حتى يُكمل الطلبات أو تُسوّى العهدة.
          </p>
        </div>
        {enforceForm && (
          <Button size="sm" disabled={savingGlobal} onClick={() => saveGlobal(enforceForm)}>
            {savingGlobal ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <Save className="h-4 w-4 ml-1" />}
            حفظ التفعيل
          </Button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-center justify-between gap-4 rounded-2xl border bg-card p-4">
          <div>
            <p className="font-medium">حد الطلبات النشطة</p>
            <p className="text-xs text-muted-foreground mt-0.5">يسري على كل المناديب</p>
          </div>
          <Switch
            checked={!!enforce.enforce_active_orders}
            onCheckedChange={(v) => setEnforceForm({ ...enforce, enforce_active_orders: v })}
          />
        </div>
        <div className="flex items-center justify-between gap-4 rounded-2xl border bg-card p-4">
          <div>
            <p className="font-medium">حد الكاش</p>
            <p className="text-xs text-muted-foreground mt-0.5">يسري على كل المناديب</p>
          </div>
          <Switch
            checked={!!enforce.enforce_cash_limit}
            onCheckedChange={(v) => setEnforceForm({ ...enforce, enforce_cash_limit: v })}
          />
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="بحث عن مندوب..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pr-9"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">لا يوجد مناديب مسجّلون</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((d) => {
            const isActive = selected?.id === d.id;
            return (
              <div
                key={d.id}
                className={`rounded-2xl border bg-card p-4 ${isActive ? "border-primary ring-1 ring-primary" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{d.full_name || "بدون اسم"}</p>
                    {d.phone ? (
                      <p className="text-xs text-muted-foreground mt-0.5" dir="ltr">
                        {d.phone}
                      </p>
                    ) : null}
                  </div>
                  {!isActive && (
                    <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => openDriver(d)}>
                      تعديل
                    </Button>
                  )}
                </div>

                {isActive ? (
                  <div className="mt-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">أقصى طلبات نشطة</Label>
                        <Input type="number" min={1} dir="ltr" value={maxOrders} onChange={(e) => setMaxOrders(e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">حد الكاش (ر.س)</Label>
                        <Input type="number" min={0} dir="ltr" value={maxCash} onChange={(e) => setMaxCash(e.target.value)} />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button className="flex-1" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
                        {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <Save className="h-4 w-4 ml-1" />}
                        حفظ
                      </Button>
                      <Button type="button" variant="outline" onClick={() => setSelected(null)}>
                        إلغاء
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-muted/50 px-3 py-2">
                      <p className="text-[11px] text-muted-foreground">الطلبات</p>
                      <p className="font-semibold">{d.max_active_orders ?? "—"}</p>
                    </div>
                    <div className="rounded-xl bg-muted/50 px-3 py-2">
                      <p className="text-[11px] text-muted-foreground">الكاش</p>
                      <p className="font-semibold">
                        {d.max_cash_on_hand != null ? `${Number(d.max_cash_on_hand).toFixed(0)} ر.س` : "—"}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
