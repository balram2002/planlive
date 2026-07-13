/**
 * Hand-rolled, server-rendered SVG charts (zero client JS). Colors come from
 * the validated --chart-* CSS variables so light/dark both work. Mark specs
 * follow the dataviz method: 2px lines, ~10% area wash, ≤24px bars with 4px
 * rounded data-ends (square at the baseline), 2px surface gaps between
 * touching marks, text in ink tokens (never the series color), native
 * <title> tooltips per mark.
 */

export type SeriesPoint = { label: string; value: number };

/** Rounds an axis max up to a clean 1/2/5×10ⁿ step. */
function niceMax(max: number): number {
  if (max <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 2, 5, 10]) {
    if (max <= m * pow) return m * pow;
  }
  return 10 * pow;
}

/* ------------------------------------------------------------------ */
/* Area trend — single series (no legend; the card title names it).    */
/* ------------------------------------------------------------------ */
export function AreaTrend({
  points,
  formatValue,
  height = 200,
}: {
  points: SeriesPoint[];
  formatValue: (v: number) => string;
  height?: number;
}) {
  const W = 560;
  const H = height;
  const pad = { l: 48, r: 20, t: 14, b: 22 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;

  const max = niceMax(Math.max(...points.map((p) => p.value), 1));
  const x = (i: number) =>
    pad.l + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (v: number) => pad.t + ih - (v / max) * ih;

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`)
    .join(" ");
  const areaPath = `${linePath} L${x(points.length - 1).toFixed(1)},${pad.t + ih} L${x(0).toFixed(1)},${pad.t + ih} Z`;

  const last = points[points.length - 1];
  const gridYs = [0.25, 0.5, 0.75, 1].map((f) => pad.t + ih - f * ih);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label={`Trend, latest ${formatValue(last.value)}`}
    >
      {/* Hairline gridlines (recessive) */}
      {gridYs.map((gy, i) => (
        <line
          key={i}
          x1={pad.l}
          x2={W - pad.r}
          y1={gy}
          y2={gy}
          stroke="var(--chart-grid)"
          strokeWidth="1"
        />
      ))}
      {/* Baseline */}
      <line
        x1={pad.l}
        x2={W - pad.r}
        y1={pad.t + ih}
        y2={pad.t + ih}
        stroke="var(--chart-axis)"
        strokeWidth="1"
      />
      {/* Y ticks (clean numbers) */}
      {[0.5, 1].map((f) => (
        <text
          key={f}
          x={pad.l - 8}
          y={pad.t + ih - f * ih + 4}
          textAnchor="end"
          className="fill-faint"
          fontSize="10"
          fontVariant="tabular-nums"
        >
          {formatValue(max * f)}
        </text>
      ))}
      {/* X labels: first / last */}
      <text x={x(0)} y={H - 6} textAnchor="start" className="fill-faint" fontSize="10">
        {points[0].label}
      </text>
      <text x={x(points.length - 1)} y={H - 6} textAnchor="end" className="fill-faint" fontSize="10">
        {last.label}
      </text>

      {/* Area wash + line */}
      <path d={areaPath} fill="var(--chart-series)" opacity="0.1" />
      <path
        d={linePath}
        fill="none"
        stroke="var(--chart-series)"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Hover targets with native tooltips */}
      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.value)} r="10" fill="transparent">
          <title>{`${p.label}: ${formatValue(p.value)}`}</title>
        </circle>
      ))}

      {/* End marker: ≥8px dot with 2px surface ring + endpoint direct label */}
      <circle
        cx={x(points.length - 1)}
        cy={y(last.value)}
        r="5"
        fill="var(--chart-series)"
        stroke="var(--surface)"
        strokeWidth="2"
      />
      <text
        x={Math.min(x(points.length - 1), W - pad.r) - 2}
        y={Math.max(y(last.value) - 10, 12)}
        textAnchor="end"
        className="fill-foreground"
        fontSize="11"
        fontWeight="600"
      >
        {formatValue(last.value)}
      </text>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Columns — daily counts (single measure, single hue).                */
/* ------------------------------------------------------------------ */
export function Columns({
  points,
  formatValue,
  height = 200,
}: {
  points: SeriesPoint[];
  formatValue: (v: number) => string;
  height?: number;
}) {
  const W = 560;
  const H = height;
  const pad = { l: 36, r: 12, t: 14, b: 22 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;

  const max = niceMax(Math.max(...points.map((p) => p.value), 1));
  const band = iw / points.length;
  const barW = Math.min(24, band - 2); // ≤24px thick; ≥2px surface gap

  const gridYs = [0.5, 1].map((f) => pad.t + ih - f * ih);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Daily counts">
      {gridYs.map((gy, i) => (
        <line key={i} x1={pad.l} x2={W - pad.r} y1={gy} y2={gy} stroke="var(--chart-grid)" strokeWidth="1" />
      ))}
      <line x1={pad.l} x2={W - pad.r} y1={pad.t + ih} y2={pad.t + ih} stroke="var(--chart-axis)" strokeWidth="1" />
      {[0.5, 1].map((f) => (
        <text
          key={f}
          x={pad.l - 6}
          y={pad.t + ih - f * ih + 4}
          textAnchor="end"
          className="fill-faint"
          fontSize="10"
          fontVariant="tabular-nums"
        >
          {formatValue(max * f)}
        </text>
      ))}
      <text x={pad.l} y={H - 6} textAnchor="start" className="fill-faint" fontSize="10">
        {points[0].label}
      </text>
      <text x={W - pad.r} y={H - 6} textAnchor="end" className="fill-faint" fontSize="10">
        {points[points.length - 1].label}
      </text>

      {points.map((p, i) => {
        const h = Math.max((p.value / max) * ih, p.value > 0 ? 2 : 0);
        const bx = pad.l + i * band + (band - barW) / 2;
        const by = pad.t + ih - h;
        const r = Math.min(4, barW / 2, h); // rounded data-end, square baseline
        return (
          <g key={i}>
            <path
              d={`M${bx},${pad.t + ih} L${bx},${by + r} Q${bx},${by} ${bx + r},${by} L${bx + barW - r},${by} Q${bx + barW},${by} ${bx + barW},${by + r} L${bx + barW},${pad.t + ih} Z`}
              fill="var(--chart-series)"
            />
            <rect x={pad.l + i * band} y={pad.t} width={band} height={ih} fill="transparent">
              <title>{`${p.label}: ${formatValue(p.value)}`}</title>
            </rect>
          </g>
        );
      })}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Stacked status bar — part-to-whole with 2px surface gaps + legend.  */
/* ------------------------------------------------------------------ */
export type StatusSegment = {
  label: string;
  value: number;
  /** CSS color, e.g. "var(--chart-good)" */
  color: string;
};

export function StatusStack({ segments }: { segments: StatusSegment[] }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  const visible = segments.filter((s) => s.value > 0);

  return (
    <div className="space-y-3">
      <div className="flex h-4 w-full gap-0.5 overflow-hidden rounded-full bg-surface-2">
        {total === 0 ? null : (
          visible.map((seg) => (
            <div
              key={seg.label}
              title={`${seg.label}: ${seg.value}`}
              className="h-full min-w-1 transition-all duration-500"
              style={{
                width: `${(seg.value / total) * 100}%`,
                background: seg.color,
              }}
            />
          ))
        )}
      </div>
      {/* Legend: swatch + label + count — identity never color-alone */}
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
        {segments.map((seg) => (
          <li key={seg.label} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: seg.color }}
            />
            <span className="text-muted">{seg.label}</span>
            <span className="ml-auto font-semibold tabular-nums">{seg.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Horizontal bars — magnitude by identity (top products).             */
/* ------------------------------------------------------------------ */
export function HBars({
  items,
  formatValue,
}: {
  items: Array<{ label: string; value: number }>;
  formatValue: (v: number) => string;
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-sm text-foreground">
              {item.label}
            </span>
            <span className="shrink-0 text-sm font-semibold tabular-nums">
              {formatValue(item.value)}
            </span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-surface-2">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.max((item.value / max) * 100, 2)}%`,
                background: "var(--chart-series)",
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
