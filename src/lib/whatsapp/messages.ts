import { formatPrice } from "@/lib/format";
import type { WhatsappMessage } from "./send";

/**
 * Every WhatsApp notification liveWAB sends, one builder per action.
 *
 * The `name` of each entry must exist as an APPROVED message template in
 * Meta Business Manager with exactly the listed body placeholders, in order.
 * The `body` string below is the text to submit when creating the template —
 * keep the two in sync or Meta will reject the send with a 400.
 *
 * Template registry (create these in Business Manager → Message Templates):
 *
 *   liveWAB_order_placed      {{1}} name {{2}} product {{3}} total {{4}} orderId
 *   liveWAB_order_paid        {{1}} name {{2}} product {{3}} total {{4}} orderId
 *   liveWAB_order_shipped     {{1}} name {{2}} product {{3}} orderId
 *   liveWAB_order_delivered   {{1}} name {{2}} product {{3}} orderId
 *   liveWAB_payment_failed    {{1}} name {{2}} product
 *   liveWAB_address_added     {{1}} name {{2}} label {{3}} city+pin
 *   liveWAB_profile_updated   {{1}} name
 *   liveWAB_shop_updated      {{1}} name {{2}} city
 *   liveWAB_seller_applied    {{1}} name {{2}} brand
 *   liveWAB_seller_approved   {{1}} name
 *   liveWAB_seller_rejected   {{1}} name
 *   liveWAB_account_status    {{1}} name {{2}} state
 *   liveWAB_welcome           {{1}} name
 */

export const WHATSAPP_TEMPLATES = {
  orderPlaced: "liveWAB_order_placed",
  orderPaid: "liveWAB_order_paid",
  orderShipped: "liveWAB_order_shipped",
  orderDelivered: "liveWAB_order_delivered",
  paymentFailed: "liveWAB_payment_failed",
  addressAdded: "liveWAB_address_added",
  profileUpdated: "liveWAB_profile_updated",
  shopUpdated: "liveWAB_shop_updated",
  sellerApplied: "liveWAB_seller_applied",
  sellerApproved: "liveWAB_seller_approved",
  sellerRejected: "liveWAB_seller_rejected",
  accountStatus: "liveWAB_account_status",
  welcome: "liveWAB_welcome",
} as const;

export function waOrderPlaced(input: {
  to: string;
  name: string;
  productTitle: string;
  totalInPaise: number;
  orderId: string;
  cod: boolean;
}): WhatsappMessage {
  const total = formatPrice(input.totalInPaise);
  return {
    to: input.to,
    template: input.cod
      ? WHATSAPP_TEMPLATES.orderPlaced
      : WHATSAPP_TEMPLATES.orderPaid,
    parameters: [input.name, input.productTitle, total, input.orderId],
    fallbackText: input.cod
      ? `Hi ${input.name}! Your liveWAB order is placed 🎉\n${input.productTitle}\nPay on delivery: ${total} (incl. delivery charge)\nOrder ID: ${input.orderId}`
      : `Hi ${input.name}! Your liveWAB order is confirmed 🎉\n${input.productTitle}\nPaid: ${total}\nOrder ID: ${input.orderId}`,
  };
}

export function waOrderStatus(input: {
  to: string;
  name: string;
  productTitle: string;
  orderId: string;
  status: "SHIPPED" | "DELIVERED";
}): WhatsappMessage {
  const shipped = input.status === "SHIPPED";
  return {
    to: input.to,
    template: shipped
      ? WHATSAPP_TEMPLATES.orderShipped
      : WHATSAPP_TEMPLATES.orderDelivered,
    parameters: [input.name, input.productTitle, input.orderId],
    fallbackText: shipped
      ? `Hi ${input.name}, your liveWAB order is on its way 📦\n${input.productTitle}\nOrder ID: ${input.orderId}`
      : `Hi ${input.name}, your liveWAB order was delivered ✅\n${input.productTitle}\nOrder ID: ${input.orderId}\nHope you love it!`,
  };
}

