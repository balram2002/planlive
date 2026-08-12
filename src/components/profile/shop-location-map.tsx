"use client";

import dynamic from "next/dynamic";

/**
 * Leaflet touches `window` at import time, which breaks server rendering —
 * same reason the ZEGO SDK is dynamically imported elsewhere in this app.
 * `ssr: false` keeps this chunk (and its CSS) out of the server bundle and
 * out of every page that never renders the shop address form.
 */
export const ShopLocationMap = dynamic(
  () => import("./shop-location-map-inner").then((m) => m.ShopLocationMapInner),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-56 w-full items-center justify-center rounded-2xl border border-border bg-surface-2 text-xs text-muted">
        Loading map…
      </div>
    ),
  },
);
