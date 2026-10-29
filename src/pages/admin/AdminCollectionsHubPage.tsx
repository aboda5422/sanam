import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { ClipboardList, MonitorSmartphone, Truck, UserRound } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import { CashierCashCollectionTab } from "@/components/admin/collections/CashierCashCollectionTab";
import { CollectionRegistryTab } from "@/components/admin/collections/CollectionRegistryTab";
import { DriverCashCollectionTab } from "@/components/admin/collections/DriverCashCollectionTab";
import {
  AdminCardTabIcon,
  AdminCardTabText,
  adminCardTabTriggerClassName,
  adminCardTabsListClass,
} from "@/components/admin/AdminCardTabs";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import {
  canViewCashierCashCollectionTab,
  canViewCollectionRegistryTab,
  canViewDriverCashCollectionTab,
} from "@/lib/staff-access";

type CollectionTab = "retail-drivers" | "cashier-cash" | "registry";

const TAB_IDS: CollectionTab[] = ["retail-drivers", "cashier-cash", "registry"];

function tabFromParam(raw: string | null): CollectionTab {
  if (raw && TAB_IDS.includes(raw as CollectionTab)) return raw as CollectionTab;
  return "retail-drivers";
}

const AdminCollectionsHubPage = () => {
  const { role, navPaths } = useAdminAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = tabFromParam(searchParams.get("tab"));

  const canRetailDrivers = canViewDriverCashCollectionTab(role, "retail", navPaths);
  const canCashierCash = canViewCashierCashCollectionTab(role, navPaths);
  const canRegistry = canViewCollectionRegistryTab(role, navPaths);

  const visibleTabs = useMemo(() => {
    const tabs: {
      id: CollectionTab;
      label: string;
      shortLabel: string;
      icon: typeof UserRound;
      accent: string;
    }[] = [];
    if (canRetailDrivers) {
      tabs.push({
        id: "retail-drivers",
        label: "مناديب",
        shortLabel: "مناديب",
        icon: UserRound,
        accent: "text-sky-700 bg-sky-100",
      });
    }
    if (canCashierCash) {
      tabs.push({
        id: "cashier-cash",
        label: "تحصيل الكاش من الكاشير",
        shortLabel: "كاشير POS",
        icon: MonitorSmartphone,
        accent: "text-amber-800 bg-amber-100",
      });
    }
    if (canRegistry) {
      tabs.push({
        id: "registry",
        label: "سجل التوريدات",
        shortLabel: "سجل التوريدات",
        icon: ClipboardList,
        accent: "text-slate-700 bg-slate-100",
      });
    }
    return tabs;
  }, [canRetailDrivers, canCashierCash, canRegistry]);

  const tab =
    visibleTabs.find((t) => t.id === activeTab)?.id ?? visibleTabs[0]?.id ?? "retail-drivers";

  const setTab = (next: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("tab", next);
    setSearchParams(params, { replace: true });
  };

  return (
    <AdminLayout title="التحصيل">
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" />
            مركز التحصيل
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            قناة واحدة لاستلام النقد من المناديب ومن كاشير نقطة البيع — بدون تسوية محافظ المناديب من
            مدير الفرع.
          </p>
        </div>

        {visibleTabs.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد قنوات تحصيل متاحة لحسابك.</p>
        ) : (
          <Tabs value={tab} onValueChange={setTab} dir="rtl">
            {visibleTabs.length > 1 ? (
              <TabsList className={adminCardTabsListClass(visibleTabs.length)}>
                {visibleTabs.map((t) => (
                  <TabsTrigger key={t.id} value={t.id} className={adminCardTabTriggerClassName}>
                    <AdminCardTabIcon icon={t.icon} accent={t.accent} />
                    <AdminCardTabText shortLabel={t.shortLabel} label={t.label} />
                  </TabsTrigger>
                ))}
              </TabsList>
            ) : null}

            {canRetailDrivers && (
              <TabsContent value="retail-drivers" className="mt-6">
                <DriverCashCollectionTab channel="retail" />
              </TabsContent>
            )}
            {canCashierCash && (
              <TabsContent value="cashier-cash" className="mt-6">
                <CashierCashCollectionTab />
              </TabsContent>
            )}
            {canRegistry && (
              <TabsContent value="registry" className="mt-6">
                <CollectionRegistryTab />
              </TabsContent>
            )}
          </Tabs>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminCollectionsHubPage;
