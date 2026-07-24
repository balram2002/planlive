import "server-only";
import type { User } from "@prisma/client";
import { queueEmail } from "@/lib/email/send";
import * as mail from "@/lib/email/templates";

/**
 * The single place that decides what gets sent for each user action.
 * Call sites (routes, server actions) name the event; this module owns the
 * copy and the recipient.
 *
 * Everything is queued rather than awaited, and never throws — a failed
 * notification must not turn a successful action into an error.
 */

type Recipient = Pick<User, "username" | "name" | "email">;

/** Friendliest available name for a user. */
export function displayName(user: Recipient): string {
  return user.name ?? user.username ?? user.email.split("@")[0];
}

function dispatch(to: string, email: mail.EmailContent): void {
  try {
    queueEmail({ to, ...email });
  } catch (err) {
    console.error("[notify] dispatch failed:", err);
  }
}

// ---------------------------------------------------------------- orders

export function notifyOrderPlaced(input: {
  buyer: Recipient;
  productTitle: string;
  quantity: number;
  itemsInPaise: number;
  deliveryFeeInPaise: number;
  totalInPaise: number;
  paymentMethod: "ONLINE" | "COD";
  orderId: string;
  address: { fullName: string; line1: string; city: string; pincode: string } | null;
}): void {
  dispatch(
    input.buyer.email,
    mail.orderPlacedEmail({
      buyerName: displayName(input.buyer),
      productTitle: input.productTitle,
      quantity: input.quantity,
      itemsInPaise: input.itemsInPaise,
      deliveryFeeInPaise: input.deliveryFeeInPaise,
      totalInPaise: input.totalInPaise,
      paymentMethod: input.paymentMethod,
      orderId: input.orderId,
      address: input.address,
    }),
  );
}

export function notifyOrderStatus(input: {
  buyer: Recipient;
  productTitle: string;
  orderId: string;
  status: "SHIPPED" | "DELIVERED";
  /** Courier details, when the parcel is booked with a carrier. */
  courierName?: string | null;
  trackingId?: string | null;
  expectedDeliveryDate?: Date | null;
}): void {
  dispatch(
    input.buyer.email,
    mail.orderStatusEmail({
      buyerName: displayName(input.buyer),
      productTitle: input.productTitle,
      status: input.status,
      orderId: input.orderId,
      courierName: input.courierName ?? null,
      trackingId: input.trackingId ?? null,
      expectedDeliveryDate: input.expectedDeliveryDate ?? null,
    }),
  );
}

export function notifyPaymentFailed(input: {
  buyer: Recipient;
  productTitle: string;
  totalInPaise: number;
}): void {
  dispatch(
    input.buyer.email,
    mail.paymentFailedEmail({
      buyerName: displayName(input.buyer),
      productTitle: input.productTitle,
      totalInPaise: input.totalInPaise,
    }),
  );
}

/** Parcel is coming back to the seller — the buyer should hear it from us. */
export function notifyOrderReturning(input: {
  buyer: Recipient;
  productTitle: string;
  orderId: string;
}): void {
  dispatch(
    input.buyer.email,
    mail.orderReturningEmail({
      buyerName: displayName(input.buyer),
      productTitle: input.productTitle,
      orderId: input.orderId,
    }),
  );
}

// --------------------------------------------------------------- account

export function notifyWelcome(user: Recipient): void {
  dispatch(user.email, mail.welcomeEmail({ name: displayName(user) }));
}

export function notifyAddressAdded(input: {
  user: Recipient;
  label: string;
  fullName: string;
  phone: string;
  line1: string;
  city: string;
  pincode: string;
}): void {
  dispatch(
    input.user.email,
    mail.addressAddedEmail({
      name: displayName(input.user),
      label: input.label,
      fullName: input.fullName,
      phone: input.phone,
      line1: input.line1,
      city: input.city,
      pincode: input.pincode,
    }),
  );
}

export function notifyProfileUpdated(input: {
  user: Recipient;
  username: string;
  changed: string[];
}): void {
  dispatch(
    input.user.email,
    mail.profileUpdatedEmail({
      name: displayName(input.user),
      username: input.username,
      changed: input.changed,
    }),
  );
}

export function notifyAccountStatus(input: {
  user: Recipient;
  active: boolean;
}): void {
  dispatch(
    input.user.email,
    mail.accountStatusEmail({
      name: displayName(input.user),
      active: input.active,
    }),
  );
}

// ---------------------------------------------------------------- seller

export function notifySellerApplied(input: {
  user: Recipient;
  brandName: string;
  category: string;
}): void {
  dispatch(
    input.user.email,
    mail.sellerApplicationEmail({
      name: displayName(input.user),
      brandName: input.brandName,
      category: input.category,
    }),
  );
}

export function notifySellerReviewed(input: {
  user: Recipient;
  approved: boolean;
}): void {
  dispatch(
    input.user.email,
    input.approved
      ? mail.sellerApprovedEmail({ name: displayName(input.user) })
      : mail.sellerRejectedEmail({ name: displayName(input.user) }),
  );
}

export function notifyShopAddressUpdated(input: {
  user: Recipient;
  shopName: string;
  city: string;
  pincode: string;
}): void {
  dispatch(
    input.user.email,
    mail.shopAddressUpdatedEmail({
      name: displayName(input.user),
      shopName: input.shopName,
      city: input.city,
      pincode: input.pincode,
    }),
  );
}

/** Seller alert when a parcel fails to book or comes back as an RTO. */
export function notifySellerShipmentIssue(input: {
  seller: Recipient;
  productTitle: string;
  orderId: string;
  reason: string;
  kind: "booking-failed" | "returning";
}): void {
  dispatch(
    input.seller.email,
    mail.shipmentIssueEmail({
      name: displayName(input.seller),
      productTitle: input.productTitle,
      orderId: input.orderId,
      reason: input.reason,
      kind: input.kind,
    }),
  );
}
