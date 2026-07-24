import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits .next/standalone with a self-contained server.js and only the
  // node_modules actually reached at runtime — the Docker image drops from
  // well over 1GB to ~250MB, and the final stage runs no `npm install`.
  output: "standalone",

  images: {
    remotePatterns: [
      // ImageKit CDN (avatars, stream thumbnails, product photos).
      { protocol: "https", hostname: "ik.imagekit.io" },
    ],
  },

  // Nothing gains from advertising the framework to the internet.
  poweredByHeader: false,
};

export default nextConfig;
