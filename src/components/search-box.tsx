"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Spinner } from "@/components/ui/action-button";
import { haptics } from "@/lib/haptics";
import { cn } from "@/lib/cn";

type Results = {
  sellers: Array<{
    id: string;
    name: string;
    fullName: string | null;
    imageUrl: string | null;
  }>;
  categories: Array<{
    id: string;
    name: string;
    subcategory: string | null;
    imageUrl: string | null;
  }>;
  streams: Array<{
    id: string;
    title: string | null;
    thumbnailUrl: string | null;
    sellerName: string;
    startedAgo: string;
  }>;
};

const DEBOUNCE_MS = 220;

/**
 * Header typeahead: results appear while typing (partial matches — "tech"
 * finds "technical"), debounced + aborted per keystroke so stale responses
 * never flash. Enter opens the full /search page.
 */
export function SearchBox() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounced live search. All setState happens inside timers/fetch
  // callbacks (external-system pattern), never synchronously in the effect.
  useEffect(() => {
    const timer = setTimeout(async () => {
      const query = q.trim();
      if (query.length < 1) {
        setResults(null);
        setLoading(false);
        return;
      }
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const body = (await res.json()) as Results;
        if (!controller.signal.aborted) {
          setResults(body);
          setOpen(true);
        }
      } catch {
        // Aborted or offline — keep previous results; next keystroke retries.
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [q]);

  // Close when tapping anywhere outside.
  useEffect(() => {
    function onDown(e: PointerEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  function submitFull() {
    const query = q.trim();
    if (query.length < 2) return;
    haptics.tap();
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(query)}`);
  }

  const empty =
    results !== null &&
    results.sellers.length === 0 &&
    results.categories.length === 0 &&
    results.streams.length === 0;

  return (
    <div ref={boxRef} className="relative min-w-0 flex-1">
      <div className="relative">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint"
        >
          <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="1.8" />
          <path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => {
            if (results) setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitFull();
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder="Search lives, categories, sellers…"
          aria-label="Search"
          className="h-9 w-full rounded-full border border-border bg-surface-2 pl-9 pr-9 text-sm placeholder:text-faint focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/25"
        />
        {/* In-field feedback: spinner while fetching, clear button otherwise. */}
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
          {loading ? (
            <Spinner className="h-3.5 w-3.5 text-faint" />
          ) : q ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setQ("");
                setResults(null);
                setOpen(false);
              }}
              className="flex h-5 w-5 items-center justify-center rounded-full bg-border text-[10px] text-muted"
            >
              ✕
            </button>
          ) : null}
        </span>
      </div>

      {/* Results dropdown */}
      <AnimatePresence>
        {open && results ? (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
            className="no-scrollbar absolute left-0 right-0 top-full z-50 mt-2 max-h-[60vh] overflow-y-auto rounded-2xl border border-border bg-surface p-2 shadow-pop"
            data-no-swipe
          >
            {empty ? (
              <p className="px-3 py-6 text-center text-sm text-faint">
                No matches for “{q.trim()}”
              </p>
            ) : (
              <>
                {results.streams.length > 0 ? (
                  <Group label="Live now">
                    {results.streams.map((stream) => (
                      <Row
                        key={stream.id}
                        href={`/live/${stream.id}`}
                        onGo={() => setOpen(false)}
                        thumb={
                          <span className="relative h-10 w-8 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                            {stream.thumbnailUrl ? (
                              <Image src={stream.thumbnailUrl} alt="" fill sizes="32px" className="object-cover" />
                            ) : (
                              <span className="flex h-full w-full items-center justify-center text-xs">🎥</span>
                            )}
                          </span>
                        }
                        title={stream.title ?? `@${stream.sellerName} live`}
                        sub={`@${stream.sellerName} · ${stream.startedAgo}`}
                        trailing={
                          <span className="rounded-full bg-live px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                            Live
                          </span>
                        }
                      />
                    ))}
                  </Group>
                ) : null}

                {results.categories.length > 0 ? (
                  <Group label="Categories">
                    {results.categories.map((category) => (
                      <Row
                        key={category.id}
                        href={`/discover?category=${category.id}`}
                        onGo={() => setOpen(false)}
                        thumb={
                          <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-surface-2">
                            {category.imageUrl ? (
                              <Image src={category.imageUrl} alt="" fill sizes="36px" className="object-cover" />
                            ) : (
                              <span className="flex h-full w-full items-center justify-center text-sm">🗂️</span>
                            )}
                          </span>
                        }
                        title={category.name}
                        sub={category.subcategory ?? "Browse streams"}
                      />
                    ))}
                  </Group>
                ) : null}

                {results.sellers.length > 0 ? (
                  <Group label="Sellers">
                    {results.sellers.map((seller) => (
                      <Row
                        key={seller.id}
                        href={`/seller/${seller.id}`}
                        onGo={() => setOpen(false)}
                        thumb={
                          <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-primary">
                            {seller.imageUrl ? (
                              <Image src={seller.imageUrl} alt="" fill sizes="36px" className="object-cover" />
                            ) : (
                              <span className="flex h-full w-full items-center justify-center text-xs font-bold uppercase text-white">
                                {seller.name.slice(0, 1)}
                              </span>
                            )}
                          </span>
                        }
                        title={`@${seller.name}`}
                        sub={seller.fullName ?? "View shop"}
                      />
                    ))}
                  </Group>
                ) : null}

                <button
                  type="button"
                  onClick={submitFull}
                  className={cn(
                    "mt-1 w-full rounded-xl px-3 py-2.5 text-center text-sm font-medium text-primary transition-colors hover:bg-primary/5",
                    q.trim().length < 2 && "hidden",
                  )}
                >
                  See all results for “{q.trim()}” →
                </button>
              </>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-1">
      <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-faint">
        {label}
      </p>
      {children}
    </div>
  );
}

function Row({
  href,
  onGo,
  thumb,
  title,
  sub,
  trailing,
}: {
  href: string;
  onGo: () => void;
  thumb: React.ReactNode;
  title: string;
  sub: string;
  trailing?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={() => {
        haptics.tap();
        onGo();
      }}
      className="flex items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-surface-2 active:scale-[0.99]"
    >
      {thumb}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        <span className="block truncate text-xs text-muted">{sub}</span>
      </span>
      {trailing}
    </Link>
  );
}
