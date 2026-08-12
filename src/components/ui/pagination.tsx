import Link from "next/link";
import { cn } from "@/lib/cn";

/**
 * Server-rendered pagination.
 *
 * Page lives in the URL rather than component state, deliberately: it means
 * page 3 of a filtered list is a real address that survives a reload, a
 * share, and the browser's back button — and it composes with the scroll
 * restoration, which keys on the full URL including query.
 *
 * Links preserve every other param, so paging never silently drops an active
 * filter or search.
 */
export function Pagination({
  page,
  pageCount,
  total,
  basePath,
  params,
  className,
}: {
  /** 1-indexed. */
  page: number;
  pageCount: number;
  total: number;
  basePath: string;
  /** Current query params to carry through (page is replaced). */
  params?: Record<string, string | undefined>;
  className?: string;
}) {
  if (pageCount <= 1) {
    return total > 0 ? (
      <p className={cn("text-center text-xs text-faint", className)}>
        {total} {total === 1 ? "result" : "results"}
      </p>
    ) : null;
  }

  const href = (target: number) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value) search.set(key, value);
    }
    if (target > 1) search.set("page", String(target));
    else search.delete("page");
    const qs = search.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  // A compact window around the current page — a 40-page list must not render
  // 40 links on a phone.
  const windowSize = 2;
  const pages: number[] = [];
  for (
    let p = Math.max(1, page - windowSize);
    p <= Math.min(pageCount, page + windowSize);
    p++
  ) {
    pages.push(p);
  }

  const pill =
    "inline-flex h-9 min-w-9 items-center justify-center rounded-full px-3 text-sm font-medium transition-colors";

  return (
    <nav
      aria-label="Pagination"
      className={cn("flex flex-col items-center gap-2", className)}
    >
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <PageLink
          href={href(page - 1)}
          disabled={page <= 1}
          className={pill}
          label="Previous page"
        >
          ←
        </PageLink>

        {pages[0] > 1 ? (
          <>
            <PageLink href={href(1)} className={pill} label="Page 1">
              1
            </PageLink>
            {pages[0] > 2 ? (
              <span className="px-1 text-faint" aria-hidden>
                …
              </span>
            ) : null}
          </>
        ) : null}

        {pages.map((p) => (
          <PageLink
            key={p}
            href={href(p)}
            current={p === page}
            className={pill}
            label={`Page ${p}`}
          >
            {p}
          </PageLink>
        ))}

        {pages[pages.length - 1] < pageCount ? (
          <>
            {pages[pages.length - 1] < pageCount - 1 ? (
              <span className="px-1 text-faint" aria-hidden>
                …
              </span>
            ) : null}
            <PageLink
              href={href(pageCount)}
              className={pill}
              label={`Page ${pageCount}`}
            >
              {pageCount}
            </PageLink>
          </>
        ) : null}

        <PageLink
          href={href(page + 1)}
          disabled={page >= pageCount}
          className={pill}
          label="Next page"
        >
          →
        </PageLink>
      </div>

      <p className="text-xs text-faint">
        Page {page} of {pageCount} · {total}{" "}
        {total === 1 ? "result" : "results"}
      </p>
    </nav>
  );
}

function PageLink({
  href,
  children,
  current = false,
  disabled = false,
  className,
  label,
}: {
  href: string;
  children: React.ReactNode;
  current?: boolean;
  disabled?: boolean;
  className?: string;
  label: string;
}) {
  if (disabled) {
    return (
      <span
        aria-disabled
        className={cn(className, "cursor-not-allowed text-faint opacity-40")}
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-label={label}
      aria-current={current ? "page" : undefined}
      className={cn(
        className,
        current
          ? "bg-primary text-primary-foreground"
          : "border border-border text-muted hover:border-primary/50 hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

/** Clamps a raw `?page=` value and derives offsets. */
export function paginate(
  rawPage: string | undefined,
  total: number,
  perPage: number,
) {
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const requested = Number(rawPage);
  const page = Number.isInteger(requested)
    ? Math.min(Math.max(requested, 1), pageCount)
    : 1;
  return { page, pageCount, skip: (page - 1) * perPage, take: perPage };
}
