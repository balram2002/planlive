"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { haptics } from "@/lib/haptics";
import { cn } from "@/lib/cn";
import {
  COLOR_SWATCHES,
  PRODUCT_TYPES,
  findPreset,
  serializeAttributes,
  swatchFor,
  type AttributeField,
  type ProductAttribute,
} from "@/lib/product-attributes";

/**
 * Type-aware product specifics.
 *
 * Picking a product type swaps in the fields that category actually needs —
 * sizes for clothing, storage/RAM for electronics — instead of one generic
 * form that fits nothing. Values are chips wherever there's a sensible set,
 * because a seller mid-stream is on a phone with one hand free and typing
 * "Medium" forty times is how you get "medium", "Med" and "M" in the same
 * catalogue.
 *
 * Everything is optional. The custom-field row at the bottom is the escape
 * hatch for anything the presets don't cover, so the taxonomy never blocks a
 * listing.
 *
 * Emits a hidden input (`attributesJson` + `productType`) so the surrounding
 * plain <form> submits it with no extra wiring.
 */
export function AttributesEditor({
  initialType,
  initialAttributes,
  compact = false,
}: {
  initialType?: string | null;
  initialAttributes?: ProductAttribute[];
  /** Tighter spacing for the in-stream sheet. */
  compact?: boolean;
}) {
  const [typeKey, setTypeKey] = useState<string | null>(initialType ?? null);
  // Preset values keyed by field, so switching type doesn't lose entries.
  const [values, setValues] = useState<Record<string, string[]>>(() =>
    seedValues(initialType, initialAttributes ?? []),
  );
  const [custom, setCustom] = useState<ProductAttribute[]>(() =>
    seedCustom(initialType, initialAttributes ?? []),
  );
  const [customLabel, setCustomLabel] = useState("");
  const [customValue, setCustomValue] = useState("");

  const preset = findPreset(typeKey);

  // Flattened, in preset order, then custom rows — this is what gets stored
  // and what buyers see, so the order here is the order on the product card.
  const attributes: ProductAttribute[] = [
    ...(preset?.fields ?? []).flatMap((field) => {
      const picked = values[field.key] ?? [];
      if (picked.length === 0) return [];
      return [
        {
          label: field.label,
          value: picked.join(", ") + (field.unit ? ` ${field.unit}` : ""),
        },
      ];
    }),
    ...custom,
  ];

  function toggleChip(field: AttributeField, option: string) {
    haptics.tap();
    setValues((prev) => {
      const current = prev[field.key] ?? [];
      if (field.multi) {
        return {
          ...prev,
          [field.key]: current.includes(option)
            ? current.filter((v) => v !== option)
            : [...current, option],
        };
      }
      return {
        ...prev,
        [field.key]: current[0] === option ? [] : [option],
      };
    });
  }

  function setFreeValue(field: AttributeField, value: string) {
    setValues((prev) => ({
      ...prev,
      [field.key]: value.trim() ? [value] : [],
    }));
  }

  function addCustom() {
    const label = customLabel.trim();
    const value = customValue.trim();
    if (!label || !value) return;
    haptics.tap();
    setCustom((prev) => [...prev, { label, value }]);
    setCustomLabel("");
    setCustomValue("");
  }

  const inputClass =
    "w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-base placeholder:text-faint focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/30 sm:text-sm";

  return (
    <div className={cn("space-y-4", compact && "space-y-3")}>
      {/* Carries the whole thing to the server in one field. */}
      <input
        type="hidden"
        name="attributesJson"
        value={serializeAttributes(attributes) ?? ""}
      />
      <input type="hidden" name="productType" value={typeKey ?? ""} />

      <div>
        <p className="mb-2 text-sm font-medium text-muted">
          What are you selling?
        </p>
        <div className="flex flex-wrap gap-2">
          {PRODUCT_TYPES.map((type) => {
            const active = typeKey === type.key;
            return (
              <button
                key={type.key}
                type="button"
                onClick={() => {
                  haptics.tap();
                  setTypeKey(active ? null : type.key);
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all active:scale-95",
                  active
                    ? "border-primary/60 bg-primary/10 text-primary"
                    : "border-border text-muted hover:border-primary/40 hover:text-foreground",
                )}
              >
                <span aria-hidden>{type.emoji}</span>
                {type.label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-faint">
          Picking a type brings up the details buyers ask about. All optional —
          add what matters for this item.
        </p>
      </div>

      <AnimatePresence initial={false} mode="wait">
        {preset ? (
          <motion.div
            key={preset.key}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className={cn("space-y-4", compact && "space-y-3")}
          >
            {preset.fields.map((field) => (
              <div key={field.key}>
                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-muted">
                    {field.label}
                  </span>
                  {field.multi ? (
                    <span className="shrink-0 text-[10px] text-faint">
                      pick any
                    </span>
                  ) : null}
                </div>

                {field.kind === "chips" && field.options ? (
                  <div className="flex flex-wrap gap-1.5">
                    {field.options.map((option) => {
                      const picked = (values[field.key] ?? []).includes(option);
                      const swatch = field.swatches
                        ? COLOR_SWATCHES[option]
                        : null;
                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() => toggleChip(field, option)}
                          aria-pressed={picked}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium transition-all active:scale-95",
                            picked
                              ? "border-primary/60 bg-primary/10 text-primary"
                              : "border-border text-muted hover:border-primary/40 hover:text-foreground",
                          )}
                        >
                          {swatch ? (
                            <span
                              aria-hidden
                              className="h-3 w-3 shrink-0 rounded-full border border-black/15"
                              style={{ background: swatch }}
                            />
                          ) : null}
                          {option}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type={field.kind === "number" ? "number" : "text"}
                      inputMode={field.kind === "number" ? "decimal" : undefined}
                      value={(values[field.key] ?? [])[0] ?? ""}
                      onChange={(e) => setFreeValue(field, e.target.value)}
                      placeholder={field.placeholder}
                      maxLength={60}
                      className={inputClass}
                    />
                    {field.unit ? (
                      <span className="shrink-0 text-xs text-faint">
                        {field.unit}
                      </span>
                    ) : null}
                  </div>
                )}
              </div>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Escape hatch */}
      <div className="rounded-2xl border border-dashed border-border p-3">
        <p className="mb-2 text-sm font-medium text-muted">
          Anything else?
        </p>

        {custom.length > 0 ? (
          <ul className="mb-2.5 flex flex-wrap gap-1.5">
            {custom.map((attribute, i) => (
              <li key={`${attribute.label}-${i}`}>
                <button
                  type="button"
                  onClick={() => {
                    haptics.tap();
                    setCustom((prev) => prev.filter((_, index) => index !== i));
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1.5 text-xs transition-colors hover:bg-border"
                >
                  <span className="font-medium">{attribute.label}:</span>
                  <span className="text-muted">{attribute.value}</span>
                  <span aria-hidden className="text-faint">
                    ×
                  </span>
                  <span className="sr-only">Remove</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <input
            value={customLabel}
            onChange={(e) => setCustomLabel(e.target.value)}
            placeholder="Field (e.g. Sleeve)"
            maxLength={40}
            className={cn(inputClass, "min-w-0 flex-1")}
          />
          <input
            value={customValue}
            onChange={(e) => setCustomValue(e.target.value)}
            onKeyDown={(e) => {
              // Enter must not submit the surrounding product form.
              if (e.key === "Enter") {
                e.preventDefault();
                addCustom();
              }
            }}
            placeholder="Value (e.g. Full)"
            maxLength={60}
            className={cn(inputClass, "min-w-0 flex-1")}
          />
          <button
            type="button"
            onClick={addCustom}
            disabled={!customLabel.trim() || !customValue.trim()}
            className="shrink-0 rounded-xl bg-surface-2 px-4 py-2 text-sm font-semibold transition-colors hover:bg-border disabled:opacity-40"
          >
            Add
          </button>
        </div>
      </div>

      {/* Live preview of exactly what buyers will see. */}
      {attributes.length > 0 ? (
        <div className="rounded-2xl bg-surface-2 p-3">
          <p className="mb-2 text-[11px] uppercase tracking-wide text-faint">
            Buyers will see
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {attributes.map((attribute, i) => {
              const swatch = swatchFor(attribute.value.split(",")[0] ?? "");
              return (
                <li
                  key={`${attribute.label}-${i}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-[11px]"
                >
                  {swatch ? (
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 shrink-0 rounded-full border border-black/15"
                      style={{ background: swatch }}
                    />
                  ) : null}
                  <span className="text-faint">{attribute.label}</span>
                  <span className="font-medium">{attribute.value}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** Rebuilds preset selections from previously saved attributes. */
function seedValues(
  typeKey: string | null | undefined,
  saved: ProductAttribute[],
): Record<string, string[]> {
  const preset = findPreset(typeKey);
  if (!preset) return {};
  const out: Record<string, string[]> = {};
  for (const field of preset.fields) {
    const match = saved.find(
      (a) => a.label.toLowerCase() === field.label.toLowerCase(),
    );
    if (!match) continue;
    const raw = field.unit
      ? match.value.replace(new RegExp(`\\s*${field.unit}$`), "")
      : match.value;
    out[field.key] = field.kind === "chips" ? raw.split(",").map((v) => v.trim()) : [raw];
  }
  return out;
}

/** Saved rows that don't belong to the preset are the seller's own fields. */
function seedCustom(
  typeKey: string | null | undefined,
  saved: ProductAttribute[],
): ProductAttribute[] {
  const preset = findPreset(typeKey);
  const known = new Set(
    (preset?.fields ?? []).map((f) => f.label.toLowerCase()),
  );
  return saved.filter((a) => !known.has(a.label.toLowerCase()));
}
