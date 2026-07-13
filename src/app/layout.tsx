import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { ThemeProvider } from "next-themes";
import { ToastProvider } from "@/components/toast";
import { ScrollRestorer } from "@/components/auth/scroll-restorer";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: "LiveShop — Shop live, buy now",
    template: "%s · LiveShop",
  },
  description:
    "Watch sellers go live, grab products in real time, and check out in seconds. Live shopping with instant Buy Now reservations.",
  applicationName: "LiveShop",
  keywords: [
    "live shopping",
    "live commerce",
    "buy now",
    "live streams",
    "online shopping India",
  ],
  openGraph: {
    type: "website",
    siteName: "LiveShop",
    title: "LiveShop — Shop live, buy now",
    description:
      "Watch sellers go live, grab products in real time, and check out in seconds.",
    url: "/",
  },
  twitter: {
    card: "summary",
    title: "LiveShop — Shop live, buy now",
    description:
      "Watch sellers go live, grab products in real time, and check out in seconds.",
  },
  robots: {
    index: true,
    follow: true,
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "LiveShop",
  },
};

export const viewport: Viewport = {
  // Browser chrome follows the active theme.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f6f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0c" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider
      appearance={{
        // CSS variables resolve inside Clerk's portals, so its modals and
        // cards follow whichever theme (light/dark/system) is active.
        variables: {
          colorPrimary: "#e11d48",
          colorBackground: "var(--surface)",
          colorForeground: "var(--foreground)",
          colorMutedForeground: "var(--muted)",
          colorInput: "var(--surface-2)",
          colorInputForeground: "var(--foreground)",
          colorBorder: "var(--border)",
          borderRadius: "1rem",
        },
      }}
    >
      {/* suppressHydrationWarning: next-themes stamps the class pre-hydration. */}
      <html
        lang="en"
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <body>
          <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
            <ToastProvider>
              {children}
              <ScrollRestorer />
            </ToastProvider>
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
