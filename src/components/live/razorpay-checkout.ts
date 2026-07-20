"use client";

/** Minimal typings for Razorpay's checkout.js global. */
type RazorpayOptions = {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  prefill?: { email?: string };
  theme?: { color?: string };
  handler: (response: {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }) => void;
  modal?: { ondismiss?: () => void };
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => { open: () => void };
  }
}

const SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

function loadScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const existing = document.querySelector(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("load failed")));
      return;
    }
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("load failed"));
    document.body.appendChild(script);
  });
}

export type CheckoutOutcome = "submitted" | "dismissed";

/**
 * Opens the Razorpay checkout modal for an order created by /api/checkout.
 * Resolves "submitted" when the buyer completed the payment UI (final truth
 * still comes from the webhook) or "dismissed" if they closed the modal.
 */
export async function openRazorpayCheckout(opts: {
  keyId: string;
  razorpayOrderId: string;
  amountInPaise: number;
  currency: string;
  productTitle: string;
  email?: string;
}): Promise<CheckoutOutcome> {
  await loadScript();
  if (!window.Razorpay) throw new Error("Razorpay failed to load");

  return new Promise<CheckoutOutcome>((resolve) => {
    const rzp = new window.Razorpay!({
      key: opts.keyId,
      order_id: opts.razorpayOrderId,
      amount: opts.amountInPaise,
      currency: opts.currency,
      name: "liveWAB",
      description: opts.productTitle,
      prefill: opts.email ? { email: opts.email } : undefined,
      theme: { color: "#f43f5e" },
      handler: () => resolve("submitted"),
      modal: { ondismiss: () => resolve("dismissed") },
    });
    rzp.open();
  });
}
