"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { useClerk } from "@clerk/nextjs";
import { useToast } from "@/components/toast";
import { haptics } from "@/lib/haptics";
import { cn } from "@/lib/cn";

/** Follow/unfollow a seller (401 → Clerk sign-in modal). */
export function FollowButton({
  sellerId,
  initialFollowing,
  className,
}: {
  sellerId: string;
  initialFollowing: boolean;
  className?: string;
}) {
  const [following, setFollowing] = useState(initialFollowing);
  const [busy, setBusy] = useState(false);
  const { openSignIn } = useClerk();
  const { toast } = useToast();

  async function toggle() {
    haptics.tap();
    setBusy(true);
    try {
      const res = await fetch("/api/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sellerId }),
      });
      if (res.status === 401) {
        openSignIn();
        return;
      }
      const body = await res.json();
      if (res.ok) setFollowing(body.following);
    } catch {
      toast({ title: "Network error", variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.button
      type="button"
      disabled={busy}
      onClick={toggle}
      whileTap={{ scale: 0.94 }}
      className={cn(
        "rounded-full px-4 py-1.5 text-sm font-semibold transition-colors duration-300",
        following
          ? "border border-border bg-surface text-muted"
          : "bg-primary text-primary-foreground",
        className,
      )}
    >
      {following ? "Following" : "Follow"}
    </motion.button>
  );
}
