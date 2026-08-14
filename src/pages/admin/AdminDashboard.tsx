import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { applyBranchFilter, fetchDriverIdsForBranches } from "@/lib/branch-scope";
import KPICard from "@/components/admin/KPICard";
import RecentOrders from "@/components/admin/RecentOrders";
import DriversMap from "@/components/admin/DriversMap";
import {
  ShoppingCart,
  DollarSign,
  Users,
  Clock,
  AlertCircle,
  Truck,
  MessageSquare,
  PackageX,
  Eye,
  ShoppingBag,
  XCircle,
  TrendingUp,
} from "lucide-react";

const AdminDashboard = () => {
  const { scopedBranchIds } = useAdminAuth();
  const { data: stats, isLoading } = useQuery({
    queryKey: ["admin-kpi-stats", scopedBranchIds],
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayISO = today.toISOString();
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const countExact = async (q: PromiseLike<{ count: number | null; error: { message: string } | null }>) => {
        const { count, error } = await q;
        if (error) throw error;
        return count || 0;
      };

      const loadTodayOrders = async () => {
        const PAGE = 1000;
        let all: { id: string; total: number; status: string }[] = [];
        let from = 0;
        while (true) {
          let q = supabase
            .from("orders")
            .select("id, total, status")
            .gte("created_at", todayISO)
            .range(from, from + PAGE - 1);
          q = applyBranchFilter(q, scopedBranchIds);
          const { data, error } = await q;
          if (error) throw error;
          if (!data?.length) break;
          all = all.concat(data);
          if (data.length < PAGE) break;
          from += PAGE;
        }
        return all;
      };

      const uniqueSessionsToday = async () => {
        const PAGE = 1000;
        const ids = new Set<string>();
        let from = 0;
        while (true) {
          let q = supabase
            .from("page_views")
            .select("session_id")
            .gte("created_at", todayISO)
            .range(from, from + PAGE - 1);
          q = applyBranchFilter(q, scopedBranchIds);
          const { data, error } = await q;
          if (error) throw error;
          if (!data?.length) break;
          for (const row of data) {
            if (row.session_id) ids.add(row.session_id);
          }
          if (data.length < PAGE) break;
          from += PAGE;
        }
        return ids.size;
      };

      let totalOrdersQ = supabase.from("orders").select("id", { count: "exact", head: true });
      totalOrdersQ = applyBranchFilter(totalOrdersQ, scopedBranchIds);
      let pendingQ = supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending", "assigned", "preparing"]);
      pendingQ = applyBranchFilter(pendingQ, scopedBranchIds);
      let complaintsQ = supabase.from("complaints").select("id", { count: "exact", head: true }).eq("status", "open");
      complaintsQ = applyBranchFilter(complaintsQ, scopedBranchIds);
      let lowStockQ = supabase
        .from("products")
        .select("id", { count: "exact", head: true })
        .lt("stock_quantity", 5)
        .eq("is_active", true);
      lowStockQ = applyBranchFilter(lowStockQ, scopedBranchIds);
      let todayViewsQ = supabase.from("page_views").select("id", { count: "exact", head: true }).gte("created_at", todayISO);
      todayViewsQ = applyBranchFilter(todayViewsQ, scopedBranchIds);
      let abandonedQ = supabase
        .from("abandoned_carts")
        .select("id, total")
        .eq("converted", false)
        .gt("items_count", 0)
        .gte("updated_at", weekAgo);
      abandonedQ = applyBranchFilter(abandonedQ, scopedBranchIds);
      let checkoutDropQ = supabase
        .from("abandoned_carts")
        .select("id", { count: "exact", head: true })
        .eq("reached_checkout", true)
        .eq("converted", false)
        .gte("updated_at", weekAgo);
      checkoutDropQ = applyBranchFilter(checkoutDropQ, scopedBranchIds);

      const driverIds = await fetchDriverIdsForBranches(scopedBranchIds);
      let driversQ = supabase.from("drivers").select("id, is_available");
      if (driverIds) {
        if (driverIds.length === 0) {
          driversQ = driversQ.eq("id", "00000000-0000-0000-0000-000000000000");
        } else {
          driversQ = driversQ.in("id", driverIds);
        }
      }

      const [
        totalOrders,
        pendingOrders,
        todayOrders,
        driversRes,
        openComplaints,
        lowStock,
        todayViews,
        uniqueVisitors,
        abandonedRes,
        checkoutDrop,
      ] = await Promise.all([
        countExact(totalOrdersQ),
        countExact(pendingQ),
        loadTodayOrders(),
        driversQ,
        countExact(complaintsQ),
        countExact(lowStockQ),
        countExact(todayViewsQ),
        uniqueSessionsToday(),
        abandonedQ,
        countExact(checkoutDropQ),
      ]);

      if (driversRes.error) throw driversRes.error;
      const drivers = driversRes.data || [];
      const todayRevenue = todayOrders.reduce((sum, o) => sum + Number(o.total), 0);
      const deliveredToday = todayOrders.filter((o) => o.status === "delivered");
      const avgDeliveryMin = deliveredToday.length > 0 ? 28 : 0;
      const availableDrivers = drivers.filter((d) => d.is_available).length;
      const abandonedCarts = abandonedRes.data || [];
      if (abandonedRes.error) throw abandonedRes.error;
      const abandonedValue = abandonedCarts.reduce((sum, c) => sum + Number(c.total || 0), 0);

      return {
        todayOrders: todayOrders.length,
        todayRevenue,
        pendingOrders,
        availableDrivers: `${availableDrivers}/${drivers.length}`,
        avgDeliveryMin,
        openComplaints,
        lowStock,
        totalOrders,
        todayViews,
        uniqueVisitors,
        abandonedCarts: abandonedCarts.length,
        abandonedValue,
        checkoutDrop,
      };
    },
    refetchInterval: 30000,
  });

  return (
    <AdminLayout title="لوحة التحكم">
      {/* عمليات اليوم */}
      <div className="mb-2">
        <h2 className="text-sm font-bold text-muted-foreground mb-3">عمليات اليوم</h2>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
        <KPICard
          title="طلبات اليوم"
          value={stats?.todayOrders ?? 0}
          icon={ShoppingCart}
          color="primary"
          loading={isLoading}
        />
        <KPICard
          title="إيرادات اليوم"
          value={`${(stats?.todayRevenue ?? 0).toFixed(0)} ر.س`}
          icon={DollarSign}
          color="success"
          loading={isLoading}
        />
        <KPICard
          title="طلبات معلقة"
          value={stats?.pendingOrders ?? 0}
          icon={AlertCircle}
          color="warning"
          loading={isLoading}
        />
        <KPICard
          title="متوسط التوصيل"
          value={stats?.avgDeliveryMin ? `${stats.avgDeliveryMin} د` : "—"}
          icon={Clock}
          color="info"
          loading={isLoading}
        />
      </div>

      {/* تحليلات الزوار والتحويلات */}
      <div className="mb-2">
        <h2 className="text-sm font-bold text-muted-foreground mb-3">تحليلات الزوار والمبيعات</h2>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
        <KPICard
          title="زيارات اليوم"
          value={stats?.todayViews ?? 0}
          icon={Eye}
          color="info"
          loading={isLoading}
        />
        <KPICard
          title="زوار فريدون اليوم"
          value={stats?.uniqueVisitors ?? 0}
          icon={Users}
          color="primary"
          loading={isLoading}
        />
        <KPICard
          title="سلات مهجورة (7 أيام)"
          value={stats?.abandonedCarts ?? 0}
          icon={ShoppingBag}
          color="warning"
          loading={isLoading}
          trend={stats?.abandonedValue ? `قيمة محتملة: ${stats.abandonedValue.toFixed(0)} ر.س` : undefined}
        />
        <KPICard
          title="ترك صفحة الدفع"
          value={stats?.checkoutDrop ?? 0}
          icon={XCircle}
          color="destructive"
          loading={isLoading}
        />
      </div>

      {/* مؤشرات تشغيلية */}
      <div className="mb-2">
        <h2 className="text-sm font-bold text-muted-foreground mb-3">مؤشرات التشغيل</h2>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
        <KPICard
          title="المناديب المتاحين"
          value={stats?.availableDrivers ?? "0/0"}
          icon={Truck}
          color="teal"
          loading={isLoading}
        />
        <KPICard
          title="الشكاوى المفتوحة"
          value={stats?.openComplaints ?? 0}
          icon={MessageSquare}
          color="destructive"
          loading={isLoading}
        />
        <KPICard
          title="منتجات منخفضة المخزون"
          value={stats?.lowStock ?? 0}
          icon={PackageX}
          color="orange"
          loading={isLoading}
        />
        <KPICard
          title="إجمالي الطلبات"
          value={stats?.totalOrders ?? 0}
          icon={TrendingUp}
          color="purple"
          loading={isLoading}
        />
      </div>

      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <DriversMap />
        <RecentOrders />
      </div>
    </AdminLayout>
  );
};

export default AdminDashboard;
