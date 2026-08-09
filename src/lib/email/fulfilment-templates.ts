import {
  COLORS,
  MUTED,
  appUrl,
  button,
  callout,
  esc,
  layout,
  type EmailContent,
} from "./templates";

/**
 * Local fulfilment and premium-broadcasting emails.
 *
 * Kept beside the core templates rather than inside them: these all concern
 * a decision or a deadline rather than a receipt, and each one has to make
 * the next step obvious from the subject line — a buyer who ignores a pickup
 * request should be able to tell something is waiting on them without
 * opening it.
 *
 * They reuse the same `layout` shell so every message still looks like the
 * rest of the app's mail.
 */

// ------------------------------------------------------------ buyer pickup

/** Seller asks the buyer to collect from the shop. */
export function pickupRequestedEmail(input: {
  buyerName: string;
  productTitle: string;
  shopName: string;
  shopAddress: string;
  windowDays: number;
  note?: string | null;
}): EmailContent {
  const accent = COLORS.amber;
  return {
    subject: `Collect ${input.productTitle} from ${input.shopName}?`,
    html: layout({
      preheader: `${input.shopName} asked if you'd like to collect your order.`,
      emoji: "🏪",
      eyebrow: "Your decision",
      heading: "Would you like to collect this order?",
      accent,
      body: `<p style="margin:0 0 16px 0;">Hi ${esc(input.buyerName)}, you're in the same area as <strong>${esc(input.shopName)}</strong>, so they've asked whether you'd rather collect <strong>${esc(input.productTitle)}</strong> in person instead of waiting for a courier.</p>
      ${callout(`Pickup address<br><strong>${esc(input.shopAddress)}</strong>`, accent)}
      ${input.note ? `<p style="margin:16px 0 0 0;color:${MUTED};">From the seller: &ldquo;${esc(input.note)}&rdquo;</p>` : ""}
      <p style="margin:16px 0 0 0;">Accept and you'll have <strong>${input.windowDays} days</strong> to collect. Prefer not to? Just decline — it'll be delivered as normal, at no extra cost.</p>
      ${button(appUrl("/orders"), "Accept or decline", accent)}`,
    }),
    text: `Hi ${input.buyerName}, ${input.shopName} asked whether you'd like to collect ${input.productTitle} in person.
Pickup address: ${input.shopAddress}
${input.note ? `Note from the seller: ${input.note}\n` : ""}Accept and you'll have ${input.windowDays} days to collect. Decline and it'll be delivered as normal.
${appUrl("/orders")}`,
  };
}

/** Buyer accepted — the seller needs it ready by the deadline. */
export function pickupAcceptedEmail(input: {
  sellerName: string;
  buyerName: string;
  productTitle: string;
  deadline: string;
}): EmailContent {
  const accent = COLORS.green;
  return {
    subject: `${input.buyerName} will collect ${input.productTitle}`,
    html: layout({
      preheader: `Have it ready by ${input.deadline}.`,
      emoji: "✅",
      eyebrow: "Pickup accepted",
      heading: "The buyer is coming to collect",
      accent,
      body: `<p style="margin:0 0 16px 0;">Hi ${esc(input.sellerName)}, <strong>${esc(input.buyerName)}</strong> accepted your pickup request for <strong>${esc(input.productTitle)}</strong>.</p>
      ${callout(`Have it ready to hand over by<br><strong>${esc(input.deadline)}</strong>`, accent)}
      <p style="margin:16px 0 0 0;">Mark it handed over in your dashboard once they've collected it.</p>
      ${button(appUrl("/dashboard/shipments"), "Open shipments", accent)}`,
    }),
    text: `Hi ${input.sellerName}, ${input.buyerName} accepted your pickup request for ${input.productTitle}. Have it ready by ${input.deadline}.
${appUrl("/dashboard/shipments")}`,
  };
}

