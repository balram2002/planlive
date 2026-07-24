/**
 * Polls Eshopbox for every in-flight parcel and applies any status changes.
 *
 * The webhook is the real-time path; this is the safety net for webhooks that
 * were dropped, fired during a deploy, or silently failed. Idempotent and
 * safe to run repeatedly — unchanged parcels are skipped without a write.
 *
 * Run once:        npm run shipments:sync
 * Run on a timer:  npm run shipments:sync -- --watch
 */
import { prisma } from "../src/lib/prisma";
import { reconcileShipments } from "../src/lib/shipping-service";
import { eshopboxConfigured } from "../src/lib/eshopbox/client";

/** Couriers scan every few minutes at best; 15 is plenty. */
const INTERVAL_MS = 15 * 60 * 1000;

async function runOnce(): Promise<void> {
  const startedAt = Date.now();
  const { checked, updated } = await reconcileShipments();
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(
    `[${new Date().toISOString()}] reconciled ${updated}/${checked} shipments in ${seconds}s`,
  );
}

async function main() {
  if (!eshopboxConfigured()) {
    console.error("Eshopbox is not configured — nothing to reconcile.");
    process.exitCode = 1;
    return;
  }

  const watch = process.argv.includes("--watch");

  await runOnce();
  if (!watch) return;

  console.log(`Watching — next pass every ${INTERVAL_MS / 60000} minutes.`);
  setInterval(() => {
    // A failed pass must not kill the loop; the next one retries.
    runOnce().catch((err) => console.error("Reconcile pass failed:", err));
  }, INTERVAL_MS);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    // Keep the connection open in watch mode.
    if (!process.argv.includes("--watch")) void prisma.$disconnect();
  });
