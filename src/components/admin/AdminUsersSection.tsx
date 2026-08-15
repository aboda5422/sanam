import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Plus, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { STAFF_ROLE_META, type StaffRole } from "@/lib/staff-access";

type StaffUser = {
  user_id: string;
  role: StaffRole;
  created_at: string;
  full_name: string | null;
  phone: string | null;
  contact_email: string | null;
  id_number: string | null;
};

const AdminUsersSection = () => {
  const queryClient = useQueryClient();
  const { isSuperAdmin, branchIds, branches: authBranches } = useAdminAuth();
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<StaffRole>("accountant");
  const [phone, setPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [scope, setScope] = useState<"all" | "branches">(isSuperAdmin ? "all" : "branches");
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);
  const [addOpen, setAddOpen] = useState(false);

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

  const accessByUser = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const row of branchAccess) {
      const list = map.get(row.user_id) || [];
      list.push(row.branch_id);
      map.set(row.user_id, list);
    }
    return map;
  }, [branchAccess]);

  const { data: staff = [], isLoading } = useQuery({
    queryKey: ["site-staff-users"],
    queryFn: async () => {
      const { data: roles, error } = await supabase
        .from("user_roles")
        .select("user_id, role, created_at")
        .in("role", ["site_admin", "accountant", "inventory", "support"]);
      if (error) throw error;
      const userIds = [...new Set((roles || []).map((r) => r.user_id))];
      if (userIds.length === 0) return [] as StaffUser[];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, phone, contact_email, id_number")
        .in("user_id", userIds);
      const profileByUser = new Map((profiles || []).map((p: any) => [p.user_id, p]));
      const picked = new Map<string, StaffUser>();
      const rank = { site_admin: 0, accountant: 1, inventory: 2, support: 3 } as Record<string, number>;
      for (const r of roles || []) {
        const existing = picked.get(r.user_id);
        if (existing && (rank[existing.role] ?? 9) <= (rank[r.role] ?? 9)) continue;
        const p = profileByUser.get(r.user_id);
        picked.set(r.user_id, {
          user_id: r.user_id,
          role: r.role as StaffRole,
          created_at: r.created_at,
          full_name: p?.full_name ?? null,
          phone: p?.phone ?? null,
          contact_email: p?.contact_email ?? null,
          id_number: p?.id_number ?? null,
        });
      }
      return [...picked.values()];
    },
  });

  const visibleStaff = isSuperAdmin
    ? staff
    : staff.filter((u) => {
        if (u.role === "site_admin") return false;
        const ids = accessByUser.get(u.user_id) || [];
        return ids.some((id) => branchIds.includes(id));
      });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!fullName.trim() || !username.trim() || !password.trim()) {
        throw new Error("الاسم الكامل واسم المستخدم وكلمة المرور مطلوبة");
      }
      const ids = role === "site_admin" || (isSuperAdmin && scope === "all") ? [] : selectedBranchIds;
      if (role !== "site_admin" && !(isSuperAdmin && scope === "all") && ids.length === 0) {
        throw new Error("حدد فرعاً واحداً على الأقل أو صلاحية الموقع كاملاً");
      }
      const { data, error } = await supabase.rpc("create_site_staff", {
        p_full_name: fullName.trim(),
        p_username: username.trim(),
        p_password: password,
        p_role: role,
        p_phone: phone.trim() || undefined,
        p_contact_email: contactEmail.trim() || undefined,
        p_id_number: idNumber.trim() || undefined,
        p_branch_ids: ids,
      });
      if (error) throw error;
      if (!(data as any)?.success) throw new Error("فشل إنشاء المستخدم");
    },
    onSuccess: () => {
      toast.success("تم إضافة مستخدم الموقع");
      setFullName("");
      setUsername("");
      setPassword("");
      setPhone("");
      setContactEmail("");
      setIdNumber("");
      setSelectedBranchIds([]);
      setAddOpen(false);
      queryClient.invalidateQueries({ queryKey: ["site-staff-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-branch-access"] });
    },
    onError: (e: any) => toast.error(e.message || "تعذر الإضافة"),
  });

  const removeMutation = useMutation({
    mutationFn: async (user: StaffUser) => {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", user.user_id).eq("role", user.role);
      if (error) throw error;
      await supabase.from("admin_branch_access" as any).delete().eq("user_id", user.user_id);
    },
    onSuccess: () => {
      toast.success("تم إزالة المستخدم من صلاحيات الموقع");
      queryClient.invalidateQueries({ queryKey: ["site-staff-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-branch-access"] });
    },
    onError: () => toast.error("تعذر الإزالة"),
  });

  const branchName = (id: string) => allBranches.find((b) => b.id === id)?.name || id.slice(0, 8);

  if (isLoading) return <Loader2 className="h-6 w-6 animate-spin mx-auto" />;

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        مستخدمو لوحة الموقع فقط. مدراء الفروع يُضافون من صفحة الفروع، والمناديب من إدارة المناديب.
      </p>

      <div className="space-y-2">
        {visibleStaff.length === 0 ? (
          <p className="text-center text-muted-foreground py-6 text-sm">لا يوجد مستخدمو موقع بعد</p>
        ) : (
          visibleStaff.map((u) => {
            const meta = STAFF_ROLE_META[u.role];
            const ids = accessByUser.get(u.user_id) || [];
            return (
              <div key={`${u.user_id}-${u.role}`} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0 space-y-1">
                  <p className="font-medium">{u.full_name || "بدون اسم"}</p>
                  <div className="flex flex-wrap gap-1">
                    <Badge className={meta.color}>{meta.label}</Badge>
                    {u.role === "site_admin" || ids.length === 0 ? (
                      <Badge variant="outline">الموقع كاملاً</Badge>
                    ) : (
                      ids.map((id) => (
                        <Badge key={id} variant="secondary">{branchName(id)}</Badge>
                      ))
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {u.phone || "بدون جوال"}
                    {u.contact_email ? ` · ${u.contact_email}` : ""}
                  </p>
                </div>
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
            );
          })
        )}
      </div>

      <button
        type="button"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        onClick={() => setAddOpen(true)}
      >
        إضافة مستخدم
        <Plus className="h-4 w-4" />
      </button>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent
          data-add-staff-dialog=""
          className="max-w-lg max-h-[90vh] overflow-y-auto"
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
          <div className="space-y-3">
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
                <Input dir="ltr" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
              </div>
              <div>
                <Label>الصلاحية *</Label>
                <Select value={role} onValueChange={(v) => setRole(v as StaffRole)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {isSuperAdmin && <SelectItem value="site_admin">مدير الموقع</SelectItem>}
                    <SelectItem value="accountant">محاسب</SelectItem>
                    <SelectItem value="inventory">مخزون</SelectItem>
                    <SelectItem value="support">شكاوى العملاء</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>الجوال</Label>
                <Input dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div>
                <Label>البريد الإلكتروني</Label>
                <Input dir="ltr" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <Label>رقم الهوية</Label>
                <Input dir="ltr" value={idNumber} onChange={(e) => setIdNumber(e.target.value)} />
              </div>
            </div>

            {role !== "site_admin" && (
              <div className="space-y-2">
                <Label>نطاق الصلاحية</Label>
                {isSuperAdmin && (
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant={scope === "all" ? "default" : "outline"} onClick={() => setScope("all")}>
                      الموقع كاملاً
                    </Button>
                    <Button type="button" size="sm" variant={scope === "branches" ? "default" : "outline"} onClick={() => setScope("branches")}>
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
                            setSelectedBranchIds((prev) => (v ? [...prev, b.id] : prev.filter((id) => id !== b.id)))
                          }
                        />
                        {b.name}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !fullName.trim() || !username.trim() || !password.trim()}
            >
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <UserPlus className="h-4 w-4 ml-1" />}
              إضافة المستخدم
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminUsersSection;
