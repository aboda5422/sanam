import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { playNotificationSound, unlockNotificationAudio } from "@/lib/notification-sound";

const ACTIVE_STATUSES = [
  "pending",
  "assigned",
  "preparing",
  "ready",
  "on_the_way",
] as const;

const STAFF_ROLES = ["staff", "admin", "preparer"] as const;

const SEEN_KEY = "customer-order-chat-seen";
export const CUSTOMER_CHAT_SEEN_EVENT = "customer-order-chat-seen";

const toastedMessageIds = new Set<string>();

function readSeen(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) || "{}");
  } catch {
    return {};
  }
}

export function markCustomerOrderChatSeen(orderId: string) {
  const map = readSeen();
  map[orderId] = new Date().toISOString();
  localStorage.setItem(SEEN_KEY, JSON.stringify(map));
  window.dispatchEvent(new CustomEvent(CUSTOMER_CHAT_SEEN_EVENT, { detail: { orderId } }));
}

type ActiveOrder = {
  id: string;
  order_number: number;
  status: string;
  created_at: string;
};

/**
 * Active (non-delivered / non-cancelled) orders + unread staff chat for the logged-in customer.
 * Mount CustomerOrderAlertsListener once in the app shell for realtime + toasts.
 */
export function useCustomerOrderAlerts() {
  const [userId, setUserId] = useState<string | null>(null);
  const [seenTick, setSeenTick] = useState(0);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const onSeen = () => setSeenTick((t) => t + 1);
    window.addEventListener(CUSTOMER_CHAT_SEEN_EVENT, onSeen);
    return () => window.removeEventListener(CUSTOMER_CHAT_SEEN_EVENT, onSeen);
  }, []);

  const { data: activeOrders = [] } = useQuery({
    queryKey: ["customer-active-orders", userId],
    enabled: !!userId,
    staleTime: 20_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, status, created_at")
        .eq("user_id", userId!)
        .in("status", [...ACTIVE_STATUSES])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as ActiveOrder[];
    },
  });

  const orderIds = useMemo(() => activeOrders.map((o) => o.id), [activeOrders]);

  const { data: lastStaffByOrder = {} } = useQuery({
    queryKey: ["customer-order-staff-chat", orderIds],
    enabled: orderIds.length > 0,
    staleTime: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_messages" as any)
        .select("id, order_id, created_at, body, message_type, sender_role")
        .in("order_id", orderIds)
        .in("sender_role", [...STAFF_ROLES])
        .order("created_at", { ascending: false });
      if (error) throw error;
      const map: Record<string, { id: string; created_at: string; body: string | null }> = {};
      for (const row of (data || []) as unknown as {
        id: string;
        order_id: string;
        created_at: string;
        body: string | null;
      }[]) {
        if (!map[row.order_id]) {
          map[row.order_id] = { id: row.id, created_at: row.created_at, body: row.body };
        }
      }
      return map;
    },
  });

  const unreadOrderIds = useMemo(() => {
    void seenTick;
    const seen = readSeen();
    return orderIds.filter((id) => {
      const last = lastStaffByOrder[id];
      if (!last) return false;
      const seenAt = seen[id];
      if (!seenAt) return true;
      return new Date(last.created_at).getTime() > new Date(seenAt).getTime();
    });
  }, [orderIds, lastStaffByOrder, seenTick]);

  const hasUnreadStaffChat = unreadOrderIds.length > 0;
  const primaryAlertOrderId = unreadOrderIds[0] || activeOrders[0]?.id || null;

  return {
    userId,
    activeOrders,
    activeOrderCount: activeOrders.length,
    hasActiveOrder: activeOrders.length > 0,
    hasUnreadStaffChat,
    unreadOrderIds,
    primaryAlertOrderId,
  };
}

/** Mount once under the app layout — realtime invalidation + toast for staff chat. */
export function CustomerOrderAlertsListener() {
  const queryClient = useQueryClient();
  const { userId, activeOrders } = useCustomerOrderAlerts();
  const orderIds = useMemo(() => activeOrders.map((o) => o.id), [activeOrders]);
  const orderIdsKey = orderIds.join(",");

  useEffect(() => {
    const unlock = () => unlockNotificationAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`customer-order-alerts-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `user_id=eq.${userId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["customer-active-orders", userId] });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "order_messages" },
        (payload) => {
          const row = payload.new as {
            id?: string;
            order_id?: string;
            sender_role?: string;
            body?: string | null;
          };
          if (!row?.order_id || !STAFF_ROLES.includes(row.sender_role as any)) return;
          if (orderIds.length > 0 && !orderIds.includes(row.order_id)) return;

          queryClient.invalidateQueries({ queryKey: ["customer-order-staff-chat"] });
          queryClient.invalidateQueries({ queryKey: ["customer-active-orders", userId] });

          if (row.id && toastedMessageIds.has(row.id)) return;
          if (row.id) toastedMessageIds.add(row.id);

          const order = activeOrders.find((o) => o.id === row.order_id);
          playNotificationSound();
          toast.info(
            order
              ? `رسالة جديدة على الطلب #${order.order_number}`
              : "رسالة جديدة على طلبك",
            {
              description: row.body?.slice(0, 80) || "افتح المحادثة للرد",
              action: {
                label: "فتح",
                onClick: () => {
                  window.location.href = `/order/${row.order_id}`;
                },
              },
            },
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, orderIdsKey, activeOrders, orderIds, queryClient]);

  return null;
}
