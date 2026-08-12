"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import L from "leaflet";

// Default default lat/lng center (India) when nothing is pinned yet.
const DEFAULT_CENTER: [number, number] = [22.9734, 78.6569];
const DEFAULT_ZOOM = 4.5;
const PINNED_ZOOM = 16;

/**
 * A pin-shaped div icon rather than Leaflet's default marker image.
 *
 * Leaflet's default `L.Icon.Default` resolves its PNG paths relative to the
 * page URL, which breaks under a bundler unless the images are copied and
 * the paths patched (`_getIconUrl` workaround). A styled div avoids shipping
 * or wiring up marker image assets entirely.
 */
const pinIcon = L.divIcon({
  className: "",
  html: `<div style="font-size:32px;line-height:1;transform:translate(-50%,-100%);filter:drop-shadow(0 2px 3px rgb(0 0 0 / 0.4))">📍</div>`,
  iconSize: [0, 0],
});

/**
 * Free OpenStreetMap-tiled map (no API key) with a draggable pin. Click
 * anywhere, or drag the pin, to set the shop's exact coordinates.
 */
export function ShopLocationMapInner({
  latitude,
  longitude,
  onChange,
}: {
  latitude: number | null;
  longitude: number | null;
  onChange: (lat: number, lon: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  // Mirrors the latest onChange without re-running the setup effect on every
  // keystroke-driven coordinate update.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Set up the map once.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    const hasInitial = latitude != null && longitude != null;
    const center: [number, number] = hasInitial
      ? [latitude, longitude]
      : DEFAULT_CENTER;

    const map = L.map(container, {
      center,
      zoom: hasInitial ? PINNED_ZOOM : DEFAULT_ZOOM,
      scrollWheelZoom: false,
    });
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    const marker = L.marker(center, { icon: pinIcon, draggable: true }).addTo(
      map,
    );
    markerRef.current = marker;

    marker.on("dragend", () => {
      const { lat, lng } = marker.getLatLng();
      onChangeRef.current(lat, lng);
    });
    map.on("click", (e: L.LeafletMouseEvent) => {
      marker.setLatLng(e.latlng);
      onChangeRef.current(e.latlng.lat, e.latlng.lng);
    });

    // The container's real size settles after the surrounding layout (and
    // any enter animation) finishes; without this the tiles render at a
    // stale 0-size viewport and the map looks blank until manually resized.
    const t = setTimeout(() => map.invalidateSize(), 150);

    return () => {
      clearTimeout(t);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Intentionally empty — the map/marker are created once; external
    // coordinate updates are applied via the effect below instead of by
    // tearing down and rebuilding the whole map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-center + move the pin when coordinates change from OUTSIDE the map
  // (manual lat/lng entry, "use my location", or a pasted Maps link).
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker || latitude == null || longitude == null) return;
    const current = marker.getLatLng();
    if (
      Math.abs(current.lat - latitude) < 1e-9 &&
      Math.abs(current.lng - longitude) < 1e-9
    ) {
      return;
    }
    marker.setLatLng([latitude, longitude]);
    map.setView([latitude, longitude], Math.max(map.getZoom(), PINNED_ZOOM));
  }, [latitude, longitude]);

  return (
    <div
      ref={containerRef}
      className="h-56 w-full overflow-hidden rounded-2xl border border-border"
    />
  );
}
