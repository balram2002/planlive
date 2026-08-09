"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Field, Input } from "@/components/ui/input";
import { haptics } from "@/lib/haptics";
import { cn } from "@/lib/cn";

export type PremiumStatus = "NONE" | "PENDING" | "APPROVED" | "REJECTED";

/**
 * Standard vs Premium broadcast picker for the go-live form.
 *
 * Premium is locked unless the seller has been approved, and even then it
 * asks for the broadcast passphrase. Both are re-checked server-side in
 * `startStream` — this is the convenient front door, not the lock.
 */
export function StreamModePicker({
  premiumStatus,
  premiumConfigured,
}: {
  premiumStatus: PremiumStatus;
  /** False when the server has no ZEGO credentials — premium can't run. */
  premiumConfigured: boolean;
}) {
  const [mode, setMode] = useState<"LIVEKIT" | "ZEGO">("LIVEKIT");
  const [password, setPassword] = useState("");

  const approved = premiumStatus === "APPROVED";
  const unlocked = approved && premiumConfigured;

  return (
    <div className="space-y-3">
      <input type="hidden" name="provider" value={mode} />

      <p className="text-sm font-medium text-muted">Broadcast quality</p>

      <div className="grid gap-2.5 sm:grid-cols-2">
        <ModeCard
          active={mode === "LIVEKIT"}
          onSelect={() => {
            haptics.tap();
            setMode("LIVEKIT");
          }}
          title="Standard"
          badge="Free"
          description="Adaptive quality up to 4K, included with every account."
          icon="📺"
        />

        <ModeCard
          active={mode === "ZEGO"}
          locked={!unlocked}
          onSelect={() => {
            if (!unlocked) return;
            haptics.tap();
            setMode("ZEGO");
          }}
          title="Premium"
          badge="1080p"
          description="Dedicated premium network for the smoothest, most reliable stream."
          icon="✨"
        />
      </div>

      {/* Why premium isn't available, and what to do about it. */}
      {!approved ? (
        <div className="rounded-2xl border border-border bg-surface-2 p-3">
          {premiumStatus === "PENDING" ? (
            <p className="text-xs leading-relaxed text-muted">
              <span className="font-semibold text-foreground">
                Premium application under review.
              </span>{" "}
              We&apos;ll enable it on your account once it&apos;s approved.
            </p>
          ) : (
            <p className="text-xs leading-relaxed text-muted">
              <span className="font-semibold text-foreground">
                Premium is invite-only.
              </span>{" "}
              {premiumStatus === "REJECTED"
                ? "Your last application wasn't approved — you can apply again."
                : "Apply to broadcast on the premium network."}{" "}
              <Link
                href="/dashboard/premium"
                className="font-semibold text-primary underline-offset-2 hover:underline"
              >
                Apply now
              </Link>
            </p>
          )}
        </div>
      ) : !premiumConfigured ? (
        <div className="rounded-2xl border border-warning/30 bg-warning/5 p-3">
          <p className="text-xs leading-relaxed text-muted">
            You&apos;re approved for premium, but the server doesn&apos;t have
            premium streaming credentials configured yet.
          </p>
        </div>
      ) : null}

      {/* Passphrase, only once premium is actually selectable and selected. */}
      <AnimatePresence initial={false}>
        {mode === "ZEGO" && unlocked ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="rounded-2xl border border-amber-300/40 bg-amber-300/5 p-3">
              <Field
                label="Premium passphrase"
                htmlFor="premium-password"
                hint="Required every time you start a premium broadcast."
              >
                <Input
                  id="premium-password"
                  name="premiumPassword"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="off"
                  placeholder="Enter passphrase"
                />
              </Field>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function ModeCard({
  active,
  locked = false,
  onSelect,
  title,
  badge,
  description,
  icon,
}: {
  active: boolean;
  locked?: boolean;
  onSelect: () => void;
  title: string;
  badge: string;
  description: string;
  icon: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={locked}
      aria-pressed={active}
      className={cn(
        "flex flex-col rounded-2xl border p-3.5 text-left transition-all",
        active
          ? "border-primary/60 bg-primary/5"
          : "border-border hover:border-primary/40",
        locked && "cursor-not-allowed opacity-55 hover:border-border",
      )}
    >
      <span className="flex items-center gap-2">
        <span aria-hidden className="text-lg">
          {locked ? "🔒" : icon}
        </span>
        <span className="text-sm font-semibold">{title}</span>
        <span
          className={cn(
            "ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
            title === "Premium"
              ? "bg-amber-300/20 text-amber-600 dark:text-amber-300"
              : "bg-surface-2 text-muted",
          )}
        >
          {badge}
        </span>
      </span>
      <span className="mt-1.5 text-xs leading-relaxed text-muted">
        {description}
      </span>
    </button>
  );
}
