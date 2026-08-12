import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * Next.js "proxy" (formerly middleware) — attaches Clerk auth context to every
 * request. Route-level protection (seller/admin gating) happens in
 * lib/authz.ts; nothing is force-protected here, but auth() is available
 * everywhere.
 *
 * It also stamps the request path onto a header. Server Components can't read
 * their own URL, so without this every `requireUser()` redirect had to send
 * people to a bare /sign-in and they'd come back to the homepage instead of
 * the page they wanted. With the header, the auth gates build an accurate
 * ?backTo= on their own and no page has to remember to pass one.
 */
export default clerkMiddleware((_auth, req) => {
  const headers = new Headers(req.headers);
  headers.set("x-pathname", req.nextUrl.pathname);
  // Query matters for pages whose state lives in it (filters, search, tabs),
  // so the return trip restores the same view rather than a bare page.
  headers.set("x-search", req.nextUrl.search);
  return NextResponse.next({ request: { headers } });
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
