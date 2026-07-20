import type { MetadataRoute } from "next";

/** PWA manifest: installable app shell with theme-matched chrome. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "liveWAB — Shop live, buy now",
    short_name: "liveWAB",
    description:
      "Watch sellers go live, grab products in real time, and check out in seconds.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f6f8",
    theme_color: "#f6f6f8",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "48x48",
        type: "image/x-icon",
      },
    ],
  };
}
