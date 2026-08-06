/**
 * `?backTo=` handling — one implementation, used by both auth pages and by
 * every server-side redirect that bounces a signed-out visitor to sign-in.
 *
 * Sending someone to the sign-in page is only half the job: landing them back
 * on `/` afterwards loses whatever they were doing, which is most obvious on
 * deep links (a shared live room, an order detail page).
 */

/**
 * Sanitises a `backTo` value into a safe same-app path.
 *
 * Open-redirect guard: only relative paths are ever returned. `//evil.com`
 * and `https://evil.com` are both rejected, because a browser treats the
 * protocol-relative form as an absolute URL.
 */
export function safeBackTo(value: string | undefined | null, fallback = "/"): string {
  if (!value) return fallback;
  // Reject anything that isn't a plain absolute path on this origin.
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//")) return fallback;
  // A backslash can be normalised to "/" by some browsers, so "/\evil.com"
  // would escape the origin too.
  if (value.startsWith("/\\")) return fallback;
  // Never bounce back into the auth pages themselves — that loops.
  if (value.startsWith("/sign-in") || value.startsWith("/sign-up")) {
    return fallback;
  }
  return value;
}

/** Builds the sign-in URL that returns to `path` once authenticated. */
export function signInPath(path: string): string {
  const target = safeBackTo(path);
  if (target === "/") return "/sign-in";
  return `/sign-in?backTo=${encodeURIComponent(target)}`;
}

/** Same, for the sign-up route. */
export function signUpPath(path: string): string {
  const target = safeBackTo(path);
  if (target === "/") return "/sign-up";
  return `/sign-up?backTo=${encodeURIComponent(target)}`;
}
