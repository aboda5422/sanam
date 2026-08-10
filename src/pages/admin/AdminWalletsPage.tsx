import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

const AdminWalletsPage = () => {
  const { data: wallets, isLoading } = useQuery({
    queryKey: ["admin-wallets"],
    queryFn: async () => {
      const { data, error } = await supabase.from("driver_wallet").select("*, drivers(phone, user_id)").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <AdminLayout title="المحافظ والعمولات">
      <Badge variant="outline" className="mb-4">{wallets?.length ?? 0} محفظة</Badge>
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <div className="bg-card rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/30">
                <th className="text-right p-3 font-medium">المندوب</th>
                <th className="text-right p-3 font-medium">الرصيد</th>
                <th className="text-right p-3 font-medium">إجمالي التحصيل</th>
                <th className="text-right p-3 font-medium">العمولات</th>
                <th className="text-right p-3 font-medium">نسبة العمولة</th>
              </tr></thead>
              <tbody>
                {wallets?.map((w) => (
                  <tr key={w.id} className="border-b last:border-0 hover:bg-muted/10">
                    <td className="p-3 font-medium">{(w.drivers as any)?.phone || w.driver_id.slice(0, 8)}</td>
                    <td className="p-3">{Number(w.balance).toFixed(2)} ر.س</td>
                    <td className="p-3">{Number(w.total_collected).toFixed(2)} ر.س</td>
                    <td className="p-3">{Number(w.total_commission).toFixed(2)} ر.س</td>
                    <td className="p-3">{(Number(w.commission_rate) * 100).toFixed(0)}%</td>
                  </tr>
                ))}
                {(!wallets || wallets.length === 0) && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">لا توجد محافظ</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default AdminWalletsPage;
