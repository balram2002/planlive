import "server-only";
import type { User } from "@prisma/client";
import { queueEmail } from "@/lib/email/send";
import * as mail from "@/lib/email/templates";
import { queueWhatsapp } from "@/lib/whatsapp/send";
import * as wa from "@/lib/whatsapp/messages";

/**
 * The single place that decides *what gets sent to whom* for each user
 * action. Call sites (routes, server actions) name the event; this module
 * owns the channels, the copy, and where the contact details come from.
 *
 * Channel rules:
 *  - Email always goes to the account address.
 *  - WhatsApp goes to the ORDER's delivery phone for anything about a
 *    parcel — that's the number the courier will actually call — and to the
 *    profile number for everything else (account, security, seller status).
 *    A user with no profile number simply gets email only.
 *
 * Everything is queued, never awaited, and never throws.
 */

type Recipient = Pick<User, "username" | "name" | "email" | "phone">;

/** Friendliest available name for a user. */
export function displayName(
  user: Pick<User, "username" | "name" | "email">,
): string {
  return user.name ?? user.username ?? user.email.split("@")[0];
}

/** Sends an email, plus WhatsApp when we have a usable number. */
function dispatch(
  to: { email: string; phone: string | null },
  email: mail.EmailContent,
  whatsapp: ((phone: string) => Parameters<typeof queueWhatsapp>[0]) | null,
): void {
  try {
    queueEmail({ to: to.email, ...email });
  } catch (err) {
    console.error("[notify] email dispatch failed:", err);
  }

  if (!whatsapp || !to.phone) return;
  try {
    queueWhatsapp(whatsapp(to.phone));
  } catch (err) {
    console.error("[notify] whatsapp dispatch failed:", err);
  }
}

// ---------------------------------------------------------------- orders

export function notifyOrderPlaced(input: {
  buyer: Recipient;
  /** Phone captured on the delivery address — preferred for parcel updates. */
  deliveryPhone: string | null;
  productTitle: string;
  quantity: number;
  itemsInPaise: number;
  deliveryFeeInPaise: number;
  totalInPaise: number;
  paymentMethod: "ONLINE" | "COD";
  orderId: string;
  address: { fullName: string; line1: string; city: string; pincode: string } | null;
}): void {
  const name = displayName(input.buyer);
  const cod = input.paymentMethod === "COD";

  dispatch(
    {
      email: input.buyer.email,
      // The delivery number is the one tied to this parcel; fall back to the
      // account number when the address didn't carry one.
      phone: input.deliveryPhone ?? input.buyer.phone,
    },
    mail.orderPlacedEmail({
      buyerName: name,
      productTitle: input.productTitle,
      quantity: input.quantity,
      itemsInPaise: input.itemsInPaise,
      deliveryFeeInPaise: input.deliveryFeeInPaise,
      totalInPaise: input.totalInPaise,
      paymentMethod: input.paymentMethod,
      orderId: input.orderId,
      address: input.address,
    }),
    (to) =>
      wa.waOrderPlaced({
        to,
        name,
        productTitle: input.productTitle,
        totalInPaise: input.totalInPaise,
        orderId: input.orderId,
        cod,
      }),
  );
}

export function notifyOrderStatus(input: {
  buyer: Recipient;
  deliveryPhone: string | null;
  productTitle: string;
  orderId: string;
  status: "SHIPPED" | "DELIVERED";
}): void {
  const name = displayName(input.buyer);
  dispatch(
    {
      email: input.buyer.email,
      phone: input.deliveryPhone ?? input.buyer.phone,
    },
    mail.orderStatusEmail({
      buyerName: name,
      productTitle: input.productTitle,
      status: input.status,
      orderId: input.orderId,
    }),
    (to) =>
      wa.waOrderStatus({
        to,
        name,
        productTitle: input.productTitle,
        orderId: input.orderId,
        status: input.status,
      }),
  );
}

export function notifyPaymentFailed(input: {
  buyer: Recipient;
  deliveryPhone: string | null;
  productTitle: string;
  totalInPaise: number;
}): void {
  const name = displayName(input.buyer);
  dispatch(
    {
      email: input.buyer.email,
      phone: input.deliveryPhone ?? input.buyer.phone,
    },
    mail.paymentFailedEmail({
      buyerName: name,
      productTitle: input.productTitle,
      totalInPaise: input.totalInPaise,
    }),
    (to) => wa.waPaymentFailed({ to, name, productTitle: input.productTitle }),
  );
}

// --------------------------------------------------------------- account

export function notifyWelcome(user: Recipient): void {
  const name = displayName(user);
  dispatch(
    { email: user.email, phone: user.phone },
    mail.welcomeEmail({ name }),
    (to) => wa.waWelcome({ to, name }),
  );
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
  const name = displayName(input.user);
  dispatch(
    // Confirm to the number just added — that's the one being vouched for.
    { email: input.user.email, phone: input.phone || input.user.phone },
    mail.addressAddedEmail({
      name,
      label: input.label,
      fullName: input.fullName,
      phone: input.phone,
      line1: input.line1,
      city: input.city,
      pincode: input.pincode,
    }),
    (to) =>
      wa.waAddressAdded({
        to,
        name,
        label: input.label,
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
  const name = displayName(input.user);
  dispatch(
    { email: input.user.email, phone: input.user.phone },
    mail.profileUpdatedEmail({
      name,
      username: input.username,
      changed: input.changed,
    }),
    (to) => wa.waProfileUpdated({ to, name }),
  );
}

export function notifyAccountStatus(input: {
  user: Recipient;
  active: boolean;
}): void {
  const name = displayName(input.user);
  dispatch(
    { email: input.user.email, phone: input.user.phone },
    mail.accountStatusEmail({ name, active: input.active }),
    (to) => wa.waAccountStatus({ to, name, active: input.active }),
  );
}

// ---------------------------------------------------------------- seller

export function notifySellerApplied(input: {
  user: Recipient;
  brandName: string;
  category: string;
  /** Phone from the application form — usually the best contact number. */
  applicationPhone: string | null;
}): void {
  const name = displayName(input.user);
  dispatch(
    {
      email: input.user.email,
      phone: input.applicationPhone ?? input.user.phone,
    },
    mail.sellerApplicationEmail({
      name,
      brandName: input.brandName,
      category: input.category,
    }),
    (to) => wa.waSellerApplied({ to, name, brandName: input.brandName }),
  );
}

export function notifySellerReviewed(input: {
  user: Recipient;
  approved: boolean;
  applicationPhone: string | null;
}): void {
  const name = displayName(input.user);
  dispatch(
    {
      email: input.user.email,
      phone: input.applicationPhone ?? input.user.phone,
    },
    input.approved
      ? mail.sellerApprovedEmail({ name })
      : mail.sellerRejectedEmail({ name }),
    (to) =>
      input.approved
        ? wa.waSellerApproved({ to, name })
        : wa.waSellerRejected({ to, name }),
  );
}

export function notifyShopAddressUpdated(input: {
  user: Recipient;
  shopName: string;
  city: string;
  pincode: string;
  shopPhone: string | null;
}): void {
  const name = displayName(input.user);
  dispatch(
    { email: input.user.email, phone: input.shopPhone ?? input.user.phone },
    mail.shopAddressUpdatedEmail({
      name,
      shopName: input.shopName,
      city: input.city,
      pincode: input.pincode,
    }),
    (to) => wa.waShopUpdated({ to, name, city: input.city }),
  );
}
