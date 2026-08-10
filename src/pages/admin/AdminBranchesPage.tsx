import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, MapPin } from "lucide-react";

const AdminBranchesPage = () => {
  const queryClient = useQueryClient();
  const { data: branches, isLoading } = useQuery({
    queryKey: ["admin-branches"],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("*").order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const { error } = await supabase.from("branches").update({ is_active: value }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-branches"] }); toast.success("تم التحديث"); },
    onError: () => toast.error("حدث خطأ"),
  });

  return (
    <AdminLayout title="إدارة الفروع">
      <Badge variant="outline" className="mb-4">{branches?.length ?? 0} فرع</Badge>
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {branches?.map((b) => (
            <div key={b.id} className="bg-card rounded-xl border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{b.name}</h3>
                <Switch checked={b.is_active} onCheckedChange={(v) => toggleMutation.mutate({ id: b.id, value: v })} />
              </div>
              <div className="text-sm text-muted-foreground space-y-1">
                {b.address && <p className="flex items-center gap-1"><MapPin className="h-3 w-3" />{b.address}</p>}
                {b.phone && <p>📞 {b.phone}</p>}
                <p className="text-xs">الإحداثيات: {b.lat}, {b.lng}</p>
              </div>
              <Badge variant={b.is_active ? "default" : "secondary"}>{b.is_active ? "مفعّل" : "معطّل"}</Badge>
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  );
};

export default AdminBranchesPage;
