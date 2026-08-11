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

export type AdminBranch = { id: string; name: string; slug: string; city: string | null };

type AdminAuthContextValue = {
  loading: boolean;
  userId: string | null;
  role: "site_admin" | "store_admin" | null;
  isSuperAdmin: boolean;
  branchIds: string[];
  branches: AdminBranch[];
  filterBranchId: string | null;
  setFilterBranchId: (id: string | null) => void;
  scopedBranchIds: string[] | null;
};

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<"site_admin" | "store_admin" | null>(null);
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [branches, setBranches] = useState<AdminBranch[]>([]);
  const [filterBranchId, setFilterBranchId] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const check = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setLoading(false);
        navigate("/admin/login");
        return;
      }

      const uid = session.user.id;
      setUserId(uid);

      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", uid);

      const isSuper = roles?.some((r) => r.role === "site_admin") ?? false;
      const isStore = roles?.some((r) => r.role === "store_admin") ?? false;

      if (!isSuper && !isStore) {
        setLoading(false);
        navigate("/admin/login");
        return;
      }

      setRole(isSuper ? "site_admin" : "store_admin");

      const { data: allBranches } = await supabase
        .from("branches")
        .select("id, name, slug, city")
        .eq("is_active", true)
        .order("name");

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
        setBranches(((allBranches as AdminBranch[]) || []).filter((b) => ids.includes(b.id)));
        if (ids.length === 1) setFilterBranchId(ids[0]);
      }

      setLoading(false);
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

  const scopedBranchIds = useMemo(() => {
    if (isSuperAdmin) {
      return filterBranchId ? [filterBranchId] : null;
    }
    if (filterBranchId && branchIds.includes(filterBranchId)) return [filterBranchId];
    return branchIds.length ? branchIds : [];
  }, [isSuperAdmin, filterBranchId, branchIds]);

  const setFilter = useCallback((id: string | null) => setFilterBranchId(id), []);

  const value: AdminAuthContextValue = {
    loading,
    userId,
    role,
    isSuperAdmin,
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
