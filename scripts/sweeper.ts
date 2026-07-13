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
