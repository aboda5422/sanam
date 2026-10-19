import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Loader2, Star, Plus, Truck, Users, Wallet, MapPin, Search, Gauge,
  UserPlus, Ban, CheckCircle, Trash2, Eye, Phone, Mail, ScrollText, FileDown
} from "lucide-react";
import { DriverLimitsPanel } from "@/components/admin/DriverLimitsCard";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import DriversMap from "@/components/admin/DriversMap";
import { openDriverTransactionsPrint } from "@/lib/driver-transactions-print";
import { DRIVER_TRANSACTIONS_HINT, DriverTransactionsTable } from "@/components/driver/DriverTransactionsTable";
import { displayStaffEmail } from "@/lib/admin-username";
import { buildOrderLedger, type LedgerOrder, type LedgerSource } from "@/lib/driver-order-ledger";
import { emptyDriverPosition, loadDriverOpenPositions } from "@/lib/driver-open-position";

/* ─── KPI Cards ─── */
const KPICards = ({ drivers, wallets }: { drivers: any[]; wallets: any[] }) => {
  const total = drivers?.length ?? 0;
  const active = drivers?.filter((d) => d.status === "active").length ?? 0;
  const available = drivers?.filter((d) => d.is_available).length ?? 0;
  const totalEarnings = wallets?.reduce((s, w) => s + Number(w.total_collected), 0) ?? 0;

  const cards = [
    { label: "إجمالي المناديب", value: total, icon: Users, color: "text-blue-600 bg-blue-50" },
    { label: "نشط", value: active, icon: CheckCircle, color: "text-green-600 bg-green-50" },
    { label: "متاح الآن", value: available, icon: Truck, color: "text-emerald-600 bg-emerald-50" },
    { label: "إجمالي التحصيل", value: `${totalEarnings.toFixed(0)} ر.س`, icon: Wallet, color: "text-amber-600 bg-amber-50" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
      {cards.map((c) => (
        <Card key={c.label} className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className={`p-2 rounded-xl ${c.color}`}><c.icon className="h-5 w-5" /></div>
            <div>
              <p className="text-xs text-muted-foreground">{c.label}</p>
              <p className="text-lg font-bold">{c.value}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

type WageTierDraft = {
  /** branch_delivery_rates.id — for stable list keys / customer fee lookup */
  branchRateId: string;
  max_distance_km: number;
  customer_fee: number;
  driver_fee: number;
};

/** Distance slabs mirror customer delivery rates; fee is per-driver only. */
const DriverWageTiersEditor = ({
  branchId,
  drafts,
  onChange,
  extraStopFee,
  onExtraStopChange,
}: {
  branchId: string | null;
  drafts: WageTierDraft[];
  onChange: (rows: WageTierDraft[]) => void;
  extraStopFee: string;
  onExtraStopChange: (v: string) => void;
}) => {
  if (!branchId) {
    return (
      <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
        اختر الفرع أولاً لعرض شرائح المسافة المرتبطة بالعميل.
      </p>
    );
  }
  if (drafts.length === 0) {
    return (
      <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5 leading-relaxed">
        لا توجد شرائح مسافة لهذا الفرع. أضفها من «إعدادات التوصيل» — المسافات تظهر هنا تلقائياً، والأسعار خاصة بهذا المندوب فقط.
      </p>
    );
  }
  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
      <div>
        <p className="text-xs font-medium">شرائح أجر هذا المندوب</p>
        <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
          المسافات من شرائح التوصيل (مشتركة). أجر المندوب خاص بهذا الحساب ولا يعدّل إعدادات الفرع ولا مناديب آخرين.
        </p>
      </div>
      <div className="space-y-2">
        {drafts.map((r) => (
          <div key={r.branchRateId} className="grid grid-cols-[1fr_0.9fr_1fr] gap-2 items-end">
            <div>
              <p className="text-[10px] text-muted-foreground">حتى (كم)</p>
              <p className="text-sm font-medium h-9 flex items-center">{r.max_distance_km}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">عميل (مرجع)</p>
              <p className="text-sm h-9 flex items-center text-muted-foreground">
                {Number(r.customer_fee).toFixed(0)} ر.س
              </p>
            </div>
            <div>
              <Label className="text-[10px]">أجر هذا المندوب</Label>
              <Input
                type="number"
                min={0}
                step={0.5}
                dir="ltr"
                className="h-9 mt-0.5"
                value={r.driver_fee}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  onChange(
                    drafts.map((row) =>
                      row.branchRateId === r.branchRateId ? { ...row, driver_fee: v } : row,
                    ),
                  );
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <div>
        <Label className="text-xs">أجر نقطة الشراء الإضافية لهذا المندوب (ر.س)</Label>
        <Input
          type="number"
          min={0}
          step={0.5}
          dir="ltr"
          className="mt-1"
          value={extraStopFee}
          onChange={(e) => onExtraStopChange(e.target.value)}
          placeholder="مثال: 2"
        />
      </div>
    </div>
  );
};

const loadDriverWageDrafts = async (
  branchId: string,
  driverId?: string | null,
): Promise<WageTierDraft[]> => {
  const { data: branchRates, error } = await supabase
    .from("branch_delivery_rates" as any)
    .select("id, max_distance_km, fee, driver_fee, sort_order")
    .eq("branch_id", branchId)
    .order("max_distance_km");
  if (error) throw error;
  const rates = (branchRates || []) as any[];

  const feeByKm = new Map<number, number>();
  if (driverId) {
    const { data: driverRates } = await supabase
      .from("driver_wage_rates" as any)
      .select("max_distance_km, fee")
      .eq("driver_id", driverId);
    ((driverRates || []) as any[]).forEach((r) => {
      feeByKm.set(Number(r.max_distance_km), Number(r.fee));
    });
  }

  return rates.map((r) => {
    const km = Number(r.max_distance_km);
    const seeded =
      feeByKm.has(km)
        ? feeByKm.get(km)!
        : Number(r.driver_fee) > 0
          ? Number(r.driver_fee)
          : Math.round(Number(r.fee) * 0.7 * 100) / 100;
    return {
      branchRateId: r.id,
      max_distance_km: km,
      customer_fee: Number(r.fee),
      driver_fee: seeded,
    };
  });
};

const saveDriverWageRates = async (driverId: string, drafts: WageTierDraft[]) => {
  for (let i = 0; i < drafts.length; i++) {
    const r = drafts[i];
    const { error } = await supabase.from("driver_wage_rates" as any).upsert(
      {
        driver_id: driverId,
        max_distance_km: Number(r.max_distance_km),
        fee: Number(r.driver_fee) || 0,
        sort_order: i,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "driver_id,max_distance_km" },
    );
    if (error) throw error;
  }
};

/* ─── Add Driver Dialog ─── */
const AddDriverDialog = ({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) => {
  const qc = useQueryClient();
  const { scopedBranchIds, filterBranchId, branches, role, writeBranchId: targetBranchId } = useAdminAuth();
  const isBranchManager = role === "store_admin";
  const lockedBranchId = isBranchManager
    ? (targetBranchId || (scopedBranchIds?.length === 1 ? scopedBranchIds[0] : null))
    : (branches.length === 1 ? branches[0].id : null);
  const assignableBranches = isBranchManager
    ? branches.filter((b) => (scopedBranchIds || []).includes(b.id))
    : branches;
  const [form, setForm] = useState({
    username: "",
    password: "",
    full_name: "",
    phone: "",
    id_number: "",
    vehicle_type: "car",
    pay_type: "salary",
    salary_amount: "",
    per_delivery_fee: "",
    extra_stop_fee: "",
    branch_id: "",
  });
  const [tierDrafts, setTierDrafts] = useState<WageTierDraft[]>([]);

  const activeBranchId = lockedBranchId || form.branch_id || targetBranchId || "";

  useEffect(() => {
    if (!open) return;
    const preset = lockedBranchId || filterBranchId || targetBranchId || "";
    setForm((f) => ({ ...f, branch_id: preset || f.branch_id }));
  }, [open, lockedBranchId, filterBranchId, targetBranchId]);

  useEffect(() => {
    if (!open || !activeBranchId || form.pay_type !== "per_order") {
      setTierDrafts([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const drafts = await loadDriverWageDrafts(activeBranchId);
        if (!cancelled) setTierDrafts(drafts);
      } catch {
        if (!cancelled) setTierDrafts([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, activeBranchId, form.pay_type]);

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!form.full_name.trim() || !form.username.trim() || !form.password.trim()) {
        throw new Error("الاسم الكامل واسم المستخدم وكلمة المرور مطلوبة");
      }
      if (form.password.trim().length < 6) {
        throw new Error("كلمة المرور يجب ألا تقل عن 6 أحرف");
      }
      const bid = lockedBranchId || form.branch_id || targetBranchId;
      if (!bid) throw new Error("اختر الفرع الذي سيُسند إليه المندوب");
      if (isBranchManager && scopedBranchIds?.length && !scopedBranchIds.includes(bid)) {
        throw new Error("لا يمكن إسناد المندوب لفرع خارج صلاحيتك");
      }
      if (form.pay_type === "per_order") {
        const hasTierPay = tierDrafts.some((r) => Number(r.driver_fee) > 0);
        if (!hasTierPay && !(Number(form.per_delivery_fee) > 0)) {
          throw new Error("حدّد أجر المندوب على الشرائح أو أجراً أساسياً احتياطياً");
        }
      }
      if (form.pay_type === "salary" && !(Number(form.salary_amount) > 0)) {
        throw new Error("أدخل مبلغ الراتب");
      }
      const { data, error } = await supabase.rpc("create_driver", {
        p_full_name: form.full_name.trim(),
        p_username: form.username.trim(),
        p_password: form.password,
        p_phone: form.phone.trim() || undefined,
        p_id_number: form.id_number.trim() || undefined,
        p_vehicle_type: form.vehicle_type,
        p_branch_id: bid,
        p_pay_type: form.pay_type,
        p_per_delivery_fee: form.pay_type === "per_order" ? Number(form.per_delivery_fee || 0) : 0,
        p_extra_order_fee: 0,
        p_wage_per_km: 0,
        p_extra_stop_fee: form.pay_type === "per_order" ? Number(form.extra_stop_fee || 0) : 0,
      });
      if (error) throw error;
      const payload = data as { success?: boolean; driver_id?: string } | null;
      if (!payload?.success) throw new Error("فشل في إنشاء الحساب");
      if (form.pay_type === "salary" && payload.driver_id) {
        const { error: salaryError } = await supabase.rpc("update_driver_pay", {
          p_driver_id: payload.driver_id,
          p_pay_type: "salary",
          p_per_delivery_fee: 0,
          p_extra_order_fee: 0,
          p_wage_per_km: 0,
          p_extra_stop_fee: 0,
          p_salary_amount: Number(form.salary_amount),
        });
        if (salaryError) throw salaryError;
      }
      if (form.pay_type === "per_order" && payload.driver_id) {
        await supabase.rpc("seed_driver_wage_rates" as any, {
          p_driver_id: payload.driver_id,
          p_branch_id: bid,
        });
        await saveDriverWageRates(payload.driver_id, tierDrafts);
      }
    },
    onSuccess: () => {
      toast.success("تم إضافة المندوب وحفظ شرائح أجره الخاصة");
      qc.invalidateQueries({ queryKey: ["admin-drivers"] });
      onOpenChange(false);
      setForm({
        username: "",
        password: "",
        full_name: "",
        phone: "",
        id_number: "",
        vehicle_type: "car",
        pay_type: "salary",
        salary_amount: "",
        per_delivery_fee: "",
        extra_stop_fee: "",
        branch_id: lockedBranchId || "",
      });
      setTierDrafts([]);
    },
    onError: (e: any) => toast.error(e.message || "فشل في إضافة المندوب"),
  });

  const lockedBranchName = assignableBranches.find((b) => b.id === (lockedBranchId || form.branch_id))?.name;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto" dir="rtl">
        <DialogHeader><DialogTitle>إضافة مندوب جديد</DialogTitle></DialogHeader>
        <div className="space-y-3 pb-1">
          <div><Label>الاسم الكامل *</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
          <div>
            <Label>اسم المستخدم *</Label>
            <Input
              dir="ltr"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              autoComplete="off"
            />
          </div>
          <div>
            <Label>كلمة المرور *</Label>
            <Input
              type="password"
              dir="ltr"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              autoComplete="new-password"
            />
          </div>
          <div><Label>رقم الجوال</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><Label>رقم الهوية</Label><Input value={form.id_number} onChange={(e) => setForm({ ...form, id_number: e.target.value })} /></div>
          {lockedBranchId ? (
            <div>
              <Label>الفرع</Label>
              <p className="text-sm font-medium rounded-md border bg-muted/40 px-3 py-2">{lockedBranchName || "فرعك"}</p>
              <p className="text-[11px] text-muted-foreground mt-1">يُسند المندوب تلقائياً إلى فرعك</p>
            </div>
          ) : (
            <div>
              <Label>الفرع *</Label>
              <Select value={form.branch_id} onValueChange={(v) => setForm({ ...form, branch_id: v })}>
                <SelectTrigger><SelectValue placeholder="اختر الفرع" /></SelectTrigger>
                <SelectContent>
                  {assignableBranches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>نوع المركبة</Label>
            <Select value={form.vehicle_type} onValueChange={(v) => setForm({ ...form, vehicle_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="car">سيارة</SelectItem>
                <SelectItem value="motorcycle">دراجة نارية</SelectItem>
                <SelectItem value="bicycle">دراجة هوائية</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>أجر المندوب *</Label>
            <p className="text-[11px] text-muted-foreground mb-1">أجر داخلي من المتجر للمندوب، وليس رسوم التوصيل على العميل</p>
            <Select value={form.pay_type} onValueChange={(v) => setForm({ ...form, pay_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="salary">راتب</SelectItem>
                <SelectItem value="per_order">حسب الطلب (شرائح المسافة)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.pay_type === "salary" && (
            <div>
              <Label>مبلغ الراتب (ر.س) *</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                dir="ltr"
                className="mt-1"
                value={form.salary_amount}
                onChange={(e) => setForm({ ...form, salary_amount: e.target.value })}
                placeholder="0.00"
              />
              <p className="text-[11px] text-muted-foreground mt-1">حفظ المبلغ لا يخصم من الحسابات. الصرف يتم لاحقاً من تبويب الأجور.</p>
            </div>
          )}
          {form.pay_type === "per_order" && (
            <>
              <DriverWageTiersEditor
                branchId={activeBranchId || null}
                drafts={tierDrafts}
                onChange={setTierDrafts}
                extraStopFee={form.extra_stop_fee}
                onExtraStopChange={(v) => setForm({ ...form, extra_stop_fee: v })}
              />
              <div>
                <Label>أجر احتياطي إن لم تُطابق شريحة (ر.س)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  dir="ltr"
                  className="mt-1"
                  value={form.per_delivery_fee}
                  onChange={(e) => setForm({ ...form, per_delivery_fee: e.target.value })}
                  placeholder="اختياري"
                />
              </div>
            </>
          )}
          <Button className="w-full" onClick={() => addMutation.mutate()} disabled={addMutation.isPending || !form.username.trim() || !form.password.trim() || !form.full_name.trim() || (!lockedBranchId && !form.branch_id)}>
            {addMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <UserPlus className="h-4 w-4 ml-2" />}
            إضافة المندوب
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

function inChosenPeriod(iso: string, from: string, to: string) {
  const t = new Date(iso).getTime();
  if (from) {
    const start = new Date(from);
    start.setHours(0, 0, 0, 0);
    if (t < start.getTime()) return false;
  }
  if (to) {
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    if (t > end.getTime()) return false;
  }
  return true;
}

/* ─── Wallets Tab ─── */
/** نقد المندوب يُسوَّى عند المحصل في مركز التحصيل — نفس مسار ثمار ماكس (أفراد/تجزئة). */
const COLLECTIONS_HREF = "/admin/collections?tab=retail-drivers";

type WageWallet = {
  id: string;
  driver_id: string;
  drivers: {
    full_name: string | null;
    phone: string | null;
    pay_type: string | null;
    unpaid_delivery_pay: number | null;
    salary_amount: number | null;
  } | null;
  lastSettlementAt: string | null;
  lastSalaryPayout: { amount: number; period_note: string | null; created_at: string } | null;
};

function driverOf(wallet: { drivers: WageWallet["drivers"] | WageWallet["drivers"][] | null }) {
  const embedded = wallet.drivers;
  if (Array.isArray(embedded)) return embedded[0] || null;
  return embedded || null;
}

function formatSettlementDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ar-SA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const WalletsTab = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const openDriverId = searchParams.get("tx");
  const [log, setLog] = useState<{ driverId: string; name: string } | null>(null);
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [salaryPay, setSalaryPay] = useState<{
    driverId: string;
    name: string;
    amount: string;
    note: string;
  } | null>(null);
  const qc = useQueryClient();
  const { data: wallets, isLoading } = useQuery({
    queryKey: ["admin-driver-wages"],
    queryFn: async () => {
      const [walletsRes, txRes, salaryRes] = await Promise.all([
        supabase
          .from("driver_wallet")
          .select("id, driver_id, drivers(full_name, phone, pay_type, unpaid_delivery_pay, salary_amount)")
          .order("created_at", { ascending: false }),
        supabase
          .from("wallet_transactions")
          .select("driver_id, created_at")
          .eq("type", "settlement"),
        supabase
          .from("driver_salary_payouts")
          .select("driver_id, amount, period_note, created_at")
          .order("created_at", { ascending: false }),
      ]);
      if (walletsRes.error) throw walletsRes.error;
      if (txRes.error) throw txRes.error;
      if (salaryRes.error) throw salaryRes.error;
      const lastSettlement = new Map<string, string>();
      for (const row of txRes.data || []) {
        const prev = lastSettlement.get(row.driver_id);
        if (!prev || row.created_at > prev) lastSettlement.set(row.driver_id, row.created_at);
      }
      const lastSalary = new Map<string, WageWallet["lastSalaryPayout"]>();
      for (const row of salaryRes.data || []) {
        if (!lastSalary.has(row.driver_id)) {
          lastSalary.set(row.driver_id, {
            amount: Number(row.amount),
            period_note: row.period_note,
            created_at: row.created_at,
          });
        }
      }
      return (walletsRes.data || []).map((wallet) => ({
        id: wallet.id,
        driver_id: wallet.driver_id,
        drivers: driverOf(wallet as { drivers: WageWallet["drivers"] | WageWallet["drivers"][] | null }),
        lastSettlementAt: lastSettlement.get(wallet.driver_id) || null,
        lastSalaryPayout: lastSalary.get(wallet.driver_id) || null,
      })) satisfies WageWallet[];
    },
  });

  const { data: openPositions = new Map<string, ReturnType<typeof emptyDriverPosition>>(), isLoading: positionsLoading } = useQuery({
    queryKey: ["driver-open-positions"],
    queryFn: loadDriverOpenPositions,
  });

  const { data: ledgerSource, isLoading: logLoading } = useQuery({
    queryKey: ["admin-driver-wallet-log", log?.driverId],
    enabled: !!log?.driverId,
    queryFn: async () => {
      const [ordersRes, wagesRes] = await Promise.all([
        supabase
          .from("orders")
          .select("id, order_number, delivery_fee, total, payment_method, delivered_at, created_at, cash_settled_at")
          .eq("driver_id", log!.driverId)
          .eq("status", "delivered"),
        supabase
          .from("wallet_transactions")
          .select("order_id, amount")
          .eq("driver_id", log!.driverId)
          .eq("type", "commission"),
      ]);
      if (ordersRes.error) throw ordersRes.error;
      if (wagesRes.error) throw wagesRes.error;
      return {
        orders: (ordersRes.data || []) as LedgerOrder[],
        wages: wagesRes.data || [],
      } satisfies LedgerSource;
    },
  });

  useEffect(() => {
    if (!openDriverId || !wallets) return;
    const wallet = wallets.find((row) => row.driver_id === openDriverId);
    setPeriodFrom("");
    setPeriodTo("");
    setLog({
      driverId: openDriverId,
      name: wallet?.drivers?.full_name || wallet?.drivers?.phone || "مندوب",
    });
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("tx");
      return next;
    }, { replace: true });
  }, [openDriverId, wallets, setSearchParams]);

  const ledgerRows = buildOrderLedger(ledgerSource || { orders: [], wages: [] }).filter((row) =>
    inChosenPeriod(row.at, periodFrom, periodTo),
  );

  const paySalary = useMutation({
    mutationFn: async () => {
      if (!salaryPay) throw new Error("اختر المندوب");
      const amount = Number(salaryPay.amount);
      if (!(amount > 0)) throw new Error("أدخل مبلغ الصرف");
      const { error } = await supabase.rpc("pay_driver_salary", {
        p_driver_id: salaryPay.driverId,
        p_amount: amount,
        p_period_note: salaryPay.note.trim() || undefined,
      });
      if (error) throw error;
      return { name: salaryPay.name, amount };
    },
    onSuccess: (data) => {
      toast.success(`صُرف لـ ${data.name} راتب ${data.amount.toFixed(2)} ر.س وسُجّل في الحسابات`);
      setSalaryPay(null);
      qc.invalidateQueries({ queryKey: ["admin-driver-wages"] });
      qc.invalidateQueries({ queryKey: ["admin-sales-orders"] });
      qc.invalidateQueries({ queryKey: ["admin-drivers"] });
    },
    onError: (e: { message?: string }) => toast.error(e.message || "تعذر صرف الراتب"),
  });

  const exportTransactions = async () => {
    if (!log) return;
    if (!ledgerRows.length) {
      toast.error("لا معاملات في هذه الفترة");
      return;
    }
    try {
      await openDriverTransactionsPrint({
        driverName: log.name,
        from: periodFrom,
        to: periodTo,
        rows: ledgerRows,
      });
    } catch {
      toast.error("تعذر فتح ملف الطباعة. اسمح بالنوافذ المنبثقة ثم أعد المحاولة");
    }
  };

  if (isLoading || positionsLoading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        الرصيد هو ما يسلّمه المندوب للمحصل بعد خصم أجره، ويطابق{" "}
        <Link to={COLLECTIONS_HREF} className="text-primary underline-offset-2 hover:underline">
          مركز التحصيل
        </Link>
        {" "}والمعاملات. أجر الكاش يُخصم عند التحصيل ولا يُصرف مرة ثانية، فيبقى المستحق صفراً. إذا دفع العميل عبر الشبكة يظهر أجر المندوب هنا ليصرفه المحصل.
      </p>
      <div className="bg-card rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/30">
              <th className="text-right p-3 font-medium">المندوب</th>
              <th className="text-right p-3 font-medium">الراتب</th>
              <th className="text-right p-3 font-medium">الرصيد (عليه للمحصل)</th>
              <th className="text-right p-3 font-medium">مستحقات المندوب</th>
              <th className="text-right p-3 font-medium">آخر تسوية</th>
              <th className="text-center p-3 font-medium">السجلات</th>
            </tr></thead>
            <tbody>
              {wallets?.map((w) => {
                const driver = w.drivers;
                const pos = openPositions.get(w.driver_id) || emptyDriverPosition();
                const cashDue = pos.cashDue;
                const entitlement = pos.cardWage;
                return (
                <tr key={w.id} className="border-b last:border-0 hover:bg-muted/10">
                  <td className="p-3 font-medium">{driver?.full_name || driver?.phone || "بدون اسم"}</td>
                  <td className="p-3">
                    {driver?.pay_type === "salary" ? (
                      <div className="space-y-1">
                        <p className="font-bold">{Number(driver.salary_amount || 0).toFixed(2)} ر.س</p>
                        <p className="text-[11px] text-muted-foreground">
                          {w.lastSalaryPayout
                            ? `آخر صرف ${w.lastSalaryPayout.amount.toFixed(2)} · ${formatSettlementDate(w.lastSalaryPayout.created_at)}${w.lastSalaryPayout.period_note ? ` · ${w.lastSalaryPayout.period_note}` : ""}`
                            : "لم يُصرف بعد"}
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() =>
                            setSalaryPay({
                              driverId: w.driver_id,
                              name: driver.full_name || driver.phone || "مندوب",
                              amount: Number(driver.salary_amount || 0) > 0 ? Number(driver.salary_amount).toFixed(2) : "",
                              note: "",
                            })
                          }
                        >
                          صرف الراتب
                        </Button>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className={`p-3 font-bold ${cashDue > 0 ? "text-amber-600" : "text-muted-foreground"}`}>
                    {cashDue.toFixed(2)} ر.س
                    {cashDue > 0 && (
                      <Link
                        to={COLLECTIONS_HREF}
                        className="block text-xs font-normal text-primary underline-offset-2 hover:underline mt-0.5"
                      >
                        استلام في التحصيل
                      </Link>
                    )}
                  </td>
                  <td className="p-3">
                    <p className={`font-bold ${entitlement > 0 ? "text-emerald-700" : "text-muted-foreground"}`}>
                      {entitlement.toFixed(2)} ر.س
                    </p>
                    {entitlement > 0 && (
                      <Link
                        to={COLLECTIONS_HREF}
                        className="block text-xs text-primary underline-offset-2 hover:underline mt-0.5"
                      >
                        صرف في التحصيل
                      </Link>
                    )}
                  </td>
                  <td className="p-3 whitespace-nowrap">{formatSettlementDate(w.lastSettlementAt)}</td>
                  <td className="p-3 text-center">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-7"
                      onClick={() => {
                        setPeriodFrom("");
                        setPeriodTo("");
                        setLog({
                          driverId: w.driver_id,
                          name: driver?.full_name || driver?.phone || "مندوب",
                        });
                      }}
                    >
                      <ScrollText className="h-3.5 w-3.5 ml-1" />
                      المعاملات
                    </Button>
                  </td>
                </tr>
                );
              })}
              {(!wallets || wallets.length === 0) && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">لا توجد محافظ</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!log} onOpenChange={(open) => { if (!open) setLog(null); }}>
        <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>المعاملات{log?.name ? ` — ${log.name}` : ""}</DialogTitle>
          </DialogHeader>
          {logLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">من</Label>
                  <Input type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} className="h-8 w-[150px]" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">إلى</Label>
                  <Input type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} className="h-8 w-[150px]" />
                </div>
                <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => void exportTransactions()}>
                  <FileDown className="h-3.5 w-3.5 ml-1" />
                  تصدير PDF
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{DRIVER_TRANSACTIONS_HINT}</p>
              <DriverTransactionsTable rows={ledgerRows} />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!salaryPay} onOpenChange={(open) => { if (!open) setSalaryPay(null); }}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>صرف الراتب{salaryPay?.name ? ` — ${salaryPay.name}` : ""}</DialogTitle>
          </DialogHeader>
          {salaryPay && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground leading-relaxed">
                المبلغ هنا هو ما يُصرف الآن. يمكنك تعديله قبل التأكيد. بعد الصرف يُسجَّل مصروفاً في الحسابات والمبيعات ويظهر أن المندوب استلم راتبه.
              </p>
              <div>
                <Label>مبلغ الصرف (ر.س)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  dir="ltr"
                  className="mt-1"
                  value={salaryPay.amount}
                  onChange={(e) => setSalaryPay({ ...salaryPay, amount: e.target.value })}
                />
              </div>
              <div>
                <Label>الفترة</Label>
                <Input
                  className="mt-1"
                  value={salaryPay.note}
                  placeholder="راتب أكتوبر"
                  onChange={(e) => setSalaryPay({ ...salaryPay, note: e.target.value })}
                />
              </div>
              <Button className="w-full" disabled={paySalary.isPending} onClick={() => paySalary.mutate()}>
                {paySalary.isPending ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : null}
                تأكيد الصرف
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

/* ─── Main Page ─── */
const AdminDriversPage = () => {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [occupancyFilter, setOccupancyFilter] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<any>(null);
  const [editTierDrafts, setEditTierDrafts] = useState<WageTierDraft[]>([]);
  const qc = useQueryClient();
  const { scopedBranchIds, branches } = useAdminAuth();

  useEffect(() => {
    if (!selectedDriver?.branch_id || selectedDriver.pay_type !== "per_order") {
      setEditTierDrafts([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const drafts = await loadDriverWageDrafts(selectedDriver.branch_id, selectedDriver.id);
        if (!cancelled) setEditTierDrafts(drafts);
      } catch {
        if (!cancelled) setEditTierDrafts([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedDriver?.id, selectedDriver?.branch_id, selectedDriver?.pay_type]);

  const { data: drivers, isLoading } = useQuery({
    queryKey: ["admin-drivers", scopedBranchIds],
    queryFn: async () => {
      if (scopedBranchIds && scopedBranchIds.length > 0) {
        const { data: links, error: le } = await supabase
          .from("driver_branches" as any)
          .select("driver_id")
          .in("branch_id", scopedBranchIds);
        if (le) throw le;
        const ids = [...new Set((links || []).map((r: any) => r.driver_id))];
        if (!ids.length) return [];
        const { data, error } = await supabase.from("drivers").select("*").in("id", ids).order("created_at", { ascending: false });
        if (error) throw error;
        const rows = data || [];
        const { data: dlinks } = await supabase.from("driver_branches" as any).select("driver_id, branch_id").in("driver_id", rows.map((r) => r.id));
        const names = new Map((dlinks || []).map((r: any) => [r.driver_id, r.branch_id]));
        return rows.map((d) => ({ ...d, branch_id: names.get(d.id) || null }));
      }
      const { data, error } = await supabase.from("drivers").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      const rows = data || [];
      if (!rows.length) return [];
      const { data: dlinks } = await supabase.from("driver_branches" as any).select("driver_id, branch_id").in("driver_id", rows.map((r) => r.id));
      const names = new Map((dlinks || []).map((r: any) => [r.driver_id, r.branch_id]));
      return rows.map((d) => ({ ...d, branch_id: names.get(d.id) || null }));
    },
  });

  const { data: wallets } = useQuery({
    queryKey: ["admin-wallets"],
    queryFn: async () => {
      const { data, error } = await supabase.from("driver_wallet").select("*");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: activeAssignments } = useQuery({
    queryKey: ["admin-drivers-active-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("driver_id")
        .not("driver_id", "is", null)
        .in("status", ["assigned", "preparing", "on_the_way"]);
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 60_000,
  });

  const busyDriverIds = new Set(
    (activeAssignments || []).map((o) => o.driver_id).filter(Boolean) as string[],
  );

  const updatePayMutation = useMutation({
    mutationFn: async ({
      driverId,
      payType,
      fee,
      extraFee = 0,
      extraStopFee = 0,
      salaryAmount = 0,
      tiers,
    }: {
      driverId: string;
      payType: string;
      fee: number;
      extraFee?: number;
      extraStopFee?: number;
      salaryAmount?: number;
      tiers?: WageTierDraft[];
    }) => {
      if (payType === "salary" && !(Number(salaryAmount) > 0)) {
        throw new Error("أدخل مبلغ الراتب");
      }
      if (payType === "per_order" && tiers?.length) {
        await saveDriverWageRates(driverId, tiers);
      }
      const { error } = await supabase.rpc("update_driver_pay", {
        p_driver_id: driverId,
        p_pay_type: payType,
        p_per_delivery_fee: fee,
        p_extra_order_fee: payType === "per_order" ? extraFee : 0,
        p_wage_per_km: 0,
        p_extra_stop_fee: payType === "per_order" ? extraStopFee : 0,
        p_salary_amount: payType === "salary" ? Number(salaryAmount) : 0,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success("تم تحديث أجر هذا المندوب");
      qc.invalidateQueries({ queryKey: ["admin-drivers"] });
      qc.invalidateQueries({ queryKey: ["admin-wallets"] });
      qc.invalidateQueries({ queryKey: ["admin-driver-wages"] });
      setSelectedDriver((prev: any) =>
        prev
          ? {
              ...prev,
              pay_type: vars.payType,
              per_delivery_fee: vars.payType === "per_order" ? vars.fee : 0,
              extra_order_fee: vars.payType === "per_order" ? vars.extraFee || 0 : 0,
              wage_per_km: 0,
              extra_stop_fee: vars.payType === "per_order" ? vars.extraStopFee || 0 : 0,
              salary_amount: vars.payType === "salary" ? Number(vars.salaryAmount || 0) : prev.salary_amount,
            }
          : prev
      );
    },
    onError: (e: any) => toast.error(e.message || "فشل تحديث الأجر"),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("drivers").update({ status } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم تحديث الحالة");
      qc.invalidateQueries({ queryKey: ["admin-drivers"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("drivers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حذف المندوب");
      qc.invalidateQueries({ queryKey: ["admin-drivers"] });
    },
  });

  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab = tabParam === "limits" || tabParam === "tracking" || tabParam === "wallets" ? tabParam : "drivers";

  const onTabChange = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === "drivers") next.delete("tab");
    else next.set("tab", value);
    next.delete("tx");
    setSearchParams(next, { replace: true });
  };

  const filtered = drivers?.filter((d) => {
    const matchSearch = !search || (d as any).full_name?.includes(search) || d.phone?.includes(search);
    const isActive = (d as any).status === "active";
    const matchStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && isActive) ||
      (statusFilter === "inactive" && !isActive);
    const hasOrder = busyDriverIds.has(d.id);
    const matchOccupancy =
      occupancyFilter === "all" ||
      (occupancyFilter === "busy" && hasOrder) ||
      (occupancyFilter === "free" && !hasOrder);
    return matchSearch && matchStatus && matchOccupancy;
  });

  return (
    <AdminLayout title="إدارة المناديب">
      <KPICards drivers={drivers || []} wallets={wallets || []} />

      <Tabs value={activeTab} onValueChange={onTabChange} dir="rtl">
        <TabsList className="mb-4 grid h-auto w-full grid-cols-2 gap-3 bg-transparent p-0 sm:grid-cols-4">
          {(
            [
              { value: "drivers", label: "المناديب", icon: Users, tone: "bg-blue-50 text-blue-600" },
              { value: "limits", label: "حدود الاستلام", icon: Gauge, tone: "bg-amber-50 text-amber-600" },
              { value: "tracking", label: "التتبع", icon: MapPin, tone: "bg-emerald-50 text-emerald-600" },
              { value: "wallets", label: "الأجور", icon: Wallet, tone: "bg-orange-50 text-orange-600" },
            ] as const
          ).map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="h-auto flex-col gap-1.5 rounded-xl border-2 border-slate-300 bg-white px-2 py-2.5 text-xs shadow-sm data-[state=active]:border-primary data-[state=active]:bg-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-none"
            >
              <span className={`flex h-9 w-9 items-center justify-center rounded-full ${tab.tone}`}>
                <tab.icon className="h-4 w-4" />
              </span>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ─── Drivers Tab ─── */}
        <TabsContent value="drivers">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="بحث بالاسم أو الجوال..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36"><SelectValue placeholder="الحالة" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="active">مفعل</SelectItem>
                <SelectItem value="inactive">غير مفعل</SelectItem>
              </SelectContent>
            </Select>
            <Select value={occupancyFilter} onValueChange={setOccupancyFilter}>
              <SelectTrigger className="w-36"><SelectValue placeholder="التوفر" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="busy">شاغر</SelectItem>
                <SelectItem value="free">متوفر</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => setAddOpen(true)} className="gap-1"><Plus className="h-4 w-4" />إضافة مندوب</Button>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : (
            <div className="bg-card rounded-xl border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b bg-muted/30">
                    <th className="text-right p-3 font-medium">المندوب</th>
                    <th className="text-right p-3 font-medium">الفرع</th>
                    <th className="text-right p-3 font-medium">الجوال</th>
                    <th className="text-right p-3 font-medium">البريد</th>
                    <th className="text-center p-3 font-medium">التقييم</th>
                    <th className="text-center p-3 font-medium">التوصيلات</th>
                    <th className="text-right p-3 font-medium">الأجر</th>
                    <th className="text-right p-3 font-medium">مستحق الأجر</th>
                    <th className="text-center p-3 font-medium">الحالة</th>
                    <th className="text-center p-3 font-medium">التوفر</th>
                    <th className="text-center p-3 font-medium">إجراءات</th>
                  </tr></thead>
                  <tbody>
                    {filtered?.map((d) => (
                      <tr key={d.id} className="border-b last:border-0 hover:bg-muted/10">
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            {(d as any).avatar_url ? (
                              <img src={(d as any).avatar_url} className="h-8 w-8 rounded-full object-cover" />
                            ) : (
                              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                                {((d as any).full_name || "م")[0]}
                              </div>
                            )}
                            <span className="font-medium">{(d as any).full_name || d.user_id.slice(0, 8)}</span>
                          </div>
                        </td>
                        <td className="p-3 text-sm">{branches.find((b) => b.id === (d as any).branch_id)?.name || "—"}</td>
                        <td className="p-3 text-muted-foreground">{d.phone || "—"}</td>
                        <td className="p-3 text-muted-foreground text-xs" dir="ltr">
                          {displayStaffEmail((d as any).email) || "—"}
                        </td>
                        <td className="p-3 text-center">
                          <span className="inline-flex items-center gap-1">
                            <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />{Number(d.rating).toFixed(1)}
                          </span>
                        </td>
                        <td className="p-3 text-center">{d.total_deliveries}</td>
                        <td className="p-3 text-sm">
                          {(d as any).pay_type === "per_order"
                            ? "حسب الطلب (شرائح الفرع)"
                            : `راتب${Number((d as any).salary_amount || 0) > 0 ? ` · ${Number((d as any).salary_amount).toFixed(2)} ر.س` : ""}`}
                        </td>
                        <td className="p-3 font-medium">
                          {(d as any).pay_type === "per_order"
                            ? `${Number((d as any).unpaid_delivery_pay || 0).toFixed(2)} ر.س`
                            : "—"}
                        </td>
                        <td className="p-3 text-center">
                          <Badge variant={(d as any).status === "active" ? "default" : "secondary"}>
                            {(d as any).status === "active" ? "مفعل" : "غير مفعل"}
                          </Badge>
                        </td>
                        <td className="p-3 text-center">
                          <Badge variant={busyDriverIds.has(d.id) ? "outline" : "secondary"}>
                            {busyDriverIds.has(d.id) ? "شاغر" : "متوفر"}
                          </Badge>
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex gap-1 justify-center">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setSelectedDriver(d)}>
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            {(d as any).status === "active" ? (
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-amber-600" onClick={() => updateStatusMutation.mutate({ id: d.id, status: "suspended" })}>
                                <Ban className="h-3.5 w-3.5" />
                              </Button>
                            ) : (
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600" onClick={() => updateStatusMutation.mutate({ id: d.id, status: "active" })}>
                                <CheckCircle className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600" onClick={() => {
                              if (confirm("هل أنت متأكد من حذف هذا المندوب؟")) deleteMutation.mutate(d.id);
                            }}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {(!filtered || filtered.length === 0) && <tr><td colSpan={11} className="p-8 text-center text-muted-foreground">لا يوجد مناديب</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="limits">
          <DriverLimitsPanel drivers={drivers || []} />
        </TabsContent>

        {/* ─── Tracking Tab ─── */}
        <TabsContent value="tracking">
          <div className="h-[calc(100vh-350px)] rounded-xl overflow-hidden">
            <DriversMap />
          </div>
        </TabsContent>

        {/* ─── Wallets Tab ─── */}
        <TabsContent value="wallets">
          <WalletsTab />
        </TabsContent>
      </Tabs>

      <AddDriverDialog open={addOpen} onOpenChange={setAddOpen} />

      {/* Driver Details Dialog */}
      <Dialog open={!!selectedDriver} onOpenChange={() => setSelectedDriver(null)}>
        <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto" dir="rtl">
          <DialogHeader><DialogTitle>بيانات المندوب</DialogTitle></DialogHeader>
          {selectedDriver && (
            <div className="space-y-4 pb-1">
              <div className="flex items-center gap-4">
                {(selectedDriver as any).avatar_url ? (
                  <img src={(selectedDriver as any).avatar_url} className="h-16 w-16 rounded-full object-cover" />
                ) : (
                  <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-xl font-bold text-primary">
                    {((selectedDriver as any).full_name || "م")[0]}
                  </div>
                )}
                <div>
                  <h3 className="font-bold text-lg">{(selectedDriver as any).full_name || "بدون اسم"}</h3>
                  <Badge variant={(selectedDriver as any).status === "active" ? "default" : "destructive"}>
                    {(selectedDriver as any).status === "active" ? "نشط" : "معلق"}
                  </Badge>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" />{selectedDriver.phone || "—"}</div>
                <div className="flex items-center gap-2" dir="ltr">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  {displayStaffEmail((selectedDriver as any).email) || "—"}
                </div>
                <div><span className="text-muted-foreground">الهوية:</span> {(selectedDriver as any).id_number || "—"}</div>
                <div><span className="text-muted-foreground">المركبة:</span> {selectedDriver.vehicle_type || "—"}</div>
                <div><span className="text-muted-foreground">الفرع:</span> {branches.find((b) => b.id === selectedDriver.branch_id)?.name || "—"}</div>
                <div><span className="text-muted-foreground">التقييم:</span> ⭐ {Number(selectedDriver.rating).toFixed(1)}</div>
                <div><span className="text-muted-foreground">التوصيلات:</span> {selectedDriver.total_deliveries}</div>
                <div><span className="text-muted-foreground">الأرباح:</span> {Number(selectedDriver.total_earnings).toFixed(2)} ر.س</div>
                <div><span className="text-muted-foreground">متاح:</span> {selectedDriver.is_available ? "نعم ✅" : "لا ❌"}</div>
              </div>
              <div className="rounded-lg border p-3 space-y-2">
                <p className="text-sm font-medium">أجر المندوب (من المتجر)</p>
                <p className="text-[11px] text-muted-foreground">
                  أسعار خاصة بهذا المندوب. المسافات تُزامَن من إعدادات التوصيل عند إضافة/حذف شريحة.
                </p>
                <Select
                  value={selectedDriver.pay_type || "salary"}
                  onValueChange={(v) => setSelectedDriver({ ...selectedDriver, pay_type: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="salary">راتب</SelectItem>
                    <SelectItem value="per_order">حسب الطلب (شرائح المسافة)</SelectItem>
                  </SelectContent>
                </Select>
                {(selectedDriver.pay_type || "salary") === "salary" && (
                  <div className="space-y-2">
                    <Label className="text-xs">مبلغ الراتب (ر.س)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      dir="ltr"
                      value={selectedDriver.salary_amount ?? ""}
                      onChange={(e) => setSelectedDriver({ ...selectedDriver, salary_amount: e.target.value })}
                      placeholder="0.00"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      حفظ المبلغ لا يخصم من الحسابات. الصرف يتم من تبويب الأجور.
                    </p>
                    <Button
                      size="sm"
                      className="w-full"
                      disabled={updatePayMutation.isPending}
                      onClick={() =>
                        updatePayMutation.mutate({
                          driverId: selectedDriver.id,
                          payType: "salary",
                          fee: 0,
                          salaryAmount: Number(selectedDriver.salary_amount || 0),
                        })
                      }
                    >
                      حفظ الراتب
                    </Button>
                  </div>
                )}
                {(selectedDriver.pay_type || "salary") === "per_order" && (
                  <div className="space-y-2">
                    <DriverWageTiersEditor
                      branchId={selectedDriver.branch_id || null}
                      drafts={editTierDrafts}
                      onChange={setEditTierDrafts}
                      extraStopFee={String(selectedDriver.extra_stop_fee ?? "")}
                      onExtraStopChange={(v) => setSelectedDriver({ ...selectedDriver, extra_stop_fee: v })}
                    />
                    <div>
                      <Label className="text-xs">أجر احتياطي إن لم تُطابق شريحة (ر.س)</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        dir="ltr"
                        value={selectedDriver.per_delivery_fee ?? ""}
                        onChange={(e) => setSelectedDriver({ ...selectedDriver, per_delivery_fee: e.target.value })}
                        placeholder="اختياري"
                      />
                    </div>
                    <Button
                      size="sm"
                      className="w-full"
                      disabled={updatePayMutation.isPending}
                      onClick={() =>
                        updatePayMutation.mutate({
                          driverId: selectedDriver.id,
                          payType: "per_order",
                          fee: Number(selectedDriver.per_delivery_fee || 0),
                          extraFee: 0,
                          extraStopFee: Number(selectedDriver.extra_stop_fee || 0),
                          tiers: editTierDrafts,
                        })
                      }
                    >
                      حفظ الأجر والشرائح
                    </Button>
                  </div>
                )}
                {(selectedDriver.pay_type || "salary") === "per_order" && (
                  <p className="text-xs text-muted-foreground pt-1">
                    أجر الكاش يُخصم عند التحصيل ولا يُصرف مرة ثانية.
                  </p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminDriversPage;
