import { Outlet } from "react-router-dom";
import { AdminAuthProvider } from "@/hooks/useAdminAuth";
import { AdminAuthedShell } from "@/components/admin/AdminLayout";

/** Loaded only when an authenticated /admin/* route is opened. */
export default function AdminAuthedLayout() {
  return (
    <AdminAuthProvider>
      <AdminAuthedShell>
        <Outlet />
      </AdminAuthedShell>
    </AdminAuthProvider>
  );
}
