import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { attachBaseLayers, loadLeaflet } from "@/lib/osm-map";
import { useDeliveryZones, type DeliveryZone } from "@/hooks/useDeliveryZones";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, MapPin, Pencil, Plus, Trash2, Save, X, Eye, Check } from "lucide-react";
import { toast } from "sonner";
import type { LatLng } from "@/lib/geo";

const DEFAULT_CENTER = { lat: 21.4225, lng: 39.8262 };
const BRANCH_ZOOM = 14;

type DeliveryZonesEditorProps = {
  branchId?: string | null;
  branchName?: string;
  branchCenter?: { lat: number; lng: number } | null;
  mapHeightClass?: string;
};

const fitLatLngs = (map: any, L: any, points: LatLng[]) => {
  if (!map || !L || points.length < 1) return;
  if (points.length === 1) {
    map.setView([points[0].lat, points[0].lng], 13);
    return;
  }
  const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
  map.fitBounds(bounds, { padding: [48, 48] });
};

/**
 * محرر مضلعات نطاق التوصيل — OpenStreetMap / Leaflet
 * (بديل عن Google Maps التي تفشل بدون Billing)
 */
const DeliveryZonesEditor = ({
  branchId = null,
  branchName,
  branchCenter = null,
  mapHeightClass = "h-72",
}: DeliveryZonesEditorProps) => {
  const queryClient = useQueryClient();
  const { data: zones = [], isLoading } = useDeliveryZones(branchId);
  const mapCenter =
    branchCenter && Number.isFinite(branchCenter.lat) && Number.isFinite(branchCenter.lng)
      ? branchCenter
      : DEFAULT_CENTER;

  const mapHostRef = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<any>(null);
  const branchMarkerRef = useRef<any>(null);
  const polygonsRef = useRef<Map<string, any>>(new Map());
  const draftLayerRef = useRef<any>(null);
  const clickHandlerRef = useRef<((e: any) => void) | null>(null);
  const drawingRef = useRef(false);
  const lastAddAtRef = useRef(0);
  const draftPointsRef = useRef<LatLng[]>([]);

  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapLoading, setMapLoading] = useState(true);
  const [drawing, setDrawing] = useState(false);
  const [draftPath, setDraftPath] = useState<LatLng[]>([]);
  const [draftComplete, setDraftComplete] = useState(false);
  const [draftName, setDraftName] = useState("منطقة توصيل جديدة");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editPath, setEditPath] = useState<LatLng[] | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["delivery-zones"] });
    queryClient.invalidateQueries({ queryKey: ["admin-branches"] });
    queryClient.invalidateQueries({ queryKey: ["admin-branches-delivery"] });
  };

  const clearDraftOverlays = () => {
    if (draftLayerRef.current && mapInstance.current) {
      try {
        mapInstance.current.removeLayer(draftLayerRef.current);
      } catch {
        /* ignore */
      }
      draftLayerRef.current = null;
    }
  };

  const removeClickListener = () => {
    if (clickHandlerRef.current && mapInstance.current) {
      mapInstance.current.off("click", clickHandlerRef.current);
      clickHandlerRef.current = null;
    }
  };

  const saveZone = useMutation({
    mutationFn: async (payload: {
      id?: string;
      name: string;
      polygon: LatLng[];
      is_active?: boolean;
      color?: string;
    }) => {
      if (!payload.id && !branchId) {
        throw new Error("اختر فرعاً أولاً قبل حفظ نطاق التوصيل");
      }
      if (payload.id) {
        const { error } = await supabase
          .from("delivery_zones")
          .update({
            name: payload.name,
            polygon: payload.polygon as any,
            ...(branchId ? { branch_id: branchId } : {}),
            ...(payload.is_active !== undefined ? { is_active: payload.is_active } : {}),
            ...(payload.color ? { color: payload.color } : {}),
          } as any)
          .eq("id", payload.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("delivery_zones").insert({
          name: payload.name,
          polygon: payload.polygon as any,
          is_active: payload.is_active ?? true,
          color: payload.color || "#16a34a",
          branch_id: branchId,
        } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      invalidate();
      toast.success("تم حفظ منطقة التوصيل");
    },
    onError: (e: any) => toast.error(e?.message || "تعذر حفظ المنطقة"),
  });

  const toggleZone = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("delivery_zones").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("تم تحديث حالة المنطقة");
    },
    onError: () => toast.error("تعذر تحديث المنطقة"),
  });

  const deleteZone = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("delivery_zones").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, id) => {
      invalidate();
      if (selectedId === id) setSelectedId(null);
      if (editingId === id) {
        setEditingId(null);
        setEditPath(null);
      }
      toast.success("تم حذف المنطقة");
    },
    onError: () => toast.error("تعذر حذف المنطقة"),
  });

  const renderDraftPreview = useCallback((points: LatLng[]) => {
    const map = mapInstance.current;
    const L = window.L;
    if (!map || !L) return;

    clearDraftOverlays();
    const group = L.layerGroup();

    points.forEach((p, i) => {
      L.circleMarker([p.lat, p.lng], {
        radius: 8,
        color: "#fff",
        weight: 2,
        fillColor: "#15803d",
        fillOpacity: 1,
      })
        .bindTooltip(String(i + 1), { permanent: true, direction: "center", className: "leaflet-zone-num" })
        .addTo(group);
    });

    if (points.length >= 2) {
      L.polygon(
        points.map((p) => [p.lat, p.lng]),
        {
          color: "#15803d",
          weight: 2,
          fillColor: "#16a34a",
          fillOpacity: points.length >= 3 ? 0.25 : 0.08,
        },
      ).addTo(group);
    }

    group.addTo(map);
    draftLayerRef.current = group;
  }, []);

  // Init Leaflet map
  useEffect(() => {
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    const outer = mapHostRef.current;

    (async () => {
      setMapLoading(true);
      setMapError(null);
      setMapReady(false);

      try {
        const ok = await loadLeaflet();
        if (cancelled) return;
        if (!ok || !window.L) {
          setMapError("تعذر تحميل الخريطة. تحقق من الاتصال ثم أعد فتح الإعدادات.");
          setMapLoading(false);
          return;
        }

        let host = mapHostRef.current;
        for (let i = 0; i < 40 && !host; i++) {
          await new Promise((r) => requestAnimationFrame(r));
          host = mapHostRef.current;
        }
        if (cancelled || !host) {
          setMapError("تعذر تهيئة الخريطة. أعد فتح النافذة.");
          setMapLoading(false);
          return;
        }

        host.replaceChildren();
        const inner = document.createElement("div");
        inner.style.width = "100%";
        inner.style.height = "100%";
        inner.style.minHeight = "420px";
        host.appendChild(inner);

        const L = window.L;
        const map = L.map(inner, {
          zoomControl: true,
          attributionControl: true,
        }).setView([mapCenter.lat, mapCenter.lng], BRANCH_ZOOM);

        attachBaseLayers(map);

        mapInstance.current = map;
        branchMarkerRef.current = L.marker([mapCenter.lat, mapCenter.lng], {
          title: branchName || "موقع الفرع",
        })
          .bindPopup(branchName || "الفرع")
          .addTo(map);

        requestAnimationFrame(() => {
          map.invalidateSize();
          setTimeout(() => map.invalidateSize(), 200);
          setTimeout(() => map.invalidateSize(), 500);
        });

        resizeObserver = new ResizeObserver(() => {
          map.invalidateSize();
        });
        resizeObserver.observe(host);

        if (!cancelled) {
          setMapReady(true);
          setMapLoading(false);
        }
      } catch (e) {
        console.error("[DeliveryZonesEditor] map init failed:", e);
        if (!cancelled) {
          setMapError("تعذر تهيئة الخريطة. أعد فتح النافذة.");
          setMapReady(false);
          setMapLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      removeClickListener();
      clearDraftOverlays();
      if (mapInstance.current) {
        try {
          mapInstance.current.remove();
        } catch {
          /* ignore */
        }
        mapInstance.current = null;
      }
      branchMarkerRef.current = null;
      polygonsRef.current.clear();
      outer?.replaceChildren();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, mapCenter.lat, mapCenter.lng]);

  useEffect(() => {
    if (!mapReady || !mapInstance.current) return;
    mapInstance.current.setView([mapCenter.lat, mapCenter.lng], BRANCH_ZOOM);
    if (branchMarkerRef.current) {
      branchMarkerRef.current.setLatLng([mapCenter.lat, mapCenter.lng]);
    }
  }, [mapReady, mapCenter.lat, mapCenter.lng]);

  // Render saved polygons
  useEffect(() => {
    if (!mapReady || !mapInstance.current || !window.L) return;
    const map = mapInstance.current;
    const L = window.L;
    const existing = polygonsRef.current;

    for (const [id, layer] of existing.entries()) {
      if (!zones.find((z) => z.id === id)) {
        map.removeLayer(layer);
        existing.delete(id);
      }
    }

    zones.forEach((zone) => {
      const path =
        editingId === zone.id && editPath
          ? editPath
          : zone.polygon;
      const isSelected = selectedId === zone.id || editingId === zone.id;
      const isEditing = editingId === zone.id;
      const latlngs = path.map((p) => [p.lat, p.lng] as [number, number]);
      const style = {
        color: isEditing ? "#2563eb" : zone.is_active ? zone.color : "#9ca3af",
        weight: isSelected ? 3 : 2,
        fillColor: zone.is_active ? zone.color : "#9ca3af",
        fillOpacity: zone.is_active ? (isSelected ? 0.35 : 0.22) : 0.1,
      };

      let layer = existing.get(zone.id);
      if (layer) {
        layer.setLatLngs(latlngs);
        layer.setStyle(style);
      } else {
        layer = L.polygon(latlngs, style);
        layer.on("click", () => {
          if (!drawingRef.current && editingId !== zone.id) focusZone(zone);
        });
        layer.addTo(map);
        existing.set(zone.id, layer);
      }

      // Vertex markers while editing — click vertex to remove (min 3)
      if (isEditing) {
        if ((layer as any)._editMarkers) {
          (layer as any)._editMarkers.forEach((m: any) => map.removeLayer(m));
        }
        const markers = path.map((p, idx) => {
          const m = L.circleMarker([p.lat, p.lng], {
            radius: 7,
            color: "#fff",
            weight: 2,
            fillColor: "#2563eb",
            fillOpacity: 1,
            draggable: false,
          });
          m.on("mousedown", (ev: any) => {
            L.DomEvent.stopPropagation(ev);
            const start = ev.latlng;
            const onMove = (e: any) => {
              const next = [...(editPath || path)];
              next[idx] = { lat: e.latlng.lat, lng: e.latlng.lng };
              setEditPath(next);
            };
            const onUp = () => {
              map.off("mousemove", onMove);
              map.off("mouseup", onUp);
            };
            map.on("mousemove", onMove);
            map.on("mouseup", onUp);
            void start;
          });
          m.on("click", (ev: any) => {
            L.DomEvent.stopPropagation(ev);
            const cur = editPath || path;
            if (cur.length <= 3) {
              toast.error("يجب الإبقاء على 3 نقاط على الأقل");
              return;
            }
            setEditPath(cur.filter((_, i) => i !== idx));
          });
          m.addTo(map);
          return m;
        });
        (layer as any)._editMarkers = markers;
      } else if ((layer as any)._editMarkers) {
        (layer as any)._editMarkers.forEach((m: any) => map.removeLayer(m));
        (layer as any)._editMarkers = null;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zones, mapReady, selectedId, drawing, editingId, editPath]);

  useEffect(() => {
    if (!mapReady || !mapInstance.current || drawing || editingId || selectedId) return;
    if (zones.length === 0) return;
    const all = zones.flatMap((z) => z.polygon);
    if (all.length > 0) fitLatLngs(mapInstance.current, window.L, all);
  }, [mapReady, zones.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const focusZone = useCallback((zone: DeliveryZone) => {
    if (!mapInstance.current) {
      toast.error("الخريطة غير جاهزة بعد");
      return;
    }
    setSelectedId(zone.id);
    setEditingName(zone.name);
    mapInstance.current.invalidateSize();
    fitLatLngs(mapInstance.current, window.L, zone.polygon);
    mapHostRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);

  const cancelEditing = () => {
    const id = editingId;
    setEditingId(null);
    setEditPath(null);
    if (id) {
      const zone = zones.find((z) => z.id === id);
      const layer = polygonsRef.current.get(id);
      if (zone && layer) {
        layer.setLatLngs(zone.polygon.map((p) => [p.lat, p.lng]));
      }
    }
  };

  const startEditing = (zone: DeliveryZone) => {
    cancelDraft();
    setSelectedId(zone.id);
    setEditingId(zone.id);
    setEditingName(zone.name);
    setEditPath(zone.polygon);
    if (mapInstance.current) {
      mapInstance.current.invalidateSize();
      fitLatLngs(mapInstance.current, window.L, zone.polygon);
    }
    mapHostRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    toast.message("اسحب النقاط الزرقاء لتعديل الحدود — انقر نقطة لحذفها");
  };

  const saveEditing = async () => {
    if (!editingId) return;
    const zone = zones.find((z) => z.id === editingId);
    if (!zone) return;
    const polygon = editPath && editPath.length >= 3 ? editPath : zone.polygon;
    if (polygon.length < 3) {
      toast.error("المنطقة يجب أن تحتوي على 3 نقاط على الأقل");
      return;
    }
    if (!editingName.trim()) {
      toast.error("أدخل اسم المنطقة");
      return;
    }
    await saveZone.mutateAsync({
      id: editingId,
      name: editingName.trim(),
      polygon,
      is_active: zone.is_active,
      color: zone.color,
    });
    setEditingId(null);
    setEditPath(null);
  };

  const cancelDraft = () => {
    drawingRef.current = false;
    removeClickListener();
    clearDraftOverlays();
    draftPointsRef.current = [];
    setDrawing(false);
    setDraftPath([]);
    setDraftComplete(false);
  };

  const startDrawing = () => {
    if (!branchId) {
      toast.error("اختر فرعاً أولاً لربط نطاق التوصيل به");
      return;
    }
    if (!mapReady || !mapInstance.current) {
      toast.error("انتظر حتى تظهر الخريطة ثم حاول مرة أخرى");
      return;
    }
    cancelEditing();
    cancelDraft();

    setSelectedId(null);
    setDraftName(branchName ? `نطاق ${branchName}` : "منطقة توصيل جديدة");
    setDraftComplete(false);
    setDrawing(true);
    drawingRef.current = true;
    draftPointsRef.current = [];
    setDraftPath([]);

    mapInstance.current.invalidateSize();
    mapHostRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });

    const addPoint = (point: LatLng) => {
      if (!drawingRef.current) return;
      const now = Date.now();
      const last = draftPointsRef.current[draftPointsRef.current.length - 1];
      if (lastAddAtRef.current && now - lastAddAtRef.current < 160) return;
      if (last && Math.abs(last.lat - point.lat) < 1e-6 && Math.abs(last.lng - point.lng) < 1e-6)
        return;
      lastAddAtRef.current = now;
      const next = [...draftPointsRef.current, point];
      draftPointsRef.current = next;
      setDraftPath(next);
      renderDraftPreview(next);
    };

    const onClick = (e: any) => {
      if (!e?.latlng) return;
      addPoint({ lat: e.latlng.lat, lng: e.latlng.lng });
    };
    clickHandlerRef.current = onClick;
    mapInstance.current.on("click", onClick);

    toast.message("انقر على الخريطة لإضافة نقاط الحدود");
  };

  const finishDrawing = () => {
    if (draftPointsRef.current.length < 3) {
      toast.error("أضف 3 نقاط على الأقل لإغلاق المنطقة");
      return;
    }
    drawingRef.current = false;
    removeClickListener();
    setDraftComplete(true);
    setDrawing(false);
    renderDraftPreview(draftPointsRef.current);
  };

  const confirmDraft = async () => {
    const points = draftPointsRef.current;
    if (points.length < 3) {
      toast.error("أضف 3 نقاط على الأقل");
      return;
    }
    if (!draftName.trim()) {
      toast.error("أدخل اسم المنطقة");
      return;
    }
    await saveZone.mutateAsync({
      name: draftName.trim(),
      polygon: points,
      is_active: true,
    });
    cancelDraft();
  };

  const handleDelete = (zone: DeliveryZone) => {
    if (!confirm(`هل تريد حذف منطقة «${zone.name}»؟`)) return;
    deleteZone.mutate(zone.id);
  };

  const listLoading = isLoading;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
        <p className="font-medium text-foreground mb-1 flex items-center gap-1.5">
          <MapPin className="h-4 w-4 text-primary" />
          نطاق التوصيل على الخريطة
          {branchName ? ` — ${branchName}` : ""}
        </p>
        <p>
          ارسم المضلع حول منطقة خدمة الفرع (خريطة OpenStreetMap). انقر لإضافة نقاط الحدود، ثم احفظ.
          الطلبات خارج المناطق المفعّلة تُرفض تلقائياً.
        </p>
        {!branchId && (
          <p className="mt-2 text-destructive text-xs font-medium">
            يجب اختيار فرع قبل رسم أو حفظ نطاق جغرافي.
          </p>
        )}
        {branchId && !branchCenter && (
          <p className="mt-2 text-amber-700 dark:text-amber-400 text-xs font-medium">
            لم يُحفظ موقع هذا الفرع بعد — حدّده من صفحة الفروع ليظهر هنا مباشرة.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          onClick={startDrawing}
          disabled={!mapReady || drawing || draftComplete || !!editingId}
        >
          <Plus className="h-4 w-4 ml-1" />
          رسم منطقة جديدة
        </Button>
        {drawing && (
          <>
            <Button
              type="button"
              size="sm"
              variant="default"
              onClick={finishDrawing}
              disabled={draftPath.length < 3}
            >
              <Check className="h-4 w-4 ml-1" />
              إنهاء الرسم ({draftPath.length})
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={cancelDraft}>
              <X className="h-4 w-4 ml-1" />
              إلغاء
            </Button>
          </>
        )}
        {draftComplete && !drawing && (
          <Button type="button" size="sm" variant="outline" onClick={cancelDraft}>
            <X className="h-4 w-4 ml-1" />
            إلغاء المسودة
          </Button>
        )}
      </div>

      {drawing && (
        <p className="text-xs text-muted-foreground">
          انقر على الخريطة لإضافة نقاط. عند اكتمال الشكل اضغط «إنهاء الرسم» (الحد الأدنى 3 نقاط).
        </p>
      )}

      <div className="relative rounded-xl overflow-hidden border">
        <div
          ref={mapHostRef}
          className={`w-full bg-muted ${mapHeightClass}`}
          style={{ minHeight: 420 }}
        />
        {mapLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/90 text-sm text-muted-foreground gap-2 z-[500]">
            <Loader2 className="h-4 w-4 animate-spin" />
            جاري تحميل الخريطة...
          </div>
        )}
        {mapError && !mapLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/95 text-sm text-destructive p-4 text-center z-[500]">
            {mapError}
          </div>
        )}
        {editingId && mapReady && (
          <div className="absolute top-3 right-3 left-3 sm:left-auto rounded-lg bg-background/95 border shadow-sm px-3 py-2 text-xs z-[500]">
            وضع التعديل — اسحب النقاط ثم احفظ
          </div>
        )}
      </div>

      {draftComplete && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-3">
          <p className="text-sm font-medium">حفظ المنطقة المرسومة</p>
          <Input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder="اسم المنطقة"
          />
          <p className="text-xs text-muted-foreground">عدد النقاط: {draftPath.length}</p>
          <Button type="button" onClick={confirmDraft} disabled={saveZone.isPending}>
            {saveZone.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin ml-2" />
            ) : (
              <Save className="h-4 w-4 ml-2" />
            )}
            حفظ المنطقة
          </Button>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">المناطق المحفوظة</p>
          <Badge variant="secondary">{zones.filter((z) => z.is_active).length} مفعّلة</Badge>
        </div>

        {listLoading ? (
          <p className="text-sm text-muted-foreground py-2 flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            جاري تحميل المناطق...
          </p>
        ) : zones.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">لا توجد مناطق بعد — ارسم منطقة على الخريطة.</p>
        ) : null}

        {zones.map((zone) => {
          const isEditing = editingId === zone.id;
          const isSelected = selectedId === zone.id;

          return (
            <div
              key={zone.id}
              className={`rounded-lg border p-3 space-y-3 transition-colors ${
                isEditing
                  ? "border-blue-500 bg-blue-50/50"
                  : isSelected
                    ? "border-primary bg-primary/5"
                    : "bg-background"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {isEditing ? (
                    <Input
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      className="mb-1"
                      placeholder="اسم المنطقة"
                    />
                  ) : (
                    <p className="text-sm font-medium truncate">{zone.name}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {(isEditing && editPath ? editPath.length : zone.polygon.length)} نقطة على المضلع
                    {isEditing ? " · اسحب النقاط أو انقر لحذفها" : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {zone.is_active ? "مفعّلة" : "متوقفة"}
                  </span>
                  <Switch
                    checked={zone.is_active}
                    onCheckedChange={(v) => toggleZone.mutate({ id: zone.id, is_active: v })}
                    disabled={isEditing}
                  />
                </div>
              </div>

              {isEditing ? (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" onClick={saveEditing} disabled={saveZone.isPending}>
                    {saveZone.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin ml-1" />
                    ) : (
                      <Save className="h-3.5 w-3.5 ml-1" />
                    )}
                    حفظ التعديلات
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={cancelEditing}>
                    <X className="h-3.5 w-3.5 ml-1" />
                    إلغاء
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => focusZone(zone)}
                    disabled={!mapReady || !!editingId || drawing}
                  >
                    <Eye className="h-3.5 w-3.5 ml-1" />
                    عرض على الخريطة
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => startEditing(zone)}
                    disabled={!mapReady || !!editingId || drawing || draftComplete}
                  >
                    <Pencil className="h-3.5 w-3.5 ml-1" />
                    تعديل
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDelete(zone)}
                    disabled={deleteZone.isPending || !!editingId}
                  >
                    <Trash2 className="h-3.5 w-3.5 ml-1" />
                    حذف
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DeliveryZonesEditor;
