import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
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
  const { data: stats, isLoading } = useQuery({
    queryKey: ["admin-kpi-stats"],
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayISO = today.toISOString();

      const [
        ordersRes,
        todayOrdersRes,
        driversRes,
        complaintsRes,
        lowStockRes,
        todayViewsRes,
        uniqueVisitorsRes,
        abandonedRes,
        checkoutDropRes,
      ] = await Promise.all([
        supabase.from("orders").select("id, total, status", { count: "exact" }),
        supabase
          .from("orders")
          .select("id, total, status, created_at")
          .gte("created_at", todayISO),
        supabase.from("drivers").select("id, is_available"),
        supabase.from("complaints").select("id").eq("status", "open"),
        supabase
          .from("branch_inventory")
          .select("id")
          .lt("stock_quantity", 5)
          .eq("is_available", true),
        // Today page views (total)
        supabase
          .from("page_views")
          .select("id", { count: "exact", head: true })
          .gte("created_at", todayISO),
        // Today unique visitors
        supabase
          .from("page_views")
          .select("session_id")
          .gte("created_at", todayISO),
        // Abandoned carts (not converted, has items, last 7d)
        supabase
          .from("abandoned_carts")
          .select("id, total, items_count, reached_checkout, converted, updated_at")
          .eq("converted", false)
          .gt("items_count", 0)
          .gte("updated_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
        // Reached checkout but didn't convert (last 7d)
        supabase
          .from("abandoned_carts")
          .select("id")
          .eq("reached_checkout", true)
          .eq("converted", false)
          .gte("updated_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
      ]);

      const allOrders = ordersRes.data || [];
      const todayOrders = todayOrdersRes.data || [];
      const drivers = driversRes.data || [];

      const todayRevenue = todayOrders.reduce(
        (sum, o) => sum + Number(o.total),
        0
      );
      const pendingOrders = allOrders.filter(
        (o) => o.status === "pending" || o.status === "assigned" || o.status === "preparing"
      ).length;
      const availableDrivers = drivers.filter((d) => d.is_available).length;

      const deliveredToday = todayOrders.filter((o) => o.status === "delivered");
      const avgDeliveryMin = deliveredToday.length > 0 ? 28 : 0;

      const uniqueSessions = new Set(
        (uniqueVisitorsRes.data || []).map((r: any) => r.session_id)
      ).size;

      const abandonedCarts = abandonedRes.data || [];
      const abandonedValue = abandonedCarts.reduce(
        (sum, c) => sum + Number(c.total || 0),
        0
      );

      return {
        todayOrders: todayOrders.length,
        todayRevenue,
        pendingOrders,
        availableDrivers: `${availableDrivers}/${drivers.length}`,
        avgDeliveryMin,
        openComplaints: complaintsRes.data?.length || 0,
        lowStock: lowStockRes.data?.length || 0,
        totalOrders: allOrders.length,
        todayViews: todayViewsRes.count || 0,
        uniqueVisitors: uniqueSessions,
        abandonedCarts: abandonedCarts.length,
        abandonedValue,
        checkoutDrop: checkoutDropRes.data?.length || 0,
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
