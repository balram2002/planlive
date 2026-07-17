import type { Reservation } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const RESERVATION_TTL_MS = 10 * 60 * 1000;

/** Max concurrent unpaid holds per user — stops one buyer locking all stock. */
export const MAX_PENDING_PER_USER = 5;

export type ReserveErrorCode =
  | "NOT_FOUND"
  | "NOT_LIVE"
  | "SOLD_OUT"
  | "INVALID_QUANTITY"
  | "TOO_MANY_PENDING";

export class ReserveError extends Error {
  constructor(public code: ReserveErrorCode) {
    super(code);
    this.name = "ReserveError";
  }
}

export type ReserveResult = {
  reservation: Reservation;
  /** Stock remaining after this reservation, for immediate UI/broadcast use. */
  availableStock: number;
  streamRoomName: string;
};

/**
 * Reserves `quantity` units of a product for a buyer.
 *
 * Race-safety: the decrement uses a conditional updateMany
 * (`availableStock >= quantity`) which MongoDB applies atomically — two
 * simultaneous buyers of the last unit can't both match. The surrounding
 * multi-document transaction (requires a replica set, e.g. Atlas) ties the
 * decrement and the Reservation insert together so a failure can't leak stock.
 */
/** MongoDB aborts one of two truly-simultaneous transactions (P2034). */
function isTransientTxnError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "P2034"
  );
}

export async function reserveProduct(opts: {
  productId: string;
  userId: string;
  quantity?: number;
}): Promise<ReserveResult> {
  const quantity = opts.quantity ?? 1;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
    throw new ReserveError("INVALID_QUANTITY");
  }

  // Retry transient write conflicts (standard MongoDB txn guidance): the
  // retried attempt then either wins on remaining stock or hits SOLD_OUT.
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await runReserveTransaction(opts.productId, opts.userId, quantity);
    } catch (err) {
      if (!isTransientTxnError(err)) throw err;
      lastErr = err;
      await new Promise((r) => setTimeout(r, 25 * (attempt + 1)));
    }
  }
  throw lastErr;
}

function runReserveTransaction(
  productId: string,
  userId: string,
  quantity: number,
): Promise<ReserveResult> {
  const opts = { productId, userId };
  return prisma.$transaction(
    async (tx) => {
      // Soft cap on concurrent holds (checked inside the transaction so the
      // count is consistent with the insert below).
      const pendingCount = await tx.reservation.count({
        where: {
          userId: opts.userId,
          status: "PENDING",
          expiresAt: { gt: new Date() },
        },
      });
      if (pendingCount >= MAX_PENDING_PER_USER) {
        throw new ReserveError("TOO_MANY_PENDING");
      }

      const product = await tx.product.findUnique({
        where: { id: opts.productId },
      });
      if (!product) throw new ReserveError("NOT_FOUND");
      if (!product.streamId) throw new ReserveError("NOT_LIVE");

      const stream = await tx.stream.findUnique({
        where: { id: product.streamId },
      });
      if (!stream || stream.status !== "LIVE") throw new ReserveError("NOT_LIVE");

      // Atomic conditional decrement — the race-condition guard.
      const updated = await tx.product.updateMany({
        where: { id: product.id, availableStock: { gte: quantity } },
        data: { availableStock: { decrement: quantity } },
      });
      if (updated.count === 0) throw new ReserveError("SOLD_OUT");

      const reservation = await tx.reservation.create({
        data: {
          productId: product.id,
          userId: opts.userId,
          streamId: stream.id,
          quantity,
          status: "PENDING",
          expiresAt: new Date(Date.now() + RESERVATION_TTL_MS),
        },
      });

      return {
        reservation,
        availableStock: product.availableStock - quantity,
        streamRoomName: stream.livekitRoomName,
      };
    },
    // MongoDB transactions are snapshot-isolated by design; no option needed.
  );
}

export type ExpiredSweepResult = { expired: number };

/**
 * Expires overdue PENDING reservations and returns their stock. Each
 * reservation is handled in its own transaction with a conditional status
 * flip (PENDING -> EXPIRED), so the sweep is idempotent and safe to run
 * concurrently with the Razorpay confirmation webhook.
 */
export async function sweepExpiredReservations(): Promise<
  ExpiredSweepResult & {
    restocked: Array<{ productId: string; availableStock: number; roomName: string | null }>;
  }
> {
  const overdue = await prisma.reservation.findMany({
    where: { status: "PENDING", expiresAt: { lt: new Date() } },
    take: 100,
  });

  let expired = 0;
  const restocked: Array<{
    productId: string;
    availableStock: number;
    roomName: string | null;
  }> = [];

  for (const reservation of overdue) {
    const result = await prisma.$transaction(async (tx) => {
      // Conditional flip: loses cleanly if the webhook confirmed it meanwhile.
      const flipped = await tx.reservation.updateMany({
        where: { id: reservation.id, status: "PENDING" },
        data: { status: "EXPIRED" },
      });
      if (flipped.count === 0) return null;

      // updateMany, not update: if the product was deleted meanwhile there is
      // nothing to restock, and the expiry must still go through (a throwing
      // update would abort the transaction and wedge this reservation as
      // PENDING forever).
      await tx.product.updateMany({
        where: { id: reservation.productId },
        data: { availableStock: { increment: reservation.quantity } },
      });
      const product = await tx.product.findUnique({
        where: { id: reservation.productId },
        select: { id: true, availableStock: true },
      });

      const stream = await tx.stream.findUnique({
        where: { id: reservation.streamId },
        select: { livekitRoomName: true, status: true },
      });

      return {
        restock: product
          ? {
              productId: product.id,
              availableStock: product.availableStock,
              roomName:
                stream?.status === "LIVE" ? stream.livekitRoomName : null,
            }
          : null,
      };
    });

    if (result) {
      expired += 1;
      if (result.restock) restocked.push(result.restock);
    }
  }

  return { expired, restocked };
}
