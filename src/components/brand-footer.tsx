import Link from "next/link";
import { cn } from "@/lib/cn";

const YEAR = new Date().getFullYear();

/**
 * Shared app footer: liveWAB branding plus the PlanWAB attribution.
 * `links` lets each surface show the nav that makes sense for its audience.
 */
export function BrandFooter({
  links = [],
  className,
}: {
  links?: Array<{ href: string; label: string }>;
  className?: string;
}) {
  return (
    <footer
      className={cn(
        "mt-10 border-t border-border pb-2 pt-6 text-center",
        className,
      )}
    >
      <p className="text-sm font-semibold">liveWAB</p>

      {links.length > 0 ? (
        <nav className="mt-3 flex flex-wrap items-center justify-center gap-4 text-xs text-muted">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      ) : null}

      <p className="mt-4 text-[11px] text-muted">
        a product by{" "}
        <a
          href="https://planwab.com"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-primary transition-opacity hover:opacity-80"
        >
          PlanWAB
        </a>
      </p>
      <p className="mt-1 text-[10px] text-faint">© {YEAR} liveWAB</p>
    </footer>
  );
}
