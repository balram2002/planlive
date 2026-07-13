import type { MetadataRoute } from "next";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/**
 * Public, stable pages only. Live streams are ephemeral (10s of minutes), so
 * they don't belong in a sitemap — Discover is their canonical entry point.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${APP_URL}/`,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${APP_URL}/discover`,
      changeFrequency: "always",
      priority: 0.9,
    },
  ];
}
