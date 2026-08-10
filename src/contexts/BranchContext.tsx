import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  BRANCH_STORAGE_KEY,
  type Branch,
  type BranchDeliveryRate,
} from "@/lib/branch";

type BranchContextValue = {
  branches: Branch[];
  ratesByBranch: Record<string, BranchDeliveryRate[]>;
  selectedBranch: Branch | null;
  loading: boolean;
  needsPicker: boolean;
  selectBranch: (branch: Branch | string, opts?: { persist?: boolean }) => void;
  clearBranch: () => void;
  /** Open branch picker; optional city filter e.g. "مكة" or "الرياض" */
  openPicker: (cityFilter?: string | null) => void;
  pickerOpen: boolean;
  setPickerOpen: (open: boolean) => void;
  pickerCityFilter: string | null;
};

const BranchContext = createContext<BranchContextValue | null>(null);

async function fetchBranches(): Promise<Branch[]> {
  const { data, error } = await supabase
    .from("branches")
    .select("id, name, address, city, slug, lat, lng, phone, is_active")
    .eq("is_active", true)
    .order("city", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data || []).map((b: any) => ({
    id: b.id,
    name: b.name,
    address: b.address,
    city: b.city,
    slug: b.slug,
    lat: Number(b.lat),
    lng: Number(b.lng),
    phone: b.phone,
    is_active: !!b.is_active,
  }));
}

async function fetchRates(): Promise<BranchDeliveryRate[]> {
  const { data, error } = await supabase
    .from("branch_delivery_rates" as any)
    .select("id, branch_id, max_distance_km, fee, sort_order")
    .order("sort_order", { ascending: true });
  if (error) {
    console.warn("[branch-rates]", error.message);
    return [];
  }
  return (data || []).map((r: any) => ({
    id: r.id,
    branch_id: r.branch_id,
    max_distance_km: Number(r.max_distance_km),
    fee: Number(r.fee),
    sort_order: r.sort_order ?? 0,
  }));
}

function isStaffPath(pathname: string) {
  return pathname.startsWith("/admin") || pathname.startsWith("/driver");
}

export function BranchProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const staffMode = isStaffPath(location.pathname);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(() => {
    try {
      return localStorage.getItem(BRANCH_STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [pickerOpen, setPickerOpenState] = useState(false);
  const [pickerCityFilter, setPickerCityFilter] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const branchesQuery = useQuery({
    queryKey: ["active-branches"],
    queryFn: fetchBranches,
    staleTime: 60_000,
    enabled: !staffMode,
  });
  const ratesQuery = useQuery({
    queryKey: ["branch-delivery-rates"],
    queryFn: fetchRates,
    staleTime: 60_000,
    enabled: !staffMode,
  });

  const branches = branchesQuery.data || [];
  const ratesByBranch = useMemo(() => {
    const map: Record<string, BranchDeliveryRate[]> = {};
    for (const r of ratesQuery.data || []) {
      (map[r.branch_id] ||= []).push(r);
    }
    return map;
  }, [ratesQuery.data]);

  const selectBranch = useCallback(
    (branchOrSlug: Branch | string, opts?: { persist?: boolean }) => {
      const branch =
        typeof branchOrSlug === "string"
          ? branches.find((b) => b.slug === branchOrSlug || b.id === branchOrSlug)
          : branchOrSlug;
      if (!branch) return;
      setSelectedSlug(branch.slug);
      if (opts?.persist !== false) {
        try {
          localStorage.setItem(BRANCH_STORAGE_KEY, branch.slug);
        } catch {
          /* ignore */
        }
      }
      setPickerCityFilter(null);
      setPickerOpenState(false);
      const current = searchParams.get("location");
      if (current !== branch.slug) {
        const next = new URLSearchParams(searchParams);
        next.set("location", branch.slug);
        setSearchParams(next, { replace: true });
      }
    },
    [branches, searchParams, setSearchParams]
  );

  const clearBranch = useCallback(() => {
    setSelectedSlug(null);
    try {
      localStorage.removeItem(BRANCH_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const setPickerOpen = useCallback((open: boolean) => {
    setPickerOpenState(open);
    if (!open) setPickerCityFilter(null);
  }, []);

  const openPicker = useCallback((cityFilter?: string | null) => {
    setPickerCityFilter(cityFilter?.trim() || null);
    setPickerOpenState(true);
  }, []);

  useEffect(() => {
    if (staffMode) {
      setPickerOpenState(false);
      setReady(true);
      return;
    }
    if (branchesQuery.isLoading) return;
    const fromUrl = searchParams.get("location")?.trim();
    if (fromUrl) {
      const match = branches.find((b) => b.slug === fromUrl || b.id === fromUrl);
      if (match) {
        setSelectedSlug(match.slug);
        try {
          localStorage.setItem(BRANCH_STORAGE_KEY, match.slug);
        } catch {
          /* ignore */
        }
        setPickerOpenState(false);
        setReady(true);
        return;
      }
    }
    if (selectedSlug && branches.some((b) => b.slug === selectedSlug)) {
      setPickerOpenState(false);
      setReady(true);
      return;
    }
    setPickerCityFilter(null);
    setPickerOpenState(true);
    setReady(true);
  }, [branches, branchesQuery.isLoading, searchParams, selectedSlug, staffMode]);

  const selectedBranch = useMemo(
    () => branches.find((b) => b.slug === selectedSlug) || null,
    [branches, selectedSlug]
  );

  const value: BranchContextValue = {
    branches,
    ratesByBranch,
    selectedBranch,
    loading: (!staffMode && branchesQuery.isLoading) || !ready,
    needsPicker: !staffMode && ready && !selectedBranch,
    selectBranch,
    clearBranch,
    openPicker,
    pickerOpen: staffMode ? false : pickerOpen,
    setPickerOpen,
    pickerCityFilter,
  };

  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>;
}

export function useBranch() {
  const ctx = useContext(BranchContext);
  if (!ctx) throw new Error("useBranch must be used within BranchProvider");
  return ctx;
}
