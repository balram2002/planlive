import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { WebhookEvent } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseRole } from "@/lib/roles";

/**
 * Clerk webhook. On first login (user.created) we create a local User doc so
 * the rest of the app can reference users by our own ObjectId and role.
 * Keeps email/role in sync on user.updated and removes the doc on user.deleted.
 *
 * Configure the endpoint in the Clerk dashboard (Webhooks -> add endpoint at
 * /api/webhooks/clerk) and put the signing secret in CLERK_WEBHOOK_SECRET.
 */
export async function POST(req: NextRequest) {
  let evt: WebhookEvent;
  try {
    evt = await verifyWebhook(req, {
      signingSecret: process.env.CLERK_WEBHOOK_SECRET,
    });
  } catch (err) {
    console.error("Clerk webhook signature verification failed:", err);
    return new NextResponse("Invalid signature", { status: 400 });
  }

  switch (evt.type) {
    case "user.created":
    case "user.updated": {
      const { id, email_addresses, primary_email_address_id, public_metadata } =
        evt.data;

      const primaryEmail =
        email_addresses.find((e) => e.id === primary_email_address_id) ??
        email_addresses[0];

      if (!primaryEmail) {
        console.error(`Clerk user ${id} has no email address; skipping.`);
        return new NextResponse("No email on user", { status: 400 });
      }

      const role = parseRole(public_metadata?.role);

      await prisma.user.upsert({
        where: { clerkId: id },
        create: {
          clerkId: id,
          email: primaryEmail.email_address,
          role,
        },
        update: {
          email: primaryEmail.email_address,
          role,
        },
      });
      break;
    }

    case "user.deleted": {
      // id is optional on delete events per Clerk's types.
      if (evt.data.id) {
        await prisma.user
          .delete({ where: { clerkId: evt.data.id } })
          .catch(() => {
            // Already gone — nothing to do.
          });
      }
      break;
    }

    default:
      // Ignore other event types.
      break;
  }

  return NextResponse.json({ received: true });
}