/** Buyer declined — the seller has to choose another route. */
export function pickupRejectedEmail(input: {
  sellerName: string;
  buyerName: string;
  productTitle: string;
  note?: string | null;
}): EmailContent {
  const accent = COLORS.rose;
  return {
    subject: `${input.buyerName} declined pickup — choose delivery for ${input.productTitle}`,
    html: layout({
      preheader: "Pick a delivery method to keep this order moving.",
      emoji: "↩️",
      eyebrow: "Action needed",
      heading: "The buyer would rather it was delivered",
      accent,
      body: `<p style="margin:0 0 16px 0;">Hi ${esc(input.sellerName)}, <strong>${esc(input.buyerName)}</strong> declined the pickup request for <strong>${esc(input.productTitle)}</strong>.</p>
      ${input.note ? `<p style="margin:0 0 16px 0;color:${MUTED};">They said: &ldquo;${esc(input.note)}&rdquo;</p>` : ""}
      <p style="margin:0;">Choose how to get it to them — deliver it yourself, or book a courier as usual.</p>
      ${button(appUrl("/dashboard/shipments"), "Choose delivery", accent)}`,
    }),
    text: `Hi ${input.sellerName}, ${input.buyerName} declined pickup for ${input.productTitle}${input.note ? ` ("${input.note}")` : ""}. Deliver it yourself or book a courier.
${appUrl("/dashboard/shipments")}`,
  };
}

/** The collection window elapsed. Sent to both sides, worded differently. */
export function pickupExpiredEmail(input: {
  name: string;
  productTitle: string;
  forSeller: boolean;
  windowDays: number;
}): EmailContent {
  const accent = COLORS.amber;
  return {
    subject: input.forSeller
      ? `Pickup window closed — ${input.productTitle}`
      : `You didn't collect ${input.productTitle}`,
    html: layout({
      preheader: input.forSeller
        ? "Choose how to get this order to the buyer."
        : "Your order is still waiting.",
      emoji: "⌛",
      eyebrow: "Pickup window closed",
      heading: input.forSeller
        ? "The buyer didn't collect in time"
        : "Your collection window has closed",
      accent,
      body: input.forSeller
        ? `<p style="margin:0 0 16px 0;">Hi ${esc(input.name)}, the ${input.windowDays}-day collection window for <strong>${esc(input.productTitle)}</strong> passed without the buyer collecting it.</p>
      <p style="margin:0;">Pick how to get it to them — deliver it yourself, or book a courier.</p>
      ${button(appUrl("/dashboard/shipments"), "Choose delivery", accent)}`
        : `<p style="margin:0 0 16px 0;">Hi ${esc(input.name)}, the ${input.windowDays}-day window to collect <strong>${esc(input.productTitle)}</strong> has closed.</p>
      <p style="margin:0;">Nothing is lost — the seller will arrange delivery instead, and you'll get an update once it's on the way.</p>
      ${button(appUrl("/orders"), "View your order", accent)}`,
    }),
    text: input.forSeller
      ? `Hi ${input.name}, the ${input.windowDays}-day pickup window for ${input.productTitle} closed without collection. Deliver it yourself or book a courier.\n${appUrl("/dashboard/shipments")}`
      : `Hi ${input.name}, your ${input.windowDays}-day window to collect ${input.productTitle} has closed. The seller will arrange delivery instead.\n${appUrl("/orders")}`,
  };
}

// -------------------------------------------------------- seller delivery

/** Seller is delivering it personally instead of using a courier. */
export function sellerDeliveryEmail(input: {
  buyerName: string;
  productTitle: string;
  shopName: string;
  note?: string | null;
}): EmailContent {
  const accent = COLORS.blue;
  return {
    subject: `${input.shopName} is delivering ${input.productTitle} personally`,
    html: layout({
      preheader: "No courier — the seller is bringing it to you.",
      emoji: "🛵",
      eyebrow: "On its way",
      heading: "The seller is delivering this one themselves",
      accent,
      body: `<p style="margin:0 0 16px 0;">Hi ${esc(input.buyerName)}, you're local to <strong>${esc(input.shopName)}</strong>, so they're bringing <strong>${esc(input.productTitle)}</strong> to you directly instead of using a courier.</p>
      <p style="margin:0;">Nothing changes for you — it still arrives at your door, usually sooner.</p>
      ${input.note ? `<p style="margin:16px 0 0 0;color:${MUTED};">From the seller: &ldquo;${esc(input.note)}&rdquo;</p>` : ""}
      ${button(appUrl("/orders"), "Track your order", accent)}`,
    }),
    text: `Hi ${input.buyerName}, ${input.shopName} is delivering ${input.productTitle} to you personally instead of using a courier.${input.note ? `\nNote: ${input.note}` : ""}\n${appUrl("/orders")}`,
  };
}

