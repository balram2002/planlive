"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useReducedMotion } from "motion/react";
import { Spinner } from "@/components/ui/action-button";
import { haptics } from "@/lib/haptics";
import { cn } from "@/lib/cn";

export type RailCategory = {
  id: string;
  name: string;
  imageUrl: string | null;
};

/**
 * Whatnot-style category tile rail. Client-side with useTransition so
 * same-route searchParam navigation (which never triggers loading.tsx)
 * still gives instant feedback: the tapped tile shows a spinner and the
 * rail dims until the filtered server render lands.
 */
export function CategoryRail({
  categories,
  selectedId,
  basePath,
}: {
  categories: RailCategory[];
  selectedId: string | null;
  basePath: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [targetId, setTargetId] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();

  function go(id: string | null) {
    haptics.tap();
    setTargetId(id ?? "__all__");
    startTransition(() => {
      router.push(id ? `${basePath}?category=${id}` : basePath, {
        scroll: false,
      });
    });
  }

  const pendingOn = (key: string | null) =>
    isPending && targetId === (key ?? "__all__");

  return (
    <div
      className={cn(
        "no-scrollbar -mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 transition-opacity duration-200",
        isPending && "opacity-70",
      )}
      data-no-swipe
      aria-busy={isPending}
    >
      {/* "For You" / all */}
      <button
        type="button"
        onClick={() => go(null)}
        disabled={isPending}
        className={cn(
          "relative flex aspect-[4/5] w-[104px] shrink-0 flex-col overflow-hidden rounded-2xl border-2 bg-gradient-to-b from-primary via-primary to-primary-hover p-2.5 text-left transition-all duration-200",
          !reduceMotion && "active:scale-[0.97]",
          !selectedId
            ? "border-foreground shadow-pop"
            : "border-transparent opacity-90 hover:opacity-100",
        )}
      >
        <span className="text-sm font-bold leading-tight text-white">
          For You
        </span>
        <span className="absolute bottom-2 left-1/2 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full bg-white/20 text-2xl backdrop-blur">
          {pendingOn(null) ? <Spinner className="h-5 w-5 text-white" /> : "⚡"}
        </span>
      </button>

      {categories.map((category) => {
        const active = selectedId === category.id;
        const busy = pendingOn(category.id);
        return (
          <button
            key={category.id}
            type="button"
            onClick={() => go(category.id)}
            disabled={isPending}
            className={cn(
              "relative flex aspect-[4/5] w-[104px] shrink-0 flex-col overflow-hidden rounded-2xl border-2 bg-surface-2 p-2.5 text-left transition-all duration-200",
              !reduceMotion && "active:scale-[0.97]",
              active
                ? "border-primary shadow-pop"
                : "border-transparent hover:border-border",
            )}
          >
            {category.imageUrl ? (
              <>
                <Image
                  src={category.imageUrl}
                  alt=""
                  fill
                  sizes="104px"
                  className="object-cover"
                />
                <span className="absolute inset-0 bg-gradient-to-b from-surface-2 via-surface-2/40 to-transparent" />
              </>
            ) : (
              <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-4xl opacity-70">
                🗂️
              </span>
            )}
            <span className="absolute left-2.5 right-2.5 top-2.5 z-20 text-sm font-bold leading-tight text-foreground">
              {category.name}
            </span>
            {busy ? (
              <span className="absolute inset-0 z-30 flex items-center justify-center bg-black/30 backdrop-blur-[1px]">
                <Spinner className="h-5 w-5 text-white" />
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
