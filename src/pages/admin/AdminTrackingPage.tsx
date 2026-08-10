import AdminLayout from "@/components/admin/AdminLayout";
import DriversMap from "@/components/admin/DriversMap";

const AdminTrackingPage = () => (
  <AdminLayout title="تتبع المناديب">
    <div className="h-[calc(100vh-200px)] rounded-xl overflow-hidden border">
      <DriversMap />
    </div>
  </AdminLayout>
);

export default AdminTrackingPage;
