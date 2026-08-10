import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { loadGoogleMaps, triggerMapResize, waitForElementSize } from "@/lib/google-maps";
import { useDeliveryZones, type DeliveryZone } from "@/hooks/useDeliveryZones";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, MapPin, Pencil, Plus, Trash2, Save, X, Eye, Check } from "lucide-react";
import { toast } from "sonner";
import type { LatLng } from "@/lib/geo";

const DEFAULT_CENTER = { lat: 21.4225, lng: 39.8262 }; // Makkah

type DeliveryZonesEditorProps = {
  /** When set, only that branch's zones are shown and new zones are linked to it. */
  branchId?: string | null;
  branchName?: string;
  branchCenter?: { lat: number; lng: number } | null;
  mapHeightClass?: string;
};

const pathToPolygon = (path: any): LatLng[] => {
  const result: LatLng[] = [];
  path.forEach((p: any) => {
    result.push({ lat: p.lat(), lng: p.lng() });
  });
  return result;
};

const fitPolygonOnMap = (map: any, polygon: LatLng[]) => {
  if (!map || !window.google?.maps || polygon.length < 1) return;
  const bounds = new window.google.maps.LatLngBounds();
  polygon.forEach((p) => bounds.extend(p));
  try {
    map.fitBounds(bounds, 56);
  } catch {
    map.setCenter(polygon[0]);
    map.setZoom(12);
  }
};

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
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const polygonsRef = useRef<Map<string, any>>(new Map());
  const draftPolygonRef = useRef<any>(null);
  const draftMarkersRef = useRef<any[]>([]);
  const clickListenerRef = useRef<any>(null);
  const pathListenersRef = useRef<any[]>([]);
  const drawingRef = useRef(false);
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
  };

  const clearPathListeners = () => {
    pathListenersRef.current.forEach((listener) => {
      try {
        window.google?.maps?.event?.removeListener(listener);
      } catch {
        /* ignore */
      }
    });
    pathListenersRef.current = [];
  };

  const clearDraftOverlays = () => {
    if (draftPolygonRef.current) {
      draftPolygonRef.current.setMap(null);
      draftPolygonRef.current = null;
    }
    draftMarkersRef.current.forEach((m) => m.setMap(null));
    draftMarkersRef.current = [];
  };

  const removeClickListener = () => {
    if (clickListenerRef.current) {
      try {
        window.google?.maps?.event?.removeListener(clickListenerRef.current);
      } catch {
        /* ignore */
      }
      clickListenerRef.current = null;
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
        clearPathListeners();
        setEditingId(null);
        setEditPath(null);
      }
      toast.success("تم حذف المنطقة");
    },
    onError: () => toast.error("تعذر حذف المنطقة"),
  });

  const renderDraftPreview = useCallback((points: LatLng[]) => {
    const map = mapInstance.current;
    if (!map || !window.google?.maps) return;

    clearDraftOverlays();

    draftMarkersRef.current = points.map(
      (p, i) =>
        new window.google.maps.Marker({
          position: p,
          map,
          label: {
            text: String(i + 1),
            color: "#fff",
            fontSize: "11px",
            fontWeight: "700",
          },
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: "#15803d",
            fillOpacity: 1,
            strokeColor: "#fff",
            strokeWeight: 2,
          },
        })
    );

    if (points.length >= 2) {
      draftPolygonRef.current = new window.google.maps.Polygon({
        paths: points,
        map,
        fillColor: "#16a34a",
        fillOpacity: points.length >= 3 ? 0.25 : 0.08,
        strokeWeight: 2,
        strokeColor: "#15803d",
        clickable: false,
        zIndex: 20,
      });
    }
  }, []);

  // Init map (no DrawingManager — removed in Maps API v3.65)
  useEffect(() => {
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;

    (async () => {
      setMapLoading(true);
      setMapError(null);

      try {
        const ok = await loadGoogleMaps();
        if (cancelled) return;

        if (!ok || !window.google?.maps) {
          setMapError("تعذر تحميل الخريطة. تحقق من الاتصال ثم أعد فتح الإعدادات.");
          setMapReady(false);
          setMapLoading(false);
          return;
        }

        if (!mapRef.current) {
          setMapError("تعذر تهيئة الخريطة");
          setMapLoading(false);
          return;
        }

        await waitForElementSize(mapRef.current);
        if (cancelled || !mapRef.current) return;

        const map = new window.google.maps.Map(mapRef.current, {
          center: mapCenter,
          zoom: 12,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          gestureHandling: "greedy",
        });
        mapInstance.current = map;

        const refresh = () => {
          triggerMapResize(map);
          map.setCenter(mapCenter);
        };
        requestAnimationFrame(() => {
          refresh();
          setTimeout(refresh, 150);
          setTimeout(refresh, 400);
        });

        resizeObserver = new ResizeObserver(() => triggerMapResize(map));
        resizeObserver.observe(mapRef.current);

        if (!cancelled) {
          setMapReady(true);
          setMapLoading(false);
        }
      } catch (e: any) {
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
      clearPathListeners();
      clearDraftOverlays();
    };
  }, [mapCenter.lat, mapCenter.lng]);

  // Keep map centered on branch when branch changes and no zones yet
  useEffect(() => {
    if (!mapReady || !mapInstance.current || zones.length > 0) return;
    mapInstance.current.setCenter(mapCenter);
    mapInstance.current.setZoom(12);
  }, [mapReady, mapCenter.lat, mapCenter.lng, zones.length]);

  // Render saved polygons
  useEffect(() => {
    if (!mapReady || !mapInstance.current || !window.google?.maps) return;

    const map = mapInstance.current;
    const existing = polygonsRef.current;

    for (const [id, poly] of existing.entries()) {
      if (!zones.find((z) => z.id === id)) {
        poly.setMap(null);
        existing.delete(id);
      }
    }

    zones.forEach((zone) => {
      let poly = existing.get(zone.id);
      const path =
        editingId === zone.id && editPath
          ? editPath.map((p) => ({ lat: p.lat, lng: p.lng }))
          : zone.polygon.map((p) => ({ lat: p.lat, lng: p.lng }));
      const isSelected = selectedId === zone.id || editingId === zone.id;
      const isEditing = editingId === zone.id;
      const opts = {
        paths: path,
        fillColor: zone.is_active ? zone.color : "#9ca3af",
        fillOpacity: zone.is_active ? (isSelected ? 0.35 : 0.22) : 0.1,
        strokeWeight: isSelected ? 3 : 2,
        strokeColor: isEditing ? "#2563eb" : zone.is_active ? zone.color : "#9ca3af",
        clickable: !isEditing && !drawing,
        editable: isEditing,
        zIndex: isSelected ? 10 : 1,
      };

      if (poly) {
        poly.setOptions(opts);
        if (!isEditing) {
          poly.setPaths(path);
        }
      } else {
        poly = new window.google.maps.Polygon(opts);
        poly.setMap(map);
        existing.set(zone.id, poly);
        window.google.maps.event.addListener(poly, "click", () => {
          focusZone(zone);
        });
      }
    });
  }, [zones, mapReady, selectedId, drawing, editingId, editPath]);

  // Fit all zones once when map becomes ready
  useEffect(() => {
    if (!mapReady || !mapInstance.current || drawing || editingId || selectedId) return;
    if (zones.length === 0) return;
    const all = zones.flatMap((z) => z.polygon);
    if (all.length > 0) fitPolygonOnMap(mapInstance.current, all);
  }, [mapReady, zones.length]);

  // Path listeners while editing saved polygon
  useEffect(() => {
    clearPathListeners();
    if (!editingId || !window.google?.maps) return;
    const poly = polygonsRef.current.get(editingId);
    if (!poly) return;

    poly.setEditable(true);
    const path = poly.getPath();
    const sync = () => setEditPath(pathToPolygon(path));
    pathListenersRef.current.push(
      window.google.maps.event.addListener(path, "set_at", sync),
      window.google.maps.event.addListener(path, "insert_at", sync),
      window.google.maps.event.addListener(path, "remove_at", sync)
    );

    return () => clearPathListeners();
  }, [editingId, mapReady]);

  const focusZone = useCallback((zone: DeliveryZone) => {
    if (!mapInstance.current) {
      toast.error("الخريطة غير جاهزة بعد");
      return;
    }
    setSelectedId(zone.id);
    setEditingName(zone.name);
    triggerMapResize(mapInstance.current);
    fitPolygonOnMap(mapInstance.current, zone.polygon);
    // Scroll map into view inside the dialog
    mapRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);

  const cancelEditing = () => {
    clearPathListeners();
    const id = editingId;
    setEditingId(null);
    setEditPath(null);
    if (id) {
      const zone = zones.find((z) => z.id === id);
      const poly = polygonsRef.current.get(id);
      if (zone && poly) {
        poly.setEditable(false);
        poly.setPaths(zone.polygon.map((p) => ({ lat: p.lat, lng: p.lng })));
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
      triggerMapResize(mapInstance.current);
      fitPolygonOnMap(mapInstance.current, zone.polygon);
    }
    mapRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    toast.message("اسحب نقاط المضلع على الخريطة ثم احفظ");
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
    clearPathListeners();
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
    if (!mapReady || !mapInstance.current || !window.google?.maps) {
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

    triggerMapResize(mapInstance.current);
    mapRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });

    clickListenerRef.current = window.google.maps.event.addListener(
      mapInstance.current,
      "click",
      (e: any) => {
        if (!drawingRef.current || !e.latLng) return;
        const point = { lat: e.latLng.lat(), lng: e.latLng.lng() };
        const next = [...draftPointsRef.current, point];
        draftPointsRef.current = next;
        setDraftPath(next);
        renderDraftPreview(next);
      }
    );

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

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
        <p className="font-medium text-foreground mb-1 flex items-center gap-1.5">
          <MapPin className="h-4 w-4 text-primary" />
          نطاق التوصيل على الخريطة
          {branchName ? ` — ${branchName}` : ""}
        </p>
        <p>
          ارسم المضلع بدقة حول منطقة خدمة الفرع. انقر لإضافة نقاط الحدود، ثم اسحبها للتعديل.
          الطلبات خارج المناطق المفعّلة تُرفض تلقائياً.
        </p>
        {!branchId && (
          <p className="mt-2 text-destructive text-xs font-medium">
            يجب اختيار فرع قبل رسم أو حفظ نطاق جغرافي.
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
        <div ref={mapRef} className={`w-full bg-muted ${mapHeightClass}`} />
        {mapLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/90 text-sm text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            جاري تحميل الخريطة...
          </div>
        )}
        {mapError && !mapLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/95 text-sm text-destructive p-4 text-center">
            {mapError}
          </div>
        )}
        {editingId && mapReady && (
          <div className="absolute top-3 right-3 left-3 sm:left-auto rounded-lg bg-background/95 border shadow-sm px-3 py-2 text-xs">
            وضع التعديل — اسحب نقاط الحدود ثم احفظ
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

        {zones.length === 0 && (
          <p className="text-sm text-muted-foreground py-2">لا توجد مناطق بعد — ارسم منطقة على الخريطة.</p>
        )}

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
                    {isEditing ? " · يمكن سحب النقاط على الخريطة" : ""}
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
