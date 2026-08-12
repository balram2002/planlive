// NOTE: no "server-only" guard — the sweeper sends hold-expiry and
// pickup-expiry mail from outside Next.js. Never import from a client
// component: it reaches the SMTP transport.
import type { User } from "@prisma/client";
import { queueEmail } from "@/lib/email/send";
import * as mail from "@/lib/email/templates";
import * as fulfilMail from "@/lib/email/fulfilment-templates";

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
  address: {
    fullName: string;
    line1: string;
    city: string;
    pincode: string;
  } | null;
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

/** An unpaid hold ran out — tell the buyer before they come back to a gap. */
export function notifyHoldExpired(input: {
  buyer: Recipient;
  productTitle: string;
  minutes: number;
}): void {
  dispatch(
    input.buyer.email,
    mail.holdExpiredEmail({
      buyerName: displayName(input.buyer),
      productTitle: input.productTitle,
      minutes: input.minutes,
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

// ------------------------------------------------- local fulfilment

/** Seller asked the buyer to collect from the shop. */
export function notifyPickupRequested(input: {
  buyer: Recipient;
  productTitle: string;
  shopName: string;
  shopAddress: string;
  windowDays: number;
  note?: string | null;
}): void {
  dispatch(
    input.buyer.email,
    fulfilMail.pickupRequestedEmail({
      buyerName: displayName(input.buyer),
      productTitle: input.productTitle,
      shopName: input.shopName,
      shopAddress: input.shopAddress,
      windowDays: input.windowDays,
      note: input.note,
    }),
  );
}

/** Buyer accepted — the seller has a deadline now. */
export function notifyPickupAccepted(input: {
  seller: Recipient;
  buyer: Recipient;
  productTitle: string;
  deadline: Date;
}): void {
  dispatch(
    input.seller.email,
    fulfilMail.pickupAcceptedEmail({
      sellerName: displayName(input.seller),
      buyerName: displayName(input.buyer),
      productTitle: input.productTitle,
      deadline: input.deadline.toLocaleString("en-IN", {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }),
    }),
  );
}

/** Buyer declined — the seller must choose another route. */
export function notifyPickupRejected(input: {
  seller: Recipient;
  buyer: Recipient;
  productTitle: string;
  note?: string | null;
}): void {
  dispatch(
    input.seller.email,
    fulfilMail.pickupRejectedEmail({
      sellerName: displayName(input.seller),
      buyerName: displayName(input.buyer),
      productTitle: input.productTitle,
      note: input.note,
    }),
  );
}

/** Window closed. Both sides hear about it, worded for each. */
export function notifyPickupExpired(input: {
  seller: Recipient | null;
  buyer: Recipient | null;
  productTitle: string;
  windowDays: number;
}): void {
  if (input.seller) {
    dispatch(
      input.seller.email,
      fulfilMail.pickupExpiredEmail({
        name: displayName(input.seller),
        productTitle: input.productTitle,
        forSeller: true,
        windowDays: input.windowDays,
      }),
    );
  }
  if (input.buyer) {
    dispatch(
      input.buyer.email,
      fulfilMail.pickupExpiredEmail({
        name: displayName(input.buyer),
        productTitle: input.productTitle,
        forSeller: false,
        windowDays: input.windowDays,
      }),
    );
  }
}

/** Seller is delivering it personally. */
export function notifySellerDelivery(input: {
  buyer: Recipient;
  productTitle: string;
  shopName: string;
  note?: string | null;
}): void {
  dispatch(
    input.buyer.email,
    fulfilMail.sellerDeliveryEmail({
      buyerName: displayName(input.buyer),
      productTitle: input.productTitle,
      shopName: input.shopName,
      note: input.note,
    }),
  );
}

/** Handover done — receipt to both sides. */
export function notifyHandoverComplete(input: {
  seller: Recipient | null;
  buyer: Recipient | null;
  productTitle: string;
  collected: boolean;
}): void {
  if (input.seller) {
    dispatch(
      input.seller.email,
      fulfilMail.handoverCompleteEmail({
        name: displayName(input.seller),
        productTitle: input.productTitle,
        collected: input.collected,
        forSeller: true,
      }),
    );
  }
  if (input.buyer) {
    dispatch(
      input.buyer.email,
      fulfilMail.handoverCompleteEmail({
        name: displayName(input.buyer),
        productTitle: input.productTitle,
        collected: input.collected,
        forSeller: false,
      }),
    );
  }
}

// ------------------------------------------------------------ premium tier

/** Admin approved or rejected a premium broadcasting application. */
export function notifyPremiumDecision(input: {
  seller: Recipient;
  approved: boolean;
  note?: string | null;
}): void {
  dispatch(
    input.seller.email,
    fulfilMail.premiumDecisionEmail({
      sellerName: displayName(input.seller),
      approved: input.approved,
      note: input.note,
    }),
  );
}

/** A seller applied — tell every admin so the queue never sits unseen. */
export function notifyPremiumApplied(input: {
  admins: Recipient[];
  sellerEmail: string;
  message?: string | null;
}): void {
  const email = fulfilMail.premiumAppliedAdminEmail({
    sellerEmail: input.sellerEmail,
    message: input.message,
  });
  for (const admin of input.admins) dispatch(admin.email, email);
}
