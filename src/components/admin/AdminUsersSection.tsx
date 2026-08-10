import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Plus, Trash2, UserPlus, ShieldCheck, Crown, MapPin } from "lucide-react";
import { toast } from "sonner";

type AdminUser = {
  user_id: string;
  role: string;
  created_at: string;
  profile?: { full_name: string | null; email?: string | null; phone: string | null };
};

const ROLE_LABELS: Record<string, { label: string; color: string; icon: typeof ShieldCheck }> = {
  site_admin: { label: "مدير الموقع", color: "bg-red-100 text-red-800", icon: Crown },
  store_admin: { label: "مدير فرع", color: "bg-blue-100 text-blue-800", icon: ShieldCheck },
};

const AdminUsersSection = () => {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<string>("store_admin");
  const [newBranchIds, setNewBranchIds] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [editBranchIds, setEditBranchIds] = useState<string[]>([]);

  const { data: branches = [] } = useQuery({
    queryKey: ["admin-branches-lite"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("branches")
        .select("id, name, city, is_active")
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: branchAccess = [] } = useQuery({
    queryKey: ["admin-branch-access"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_branch_access" as any)
        .select("user_id, branch_id");
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

  const { data: adminUsers = [], isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data: roles, error } = await supabase
        .from("user_roles")
        .select("user_id, role, created_at")
        .in("role", ["store_admin", "site_admin"]);
      if (error) throw error;

      const userIds = roles?.map((r) => r.user_id) || [];
      if (userIds.length === 0) return [];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, phone")
        .in("user_id", userIds);

      return (roles || []).map((r) => ({
        ...r,
        profile: profiles?.find((p) => p.user_id === r.user_id),
      })) as AdminUser[];
    },
  });

  const syncBranches = async (userId: string, branchIds: string[]) => {
    const current = branchAccess.filter((a) => a.user_id === userId).map((a) => a.branch_id);
    const toAdd = branchIds.filter((id) => !current.includes(id));
    const toRemove = current.filter((id) => !branchIds.includes(id));

    if (toRemove.length > 0) {
      const { error } = await supabase
        .from("admin_branch_access" as any)
        .delete()
        .eq("user_id", userId)
        .in("branch_id", toRemove);
      if (error) throw error;
    }
    if (toAdd.length > 0) {
      const { error } = await supabase.from("admin_branch_access" as any).insert(
        toAdd.map((branch_id) => ({ user_id: userId, branch_id }))
      );
      if (error) throw error;
    }
  };

  const handleAddAdmin = async () => {
    if (!newEmail.trim()) {
      toast.error("أدخل البريد الإلكتروني");
      return;
    }
    if (newRole === "store_admin" && newBranchIds.length === 0) {
      toast.error("اختر فرعاً واحداً على الأقل لمدير الفرع");
      return;
    }
    setAdding(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-admin", {
        body: { action: "add", email: newEmail.trim(), role: newRole },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (newRole === "store_admin" && data?.user_id) {
        await syncBranches(data.user_id, newBranchIds);
      }

      toast.success("تم إضافة المشرف بنجاح");
      setShowAdd(false);
      setNewEmail("");
      setNewBranchIds([]);
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-branch-access"] });
      queryClient.invalidateQueries({ queryKey: ["store-admins-for-branches"] });
    } catch (err: any) {
      toast.error(err.message || "حدث خطأ أثناء الإضافة");
    } finally {
      setAdding(false);
    }
  };

  const removeMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const { error } = await supabase.functions.invoke("manage-admin", {
        body: { action: "remove", user_id: userId, role },
      });
      if (error) throw error;
      if (role === "store_admin") {
        await supabase.from("admin_branch_access" as any).delete().eq("user_id", userId);
      }
    },
    onSuccess: () => {
      toast.success("تم إزالة الصلاحية");
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-branch-access"] });
      queryClient.invalidateQueries({ queryKey: ["store-admins-for-branches"] });
    },
    onError: () => toast.error("حدث خطأ أثناء الإزالة"),
  });

  const saveBranchesMutation = useMutation({
    mutationFn: async ({ userId, branchIds }: { userId: string; branchIds: string[] }) => {
      if (branchIds.length === 0) throw new Error("يجب اختيار فرع واحد على الأقل");
      await syncBranches(userId, branchIds);
    },
    onSuccess: () => {
      toast.success("تم تحديث فروع المدير");
      setEditUser(null);
      queryClient.invalidateQueries({ queryKey: ["admin-branch-access"] });
      queryClient.invalidateQueries({ queryKey: ["store-admins-for-branches"] });
    },
    onError: (e: any) => toast.error(e?.message || "تعذر الحفظ"),
  });

  const toggleBranch = (list: string[], id: string, checked: boolean) =>
    checked ? [...list, id] : list.filter((x) => x !== id);

  if (isLoading) return <Loader2 className="h-6 w-6 animate-spin mx-auto" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          إدارة المشرفين وتعيين مدراء الفروع
        </p>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <UserPlus className="h-4 w-4 ml-2" />
          إضافة مشرف
        </Button>
      </div>

      {adminUsers.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">لا يوجد مشرفين</p>
      ) : (
        <div className="space-y-2">
          {adminUsers.map((u) => {
            const roleInfo =
              ROLE_LABELS[u.role] || {
                label: u.role,
                color: "bg-gray-100 text-gray-800",
                icon: ShieldCheck,
              };
            const RoleIcon = roleInfo.icon;
            const userBranches = accessByUser.get(u.user_id) || [];
            return (
              <div
                key={`${u.user_id}-${u.role}`}
                className="flex flex-col gap-2 p-3 rounded-lg border sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                    <RoleIcon className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{u.profile?.full_name || "بدون اسم"}</p>
                    <p className="text-xs text-muted-foreground">
                      {u.profile?.phone || u.user_id.slice(0, 8) + "..."}
                    </p>
                    {u.role === "store_admin" && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {userBranches.length === 0 ? (
                          <span className="text-xs text-destructive">بدون فرع معيّن</span>
                        ) : (
                          userBranches.map((bid) => {
                            const b = branches.find((x) => x.id === bid);
                            return (
                              <Badge key={bid} variant="outline" className="text-[10px]">
                                <MapPin className="h-3 w-3 ml-0.5" />
                                {b?.name || bid.slice(0, 6)}
                              </Badge>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <Badge variant="secondary" className={roleInfo.color}>
                    {roleInfo.label}
                  </Badge>
                  {u.role === "store_admin" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditUser(u);
                        setEditBranchIds([...(accessByUser.get(u.user_id) || [])]);
                      }}
                    >
                      الفروع
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => removeMutation.mutate({ userId: u.user_id, role: u.role })}
                    disabled={removeMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              إضافة مشرف جديد
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>البريد الإلكتروني للمستخدم</Label>
              <Input
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="admin@example.com"
                dir="ltr"
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                يجب أن يكون المستخدم مسجلاً مسبقاً في المتجر
              </p>
            </div>
            <div>
              <Label>الصلاحية</Label>
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="store_admin">مدير فرع — فرع/فروع محددة</SelectItem>
                  <SelectItem value="site_admin">مدير الموقع — صلاحيات كاملة</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {newRole === "store_admin" && (
              <div className="space-y-2">
                <Label>الفروع المسؤول عنها</Label>
                {branches.map((b) => (
                  <label key={b.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={newBranchIds.includes(b.id)}
                      onCheckedChange={(v) =>
                        setNewBranchIds((prev) => toggleBranch(prev, b.id, !!v))
                      }
                    />
                    {b.name}
                    {b.city ? ` (${b.city})` : ""}
                  </label>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={handleAddAdmin} disabled={adding}>
              {adding ? (
                <Loader2 className="h-4 w-4 animate-spin ml-2" />
              ) : (
                <Plus className="h-4 w-4 ml-2" />
              )}
              إضافة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editUser} onOpenChange={(open) => !open && setEditUser(null)}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>فروع المدير — {editUser?.profile?.full_name || "بدون اسم"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {branches.map((b) => (
              <label key={b.id} className="flex items-center gap-2 text-sm rounded-lg border p-2">
                <Checkbox
                  checked={editBranchIds.includes(b.id)}
                  onCheckedChange={(v) =>
                    setEditBranchIds((prev) => toggleBranch(prev, b.id, !!v))
                  }
                />
                {b.name}
                {b.city ? ` (${b.city})` : ""}
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button
              onClick={() =>
                editUser &&
                saveBranchesMutation.mutate({
                  userId: editUser.user_id,
                  branchIds: editBranchIds,
                })
              }
              disabled={saveBranchesMutation.isPending}
            >
              {saveBranchesMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin ml-2" />
              ) : null}
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminUsersSection;
