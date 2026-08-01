import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, isSeller } from "@/lib/current-user";
import { eshopboxConfigured, EshopboxError } from "@/lib/eshopbox/client";
import {
  calculateRate,
  checkServiceability,
} from "@/lib/eshopbox/serviceability";

/**
 * POST /api/shipping/serviceability
 *
 * Seller/admin-only lane check: is this pickup → drop route deliverable, and
 * what would it cost? Both Eshopbox calls are read-only, so this is safe to
 * hit as often as the dashboard needs.
 *
 * Rates are best-effort on purpose — the account may not expose the rate
 * card, and a serviceability answer is still useful without pricing.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isSeller(user)) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }
  if (!user.isActive) {
    return NextResponse.json({ error: "Account suspended." }, { status: 403 });
  }
  if (!eshopboxConfigured()) {
    return NextResponse.json(
      { error: "Shipping isn't configured on the server." },
      { status: 503 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const pin = (value: unknown) => String(value ?? "").trim();
  const pickupPincode = pin(body.pickupPincode);
  const dropPincode = pin(body.dropPincode);

  if (!/^\d{6}$/.test(pickupPincode) || !/^\d{6}$/.test(dropPincode)) {
    return NextResponse.json(
      { error: "Both PIN codes must be 6 digits." },
      { status: 400 },
    );
  }

  // Clamped so a typo can't send a nonsense parcel to their API.
  const num = (value: unknown, fallback: number, max: number) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.min(n, max) : fallback;
  };
  const deadWeight = num(body.weightGrams, 500, 50_000);
  const lengthCm = num(body.lengthCm, 25, 300);
  const widthCm = num(body.widthCm, 20, 300);
  const heightCm = num(body.heightCm, 5, 300);
  const paymentMethod = body.paymentMethod === "COD" ? "COD" : "ONLINE";
  const codAmount = num(body.codAmount, 0, 500_000);

  try {
    const serviceability = await checkServiceability({
      pickupPincode,
      dropPincode,
      deadWeight,
      lengthCm,
      widthCm,
      heightCm,
    });

    let rates = null;
    try {
      rates = await checkRates();
    } catch (err) {
      console.warn("[shipping] rate lookup failed:", err);
    }

    return NextResponse.json({ serviceability, rates });

    async function checkRates() {
      if (!serviceability.serviceable) return null;
      return calculateRate({
        journeyType: "forward",
        pickupPincode,
        dropPincode,
        orderWeight: deadWeight,
        lengthCm,
        widthCm,
        heightCm,
        paymentMethod,
        codAmount,
      });
    }
  } catch (err) {
    const message =
      err instanceof EshopboxError
        ? err.message
        : "Couldn't reach the courier network.";
    console.error("[shipping] serviceability check failed:", err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
