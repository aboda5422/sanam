import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Plus, Trash2, UserPlus, ShieldCheck, Crown } from "lucide-react";
import { toast } from "sonner";

type AdminUser = {
  user_id: string;
  role: string;
  created_at: string;
  profile?: { full_name: string | null; email?: string | null; phone: string | null };
};

const ROLE_LABELS: Record<string, { label: string; color: string; icon: typeof ShieldCheck }> = {
  site_admin: { label: "مدير الموقع", color: "bg-red-100 text-red-800", icon: Crown },
  store_admin: { label: "مشرف المتجر", color: "bg-blue-100 text-blue-800", icon: ShieldCheck },
};

const AdminUsersSection = () => {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<string>("store_admin");
  const [adding, setAdding] = useState(false);

  // Fetch admin users
  const { data: adminUsers = [], isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data: roles, error } = await supabase
        .from("user_roles")
        .select("user_id, role, created_at")
        .in("role", ["store_admin", "site_admin"]);
      if (error) throw error;

      // Get profiles for these users
      const userIds = roles?.map(r => r.user_id) || [];
      if (userIds.length === 0) return [];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, phone")
        .in("user_id", userIds);

      return (roles || []).map(r => ({
        ...r,
        profile: profiles?.find(p => p.user_id === r.user_id),
      })) as AdminUser[];
    },
  });

  // Add admin
  const handleAddAdmin = async () => {
    if (!newEmail.trim()) {
      toast.error("أدخل البريد الإلكتروني");
      return;
    }
    setAdding(true);
    try {
      // Find user by checking profiles or use edge function
      // We'll use the create-test-user pattern - look up by email via edge function
      const { data, error } = await supabase.functions.invoke("manage-admin", {
        body: { action: "add", email: newEmail.trim(), role: newRole },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success("تم إضافة المشرف بنجاح");
      setShowAdd(false);
      setNewEmail("");
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (err: any) {
      toast.error(err.message || "حدث خطأ أثناء الإضافة");
    } finally {
      setAdding(false);
    }
  };

  // Remove admin role
  const removeMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const { error } = await supabase.functions.invoke("manage-admin", {
        body: { action: "remove", user_id: userId, role },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم إزالة الصلاحية");
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: () => toast.error("حدث خطأ أثناء الإزالة"),
  });

  if (isLoading) return <Loader2 className="h-6 w-6 animate-spin mx-auto" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">إدارة المشرفين وصلاحياتهم</p>
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
            const roleInfo = ROLE_LABELS[u.role] || { label: u.role, color: "bg-gray-100 text-gray-800", icon: ShieldCheck };
            const RoleIcon = roleInfo.icon;
            return (
              <div
                key={`${u.user_id}-${u.role}`}
                className="flex items-center justify-between p-3 rounded-lg border"
              >
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                    <RoleIcon className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      {u.profile?.full_name || "بدون اسم"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {u.profile?.phone || u.user_id.slice(0, 8) + "..."}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className={roleInfo.color}>
                    {roleInfo.label}
                  </Badge>
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
                onChange={e => setNewEmail(e.target.value)}
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
                  <SelectItem value="store_admin">مشرف المتجر - إدارة المنتجات والطلبات</SelectItem>
                  <SelectItem value="site_admin">مدير الموقع - صلاحيات كاملة</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleAddAdmin} disabled={adding}>
              {adding ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Plus className="h-4 w-4 ml-2" />}
              إضافة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminUsersSection;
