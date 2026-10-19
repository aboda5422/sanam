/** Lightweight Leaflet loader (OSM) — used when Google Maps tiles fail. */

const CSS_ID = "Sanam-leaflet-css";
const JS_ID = "Sanam-leaflet-js";
const LEAFLET_VER = "1.9.4";

let loadPromise: Promise<boolean> | null = null;

declare global {
  interface Window {
    L?: any;
  }
}

export function loadLeaflet(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.L?.map) return Promise.resolve(true);
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      if (!document.getElementById(CSS_ID)) {
        const link = document.createElement("link");
        link.id = CSS_ID;
        link.rel = "stylesheet";
        link.href = `https://unpkg.com/leaflet@${LEAFLET_VER}/dist/leaflet.css`;
        document.head.appendChild(link);
      }
      const existing = document.getElementById(JS_ID) as HTMLScriptElement | null;
      if (!existing) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.id = JS_ID;
          script.src = `https://unpkg.com/leaflet@${LEAFLET_VER}/dist/leaflet.js`;
          script.async = true;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("leaflet failed"));
          document.head.appendChild(script);
        });
      } else if (!window.L) {
        await new Promise<void>((resolve, reject) => {
          existing.addEventListener("load", () => resolve(), { once: true });
          existing.addEventListener("error", () => reject(new Error("leaflet failed")), {
            once: true,
          });
        });
      }
      return !!window.L?.map;
    } catch (e) {
      console.error("[osm-map] load failed:", e);
      loadPromise = null;
      return false;
    }
  })();

  return loadPromise;
}

export type OsmZone = {
  polygon: { lat: number; lng: number }[];
  color?: string;
};

export type OsmMapHandle = {
  destroy: () => void;
  setView: (lat: number, lng: number, zoom?: number) => void;
  setMarker: (lat: number, lng: number) => void;
  locateTo: (lat: number, lng: number, zoom?: number) => void;
  setZones: (zones: OsmZone[]) => void;
};

/**
 * Street (OSM) + satellite (Esri imagery) with a compact Arabic toggle.
 * OSM alone has no satellite tiles — Esri World Imagery is the free common layer.
 */
export function attachBaseLayers(map: any, opts?: { defaultSatellite?: boolean }) {
  const L = window.L;
  if (!L || !map) return;

  const street = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
    maxZoom: 19,
  });
  const satellite = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {
      attribution:
        "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics",
      maxZoom: 19,
    },
  );

  let mode: "street" | "satellite" = opts?.defaultSatellite ? "satellite" : "street";
  (mode === "satellite" ? satellite : street).addTo(map);

  const Control = L.Control.extend({
    options: { position: "topright" },
    onAdd() {
      const btn = L.DomUtil.create(
        "button",
        "Sanam-map-basemap leaflet-bar leaflet-control",
      ) as HTMLButtonElement;
      btn.type = "button";
      btn.title = "تبديل الخريطة / القمر الصناعي";
      const syncLabel = () => {
        btn.textContent = mode === "street" ? "قمر صناعي" : "خريطة";
        btn.setAttribute("aria-label", btn.textContent);
      };
      syncLabel();
      L.DomEvent.disableClickPropagation(btn);
      L.DomEvent.on(btn, "click", (e: Event) => {
        L.DomEvent.stop(e);
        if (mode === "street") {
          map.removeLayer(street);
          satellite.addTo(map);
          mode = "satellite";
        } else {
          map.removeLayer(satellite);
          street.addTo(map);
          mode = "street";
        }
        syncLabel();
      });
      return btn;
    },
  });
  map.addControl(new Control());
}

