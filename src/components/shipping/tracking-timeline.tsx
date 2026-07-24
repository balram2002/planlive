import type { Shipment } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { SHIPMENT_LABELS, SHIPMENT_TONES } from "@/lib/eshopbox/status-map";
import { cn } from "@/lib/cn";

type ParsedLog = {
  status: string;
  remarks?: string;
  location?: string;
  city?: string;
  dateTime?: string;
};

/** Courier scan history, newest first. Malformed JSON degrades to no list. */
function parseLogs(json: string | null): ParsedLog[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is ParsedLog => typeof entry?.status === "string")
      .sort((a, b) => {
        const at = a.dateTime ? Date.parse(a.dateTime) : 0;
        const bt = b.dateTime ? Date.parse(b.dateTime) : 0;
        return bt - at;
      });
  } catch {
    return [];
  }
}

function humanize(status: string): string {
  const pretty = status.replaceAll("_", " ").toLowerCase();
  return pretty.charAt(0).toUpperCase() + pretty.slice(1);
}

/**
 * Buyer-facing courier detail: carrier, AWB, expected delivery, and the scan
 * history from Eshopbox. Rendered under the Placed→Shipped→Delivered track,
 * for people who want to know exactly where the parcel is.
 */
export function TrackingTimeline({
  shipment,
  className,
}: {
  shipment: Shipment;
  className?: string;
}) {
  const logs = parseLogs(shipment.statusLogsJson);

  return (
    <div className={cn("space-y-2.5", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={SHIPMENT_TONES[shipment.status]}>
          {SHIPMENT_LABELS[shipment.status]}
        </Badge>
        {shipment.courierName ? (
          <span className="text-xs text-muted">via {shipment.courierName}</span>
        ) : null}
      </div>

      {shipment.trackingId ? (
        <p className="font-mono text-[11px] tabular-nums text-muted">
          AWB {shipment.trackingId}
        </p>
      ) : null}

      {shipment.expectedDeliveryDate && shipment.status !== "DELIVERED" ? (
        <p className="text-xs text-muted">
          Expected by{" "}
          <span className="font-medium text-foreground">
            {shipment.expectedDeliveryDate.toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
            })}
          </span>
        </p>
      ) : null}

      {logs.length > 0 ? (
        <ol className="mt-1 space-y-0">
          {logs.slice(0, 6).map((log, i) => (
            <li
              key={`${log.status}-${log.dateTime ?? i}`}
              className="relative flex gap-3 pb-3 last:pb-0"
            >
              {/* Connector line, hidden on the final row. */}
              {i < Math.min(logs.length, 6) - 1 ? (
                <span
                  aria-hidden
                  className="absolute left-[3px] top-3 h-full w-px bg-border"
                />
              ) : null}
              <span
                aria-hidden
                className={cn(
                  "relative mt-1.5 h-[7px] w-[7px] shrink-0 rounded-full",
                  i === 0 ? "bg-primary" : "bg-border",
                )}
              />
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "text-xs leading-snug",
                    i === 0 ? "font-semibold text-foreground" : "text-muted",
                  )}
                >
                  {humanize(log.status)}
                </p>
                {log.remarks && log.remarks !== log.status ? (
                  <p className="mt-0.5 text-[11px] leading-snug text-faint">
                    {log.remarks}
                  </p>
                ) : null}
                <p className="mt-0.5 text-[10px] text-faint">
                  {[log.city || log.location, formatWhen(log.dateTime)]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

function formatWhen(value?: string): string {
  if (!value) return "";
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return "";
  return at.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
