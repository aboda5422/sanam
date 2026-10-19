import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, DoorOpen, DoorClosed } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { formatPosError } from "@/lib/pos";
import type { CashierSession } from "@/hooks/useCashierAuth";

type Ctx = { session: CashierSession };

const CashierShiftPage = () => {
  const { session } = useOutletContext<Ctx>();
  const queryClient = useQueryClient();
  const [stationId, setStationId] = useState("");
  const [openingCash, setOpeningCash] = useState("0");
  const [closingCash, setClosingCash] = useState("");
  const [notes, setNotes] = useState("");

  const { data: openShift, isLoading } = useQuery({
    queryKey: ["pos-open-shift", session.userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pos_shifts")
        .select("id, branch_id, station_id, opening_cash, opened_at, status")
        .eq("cashier_id", session.userId)
        .eq("status", "open")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: stations = [] } = useQuery({
    queryKey: ["pos-stations", session.branchIds],
    enabled: !openShift,
    queryFn: async () => {
      let q = supabase
        .from("pos_stations")
        .select("id, name, code, branch_id, branches!inner(name, is_active)")
        .eq("is_active", true)
        .eq("branches.is_active", true)
        .order("code");
      if (session.branchIds.length && !session.branchIds.includes("*")) {
        q = q.in("branch_id", session.branchIds);
      }
      // site_admin may have empty branch access — show all
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  const startShift = useMutation({
    mutationFn: async () => {
      if (!stationId) throw new Error("اختر المحطة");
      const { data, error } = await supabase.rpc("pos_start_shift" as any, {
        p_station_id: stationId,
        p_opening_cash: Number(openingCash) || 0,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("تم فتح الوردية");
      queryClient.invalidateQueries({ queryKey: ["pos-open-shift"] });
    },
    onError: (e: any) => toast.error(formatPosError(e, "فشل فتح الوردية")),
  });

  const endShift = useMutation({
    mutationFn: async () => {
      if (!openShift) throw new Error("لا توجد وردية");
      const { data, error } = await supabase.rpc("pos_end_shift" as any, {
        p_shift_id: openShift.id,
        p_closing_cash: Number(closingCash) || 0,
        p_notes: notes || null,
      });
      if (error) throw error;
      return data as {
        cash_sales: number;
        expected_cash: number;
        closing_cash: number;
        difference: number;
      };
    },
    onSuccess: (data) => {
      toast.success(
        `أُغلقت الوردية · المتوقع ${Number(data.expected_cash).toFixed(2)} · الفرق ${Number(data.difference).toFixed(2)}`,
      );
      queryClient.invalidateQueries({ queryKey: ["pos-open-shift"] });
      setClosingCash("");
      setNotes("");
    },
    onError: (e: any) => toast.error(formatPosError(e, "فشل إغلاق الوردية")),
  });

  if (isLoading) {
    return (
      <div className="p-10 flex justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {openShift ? <DoorClosed className="h-5 w-5 text-primary" /> : <DoorOpen className="h-5 w-5 text-primary" />}
            {openShift ? "إغلاق الوردية" : "فتح وردية جديدة"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!openShift ? (
            <>
              <div>
                <Label>المحطة (كاشير الفرع)</Label>
                <select
                  className="mt-1 w-full h-10 rounded-md border bg-background px-3 text-sm"
                  value={stationId}
                  onChange={(e) => setStationId(e.target.value)}
                >
                  <option value="">اختر المحطة...</option>
                  {stations.length === 0 && (
                    <option value="" disabled>لا توجد محطة على فرع مفعّل</option>
                  )}
                  {stations.map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {(s.branches?.name || "فرع") + " · " + s.name + " (" + s.code + ")"}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>عهدة الافتتاح النقدية</Label>
                <Input
                  type="number"
                  value={openingCash}
                  onChange={(e) => setOpeningCash(e.target.value)}
                  dir="ltr"
                  className="mt-1"
                />
              </div>
              <Button
                className="w-full"
                disabled={startShift.isPending}
                onClick={() => startShift.mutate()}
              >
                {startShift.isPending ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : null}
                فتح الوردية والبدء بالبيع
              </Button>
            </>
          ) : (
            <>
              <div className="rounded-lg bg-muted p-3 text-sm space-y-1">
                <p>افتتاح: {new Date(openShift.opened_at).toLocaleString("ar-SA")}</p>
                <p dir="ltr">عهدة الافتتاح: {Number(openShift.opening_cash).toFixed(2)}</p>
              </div>
              <div>
                <Label>النقد الفعلي عند الإغلاق</Label>
                <Input
                  type="number"
                  value={closingCash}
                  onChange={(e) => setClosingCash(e.target.value)}
                  dir="ltr"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>ملاحظات</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" />
              </div>
              <Button
                variant="destructive"
                className="w-full"
                disabled={endShift.isPending}
                onClick={() => endShift.mutate()}
              >
                {endShift.isPending ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : null}
                إغلاق الوردية وحساب الفرق
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CashierShiftPage;
