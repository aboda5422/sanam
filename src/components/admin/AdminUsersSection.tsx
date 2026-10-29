import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Pencil, Plus, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { STAFF_ROLE_META, type StaffRole } from "@/lib/staff-access";
import {
  ADMIN_NAV_GROUP_LABELS,
  ADMIN_NAV_ITEMS,
  ADMIN_NAV_BY_PATH,
  normalizeNavPaths,
  type AdminNavGroup,
} from "@/lib/admin-nav";
import { useCloseSettingsDialog } from "@/contexts/SettingsDialogCloseContext";
import { cn } from "@/lib/utils";

type StaffUser = {
  user_id: string;
  role: StaffRole | "store_admin";
  created_at: string;
  full_name: string | null;
  phone: string | null;
  contact_email: string | null;
  id_number: string | null;
  nav_paths: string[];
};

const GROUPS: AdminNavGroup[] = ["main", "operations", "system"];

function NavIconPicker({
  selected,
  onChange,
  disabled,
}: {
  selected: string[];
  onChange: (paths: string[]) => void;
  disabled?: boolean;
}) {
  const selectedSet = new Set(selected);
  const toggle = (path: string, on: boolean) => {
    if (path === "/admin") return; // dashboard always included when any selected
    const next = on
      ? normalizeNavPaths([...selected, path])
      : normalizeNavPaths(selected.filter((p) => p !== path));
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Label>أيقونات اللوحة *</Label>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => onChange(normalizeNavPaths(ADMIN_NAV_ITEMS.map((i) => i.path)))}
          >
            تحديد الكل
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => onChange([])}>
            مسح
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        الأيقونات المحددة تظهر نشطة للمستخدم؛ الباقي يظهر باهتاً وغير قابل للفتح.
      </p>
      {GROUPS.map((group) => (
        <div key={group} className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">{ADMIN_NAV_GROUP_LABELS[group]}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {ADMIN_NAV_ITEMS.filter((i) => i.group === group).map((item) => {
              const checked = selectedSet.has(item.path);
              const locked = item.path === "/admin" && selected.length > 0;
              return (
                <label
                  key={item.path}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-sm cursor-pointer transition-colors",
                    checked ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                    (disabled || locked) && "opacity-70",
                  )}
                >
                  <Checkbox
                    checked={checked || locked}
                    disabled={disabled || locked}
                    onCheckedChange={(v) => toggle(item.path, !!v)}
                  />
                  <item.icon className="h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0 truncate">{item.title}</span>
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

const AdminUsersSection = () => {
  const queryClient = useQueryClient();
  const closeDialog = useCloseSettingsDialog();
  const { isSuperAdmin, branchIds, branches: authBranches } = useAdminAuth();
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isSiteAdmin, setIsSiteAdmin] = useState(false);
  const [navPaths, setNavPaths] = useState<string[]>([]);
  const [phone, setPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [scope, setScope] = useState<"all" | "branches">(isSuperAdmin ? "all" : "branches");
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [editUser, setEditUser] = useState<StaffUser | null>(null);
  const [editNavPaths, setEditNavPaths] = useState<string[]>([]);

  const { data: allBranches = [] } = useQuery({
    queryKey: ["admin-branches-lite"],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("id, name, city, is_active").order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const assignableBranches = isSuperAdmin
    ? allBranches
    : allBranches.filter((b) => branchIds.includes(b.id) || authBranches.some((ab) => ab.id === b.id));

  const { data: branchAccess = [] } = useQuery({
    queryKey: ["admin-branch-access"],
    queryFn: async () => {
      const { data, error } = await supabase.from("admin_branch_access" as any).select("user_id, branch_id");
      if (error) throw error;
      return (data || []) as { user_id: string; branch_id: string }[];
    },
  });

  const { data: allNavRows = [] } = useQuery({
    queryKey: ["admin-nav-permissions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("admin_nav_permissions" as any).select("user_id, path");
      if (error) throw error;
      return (data || []) as { user_id: string; path: string }[];
    },
  });

  const accessByUser = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const row of branchAccess) {
      const list = map.get(row.user_id) || [];
      list.push(row.branch_id);
      map.set(row.user_id, list);
    }
    return map;
  }, [branchAccess]);

  const navByUser = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const row of allNavRows) {
      const list = map.get(row.user_id) || [];
      list.push(row.path);
      map.set(row.user_id, list);
    }
    return map;
  }, [allNavRows]);

  const { data: staff = [], isLoading } = useQuery({
    queryKey: ["site-staff-users"],
    queryFn: async () => {
      const { data: roles, error } = await supabase
        .from("user_roles")
        .select("user_id, role, created_at")
        .in("role", ["site_admin", "accountant", "inventory", "support", "store_admin"]);
      if (error) throw error;

      const { data: navRows } = await supabase.from("admin_nav_permissions" as any).select("user_id, path");
      const navMap = new Map<string, string[]>();
      for (const row of (navRows || []) as { user_id: string; path: string }[]) {
        const list = navMap.get(row.user_id) || [];
        list.push(row.path);
        navMap.set(row.user_id, list);
      }

      // Site staff = site_admin / classic staff roles OR anyone with explicit nav permissions
      // Exclude pure branch managers (store_admin only, no nav rows, no other staff roles)
      const roleRows = roles || [];
      const byUserRoles = new Map<string, { roles: string[]; created_at: string }>();
      for (const r of roleRows) {
        const cur = byUserRoles.get(r.user_id) || { roles: [], created_at: r.created_at };
        cur.roles.push(r.role);
        if (r.created_at < cur.created_at) cur.created_at = r.created_at;
        byUserRoles.set(r.user_id, cur);
      }

      const staffIds = [...byUserRoles.entries()]
        .filter(([uid, info]) => {
          if (info.roles.includes("site_admin")) return true;
          if (info.roles.some((x) => ["accountant", "inventory", "support"].includes(x))) return true;
          if (navMap.has(uid)) return true;
          return false;
        })
        .map(([uid]) => uid);

      if (staffIds.length === 0) return [] as StaffUser[];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, phone, contact_email, id_number")
        .in("user_id", staffIds);
      const profileByUser = new Map((profiles || []).map((p: any) => [p.user_id, p]));

      const rank: Record<string, number> = {
        site_admin: 0,
        store_admin: 1,
        accountant: 2,
        inventory: 3,
        support: 4,
      };

      return staffIds.map((uid) => {
        const info = byUserRoles.get(uid)!;
        const best = [...info.roles].sort((a, b) => (rank[a] ?? 9) - (rank[b] ?? 9))[0] as StaffUser["role"];
        const p = profileByUser.get(uid);
        return {
          user_id: uid,
          role: best,
          created_at: info.created_at,
          full_name: p?.full_name ?? null,
          phone: p?.phone ?? null,
          contact_email: p?.contact_email ?? null,
          id_number: p?.id_number ?? null,
          nav_paths: navMap.get(uid) || [],
        };
      });
    },
  });

  const visibleStaff = isSuperAdmin
    ? staff
    : staff.filter((u) => {
        if (u.role === "site_admin") return false;
        const ids = accessByUser.get(u.user_id) || [];
        return ids.some((id) => branchIds.includes(id));
      });

  const resetAddForm = () => {
    setFullName("");
    setUsername("");
    setPassword("");
    setIsSiteAdmin(false);
    setNavPaths([]);
    setPhone("");
    setContactEmail("");
    setIdNumber("");
    setSelectedBranchIds([]);
    setScope(isSuperAdmin ? "all" : "branches");
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!fullName.trim() || !username.trim() || !password.trim()) {
        throw new Error("الاسم الكامل واسم المستخدم وكلمة المرور مطلوبة");
      }
      if (!isSiteAdmin) {
        const paths = normalizeNavPaths(navPaths);
        if (paths.length === 0) throw new Error("حدد أيقونة واحدة على الأقل من قائمة اللوحة");
      }
      const ids = isSiteAdmin || (isSuperAdmin && scope === "all") ? [] : selectedBranchIds;
      if (!isSiteAdmin && !(isSuperAdmin && scope === "all") && ids.length === 0) {
        throw new Error("حدد فرعاً واحداً على الأقل أو صلاحية الموقع كاملاً");
      }
      const { data, error } = await supabase.rpc("create_site_staff" as any, {
        p_full_name: fullName.trim(),
        p_username: username.trim(),
        p_password: password,
        p_role: isSiteAdmin ? "site_admin" : "support",
        p_phone: phone.trim() || undefined,
        p_contact_email: contactEmail.trim() || undefined,
        p_id_number: idNumber.trim() || undefined,
        p_branch_ids: ids,
        p_nav_paths: isSiteAdmin ? null : normalizeNavPaths(navPaths),
      });
      if (error) throw error;
      if (!(data as any)?.success) throw new Error("فشل إنشاء المستخدم");
    },
    onSuccess: () => {
      toast.success("تم إضافة مستخدم الموقع");
      resetAddForm();
      setAddOpen(false);
      queryClient.invalidateQueries({ queryKey: ["site-staff-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-branch-access"] });
      queryClient.invalidateQueries({ queryKey: ["admin-nav-permissions"] });
      closeDialog?.();
    },
    onError: (e: any) => toast.error(e.message || "تعذر الإضافة"),
  });

  const editMutation = useMutation({
    mutationFn: async () => {
      if (!editUser) return;
      if (editUser.role === "site_admin") return;
      const paths = normalizeNavPaths(editNavPaths);
      if (paths.length === 0) throw new Error("حدد أيقونة واحدة على الأقل");
      const { data, error } = await supabase.rpc("set_site_staff_nav" as any, {
        p_user_id: editUser.user_id,
        p_nav_paths: paths,
      });
      if (error) throw error;
      if (!(data as any)?.success) throw new Error("فشل حفظ الصلاحيات");
    },
    onSuccess: () => {
      toast.success("تم تحديث صلاحيات الأيقونات");
      setEditUser(null);
      queryClient.invalidateQueries({ queryKey: ["site-staff-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-nav-permissions"] });
    },
    onError: (e: any) => toast.error(e.message || "تعذر الحفظ"),
  });

  const removeMutation = useMutation({
    mutationFn: async (user: StaffUser) => {
      const { data, error } = await supabase.rpc("remove_site_staff" as any, {
        p_user_id: user.user_id,
      });
      if (error) throw error;
      if (!(data as any)?.success) throw new Error("فشل الإزالة");
    },
    onSuccess: () => {
      toast.success("تم إزالة المستخدم من صلاحيات الموقع");
      queryClient.invalidateQueries({ queryKey: ["site-staff-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-branch-access"] });
      queryClient.invalidateQueries({ queryKey: ["admin-nav-permissions"] });
    },
    onError: (e: any) => toast.error(e?.message || "تعذر الإزالة"),
  });

  const branchName = (id: string) => allBranches.find((b) => b.id === id)?.name || id.slice(0, 8);

  if (isLoading) return <Loader2 className="h-6 w-6 animate-spin mx-auto" />;

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        أسند أيقونات القائمة الجانبية لكل مستخدم. الأيقونات غير المحددة تظهر له باهتة وغير فعالة. مدراء الفروع
        يُضافون من صفحة الفروع، والمناديب من إدارة المناديب.
      </p>

      <div className="space-y-2">
        {visibleStaff.length === 0 ? (
          <p className="text-center text-muted-foreground py-6 text-sm">لا يوجد مستخدمو موقع بعد</p>
        ) : (
          visibleStaff.map((u) => {
            const meta =
              u.role === "site_admin" || u.role === "accountant" || u.role === "inventory" || u.role === "support"
                ? STAFF_ROLE_META[u.role]
                : { label: "صلاحيات مخصصة", color: "bg-violet-100 text-violet-800" };
            const ids = accessByUser.get(u.user_id) || [];
            const paths = u.nav_paths.length ? u.nav_paths : navByUser.get(u.user_id) || [];
            return (
              <div key={u.user_id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0 space-y-1.5 flex-1">
                  <p className="font-medium">{u.full_name || "بدون اسم"}</p>
                  <div className="flex flex-wrap gap-1">
                    <Badge className={meta.color}>
                      {u.role === "site_admin" ? "مدير الموقع" : meta.label}
                    </Badge>
                    {u.role === "site_admin" || ids.length === 0 ? (
                      <Badge variant="outline">الموقع كاملاً</Badge>
                    ) : (
                      ids.map((id) => (
                        <Badge key={id} variant="secondary">
                          {branchName(id)}
                        </Badge>
                      ))
                    )}
                  </div>
                  {u.role === "site_admin" ? (
                    <p className="text-xs text-muted-foreground">كل أيقونات اللوحة</p>
                  ) : paths.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {paths
                        .filter((p) => p !== "/admin")
                        .map((p) => (
                          <Badge key={p} variant="outline" className="text-[10px] font-normal">
                            {ADMIN_NAV_BY_PATH[p]?.title || p}
                          </Badge>
                        ))}
                    </div>
                  ) : (
                    <p className="text-xs text-amber-700">بدون أيقونات مخصصة (صلاحية الدور الافتراضية)</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {u.phone || "بدون جوال"}
                    {u.contact_email ? ` · ${u.contact_email}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  {u.role !== "site_admin" && (
                    <Button
                      size="icon"
                      variant="ghost"
                      title="تعديل الأيقونات"
                      onClick={() => {
                        setEditUser(u);
                        setEditNavPaths(normalizeNavPaths(paths.length ? paths : []));
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-destructive"
                    disabled={removeMutation.isPending}
                    onClick={() => {
                      if (confirm("إزالة صلاحية هذا المستخدم؟")) removeMutation.mutate(u);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <button
        type="button"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        onClick={() => {
          resetAddForm();
          setAddOpen(true);
        }}
      >
        إضافة مستخدم
        <Plus className="h-4 w-4" />
      </button>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent
          data-add-staff-dialog=""
          className="max-w-2xl max-h-[90vh] overflow-y-auto"
          dir="rtl"
          onPointerDownOutside={(e) => e.stopPropagation()}
          onInteractOutside={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-primary" />
              إضافة مستخدم
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>الاسم الكامل *</Label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div>
                <Label>اسم المستخدم *</Label>
                <Input dir="ltr" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" />
              </div>
              <div>
                <Label>كلمة المرور *</Label>
                <Input
                  dir="ltr"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <div>
                <Label>الجوال</Label>
                <Input dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div>
                <Label>البريد الإلكتروني</Label>
                <Input
                  dir="ltr"
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                />
              </div>
              <div>
                <Label>رقم الهوية</Label>
                <Input dir="ltr" value={idNumber} onChange={(e) => setIdNumber(e.target.value)} />
              </div>
            </div>

            {isSuperAdmin && (
              <label className="flex items-center gap-2 text-sm rounded-lg border p-3 cursor-pointer">
                <Checkbox
                  checked={isSiteAdmin}
                  onCheckedChange={(v) => {
                    setIsSiteAdmin(!!v);
                    if (v) setNavPaths([]);
                  }}
                />
                <span>
                  <span className="font-medium">مدير الموقع — صلاحية كاملة</span>
                  <span className="block text-xs text-muted-foreground">كل أيقونات اللوحة بدون تقييد</span>
                </span>
              </label>
            )}

            {!isSiteAdmin && (
              <>
                <NavIconPicker selected={navPaths} onChange={setNavPaths} />
                <div className="space-y-2">
                  <Label>نطاق الفروع</Label>
                  {isSuperAdmin && (
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={scope === "all" ? "default" : "outline"}
                        onClick={() => setScope("all")}
                      >
                        الموقع كاملاً
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={scope === "branches" ? "default" : "outline"}
                        onClick={() => setScope("branches")}
                      >
                        فرع معيّن
                      </Button>
                    </div>
                  )}
                  {(!isSuperAdmin || scope === "branches") && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto border rounded-lg p-2">
                      {assignableBranches.map((b) => (
                        <label key={b.id} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={selectedBranchIds.includes(b.id)}
                            onCheckedChange={(v) =>
                              setSelectedBranchIds((prev) =>
                                v ? [...prev, b.id] : prev.filter((id) => id !== b.id),
                              )
                            }
                          />
                          {b.name}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            <Button
              onClick={() => createMutation.mutate()}
              disabled={
                createMutation.isPending ||
                !fullName.trim() ||
                !username.trim() ||
                !password.trim() ||
                (!isSiteAdmin && normalizeNavPaths(navPaths).length === 0)
              }
            >
              {createMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin ml-1" />
              ) : (
                <UserPlus className="h-4 w-4 ml-1" />
              )}
              إضافة المستخدم
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editUser} onOpenChange={(o) => !o && setEditUser(null)}>
        <DialogContent
          data-add-staff-dialog=""
          className="max-w-2xl max-h-[90vh] overflow-y-auto"
          dir="rtl"
          onPointerDownOutside={(e) => e.stopPropagation()}
          onInteractOutside={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4 text-primary" />
              تعديل أيقونات — {editUser?.full_name || "مستخدم"}
            </DialogTitle>
          </DialogHeader>
          <NavIconPicker selected={editNavPaths} onChange={setEditNavPaths} />
          <Button
            onClick={() => editMutation.mutate()}
            disabled={editMutation.isPending || normalizeNavPaths(editNavPaths).length === 0}
          >
            {editMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : null}
            حفظ الصلاحيات
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminUsersSection;
