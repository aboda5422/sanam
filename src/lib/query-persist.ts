import type { QueryClient } from "@tanstack/react-query";

const STORAGE_KEY = "sanam:rq-cache-v1";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

type PersistedCache = {
  savedAt: number;
  client: unknown;
};

/** Persist React Query cache for ~30 days; refresh quietly in the background via staleTime. */
export function restoreQueryClient(queryClient: QueryClient): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as PersistedCache;
    if (!parsed?.savedAt || Date.now() - parsed.savedAt > MAX_AGE_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    queryClient.setQueryData(["__persist_boot__"], parsed.savedAt);
    // Hydrate known query cache shape from dehydrate/hydrate JSON
    const cache = parsed.client as {
      queries?: Array<{
        queryKey: unknown[];
        state: { data: unknown; dataUpdatedAt: number; status: string };
      }>;
    };
    for (const q of cache?.queries || []) {
      if (!q?.queryKey || q.state?.status !== "success") continue;
      queryClient.setQueryData(q.queryKey, q.state.data, {
        updatedAt: q.state.dataUpdatedAt,
      });
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function persistQueryClient(queryClient: QueryClient): void {
  if (typeof window === "undefined") return;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const save = () => {
    try {
      const queries = queryClient
        .getQueryCache()
        .getAll()
        .filter((q) => q.state.status === "success" && q.state.data !== undefined)
        // Skip noisy / personal keys
        .filter((q) => {
          const key = String(q.queryKey[0] || "");
          return (
            key.startsWith("categor") ||
            key === "products" ||
            key === "products-infinite" ||
            key === "featured-products" ||
            key === "product" ||
            key === "branches" ||
            key === "store-info" ||
            key === "home"
          );
        })
        .slice(0, 80)
        .map((q) => ({
          queryKey: q.queryKey,
          state: {
            data: q.state.data,
            dataUpdatedAt: q.state.dataUpdatedAt,
            status: q.state.status,
          },
        }));

      const payload: PersistedCache = {
        savedAt: Date.now(),
        client: { queries },
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* quota / private mode — ignore */
    }
  };

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(save, 1500);
  };

  queryClient.getQueryCache().subscribe(schedule);
  window.addEventListener("pagehide", save);
}