/** Handover complete — receipt for whichever side is being told. */
export function handoverCompleteEmail(input: {
  name: string;
  productTitle: string;
  collected: boolean;
  forSeller: boolean;
}): EmailContent {
  const accent = COLORS.green;
  const what = input.collected ? "collected" : "delivered";
  return {
    subject: `${input.productTitle} ${what}`,
    html: layout({
      preheader: "This order is complete.",
      emoji: "🎉",
      eyebrow: "Complete",
      heading: input.collected ? "Order collected" : "Order delivered",
      accent,
      body: `<p style="margin:0 0 16px 0;">Hi ${esc(input.name)}, <strong>${esc(input.productTitle)}</strong> has been ${what}${input.forSeller ? " — this order is now complete." : "."}</p>
      <p style="margin:0;">${input.forSeller ? "Nothing further to do." : "Thanks for shopping live with us."}</p>
      ${button(appUrl(input.forSeller ? "/dashboard/sales" : "/orders"), input.forSeller ? "View sales" : "View orders", accent)}`,
    }),
    text: `Hi ${input.name}, ${input.productTitle} has been ${what}.`,
  };
}

// ------------------------------------------------------------- premium tier

/** Premium broadcasting decision, sent to the seller. */
export function premiumDecisionEmail(input: {
  sellerName: string;
  approved: boolean;
  note?: string | null;
}): EmailContent {
  const accent = input.approved ? COLORS.amber : COLORS.slate;
  return {
    subject: input.approved
      ? "Premium broadcasting is enabled on your account"
      : "Your premium broadcasting application",
    html: layout({
      preheader: input.approved
        ? "You can now go live in premium quality."
        : "An update on your application.",
      emoji: input.approved ? "✨" : "📋",
      eyebrow: "Premium broadcasting",
      heading: input.approved
        ? "You're approved for premium"
        : "Your application wasn't approved",
      accent,
      body: input.approved
        ? `<p style="margin:0 0 16px 0;">Hi ${esc(input.sellerName)}, premium broadcasting is now enabled on your account.</p>
      <p style="margin:0;">Pick <strong>Premium</strong> on the go-live screen and enter your broadcast passphrase to start. Your stream carries a gold ring so buyers can tell.</p>
      ${input.note ? `<p style="margin:16px 0 0 0;color:${MUTED};">${esc(input.note)}</p>` : ""}
      ${button(appUrl("/go-live"), "Go live in premium", accent)}`
        : `<p style="margin:0 0 16px 0;">Hi ${esc(input.sellerName)}, we couldn't approve your premium broadcasting application this time.</p>
      ${input.note ? `<p style="margin:0 0 16px 0;color:${MUTED};">${esc(input.note)}</p>` : ""}
      <p style="margin:0;">Standard streaming is unaffected, and you're welcome to apply again.</p>
      ${button(appUrl("/dashboard/premium"), "View details", accent)}`,
    }),
    text: input.approved
      ? `Hi ${input.sellerName}, premium broadcasting is now enabled. Pick Premium on the go-live screen.${input.note ? `\n${input.note}` : ""}\n${appUrl("/go-live")}`
      : `Hi ${input.sellerName}, your premium broadcasting application wasn't approved.${input.note ? `\n${input.note}` : ""}\n${appUrl("/dashboard/premium")}`,
  };
}

/** New premium application — so admins know something is waiting. */
export function premiumAppliedAdminEmail(input: {
  sellerEmail: string;
  message?: string | null;
}): EmailContent {
  const accent = COLORS.violet;
  return {
    subject: `Premium application from ${input.sellerEmail}`,
    html: layout({
      preheader: "A seller applied for premium broadcasting.",
      emoji: "📥",
      eyebrow: "Needs review",
      heading: "New premium application",
      accent,
      body: `<p style="margin:0 0 16px 0;"><strong>${esc(input.sellerEmail)}</strong> applied for premium broadcasting.</p>
      ${input.message ? `<p style="margin:0 0 16px 0;color:${MUTED};">&ldquo;${esc(input.message)}&rdquo;</p>` : ""}
      ${button(appUrl("/admin/sellers"), "Review application", accent)}`,
    }),
    text: `${input.sellerEmail} applied for premium broadcasting.${input.message ? `\n"${input.message}"` : ""}\n${appUrl("/admin/sellers")}`,
  };
}
