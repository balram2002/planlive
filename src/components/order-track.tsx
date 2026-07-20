import type { OrderStatus } from "@prisma/client";
import {
  STAGE_LABELS,
  TRACK_STAGES,
  stageIndex,
  type TrackStage,
} from "@/lib/order-status";
import { cn } from "@/lib/cn";

const dateFormat: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
};

/**
 * Placed → Shipped → Delivered progress track.
 *
 * The connecting bar is a single background element whose filled width is
 * driven by the reached-stage index, so the dots always sit exactly on the
 * line regardless of label length or container width.
 */
export function OrderTrack({
  status,
  timestamps,
  className,
}: {
  status: OrderStatus;
  timestamps: Record<TrackStage, Date | null>;
  className?: string;
}) {
  const reached = stageIndex(status);
  if (reached < 0) return null; // Not in fulfilment (unpaid / failed).

  const lastIndex = TRACK_STAGES.length - 1;
  const fillPercent = (reached / lastIndex) * 100;

  return (
    <div className={cn("pt-1", className)}>
      <div className="relative">
        {/* Rail — inset by half a dot so it starts/ends at the dot centres. */}
        <div className="absolute left-[10%] right-[10%] top-[7px] h-0.5 rounded-full bg-border" />
        <div
          className="absolute left-[10%] top-[7px] h-0.5 rounded-full bg-success transition-[width] duration-500"
          style={{ width: `calc(${fillPercent} * 0.8%)` }}
        />

        <ol className="relative flex items-start justify-between">
          {TRACK_STAGES.map((stage, i) => {
            const done = i <= reached;
            const current = i === reached;
            const at = timestamps[stage];
            return (
              <li
                key={stage}
                className="flex w-1/5 min-w-0 flex-col items-center gap-1.5 text-center"
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex h-4 w-4 items-center justify-center rounded-full border-2 bg-surface transition-colors duration-300",
                    done
                      ? "border-success bg-success"
                      : "border-border bg-surface",
                    current && "ring-4 ring-success/15",
                  )}
                >
                  {done ? (
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      className="h-2.5 w-2.5 text-white"
                      aria-hidden
                    >
                      <path
                        d="m5 12.5 4.5 4.5L19 7.5"
                        stroke="currentColor"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : null}
                </span>
                <span
                  className={cn(
                    "text-[10px] font-semibold leading-none",
                    done ? "text-foreground" : "text-faint",
                  )}
                >
                  {STAGE_LABELS[stage]}
                </span>
                <span className="text-[9px] leading-none text-faint">
                  {done && at ? at.toLocaleDateString("en-IN", dateFormat) : "—"}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
