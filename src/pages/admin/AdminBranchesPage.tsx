import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, MapPin, Plus, Pencil, ExternalLink, Store, Link2, UserPlus, Clock } from "lucide-react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { mapsLinkFromCoords, parseMapsCoords } from "@/lib/maps-link";

type BranchRow = {
  id: string;
  name: string;
  city?: string | null;
  address?: string | null;
  phone?: string | null;
  slug: string;
  lat?: number | null;
  lng?: number | null;
  is_active: boolean;
  work_start?: string | null;
  work_end?: string | null;
};

type StoreAdmin = {
  user_id: string;
  full_name: string | null;
  phone: string | null;
};

const toTimeInput = (value?: string | null, fallback = "08:00") => {
  if (!value) return fallback;
  return value.slice(0, 5);
};

const BranchHoursEditor = ({
  branch,
  canEdit,
  saving,
  onSave,
}: {
  branch: BranchRow;
  canEdit: boolean;
  saving: boolean;
  onSave: (hours: { work_start: string; work_end: string }) => void;
}) => {
  const [start, setStart] = useState(() => toTimeInput(branch.work_start, "08:00"));
  const [end, setEnd] = useState(() => toTimeInput(branch.work_end, "23:00"));

  const dirty =
    toTimeInput(start) !== toTimeInput(branch.work_start, "08:00") ||
    toTimeInput(end) !== toTimeInput(branch.work_end, "23:00");

  return (
    <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-2">
      <p className="font-semibold flex items-center gap-1">
        <Clock className="h-3.5 w-3.5" />
        أوقات الدوام
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[11px]">بداية الدوام</Label>
          <Input
            type="time"
            dir="ltr"
            className="h-9"
            value={start}
            disabled={!canEdit}
            onChange={(e) => setStart(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-[11px]">نهاية الدوام</Label>
          <Input
            type="time"
            dir="ltr"
            className="h-9"
            value={end}
            disabled={!canEdit}
            onChange={(e) => setEnd(e.target.value)}
          />
        </div>
      </div>
      {canEdit && (
        <Button
          type="button"
          size="sm"
          className="h-8 w-full"
          disabled={!dirty || saving || !start || !end}
          onClick={() => onSave({ work_start: start, work_end: end })}
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin ml-1" /> : null}
          حفظ الدوام
        </Button>
      )}
    </div>
  );
};

const AdminBranchesContent = () => {
  const queryClient = useQueryClient();
  const { isSuperAdmin, scopedBranchIds } = useAdminAuth();

  const [managersBranch, setManagersBranch] = useState<BranchRow | null>(null);
  const [selectedManagerIds, setSelectedManagerIds] = useState<string[]>([]);
  const [newManagerName, setNewManagerName] = useState("");
  const [newManagerUsername, setNewManagerUsername] = useState("");
  const [newManagerPassword, setNewManagerPassword] = useState("");
  const [locationBranch, setLocationBranch] = useState<BranchRow | null>(null);
  const [locationLink, setLocationLink] = useState("");
  const [editManagerId, setEditManagerId] = useState<string | null>(null);
  const [editManagerName, setEditManagerName] = useState("");
  const [editManagerUsername, setEditManagerUsername] = useState("");
  const [editManagerPassword, setEditManagerPassword] = useState("");
  const [editManagerLoading, setEditManagerLoading] = useState(false);

  const { data: branches, isLoading } = useQuery({
    queryKey: ["admin-branches", scopedBranchIds],
    queryFn: async () => {
      let q = supabase.from("branches").select("*").order("created_at");
      // Store admins only see their assigned branches
      if (scopedBranchIds && scopedBranchIds.length > 0) {
        q = q.in("id", scopedBranchIds);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data as BranchRow[];
    },
  });

  const { data: storeAdmins = [] } = useQuery({
    queryKey: ["store-admins-for-branches"],
    enabled: isSuperAdmin,
    queryFn: async () => {
      const { data: roles, error } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "store_admin");
      if (error) throw error;
      const ids = [...new Set((roles || []).map((r) => r.user_id))];
      if (ids.length === 0) return [] as StoreAdmin[];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, phone")
        .in("user_id", ids);
      return (profiles || []).map((p) => ({
        user_id: p.user_id,
        full_name: p.full_name,
        phone: p.phone,
      })) as StoreAdmin[];
    },
  });

  const { data: allAccess = [], isFetching: accessLoading } = useQuery({
    queryKey: ["admin-branch-access"],
    enabled: isSuperAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_branch_access" as any)
        .select("user_id, branch_id");
      if (error) throw error;
      return (data || []) as { user_id: string; branch_id: string }[];
    },
  });

  /** Managers grouped strictly by branch_id — never mix across branches */
  const managersByBranch = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const row of allAccess) {
      const list = map.get(row.branch_id) || [];
      list.push(row.user_id);
      map.set(row.branch_id, list);
    }
    return map;
  }, [allAccess]);

  const toggleMutation = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      if (!isSuperAdmin) throw new Error("not allowed");
      const { error } = await supabase.from("branches").update({ is_active: value }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-branches"] });
      toast.success("تم التحديث");
    },
    onError: () => toast.error("حدث خطأ"),
  });

  const saveLocationMutation = useMutation({
    mutationFn: async ({ id, lat, lng }: { id: string; lat: number; lng: number }) => {
      const { error } = await supabase
        .from("branches")
        .update({ lat, lng })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-branches"] });
      queryClient.invalidateQueries({ queryKey: ["admin-branches-delivery"] });
      toast.success("تم حفظ موقع الفرع");
      setLocationBranch(null);
    },
    onError: (e: any) => toast.error(e?.message || "تعذر حفظ الموقع"),
  });

  const saveHoursMutation = useMutation({
    mutationFn: async ({
      id,
      work_start,
      work_end,
    }: {
      id: string;
      work_start: string;
      work_end: string;
    }) => {
      const { error } = await supabase.from("branches").update({ work_start, work_end }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-branches"] });
      toast.success("تم حفظ أوقات الدوام");
    },
    onError: (e: any) => toast.error(e?.message || "تعذر حفظ الدوام"),
  });

  const saveManagersMutation = useMutation({
    mutationFn: async ({ branchId, userIds }: { branchId: string; userIds: string[] }) => {
      // Only touch access rows for THIS branch
      const current = allAccess
        .filter((a) => a.branch_id === branchId)
        .map((a) => a.user_id);
      const toAdd = userIds.filter((id) => !current.includes(id));
      const toRemove = current.filter((id) => !userIds.includes(id));

      if (toRemove.length > 0) {
        const { error } = await supabase
          .from("admin_branch_access" as any)
          .delete()
          .eq("branch_id", branchId)
          .in("user_id", toRemove);
        if (error) throw error;
      }
      if (toAdd.length > 0) {
        const { error } = await supabase.from("admin_branch_access" as any).insert(
          toAdd.map((user_id) => ({ user_id, branch_id: branchId })),
        );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-branch-access"] });
      toast.success("تم تحديث مدراء الفرع — لديهم صلاحيات هذا الفرع فقط");
      setManagersBranch(null);
    },
    onError: (e: any) => toast.error(e?.message || "تعذر حفظ المدراء"),
  });

  const createManagerMutation = useMutation({
    mutationFn: async ({
      branchId,
      fullName,
      username,
      password,
    }: {
      branchId: string;
      fullName: string;
      username: string;
      password: string;
    }) => {
      const { data, error } = await supabase.rpc("create_branch_manager", {
        p_full_name: fullName,
        p_username: username,
        p_password: password,
        p_branch_id: branchId,
      });
      if (error) throw error;
      const payload = data as { user_id?: string; error?: string } | null;
      if (payload?.error) throw new Error(payload.error);
      if (!payload?.user_id) throw new Error("تعذر إنشاء المدير");
      return payload as { user_id: string };
    },
    onSuccess: (data) => {
      if (data?.user_id) {
        setSelectedManagerIds((prev) =>
          prev.includes(data.user_id) ? prev : [...prev, data.user_id],
        );
      }
      setNewManagerName("");
      setNewManagerUsername("");
      setNewManagerPassword("");
      queryClient.invalidateQueries({ queryKey: ["store-admins-for-branches"] });
      queryClient.invalidateQueries({ queryKey: ["admin-branch-access"] });
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("تم إنشاء مدير الفرع وتعيينه لهذا الفرع");
    },
    onError: (e: any) => toast.error(e?.message || "تعذر إنشاء المدير"),
  });

  const updateManagerMutation = useMutation({
    mutationFn: async ({
      userId,
      fullName,
      username,
      password,
    }: {
      userId: string;
      fullName: string;
      username: string;
      password: string;
    }) => {
      const { data, error } = await supabase.rpc("update_branch_manager", {
        p_user_id: userId,
        p_full_name: fullName,
        p_username: username,
        p_password: password.trim() ? password : "",
      });
      if (error) throw error;
      const payload = data as { success?: boolean } | null;
      if (!payload?.success) throw new Error("تعذر حفظ التعديلات");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["store-admins-for-branches"] });
      toast.success("تم تحديث بيانات مدير الفرع");
      setEditManagerId(null);
      setEditManagerPassword("");
    },
    onError: (e: any) => toast.error(e?.message || "تعذر تحديث المدير"),
  });

  const openEditManager = async (userId: string) => {
    setEditManagerId(userId);
    setEditManagerPassword("");
    setEditManagerLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_branch_manager_account", {
        p_user_id: userId,
      });
      if (error) throw error;
      const payload = data as { full_name?: string; username?: string } | null;
      setEditManagerName(payload?.full_name || "");
      setEditManagerUsername(payload?.username || "");
    } catch (e: any) {
      toast.error(e?.message || "تعذر تحميل بيانات المدير");
      setEditManagerId(null);
    } finally {
      setEditManagerLoading(false);
    }
  };

  const openManagers = (branch: BranchRow) => {
    setManagersBranch(branch);
    setSelectedManagerIds([...(managersByBranch.get(branch.id) || [])]);
    setNewManagerName("");
    setNewManagerUsername("");
    setNewManagerPassword("");
  };

  const openLocation = (branch: BranchRow) => {
    setLocationBranch(branch);
    if (
      branch.lat != null &&
      branch.lng != null &&
      Number.isFinite(Number(branch.lat)) &&
      Number.isFinite(Number(branch.lng))
    ) {
      setLocationLink(mapsLinkFromCoords(Number(branch.lat), Number(branch.lng)));
    } else {
      setLocationLink("");
    }
  };

  const visitBranchStorefront = (branch: BranchRow) => {
    const url = `${window.location.origin}/?location=${encodeURIComponent(branch.slug)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const hasLocation = (b: BranchRow) =>
    b.lat != null && b.lng != null && Number.isFinite(Number(b.lat)) && Number.isFinite(Number(b.lng));

  return (
    <>
      <Badge variant="outline" className="mb-4">
        {branches?.length ?? 0} فرع
      </Badge>
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {branches?.map((b) => {
            const managerIds = managersByBranch.get(b.id) || [];
            return (
              <div key={b.id} className="bg-card rounded-xl border p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold">{b.name}</h3>
                  <div className="flex items-center gap-4">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1"
                      title="فتح واجهة العميل لهذا الفرع"
                      onClick={() => visitBranchStorefront(b)}
                    >
                      <Store className="h-3.5 w-3.5" />
                      زيارة الفرع
                      <ExternalLink className="h-3 w-3 opacity-60" />
                    </Button>
                    {isSuperAdmin && (
                      <Switch
                        checked={b.is_active}
                        onCheckedChange={(v) => toggleMutation.mutate({ id: b.id, value: v })}
                      />
                    )}
                  </div>
                </div>

                <div className="text-sm text-muted-foreground space-y-1">
                  {b.city && <p className="font-medium text-foreground">{b.city}</p>}
                  {b.address && (
                    <p className="flex items-center gap-1">
                      <MapPin className="h-3 w-3 shrink-0" />
                      {b.address}
                    </p>
                  )}
                  {b.phone && <p>📞 {b.phone}</p>}
                </div>

                {/* Branch location — foundation for zones & rate tiers */}
                <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold">موقع الفرع (اللوكيشن)</p>
                    {(isSuperAdmin || (scopedBranchIds || []).includes(b.id)) && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2"
                        onClick={() => openLocation(b)}
                      >
                        <Pencil className="h-3.5 w-3.5 ml-1" />
                        {hasLocation(b) ? "تعديل" : "تعيين"}
                      </Button>
                    )}
                  </div>
                  {hasLocation(b) ? (
                    <a
                      href={mapsLinkFromCoords(Number(b.lat), Number(b.lng))}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline break-all"
                      dir="ltr"
                    >
                      <Link2 className="h-3 w-3 shrink-0" />
                      <span className="text-[11px] font-mono truncate max-w-full">
                        {mapsLinkFromCoords(Number(b.lat), Number(b.lng))}
                      </span>
                    </a>
                  ) : (
                    <p className="text-amber-700 dark:text-amber-400">
                      لم يُحدَّد موقع بعد — حدّده ليُبنى عليه النطاق الجغرافي وشرائح التوصيل
                    </p>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    النطاق الجغرافي والشرائح الخاصة بهذا الفرع تُدار من «إعدادات التوصيل» بعد تعيين الموقع.
                  </p>
                </div>

                <BranchHoursEditor
                  key={`${b.id}-${toTimeInput(b.work_start)}-${toTimeInput(b.work_end)}`}
                  branch={b}
                  canEdit={isSuperAdmin || (scopedBranchIds || []).includes(b.id)}
                  saving={saveHoursMutation.isPending && saveHoursMutation.variables?.id === b.id}
                  onSave={({ work_start, work_end }) =>
                    saveHoursMutation.mutate({ id: b.id, work_start, work_end })
                  }
                />

                {isSuperAdmin && (
                  <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold">مدراء الفرع</p>
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="h-7 w-7"
                        title="إضافة / تعديل مدراء هذا الفرع"
                        onClick={() => openManagers(b)}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    {accessLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : managerIds.length === 0 ? (
                      <p className="text-muted-foreground">لم يُعيَّن مدراء بعد</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {managerIds.map((uid) => {
                          const admin = storeAdmins.find((a) => a.user_id === uid);
                          return (
                            <div
                              key={uid}
                              className="inline-flex items-center gap-1 rounded-full bg-secondary text-secondary-foreground px-2 py-0.5"
                            >
                              <span className="text-xs font-medium">
                                {admin?.full_name || uid.slice(0, 8)}
                              </span>
                              <button
                                type="button"
                                className="h-5 w-5 inline-flex items-center justify-center rounded-full hover:bg-background/70"
                                title="تعديل بيانات المدير"
                                onClick={() => openEditManager(uid)}
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      المدير المعيَّن هنا يحصل على كل صلاحيات هذا الفرع فقط (لا يرى فروع أخرى).
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Location dialog — scoped to one branch */}
      <Dialog open={!!locationBranch} onOpenChange={(open) => !open && setLocationBranch(null)}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              موقع الفرع — {locationBranch?.name}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            الصق رابط موقع الفرع من خرائط جوجل (أو إحداثيات lat,lng). يُستخدم كمركز للنطاق الجغرافي وشرائح التوصيل.
          </p>
          <div className="space-y-2">
            <Label htmlFor="branch-maps-link">رابط الموقع</Label>
            <Input
              id="branch-maps-link"
              dir="ltr"
              type="url"
              value={locationLink}
              onChange={(e) => setLocationLink(e.target.value)}
              placeholder="https://www.google.com/maps?q=21.452,39.857"
              className="font-mono text-sm"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLocationBranch(null)}>
              إلغاء
            </Button>
            <Button
              disabled={
                !locationBranch ||
                saveLocationMutation.isPending ||
                !locationLink.trim()
              }
              onClick={() => {
                if (!locationBranch) return;
                const coords = parseMapsCoords(locationLink);
                if (!coords) {
                  toast.error("تعذر قراءة الموقع من الرابط — استخدم رابط خرائط جوجل أو lat,lng");
                  return;
                }
                saveLocationMutation.mutate({
                  id: locationBranch.id,
                  lat: coords.lat,
                  lng: coords.lng,
                });
              }}
            >
              {saveLocationMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin ml-2" />
              ) : null}
              حفظ الموقع
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Managers dialog — access rows filtered by this branch only */}
      <Dialog
        open={!!managersBranch}
        onOpenChange={(open) => {
          if (!open) {
            setManagersBranch(null);
            setNewManagerName("");
            setNewManagerUsername("");
            setNewManagerPassword("");
          }
        }}
      >
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>مدراء {managersBranch?.name}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            عيّن مشرفي المتجر لهذا الفرع فقط. يحصل كل مدير على صلاحيات إدارة هذا الفرع دون الوصول لفروع أخرى.
          </p>

          <div className="rounded-lg border p-3 space-y-3">
            <p className="text-sm font-semibold flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-primary" />
              إضافة مدير فرع جديد
            </p>
            <div className="space-y-2">
              <Label htmlFor="new-manager-name">الاسم</Label>
              <Input
                id="new-manager-name"
                value={newManagerName}
                onChange={(e) => setNewManagerName(e.target.value)}
                placeholder="الاسم الكامل"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-manager-username">اسم المستخدم</Label>
              <Input
                id="new-manager-username"
                dir="ltr"
                value={newManagerUsername}
                onChange={(e) => setNewManagerUsername(e.target.value)}
                placeholder="username"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-manager-password">كلمة المرور</Label>
              <Input
                id="new-manager-password"
                dir="ltr"
                type="password"
                value={newManagerPassword}
                onChange={(e) => setNewManagerPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </div>
            <Button
              type="button"
              className="w-full"
              disabled={
                !managersBranch ||
                createManagerMutation.isPending ||
                !newManagerName.trim() ||
                !newManagerUsername.trim() ||
                !newManagerPassword.trim()
              }
              onClick={() => {
                if (!managersBranch) return;
                if (newManagerPassword.trim().length < 6) {
                  toast.error("كلمة المرور يجب ألا تقل عن 6 أحرف");
                  return;
                }
                createManagerMutation.mutate({
                  branchId: managersBranch.id,
                  fullName: newManagerName.trim(),
                  username: newManagerUsername.trim(),
                  password: newManagerPassword,
                });
              }}
            >
              {createManagerMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin ml-2" />
              ) : (
                <UserPlus className="h-4 w-4 ml-2" />
              )}
              إنشاء المدير
            </Button>
          </div>

          {storeAdmins.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2 text-center">
              لا يوجد مدراء بعد. أنشئ مديراً من الحقول أعلاه.
            </p>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {storeAdmins.map((admin) => {
                const checked = selectedManagerIds.includes(admin.user_id);
                return (
                  <label
                    key={admin.user_id}
                    className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/40"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => {
                        setSelectedManagerIds((prev) =>
                          v ? [...prev, admin.user_id] : prev.filter((id) => id !== admin.user_id),
                        );
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{admin.full_name || "بدون اسم"}</p>
                      <p className="text-xs text-muted-foreground">
                        {admin.phone || admin.user_id.slice(0, 8)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 shrink-0"
                      title="تعديل بيانات المدير"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        openEditManager(admin.user_id);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </label>
                );
              })}
            </div>
          )}
          <DialogFooter>
            <Button
              onClick={() =>
                managersBranch &&
                saveManagersMutation.mutate({
                  branchId: managersBranch.id,
                  userIds: selectedManagerIds,
                })
              }
              disabled={!managersBranch || saveManagersMutation.isPending}
            >
              {saveManagersMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin ml-2" />
              ) : null}
              حفظ المدراء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!editManagerId}
        onOpenChange={(open) => {
          if (!open) {
            setEditManagerId(null);
            setEditManagerPassword("");
          }
        }}
      >
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>تعديل مدير الفرع</DialogTitle>
          </DialogHeader>
          {editManagerLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="edit-manager-name">الاسم</Label>
                <Input
                  id="edit-manager-name"
                  value={editManagerName}
                  onChange={(e) => setEditManagerName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-manager-username">اسم المستخدم</Label>
                <Input
                  id="edit-manager-username"
                  dir="ltr"
                  value={editManagerUsername}
                  onChange={(e) => setEditManagerUsername(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-manager-password">كلمة المرور الجديدة</Label>
                <Input
                  id="edit-manager-password"
                  dir="ltr"
                  type="password"
                  value={editManagerPassword}
                  onChange={(e) => setEditManagerPassword(e.target.value)}
                  placeholder="اتركها فارغة إذا لا تريد التغيير"
                  autoComplete="new-password"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditManagerId(null)}>
              إلغاء
            </Button>
            <Button
              disabled={
                !editManagerId ||
                editManagerLoading ||
                updateManagerMutation.isPending ||
                !editManagerName.trim() ||
                !editManagerUsername.trim()
              }
              onClick={() => {
                if (!editManagerId) return;
                if (editManagerPassword.trim() && editManagerPassword.trim().length < 6) {
                  toast.error("كلمة المرور يجب ألا تقل عن 6 أحرف");
                  return;
                }
                updateManagerMutation.mutate({
                  userId: editManagerId,
                  fullName: editManagerName.trim(),
                  username: editManagerUsername.trim(),
                  password: editManagerPassword,
                });
              }}
            >
              {updateManagerMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin ml-2" />
              ) : null}
              حفظ التعديلات
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

const AdminBranchesPage = () => (
  <AdminLayout title="إدارة الفروع">
    <AdminBranchesContent />
  </AdminLayout>
);

export default AdminBranchesPage;
