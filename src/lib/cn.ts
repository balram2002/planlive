/**
 * Minimal className joiner. Filters out falsy values so conditional classes
 * read cleanly: cn("base", isActive && "active"). Intentionally dependency-free.
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
