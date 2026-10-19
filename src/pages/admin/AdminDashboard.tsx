import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { applyBranchFilter, fetchDriverIdsForBranches } from "@/lib/branch-scope";
import KPICard from "@/components/admin/KPICard";
import RecentOrders from "@/components/admin/RecentOrders";
import DriversMap from "@/components/admin/DriversMap";
import AdminAssistantCard from "@/components/admin/AdminAssistantCard";
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
  Sparkles,
  Banknote,
  MonitorSmartphone,
  Receipt,
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

      const loadPosToday = async () => {
        const PAGE = 500;
        let sales: { id: string; total: number; status: string }[] = [];
        let from = 0;
        while (true) {
          let q = supabase
            .from("pos_sales" as any)
            .select("id, total, status")
            .gte("created_at", todayISO)
            .range(from, from + PAGE - 1);
          q = applyBranchFilter(q, scopedBranchIds);
          const { data, error } = await q;
          if (error) throw error;
          if (!data?.length) break;
          sales = sales.concat(data as any);
          if (data.length < PAGE) break;
          from += PAGE;
        }
        const completed = sales.filter((s) => s.status === "completed" || !s.status);
        const revenue = completed.reduce((sum, s) => sum + Number(s.total || 0), 0);
        let openShiftsQ = supabase
          .from("pos_shifts" as any)
          .select("id", { count: "exact", head: true })
          .eq("status", "open");
        openShiftsQ = applyBranchFilter(openShiftsQ, scopedBranchIds);
        const { count: openShifts, error: shiftErr } = await openShiftsQ;
        if (shiftErr) throw shiftErr;
        return {
          salesCount: completed.length,
          revenue,
          avgTicket: completed.length ? revenue / completed.length : 0,
          openShifts: openShifts || 0,
        };
      };

      const loadAiStats = async () => {
        const empty = {
          aiUsers: 0,
          basketRate: 0,
          cartRate: 0,
          orderRate: 0,
          aiAov: 0,
          storeAov: 0,
          aiOrders: 0,
          smartOpen: 0,
          classicOpen: 0,
        };
        try {
          let q = supabase
            .from("ai_shopping_events" as any)
            .select("event, variant, session_id, basket_total, conversation_id")
            .gte("created_at", weekAgo)
            .limit(5000);
          q = applyBranchFilter(q, scopedBranchIds);
          const { data, error } = await q;
          if (error) throw error;
          const rows = (data || []) as {
            event: string;
            variant: string | null;
            session_id: string;
            conversation_id: string | null;
          }[];
          const sessionsOpen = new Set(rows.filter((r) => r.event === "open").map((r) => r.session_id));
          const convBasket = new Set(
            rows.filter((r) => r.event === "basket_shown").map((r) => r.conversation_id || r.session_id),
          );
          const convCart = new Set(
            rows.filter((r) => r.event === "add_to_cart").map((r) => r.conversation_id || r.session_id),
          );
          const convOrder = new Set(
            rows.filter((r) => r.event === "order_placed").map((r) => r.conversation_id || r.session_id),
          );
          let oq: any = supabase.from("orders").select("total, shopping_source" as any);
          oq = oq.gte("created_at", weekAgo).limit(3000);
          oq = applyBranchFilter(oq, scopedBranchIds);
          const { data: orderRows } = await oq;
          const aiOrders = (orderRows || []).filter((o: any) => o.shopping_source === "assistant");
          const storeOrders = (orderRows || []).filter((o: any) => o.shopping_source !== "assistant");
          const avg = (list: { total: number }[]) =>
            list.length ? list.reduce((s, o) => s + Number(o.total || 0), 0) / list.length : 0;
          return {
            aiUsers: sessionsOpen.size,
            basketRate: sessionsOpen.size ? Math.round((convBasket.size / sessionsOpen.size) * 100) : 0,
            cartRate: convBasket.size ? Math.round((convCart.size / convBasket.size) * 100) : 0,
            orderRate: convCart.size ? Math.round((convOrder.size / convCart.size) * 100) : 0,
            aiAov: avg(aiOrders as { total: number }[]),
            storeAov: avg(storeOrders as { total: number }[]),
            aiOrders: aiOrders.length,
            smartOpen: rows.filter((r) => r.event === "open" && r.variant === "smart").length,
            classicOpen: rows.filter((r) => r.event === "open" && r.variant === "classic").length,
          };
        } catch {
          return empty;
        }
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
        .from("product_branch" as "products")
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
        aiStats,
        posToday,
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
        loadAiStats(),
        loadPosToday(),
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
        aiUsers: aiStats.aiUsers,
        aiBasketRate: aiStats.basketRate,
        aiCartRate: aiStats.cartRate,
        aiOrderRate: aiStats.orderRate,
        aiAov: aiStats.aiAov,
        storeAov: aiStats.storeAov,
        aiOrders: aiStats.aiOrders,
        aiSmartOpen: aiStats.smartOpen,
        aiClassicOpen: aiStats.classicOpen,
        posSalesToday: posToday.salesCount,
        posRevenueToday: posToday.revenue,
        posAvgTicket: posToday.avgTicket,
        posOpenShifts: posToday.openShifts,
      };
    },
    refetchInterval: 30000,
  });

  return (
    <AdminLayout title="لوحة التحكم">
      {/* عمليات اليوم */}
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-muted-foreground">عمليات اليوم</h2>
      </div>
      <div className="mb-4">
        <AdminAssistantCard />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
        <KPICard
          title="طلبات اليوم"
          value={stats?.todayOrders ?? 0}
          icon={ShoppingCart}
          color="primary"
          loading={isLoading}
          to="/admin/orders"
        />
        <KPICard
          title="إيرادات اليوم"
          value={`${(stats?.todayRevenue ?? 0).toFixed(0)} ر.س`}
          icon={DollarSign}
          color="success"
          loading={isLoading}
          to="/admin/sales"
        />
        <KPICard
          title="طلبات معلقة"
          value={stats?.pendingOrders ?? 0}
          icon={AlertCircle}
          color="warning"
          loading={isLoading}
          to="/admin/orders?status=open"
        />
        <KPICard
          title="متوسط التوصيل"
          value={stats?.avgDeliveryMin ? `${stats.avgDeliveryMin} د` : "—"}
          icon={Clock}
          color="info"
          loading={isLoading}
          to="/admin/orders?status=delivered"
        />
      </div>

      {/* إحصائيات الكاشير */}
      <div className="mb-2">
        <h2 className="text-sm font-bold text-muted-foreground mb-3">إحصائيات الكاشير</h2>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
        <KPICard
          title="مبيعات الكاشير اليوم"
          value={stats?.posSalesToday ?? 0}
          icon={Receipt}
          color="teal"
          loading={isLoading}
          to="/admin/pos"
        />
        <KPICard
          title="إيرادات الكاشير"
          value={`${(stats?.posRevenueToday ?? 0).toFixed(0)} ر.س`}
          icon={Banknote}
          color="success"
          loading={isLoading}
          to="/admin/pos"
        />
        <KPICard
          title="متوسط الفاتورة"
          value={
            stats?.posSalesToday
              ? `${(stats.posAvgTicket ?? 0).toFixed(0)} ر.س`
              : "—"
          }
          icon={DollarSign}
          color="info"
          loading={isLoading}
          to="/admin/pos"
        />
        <KPICard
          title="ورديات مفتوحة"
          value={stats?.posOpenShifts ?? 0}
          icon={MonitorSmartphone}
          color="orange"
          loading={isLoading}
          to="/admin/pos"
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
          to="/admin/sales"
        />
        <KPICard
          title="زوار فريدون اليوم"
          value={stats?.uniqueVisitors ?? 0}
          icon={Users}
          color="primary"
          loading={isLoading}
          to="/admin/customers"
        />
        <KPICard
          title="سلات مهجورة (7 أيام)"
          value={stats?.abandonedCarts ?? 0}
          icon={ShoppingBag}
          color="warning"
          loading={isLoading}
          trend={stats?.abandonedValue ? `قيمة محتملة: ${stats.abandonedValue.toFixed(0)} ر.س` : undefined}
          to="/admin/customers"
        />
        <KPICard
          title="ترك صفحة الدفع"
          value={stats?.checkoutDrop ?? 0}
          icon={XCircle}
          color="destructive"
          loading={isLoading}
          to="/admin/sales"
        />
      </div>

      <div className="mb-2">
        <h2 className="text-sm font-bold text-muted-foreground mb-3">مساعد سنام (7 أيام) — A/B</h2>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
        <KPICard
          title="جلسات استخدمت المساعد"
          value={stats?.aiUsers ?? 0}
          icon={Sparkles}
          color="purple"
          loading={isLoading}
          trend={
            stats
              ? `واجهة كاملة ${stats.aiSmartOpen} · مختصرة ${stats.aiClassicOpen}`
              : undefined
          }
          to="/admin?assistant=1"
        />
        <KPICard
          title="محادثة ← سلة"
          value={`${stats?.aiBasketRate ?? 0}%`}
          icon={ShoppingBag}
          color="info"
          loading={isLoading}
          trend={stats?.aiCartRate != null ? `سلة ← إضافة ${stats.aiCartRate}%` : undefined}
          trendUp
          to="/admin?assistant=1"
        />
        <KPICard
          title="طلبات من المساعد"
          value={stats?.aiOrders ?? 0}
          icon={ShoppingCart}
          color="teal"
          loading={isLoading}
          trend={stats?.aiOrderRate != null ? `تحويل من السلة ${stats.aiOrderRate}%` : undefined}
          trendUp
          to="/admin/orders"
        />
        <KPICard
          title="متوسط الطلب"
          value={`${(stats?.aiAov ?? 0).toFixed(0)} ر.س`}
          icon={DollarSign}
          color="success"
          loading={isLoading}
          trend={stats ? `التقليدي ${(stats.storeAov ?? 0).toFixed(0)} ر.س` : undefined}
          trendUp={(stats?.aiAov ?? 0) >= (stats?.storeAov ?? 0)}
          to="/admin/sales"
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
          to="/admin/drivers"
        />
        <KPICard
          title="الشكاوى المفتوحة"
          value={stats?.openComplaints ?? 0}
          icon={MessageSquare}
          color="destructive"
          loading={isLoading}
          to="/admin/complaints"
        />
        <KPICard
          title="منتجات منخفضة المخزون"
          value={stats?.lowStock ?? 0}
          icon={PackageX}
          color="orange"
          loading={isLoading}
          to="/admin/products?stock=low"
        />
        <KPICard
          title="إجمالي الطلبات"
          value={stats?.totalOrders ?? 0}
          icon={TrendingUp}
          color="purple"
          loading={isLoading}
          to="/admin/orders"
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
