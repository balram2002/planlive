/**
 * Reservation expiry sweeper.
 *
 * Every 45 seconds: flips overdue PENDING reservations to EXPIRED, returns
 * their quantity to product stock, and broadcasts the new stock to the
 * stream's LiveKit room so viewers see it live.
 *
 * Run locally:   npm run sweeper
 * In production: pm2 start "npm run sweeper" --name liveshop-sweeper
 */
import cron from "node-cron";
import { sweepExpiredReservations } from "../src/lib/reservations";
import {
  expireOverduePickups,
  PICKUP_WINDOW_DAYS,
} from "../src/lib/local-fulfilment";
import { notifyPickupExpired } from "../src/lib/notify";
import { broadcastToRoom } from "../src/lib/livekit";
import { prisma } from "../src/lib/prisma";

let running = false;

async function tick() {
  // Skip a tick rather than overlap if the previous sweep is still going.
  if (running) return;
  running = true;
  try {
    const { expired, restocked } = await sweepExpiredReservations();
    if (expired > 0) {
      console.log(
        `[sweeper] ${new Date().toISOString()} expired ${expired} reservation(s)`,
      );
      for (const item of restocked) {
        if (item.roomName) {
          await broadcastToRoom(item.roomName, {
            type: "stock",
            productId: item.productId,
            availableStock: item.availableStock,
          });
        }
      }
    }
  } catch (err) {
    console.error("[sweeper] sweep failed:", err);
  }

  // Collection windows that ran out. Separate try so a failure here can't
  // stop reservation expiry, which is the more time-critical of the two.
  try {
    const expired = await expireOverduePickups();
    for (const item of expired) {
      console.log(
        `[sweeper] pickup window expired for order ${item.fulfilment.orderId}`,
      );
      notifyPickupExpired({
        seller: item.seller,
        buyer: item.buyer,
        productTitle: item.productTitle ?? "your order",
        windowDays: PICKUP_WINDOW_DAYS,
      });
    }
  } catch (err) {
    console.error("[sweeper] pickup expiry failed:", err);
  } finally {
    running = false;
  }
}

console.log("[sweeper] started — sweeping every 45s");
cron.schedule("*/45 * * * * *", tick);

// Run one sweep immediately on boot so restarts don't delay expiries.
void tick();

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});