export function waPaymentFailed(input: {
  to: string;
  name: string;
  productTitle: string;
}): WhatsappMessage {
  return {
    to: input.to,
    template: WHATSAPP_TEMPLATES.paymentFailed,
    parameters: [input.name, input.productTitle],
    fallbackText: `Hi ${input.name}, your payment for ${input.productTitle} didn't go through. Your item is still reserved for a few more minutes — open liveWAB to retry.`,
  };
}

export function waAddressAdded(input: {
  to: string;
  name: string;
  label: string;
  city: string;
  pincode: string;
}): WhatsappMessage {
  const where = `${input.city} — ${input.pincode}`;
  return {
    to: input.to,
    template: WHATSAPP_TEMPLATES.addressAdded,
    parameters: [input.name, input.label, where],
    fallbackText: `Hi ${input.name}, a new delivery address was saved on liveWAB 📍\n${input.label}: ${where}\nIf this wasn't you, review your saved addresses.`,
  };
}

export function waProfileUpdated(input: {
  to: string;
  name: string;
}): WhatsappMessage {
  return {
    to: input.to,
    template: WHATSAPP_TEMPLATES.profileUpdated,
    parameters: [input.name],
    fallbackText: `Hi ${input.name}, your liveWAB profile was just updated. If this wasn't you, secure your account right away.`,
  };
}

export function waShopUpdated(input: {
  to: string;
  name: string;
  city: string;
}): WhatsappMessage {
  return {
    to: input.to,
    template: WHATSAPP_TEMPLATES.shopUpdated,
    parameters: [input.name, input.city],
    fallbackText: `Hi ${input.name}, your liveWAB shop address was updated to ${input.city}. Buyers will see this city on your shop page.`,
  };
}

export function waSellerApplied(input: {
  to: string;
  name: string;
  brandName: string;
}): WhatsappMessage {
  return {
    to: input.to,
    template: WHATSAPP_TEMPLATES.sellerApplied,
    parameters: [input.name, input.brandName],
    fallbackText: `Hi ${input.name}, we've received your liveWAB seller application for ${input.brandName} 🛍️ We'll message you as soon as it's reviewed.`,
  };
}

export function waSellerApproved(input: {
  to: string;
  name: string;
}): WhatsappMessage {
  return {
    to: input.to,
    template: WHATSAPP_TEMPLATES.sellerApproved,
    parameters: [input.name],
    fallbackText: `Congratulations ${input.name}! 🎊 You're approved to sell on liveWAB. Your seller dashboard is unlocked — add products and go live.`,
  };
}

export function waSellerRejected(input: {
  to: string;
  name: string;
}): WhatsappMessage {
  return {
    to: input.to,
    template: WHATSAPP_TEMPLATES.sellerRejected,
    parameters: [input.name],
    fallbackText: `Hi ${input.name}, your liveWAB seller application wasn't approved this time. You're welcome to update your details and apply again.`,
  };
}

export function waAccountStatus(input: {
  to: string;
  name: string;
  active: boolean;
}): WhatsappMessage {
  return {
    to: input.to,
    template: WHATSAPP_TEMPLATES.accountStatus,
    parameters: [input.name, input.active ? "reactivated" : "suspended"],
    fallbackText: input.active
      ? `Hi ${input.name}, your liveWAB account has been reactivated. Welcome back!`
      : `Hi ${input.name}, your liveWAB account has been suspended. Reply to this message if you think it's a mistake.`,
  };
}

export function waWelcome(input: { to: string; name: string }): WhatsappMessage {
  return {
    to: input.to,
    template: WHATSAPP_TEMPLATES.welcome,
    parameters: [input.name],
    fallbackText: `Welcome to liveWAB, ${input.name}! 👋 Watch sellers go live and grab products before they sell out.`,
  };
}
