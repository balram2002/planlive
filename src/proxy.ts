import { clerkMiddleware } from "@clerk/nextjs/server";

// Next.js "proxy" (formerly middleware) — attaches Clerk auth context to every
// request. Route-level protection (seller/admin gating) is added in later
// milestones; for now no route is force-protected, but auth() is available
// everywhere.
export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
