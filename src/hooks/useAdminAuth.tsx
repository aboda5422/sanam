// @refresh reset
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { pickAdminRole, type AdminPanelRole } from "@/lib/staff-access";

export type AdminBranch = { id: string; name: string; slug: string; city: string | null };

type AdminAuthContextValue = {
  loading: boolean;
  userId: string | null;
  role: AdminPanelRole | null;
  isSuperAdmin: boolean;
  isSiteWide: boolean;
  branchIds: string[];
  branches: AdminBranch[];
  filterBranchId: string | null;
  setFilterBranchId: (id: string | null) => void;
  scopedBranchIds: string[] | null;
};

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const existing = useContext(AdminAuthContext);
  if (existing) return <>{children}</>;
  return <AdminAuthProviderInner>{children}</AdminAuthProviderInner>;
}

function AdminAuthProviderInner({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<AdminPanelRole | null>(null);
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [branches, setBranches] = useState<AdminBranch[]>([]);
  const [filterBranchId, setFilterBranchId] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const check = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) {
          navigate("/admin/login");
          return;
        }

        const uid = session.user.id;
        setUserId(uid);

        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", uid);

        const panelRole = pickAdminRole(roles);
        if (!panelRole) {
          navigate("/admin/login");
          return;
        }

        setRole(panelRole);

        const { data: allBranches } = await supabase
          .from("branches")
          .select("id, name, slug, city")
          .eq("is_active", true)
          .order("name");

        const isSuper = panelRole === "site_admin";
        if (isSuper) {
          setBranchIds([]);
          setBranches((allBranches as AdminBranch[]) || []);
        } else {
          const { data: access } = await supabase
            .from("admin_branch_access" as any)
            .select("branch_id")
            .eq("user_id", uid);
          const ids = (access || []).map((a: any) => a.branch_id as string);
          setBranchIds(ids);
          const list = (allBranches as AdminBranch[]) || [];
          setBranches(ids.length ? list.filter((b) => ids.includes(b.id)) : list);
          if (ids.length === 1) setFilterBranchId(ids[0]);
        }
      } catch (err) {
        console.error("[admin-auth]", err);
        navigate("/admin/login");
      } finally {
        setLoading(false);
      }
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      check();
    });

    check();
    return () => subscription.unsubscribe();
  }, [navigate]);

  const isSuperAdmin = role === "site_admin";
  const isSiteWide = isSuperAdmin || ((role === "accountant" || role === "inventory" || role === "support") && branchIds.length === 0);

  const scopedBranchIds = useMemo(() => {
    if (isSiteWide) {
      return filterBranchId ? [filterBranchId] : null;
    }
    if (filterBranchId && branchIds.includes(filterBranchId)) return [filterBranchId];
    return branchIds.length ? branchIds : [];
  }, [isSiteWide, filterBranchId, branchIds]);

  const setFilter = useCallback((id: string | null) => setFilterBranchId(id), []);

  const value: AdminAuthContextValue = {
    loading,
    userId,
    role,
    isSuperAdmin,
    isSiteWide,
    branchIds,
    branches,
    filterBranchId,
    setFilterBranchId: setFilter,
    scopedBranchIds,
  };

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export const useAdminAuth = (): AdminAuthContextValue => {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) {
    throw new Error("useAdminAuth must be used within AdminAuthProvider");
  }
  return ctx;
};
