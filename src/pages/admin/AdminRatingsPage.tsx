import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Star, MessageSquare } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

type RatingRow = {
  id: string;
  kind: "driver" | "preparer";
  rating: number;
  comment: string | null;
  created_at: string;
  order_id: string;
  order_number?: number | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  staff_name?: string | null;
};

export default function AdminRatingsPage() {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin-low-ratings"],
    queryFn: async () => {
      const [{ data: drivers }, { data: preparers }] = await Promise.all([
        supabase
          .from("driver_ratings" as any)
          .select("id, rating, comment, created_at, order_id, driver_id, drivers(full_name), orders:order_id(order_number, customer_name, customer_phone)")
          .lt("rating", 3)
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("preparer_ratings" as any)
          .select("id, rating, comment, created_at, order_id, preparer_id, orders:order_id(order_number, customer_name, customer_phone)")
          .lt("rating", 3)
          .order("created_at", { ascending: false })
          .limit(100),
      ]);

      const preparerIds = [...new Set(((preparers as any[]) || []).map((r) => r.preparer_id).filter(Boolean))];
      let preparerNames: Record<string, string> = {};
      if (preparerIds.length) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", preparerIds);
        for (const p of profiles || []) {
          preparerNames[p.user_id] = p.full_name || "محضّر";
        }
      }

      const mapped: RatingRow[] = [
        ...((drivers as any[]) || []).map((r) => ({
          id: r.id,
          kind: "driver" as const,
          rating: r.rating,
          comment: r.comment,
          created_at: r.created_at,
          order_id: r.order_id,
          order_number: r.orders?.order_number,
          customer_name: r.orders?.customer_name,
          customer_phone: r.orders?.customer_phone,
          staff_name: r.drivers?.full_name || "مندوب",
        })),
        ...((preparers as any[]) || []).map((r) => ({
          id: r.id,
          kind: "preparer" as const,
          rating: r.rating,
          comment: r.comment,
          created_at: r.created_at,
          order_id: r.order_id,
          order_number: r.orders?.order_number,
          customer_name: r.orders?.customer_name,
          customer_phone: r.orders?.customer_phone,
          staff_name: preparerNames[r.preparer_id] || "محضّر",
        })),
      ].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));

      return mapped;
    },
  });

  return (
    <AdminLayout title="التقييمات المنخفضة">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Star className="h-5 w-5 text-amber-500" />
            تقييمات أقل من 3 نجوم
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">جاري التحميل...</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا توجد تقييمات منخفضة حالياً.</p>
          ) : (
            rows.map((row) => (
              <div key={`${row.kind}-${row.id}`} className="rounded-xl border p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={row.kind === "driver" ? "default" : "secondary"}>
                      {row.kind === "driver" ? "مندوب" : "محضّر"}
                    </Badge>
                    <span className="font-medium">{row.staff_name}</span>
                    <span className="text-amber-600 font-bold">{row.rating}/5</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(row.created_at).toLocaleString("ar-SA")}
                  </span>
                </div>
                {row.comment && (
                  <p className="text-sm rounded-lg bg-muted/40 p-2 flex gap-2">
                    <MessageSquare className="h-4 w-4 shrink-0 mt-0.5" />
                    {row.comment}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span>
                    الطلب #{row.order_number ?? "—"} · {row.customer_name || "عميل"}
                    {row.customer_phone ? ` · ${row.customer_phone}` : ""}
                  </span>
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/admin/orders?highlight=${row.order_id}`}>فتح الطلب</Link>
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </AdminLayout>
  );
}
