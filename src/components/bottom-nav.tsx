"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { MenuSheet } from "@/components/menu-sheet";
import { haptics } from "@/lib/haptics";
import { cn } from "@/lib/cn";

export type NavRole = "BUYER" | "SELLER" | "ADMIN" | null;

type Tab = {
  href: string;
  label: string;
  icon: React.ReactNode;
};

const baseTabs: Tab[] = [
  {
    href: "/",
    label: "Home",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-[22px] w-[22px]" aria-hidden>
        <path
          d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1v-8.5Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    href: "/play",
    label: "Play",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-[22px] w-[22px]" aria-hidden>
        <rect x="3.5" y="3.5" width="17" height="17" rx="5" stroke="currentColor" strokeWidth="1.8" />
        <path d="M10 8.8v6.4a.5.5 0 0 0 .77.42l5-3.2a.5.5 0 0 0 0-.84l-5-3.2a.5.5 0 0 0-.77.42Z" fill="currentColor" />
      </svg>
    ),
  },
  {
    href: "/dashboard",
    label: "Sell",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-[22px] w-[22px]" aria-hidden>
        <path
          d="M5 8h14l-1 11a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 8Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M9 8a3 3 0 0 1 6 0"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    href: "/orders",
    label: "Orders",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-[22px] w-[22px]" aria-hidden>
        <rect x="5" y="4" width="14" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M9 9h6M9 13h6M9 17h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
];

const menuIcon = (
  <svg viewBox="0 0 24 24" fill="none" className="h-[22px] w-[22px]" aria-hidden>
    <path
      d="M4 7h16M4 12h16M4 17h10"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>
);

const adminTab: Tab = {
  href: "/admin",
  label: "Admin",
  icon: (
    <svg viewBox="0 0 24 24" fill="none" className="h-[22px] w-[22px]" aria-hidden>
      <path
        d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Zm-2.5 9 2 2 3.5-4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
};

/** Menu-sheet links: account settings + role tools (nav tabs cover the rest). */
function linksForRole(role: NavRole) {
  const account =
    role !== null
      ? [
          { href: "/profile", label: "Edit profile", emoji: "👤" },
          { href: "/addresses", label: "Addresses", emoji: "📍" },
        ]
      : [];
  if (role === "ADMIN") {
    return [...account, { href: "/admin", label: "Admin panel", emoji: "🛡️" }];
  }
  if (role === "SELLER") {
    return [
      ...account,
      { href: "/shop-address", label: "Shop address", emoji: "🏬" },
      { href: "/dashboard", label: "Seller dashboard", emoji: "🛍️" },
      { href: "/dashboard/sales", label: "Sales", emoji: "💸" },
    ];
  }
  // Buyers (and guests) get the application funnel entry instead.
  return [
    ...account,
    { href: "/become-a-seller", label: "Become a seller", emoji: "🛍️" },
  ];
}

/**
 * Floating pill tab bar. The active highlight is a Motion shared-layout
 * element (layoutId), so it *slides* between tabs with a spring instead of
 * jumping — transform/opacity only, no layout thrash.
 */
export function BottomNav({ role = null }: { role?: NavRole }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  // Admins get an Admin tab where sellers/buyers see Sell.
  const tabs = baseTabs.map((tab) =>
    tab.href === "/dashboard" && role === "ADMIN" ? adminTab : tab,
  );

  return (
    <>
      <div className="pointer-events-none sticky bottom-0 z-30 px-3 pb-[calc(env(safe-area-inset-bottom)+0.625rem)] pt-2">
        <nav className="pointer-events-auto mx-auto flex max-w-sm items-stretch rounded-full border border-border bg-surface/85 p-1 shadow-pop backdrop-blur-xl">
          {tabs.map((tab) => {
            const active =
              pathname === tab.href || pathname.startsWith(tab.href + "/");
            return (
              <Link
                key={tab.href}
                href={tab.href}
                onClick={() => haptics.tap()}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex flex-1 flex-col items-center gap-0.5 rounded-full py-2 text-[10.5px] font-semibold transition-colors duration-200 active:scale-95",
                  active ? "text-primary" : "text-faint hover:text-muted",
                )}
              >
                {active ? (
                  <motion.span
                    layoutId="bottom-nav-pill"
                    className="absolute inset-0 rounded-full bg-primary/10"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                ) : null}
                <motion.span
                  className="relative"
                  animate={{ scale: active ? 1.08 : 1, y: active ? -1 : 0 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                >
                  {tab.icon}
                </motion.span>
                <span className="relative">{tab.label}</span>
              </Link>
            );
          })}

          {/* Menu — theme, links, account (theme toggle lives here on mobile). */}
          <button
            type="button"
            onClick={() => {
              haptics.tap();
              setMenuOpen(true);
            }}
            className="relative flex flex-1 flex-col items-center gap-0.5 rounded-full py-2 text-[10.5px] font-semibold text-faint transition-colors duration-200 hover:text-muted active:scale-95"
          >
            {menuIcon}
            Menu
          </button>
        </nav>
      </div>

      <MenuSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        links={linksForRole(role)}
      />
    </>
  );
}