/** Interactive OSM map with a draggable pin (+ optional delivery zone polygons). */
export function mountOsmPinMap(
  el: HTMLElement,
  opts: {
    lat: number;
    lng: number;
    zoom?: number;
    onMove: (lat: number, lng: number) => void;
    zones?: OsmZone[];
  },
): OsmMapHandle | null {
  const L = window.L;
  if (!L || !el) return null;

  // Clear previous leaflet instance if container was reused
  if ((el as any)._leaflet_id) {
    try {
      (el as any)._leaflet_id = null;
      el.innerHTML = "";
    } catch {
      /* ignore */
    }
  }

  const map = L.map(el, { zoomControl: true }).setView([opts.lat, opts.lng], opts.zoom ?? 14);
  attachBaseLayers(map);

  const marker = L.marker([opts.lat, opts.lng], { draggable: true }).addTo(map);
  let zoneLayers: any[] = [];

  const drawZones = (zones: OsmZone[] | undefined) => {
    zoneLayers.forEach((z) => {
      try {
        map.removeLayer(z);
      } catch {
        /* ignore */
      }
    });
    zoneLayers = [];
    for (const z of zones || []) {
      if (!z.polygon?.length) continue;
      const latlngs = z.polygon.map((p) => [p.lat, p.lng] as [number, number]);
      const layer = L.polygon(latlngs, {
        color: z.color || "#16a34a",
        weight: 2,
        opacity: 0.7,
        fillColor: z.color || "#16a34a",
        fillOpacity: 0.12,
        interactive: false,
      }).addTo(map);
      zoneLayers.push(layer);
    }
  };

  drawZones(opts.zones);

  marker.on("dragend", () => {
    const p = marker.getLatLng();
    opts.onMove(p.lat, p.lng);
  });
  map.on("click", (e: any) => {
    marker.setLatLng(e.latlng);
    opts.onMove(e.latlng.lat, e.latlng.lng);
  });

  setTimeout(() => map.invalidateSize(), 80);
  setTimeout(() => map.invalidateSize(), 300);

  return {
    destroy: () => {
      try {
        map.remove();
      } catch {
        /* ignore */
      }
    },
    setView: (lat, lng, zoom) => {
      map.setView([lat, lng], zoom ?? map.getZoom());
      marker.setLatLng([lat, lng]);
    },
    setMarker: (lat, lng) => {
      marker.setLatLng([lat, lng]);
    },
    /** Move pin + notify (same as user drag/click) so location is confirmed. */
    locateTo: (lat, lng, zoom) => {
      map.setView([lat, lng], zoom ?? 16);
      marker.setLatLng([lat, lng]);
      opts.onMove(lat, lng);
    },
    setZones: drawZones,
  };
}

/** Reset a container that previously held a Leaflet map. */
export function resetLeafletContainer(el: HTMLElement | null) {
  if (!el) return;
  try {
    if ((el as any)._leaflet_id) {
      (el as any)._leaflet_id = null;
      el.innerHTML = "";
    }
  } catch {
    /* ignore */
  }
}

/** Base OSM map (tiles only). Caller manages markers. */
export function createOsmMap(
  el: HTMLElement,
  center: { lat: number; lng: number },
  zoom = 13,
): any | null {
  const L = window.L;
  if (!L || !el) return null;
  resetLeafletContainer(el);
  const map = L.map(el, { zoomControl: true, attributionControl: true }).setView(
    [center.lat, center.lng],
    zoom,
  );
  attachBaseLayers(map);
  setTimeout(() => map.invalidateSize(), 80);
  setTimeout(() => map.invalidateSize(), 300);
  return map;
}

export function osmCircleMarker(
  map: any,
  lat: number,
  lng: number,
  opts: { color: string; radius?: number; label?: string; title?: string },
): any | null {
  const L = window.L;
  if (!L || !map) return null;
  const m = L.circleMarker([lat, lng], {
    radius: opts.radius ?? 10,
    color: "#fff",
    weight: 2,
    fillColor: opts.color,
    fillOpacity: 1,
  });
  if (opts.title) m.bindTooltip(opts.title, { direction: "top" });
  if (opts.label) {
    m.bindTooltip(opts.label, {
      permanent: true,
      direction: "center",
      className: "Sanam-osm-label",
    });
  }
  m.addTo(map);
  return m;
}

export function osmFitPoints(
  map: any,
  points: { lat: number; lng: number }[],
  padding = 48,
) {
  const L = window.L;
  if (!L || !map || !points.length) return;
  if (points.length === 1) {
    map.setView([points[0].lat, points[0].lng], 14);
    return;
  }
  const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
  map.fitBounds(bounds, { padding: [padding, padding] });
}
