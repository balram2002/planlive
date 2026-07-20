/**
 * Order pricing rules — shared by the checkout UI and the server routes so a
 * buyer can never be shown a total that differs from what gets charged.
 *
 * Cash on delivery carries a flat handling/delivery charge; paying online is
 * free (the money is already collected, so there's nothing to recover).
 */
export const COD_DELIVERY_FEE_PAISE = 3500; // ₹35

export type PaymentMethod = "ONLINE" | "COD";

export type PriceBreakdown = {
  itemsInPaise: number;
  deliveryFeeInPaise: number;
  totalInPaise: number;
};

/** Line-items → totals for a given payment method. */
export function priceBreakdown(
  itemsInPaise: number,
  method: PaymentMethod,
): PriceBreakdown {
  const deliveryFeeInPaise = method === "COD" ? COD_DELIVERY_FEE_PAISE : 0;
  return {
    itemsInPaise,
    deliveryFeeInPaise,
    totalInPaise: itemsInPaise + deliveryFeeInPaise,
  };
}
