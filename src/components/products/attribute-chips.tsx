import { swatchFor, type ProductAttribute } from "@/lib/product-attributes";
import { cn } from "@/lib/cn";

/**
 * Buyer-facing product specifics as chips.
 *
 * Used everywhere a product appears — pinned card, products drawer, order
 * rows — so "Size: M · Colour: Navy" reads the same in all of them. Colour
 * values get their swatch, because a dot answers the question faster than the
 * word does.
 *
 * `tone="dark"` is for the live room, which sits on video rather than surface.
 */
export function AttributeChips({
  attributes,
  tone = "light",
  size = "sm",
  className,
}: {
  attributes: ProductAttribute[];
  tone?: "light" | "dark";
  size?: "xs" | "sm";
  className?: string;
}) {
  if (attributes.length === 0) return null;

  return (
    <ul className={cn("flex flex-wrap gap-1", className)}>
      {attributes.map((attribute, i) => {
        // A multi-value attribute ("Navy, Black") gets the first swatch — the
        // chip already spells out the rest.
        const swatch = swatchFor(attribute.value.split(",")[0] ?? "");
        return (
          <li
            key={`${attribute.label}-${i}`}
            className={cn(
              "inline-flex min-w-0 max-w-full items-center gap-1 rounded-full",
              size === "xs"
                ? "px-1.5 py-0.5 text-[9px]"
                : "px-2 py-0.5 text-[11px]",
              tone === "dark"
                ? "bg-white/15 text-white backdrop-blur-sm"
                : "bg-surface-2 text-foreground",
            )}
          >
            {swatch ? (
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 rounded-full border border-black/20"
                style={{ background: swatch }}
              />
            ) : null}
            <span
              className={cn(
                "shrink-0",
                tone === "dark" ? "text-white/60" : "text-faint",
              )}
            >
              {attribute.label}
            </span>
            <span className="min-w-0 truncate font-medium">
              {attribute.value}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
