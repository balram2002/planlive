"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/cn";
import { haptics } from "@/lib/haptics";

type ToastVariant = "success" | "error" | "info";

type ToastInput = {
  title: string;
  description?: string;
  variant?: ToastVariant;
};

type ToastItem = ToastInput & {
  id: number;
  leaving: boolean;
};

type ToastContextValue = {
  toast: (t: ToastInput) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

const AUTO_DISMISS_MS = 3800;
const LEAVE_MS = 250;
const MAX_VISIBLE = 3;

const icons: Record<ToastVariant, React.ReactNode> = {
  success: (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
      <path d="m5 12.5 4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  error: (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
      <path d="M12 7v6m0 4h.01" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  ),
  info: (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
      <path d="M12 11v6m0-10h.01" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  ),
};

const variantStyles: Record<ToastVariant, { chip: string }> = {
  success: { chip: "bg-success/15 text-success" },
  error: { chip: "bg-live/15 text-live" },
  info: { chip: "bg-primary/15 text-primary" },
};

/** App-wide toast provider + fixed top-center stack. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    // Two-phase: mark leaving (plays exit animation), then remove.
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)),
    );
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, LEAVE_MS);
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id = nextId.current++;
      const variant = input.variant ?? "info";

      // Important notifications carry a matching haptic.
      if (variant === "success") haptics.success();
      else if (variant === "error") haptics.error();

      setToasts((prev) => {
        const next = [...prev, { ...input, variant, id, leaving: false }];
        // Cap the stack: drop the oldest immediately.
        return next.length > MAX_VISIBLE ? next.slice(-MAX_VISIBLE) : next;
      });
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Stack — below the top bar, above everything else. */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+4rem)] z-50 flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => dismiss(t.id)}
            className={cn(
              "pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-2xl border border-border bg-elevated px-3.5 py-3 text-left shadow-pop",
              t.leaving ? "animate-toast-out" : "animate-toast-in",
            )}
          >
            <span
              className={cn(
                "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                variantStyles[t.variant ?? "info"].chip,
              )}
            >
              {icons[t.variant ?? "info"]}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold leading-snug">
                {t.title}
              </span>
              {t.description ? (
                <span className="mt-0.5 block text-xs text-muted">
                  {t.description}
                </span>
              ) : null}
            </span>
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
