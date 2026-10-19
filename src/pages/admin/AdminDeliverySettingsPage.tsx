import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Save, Loader2, Pencil, Plus, Trash2, Map as MapIcon, MapPin } from "lucide-react";
import { toast } from "sonner";
import DeliveryZonesEditor from "@/components/admin/DeliveryZonesEditor";
import { useAdminAuth } from "@/hooks/useAdminAuth";

type BranchRow = {
  id: string;
  name: string;
  city?: string | null;
  lat?: number | null;
  lng?: number | null;
  is_active: boolean;
  delivery_fee?: number | null;
  free_delivery_threshold?: number | null;
  min_order?: number | null;
  service_commission_percent?: number | null;
  /** رسوم لكل طلب / نقطة شراء بعد الأولى */
  extra_stop_fee?: number | null;
  delivery_zones?: { id: string; name: string; is_active: boolean }[];
  branch_delivery_rates?: {
    id: string;
    max_distance_km: number;
    fee: number;
    sort_order: number;
  }[];
};

const BranchFeeEditor = ({
  branch,
  saving,
  onSave,
}: {
  branch: BranchRow;
  saving: boolean;
  onSave: (vals: {
    delivery_fee: number;
    free_delivery_threshold: number;
    min_order: number;
    service_commission_percent: number;
    extra_stop_fee: number;
  }) => void;
}) => {
  const [deliveryFee, setDeliveryFee] = useState(String(Number(branch.delivery_fee ?? 10)));
  const [freeOver, setFreeOver] = useState(String(Number(branch.free_delivery_threshold ?? 100)));
  const [minOrder, setMinOrder] = useState(String(Number(branch.min_order ?? 20)));
  const [commissionPct, setCommissionPct] = useState(
    String(Number(branch.service_commission_percent ?? 8)),
  );
  const [extraStop, setExtraStop] = useState(String(Number(branch.extra_stop_fee ?? 0)));

  const dirty =
    Number(deliveryFee) !== Number(branch.delivery_fee ?? 10) ||
    Number(freeOver) !== Number(branch.free_delivery_threshold ?? 100) ||
    Number(minOrder) !== Number(branch.min_order ?? 20) ||
    Number(commissionPct) !== Number(branch.service_commission_percent ?? 8) ||
    Number(extraStop) !== Number(branch.extra_stop_fee ?? 0);

  return (
    <div className="rounded-lg bg-muted/50 p-3 space-y-2">
      <p className="text-xs font-semibold">رسوم الطلب لهذا الفرع</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <Label className="text-[11px]">رسوم احتياطية إن لم تُضبط شرائح (ر.س)</Label>
          <Input
            type="number"
            min={0}
            className="h-9"
            value={deliveryFee}
            onChange={(e) => setDeliveryFee(e.target.value)}
          />
          <p className="mt-1 text-[10px] text-muted-foreground leading-relaxed">
            ليست الشريحة الأولى. عند وجود شرائح مسافة يُستخدم سعر الشريحة المناسبة؛ هذا الحقل فقط إن لم توجد شرائح.
            عند حفظ الشرائح تُزامَن هذه القيمة تلقائياً مع رسوم أصغر شريحة (الأولى).
          </p>
        </div>
        <div>
          <Label className="text-[11px]">توصيل مجاني فوق (ر.س)</Label>
          <Input
            type="number"
            min={0}
            className="h-9"
            value={freeOver}
            onChange={(e) => setFreeOver(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-[11px]">أقل طلب (ر.س)</Label>
          <Input
            type="number"
            min={0}
            className="h-9"
            value={minOrder}
            onChange={(e) => setMinOrder(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-[11px]">عمولة الخدمة (%)</Label>
          <Input
            type="number"
            min={0}
            max={100}
            step={0.1}
            className="h-9"
            value={commissionPct}
            onChange={(e) => setCommissionPct(e.target.value)}
          />
        </div>
      </div>

      <div className="rounded-md border border-dashed border-border/80 bg-background/60 p-2.5 space-y-2">
        <p className="text-[11px] font-bold text-foreground">معادلة الطلبات المتعددة</p>
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          نجمع مسافات كل أماكن الشراء (متجر → العميل)، ثم نطبّق شريحة واحدة على الإجمالي.
          وكل نقطة شراء بعد الأولى تُضاف لها «رسوم الطلب الإضافي» فقط.
        </p>
        <div>
          <Label className="text-[11px]">رسوم الطلب الإضافي للعميل (ر.س / نقطة)</Label>
          <Input
            type="number"
            min={0}
            step={0.5}
            className="h-9"
            value={extraStop}
            onChange={(e) => setExtraStop(e.target.value)}
          />
          <p className="mt-1 text-[10px] text-muted-foreground">
            للنقطة الثانية والثالثة… أجور المندوب تُضبط في بطاقة كل مندوب بشكل مستقل.
          </p>
        </div>
      </div>

      <Button
        type="button"
        size="sm"
        className="h-8 w-full"
        disabled={!dirty || saving}
        onClick={() =>
          onSave({
            delivery_fee: Number(deliveryFee) || 0,
            free_delivery_threshold: Number(freeOver) || 0,
            min_order: Number(minOrder) || 0,
            service_commission_percent: Math.min(100, Math.max(0, Number(commissionPct) || 0)),
            extra_stop_fee: Math.max(0, Number(extraStop) || 0),
          })
        }
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin ml-1" /> : <Save className="h-3.5 w-3.5 ml-1" />}
        حفظ رسوم الفرع
      </Button>
    </div>
  );
};

const AdminDeliverySettingsPage = () => (
  <AdminLayout title="إعدادات التوصيل">
    <DeliverySettingsBody />
  </AdminLayout>
);

const DeliverySettingsBody = () => {
  const queryClient = useQueryClient();
  const { isSuperAdmin, scopedBranchIds } = useAdminAuth();

  const [zonesBranch, setZonesBranch] = useState<BranchRow | null>(null);
  const [ratesBranch, setRatesBranch] = useState<BranchRow | null>(null);
  const [rateDrafts, setRateDrafts] = useState<
    { id?: string; max_distance_km: number; fee: number }[]
  >([]);

  const { data: branches = [], isLoading: branchesLoading } = useQuery({
    queryKey: ["admin-branches-delivery", scopedBranchIds],
    queryFn: async () => {
      let q = supabase
        .from("branches")
        .select(
          "id, name, city, lat, lng, is_active, delivery_fee, free_delivery_threshold, min_order, service_commission_percent, extra_stop_fee, delivery_zones(id, name, is_active), branch_delivery_rates(id, max_distance_km, fee, sort_order)",
        )
        .order("name");
      if (scopedBranchIds && scopedBranchIds.length > 0) {
        q = q.in("id", scopedBranchIds);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as BranchRow[];
    },
  });

  const visibleBranches = useMemo(
    () => (isSuperAdmin ? branches : branches.filter((b) => b.is_active)),
    [branches, isSuperAdmin],
  );

  const saveRatesMutation = useMutation({
    mutationFn: async ({
      branchId,
      rates,
      existing,
    }: {
      branchId: string;
      rates: { id?: string; max_distance_km: number; fee: number }[];
      existing: BranchRow["branch_delivery_rates"];
    }) => {
      const keepIds = rates.filter((r) => r.id).map((r) => r.id!);
      const toDelete = (existing || []).filter((r) => !keepIds.includes(r.id)).map((r) => r.id);

      if (toDelete.length > 0) {
        const { error } = await supabase
          .from("branch_delivery_rates" as any)
          .delete()
          .in("id", toDelete);
        if (error) throw error;
      }

      for (let i = 0; i < rates.length; i++) {
        const r = rates[i];
        const row = {
          branch_id: branchId,
          max_distance_km: Number(r.max_distance_km),
          fee: Number(r.fee),
          sort_order: i,
        };
        if (r.id) {
          const { error } = await supabase
            .from("branch_delivery_rates" as any)
            .update(row)
            .eq("id", r.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("branch_delivery_rates" as any).insert(row);
          if (error) throw error;
        }
      }

      // Keep branch.delivery_fee aligned with the first (smallest km) customer tier —
      // used only as fallback when no rates match / rates missing.
      const firstTier = [...rates].sort(
        (a, b) => Number(a.max_distance_km) - Number(b.max_distance_km),
      )[0];
      if (firstTier) {
        const { error: feeErr } = await supabase
          .from("branches")
          .update({ delivery_fee: Number(firstTier.fee) || 0 } as any)
          .eq("id", branchId);
        if (feeErr) throw feeErr;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-branches-delivery"] });
      queryClient.invalidateQueries({ queryKey: ["admin-branches"] });
      queryClient.invalidateQueries({ queryKey: ["branch-delivery-rates"] });
      queryClient.invalidateQueries({ queryKey: ["active-branches"] });
      toast.success("تم حفظ شرائح التوصيل للعميل");
      setRatesBranch(null);
    },
    onError: (e: any) => toast.error(e?.message || "تعذر حفظ الأسعار"),
  });

  const saveFeesMutation = useMutation({
    mutationFn: async ({
      id,
      delivery_fee,
      free_delivery_threshold,
      min_order,
      service_commission_percent,
      extra_stop_fee,
    }: {
      id: string;
      delivery_fee: number;
      free_delivery_threshold: number;
      min_order: number;
      service_commission_percent: number;
      extra_stop_fee: number;
    }) => {
      const { error } = await supabase
        .from("branches")
        .update({
          delivery_fee,
          free_delivery_threshold,
          min_order,
          service_commission_percent,
          extra_stop_fee,
          extra_km_fee: 0,
        } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-branches-delivery"] });
      queryClient.invalidateQueries({ queryKey: ["admin-branches"] });
      queryClient.invalidateQueries({ queryKey: ["active-branches"] });
      toast.success("تم حفظ رسوم الفرع");
    },
    onError: (e: any) => toast.error(e?.message || "تعذر حفظ الرسوم"),
  });

  const openRates = (branch: BranchRow) => {
    const rates = [...(branch.branch_delivery_rates || [])].sort(
      (a, b) => a.max_distance_km - b.max_distance_km,
    );
    setRatesBranch(branch);
    setRateDrafts(
      rates.length > 0
        ? rates.map((r) => ({
            id: r.id,
            max_distance_km: r.max_distance_km,
            fee: Number(r.fee),
          }))
        : [
            { max_distance_km: 3, fee: 10 },
            { max_distance_km: 7, fee: 18 },
            { max_distance_km: 15, fee: 28 },
          ],
    );
  };

  return (
    <>
      <div className="space-y-6 max-w-5xl">
        <div>
          <h2 className="font-semibold text-lg">التوصيل حسب الفرع</h2>
          <p className="text-sm text-muted-foreground">
            كل فرع يضبط شرائح المسافة الإجمالية، رسوم الطلب الإضافي للنقاط المتعددة، والحد الأدنى،
            ومضلعات التغطية
          </p>
        </div>

        {branchesLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2">
            {visibleBranches.map((b) => {
              const rates = [...(b.branch_delivery_rates || [])].sort(
                (a, c) => a.max_distance_km - c.max_distance_km,
              );
              const zonesCount = b.delivery_zones?.length || 0;
              return (
                <div key={b.id} className="bg-card rounded-xl border p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold">{b.name}</h3>
                      {b.city && (
                        <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                          <MapPin className="h-3.5 w-3.5" />
                          {b.city}
                        </p>
                      )}
                    </div>
                    <Badge variant={b.is_active ? "default" : "secondary"}>
                      {b.is_active ? "مفعّل" : "معطّل"}
                    </Badge>
                  </div>

                  <BranchFeeEditor
                    key={`${b.id}-${b.delivery_fee}-${b.free_delivery_threshold}-${b.min_order}-${b.service_commission_percent}-${b.extra_stop_fee}`}
                    branch={b}
                    saving={saveFeesMutation.isPending && saveFeesMutation.variables?.id === b.id}
                    onSave={(vals) => saveFeesMutation.mutate({ id: b.id, ...vals })}
                  />

                  <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-1">
                        <div className="flex items-center justify-between mb-1">
                          <p className="font-semibold">شرائح مسافة الطريق (كم) — العميل</p>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2"
                            onClick={() => openRates(b)}
                          >
                            <Pencil className="h-3.5 w-3.5 ml-1" />
                            تعديل
                          </Button>
                        </div>
                        <p className="text-[10px] text-muted-foreground pb-1">
                          أجور المندوب تُعدَّل في بطاقة كل مندوب (نفس المسافات، أسعار خاصة)
                        </p>
                        {rates.length === 0 ? (
                          <p className="text-muted-foreground">لا توجد شرائح بعد</p>
                        ) : (
                          rates.map((r) => (
                            <div key={r.id} className="flex justify-between gap-2">
                              <span>حتى {r.max_distance_km} كم</span>
                              <span className="font-medium">{r.fee} ر.س</span>
                            </div>
                          ))
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">{zonesCount} نطاق جغرافي</Badge>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          onClick={() => setZonesBranch(b)}
                        >
                          <MapIcon className="h-3.5 w-3.5" />
                          مضلعات التوصيل
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
      </div>

      <Dialog open={!!zonesBranch} onOpenChange={(open) => !open && setZonesBranch(null)}>
        <DialogContent
          className="max-w-5xl max-h-[92vh] overflow-y-auto flex flex-col left-4 right-4 top-6 translate-x-0 translate-y-0 !transform-none data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100"
          dir="rtl"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapIcon className="h-5 w-5 text-primary" />
              مضلعات التوصيل — {zonesBranch?.name}
            </DialogTitle>
          </DialogHeader>
          {zonesBranch && (
            <DeliveryZonesEditor
              key={zonesBranch.id}
              branchId={zonesBranch.id}
              branchName={zonesBranch.name}
              branchCenter={
                zonesBranch.lat != null && zonesBranch.lng != null
                  ? { lat: Number(zonesBranch.lat), lng: Number(zonesBranch.lng) }
                  : null
              }
              mapHeightClass="h-[420px]"
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!ratesBranch} onOpenChange={(open) => !open && setRatesBranch(null)}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>شرائح التوصيل للعميل — {ratesBranch?.name}</DialogTitle>
          </DialogHeader>
          <p className="text-[11px] text-muted-foreground -mt-1">
            عند إضافة/حذف شريحة تظهر/تختفي مسافاتها في بطاقات المناديب تلقائياً. أسعار أجر كل مندوب تُضبط عنده فقط.
          </p>
          <div className="space-y-3">
            {rateDrafts.map((r, idx) => (
              <div key={r.id || `new-${idx}`} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                <div>
                  <Label className="text-xs">حتى (كم)</Label>
                  <Input
                    type="number"
                    min={0.1}
                    step={0.5}
                    value={r.max_distance_km}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setRateDrafts((prev) =>
                        prev.map((row, i) => (i === idx ? { ...row, max_distance_km: v } : row)),
                      );
                    }}
                  />
                </div>
                <div>
                  <Label className="text-xs">رسوم العميل (ر.س)</Label>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={r.fee}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setRateDrafts((prev) =>
                        prev.map((row, i) => (i === idx ? { ...row, fee: v } : row)),
                      );
                    }}
                  />
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => setRateDrafts((prev) => prev.filter((_, i) => i !== idx))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setRateDrafts((prev) => [
                  ...prev,
                  {
                    max_distance_km: (prev[prev.length - 1]?.max_distance_km || 0) + 5,
                    fee: 10,
                  },
                ])
              }
            >
              <Plus className="h-4 w-4 ml-1" />
              إضافة شريحة
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRatesBranch(null)}>
              إلغاء
            </Button>
            <Button
              onClick={() =>
                ratesBranch &&
                saveRatesMutation.mutate({
                  branchId: ratesBranch.id,
                  rates: rateDrafts,
                  existing: ratesBranch.branch_delivery_rates,
                })
              }
              disabled={!ratesBranch || saveRatesMutation.isPending || rateDrafts.length === 0}
            >
              {saveRatesMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin ml-2" />
              ) : null}
              حفظ الشرائح
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AdminDeliverySettingsPage;
