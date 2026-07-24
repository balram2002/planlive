import { formatPrice } from "@/lib/format";

/**
 * Transactional email templates — one per user-facing action.
 *
 * Rules that keep these rendering everywhere (Gmail, Outlook, Apple Mail):
 * tables for layout, inline styles only, no external CSS/webfonts, and a
 * plain-text alternative for every message.
 *
 * Each template carries its own accent colour and hero treatment so the
 * message is recognisable at a glance — a delivery confirmation should not
 * look identical to a security notice.
 */

const BRAND = "liveWAB";

const COLORS = {
  rose: "#e11d48",
  green: "#059669",
  blue: "#2563eb",
  amber: "#d97706",
  violet: "#7c3aed",
  slate: "#475569",
} as const;

const INK = "#111827";
const MUTED = "#6b7280";
const LINE = "#e5e7eb";
const CANVAS = "#f4f4f5";

type Accent = (typeof COLORS)[keyof typeof COLORS];

export type EmailContent = { subject: string; html: string; text: string };

function appUrl(path = ""): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  return base ? `${base.replace(/\/$/, "")}${path}` : path;
}

/** Escapes user-supplied values before they land in the HTML body. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type Row = { label: string; value: string; strong?: boolean };

function rowsTable(rows: Row[]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
    ${rows
      .map((row, i) => {
        const pad = i === 0 ? "0 0 10px 0" : "10px 0";
        const border = i === 0 ? "none" : `1px solid ${LINE}`;
        return `<tr>
      <td style="padding:${pad};border-top:${border};color:${MUTED};font-size:14px;">${esc(row.label)}</td>
      <td align="right" style="padding:${pad};border-top:${border};color:${INK};font-size:14px;font-weight:${row.strong ? "700" : "500"};">${esc(row.value)}</td>
    </tr>`;
      })
      .join("")}
  </table>`;
}

function button(href: string, label: string, accent: Accent): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 4px 0;">
    <tr><td style="border-radius:999px;background:${accent};">
      <a href="${esc(href)}" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;">${esc(label)}</a>
    </td></tr>
  </table>`;
}

/** Tinted callout for security notices and next-step hints. */
function callout(text: string, accent: Accent): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;">
    <tr><td style="border-left:3px solid ${accent};background:${CANVAS};border-radius:0 10px 10px 0;padding:12px 14px;color:${MUTED};font-size:13px;line-height:1.55;">${text}</td></tr>
  </table>`;
}

/** A three-stop fulfilment track, rendered as a table so Outlook behaves. */
function progressTrack(reached: 0 | 1 | 2): string {
  const stages = ["Placed", "Shipped", "Delivered"];
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 4px 0;">
    <tr>
      ${stages
        .map((stage, i) => {
          const done = i <= reached;
          const color = done ? COLORS.green : "#cbd5e1";
          return `<td align="center" width="33%" style="font-size:12px;">
          <div style="width:14px;height:14px;border-radius:50%;background:${color};margin:0 auto 6px auto;"></div>
          <span style="color:${done ? INK : "#9ca3af"};font-weight:${i === reached ? "700" : "500"};">${stage}</span>
        </td>`;
        })
        .join("")}
    </tr>
  </table>`;
}

function layout(opts: {
  preheader: string;
  emoji: string;
  eyebrow: string;
  heading: string;
  accent: Accent;
  body: string;
}): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(opts.heading)}</title></head>
<body style="margin:0;padding:0;background:${CANVAS};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(opts.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CANVAS};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr><td style="height:4px;background:${opts.accent};font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:26px 32px 0 32px;">
          <p style="margin:0;font-size:17px;font-weight:800;letter-spacing:-0.02em;color:${INK};">${BRAND}</p>
        </td></tr>
        <tr><td style="padding:18px 32px 8px 32px;">
          <div style="font-size:38px;line-height:1;">${opts.emoji}</div>
          <p style="margin:14px 0 0 0;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${opts.accent};">${esc(opts.eyebrow)}</p>
          <h1 style="margin:6px 0 0 0;font-size:22px;line-height:1.3;font-weight:800;letter-spacing:-0.02em;color:${INK};">${esc(opts.heading)}</h1>
        </td></tr>
        <tr><td style="padding:10px 32px 30px 32px;color:${INK};font-size:15px;line-height:1.6;">
          ${opts.body}
        </td></tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
        <tr><td align="center" style="padding:20px 16px;color:${MUTED};font-size:12px;line-height:1.6;">
          <p style="margin:0;">You're receiving this because you have a ${BRAND} account.</p>
          <p style="margin:6px 0 0 0;">a product by <a href="https://planwab.com" style="color:${COLORS.rose};text-decoration:none;font-weight:600;">PlanWAB</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// --------------------------------------------------------------- orders

export type OrderEmailInput = {
  buyerName: string;
  productTitle: string;
  quantity: number;
  itemsInPaise: number;
  deliveryFeeInPaise: number;
  totalInPaise: number;
  paymentMethod: "ONLINE" | "COD";
  orderId: string;
  address?: { fullName: string; line1: string; city: string; pincode: string } | null;
};

/** Order receipt — the COD and prepaid variants differ in tone and totals. */
export function orderPlacedEmail(input: OrderEmailInput): EmailContent {
  const cod = input.paymentMethod === "COD";
  const accent = cod ? COLORS.amber : COLORS.green;

  const rows: Row[] = [
    {
      label: `${input.productTitle} × ${input.quantity}`,
      value: formatPrice(input.itemsInPaise),
    },
  ];
  if (input.deliveryFeeInPaise > 0) {
    rows.push({ label: "Delivery charge", value: formatPrice(input.deliveryFeeInPaise) });
  }
  rows.push({
    label: cod ? "Pay on delivery" : "Paid online",
    value: formatPrice(input.totalInPaise),
    strong: true,
  });

  const addressBlock = input.address
    ? `<p style="margin:22px 0 0 0;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${MUTED};">Delivering to</p>
       <p style="margin:6px 0 0 0;font-size:14px;line-height:1.55;">${esc(input.address.fullName)}<br>${esc(input.address.line1)}<br>${esc(input.address.city)} — ${esc(input.address.pincode)}</p>`
    : "";

  return {
    subject: cod
      ? `Order placed — ${input.productTitle}`
      : `Payment received — ${input.productTitle}`,
    html: layout({
      preheader: `${input.productTitle} · ${formatPrice(input.totalInPaise)}`,
      emoji: "🎉",
      eyebrow: cod ? "Cash on delivery" : "Payment confirmed",
      heading: cod ? "Your order is placed!" : "Your order is confirmed!",
      accent,
      body: `<p style="margin:0 0 20px 0;">Hi ${esc(input.buyerName)}, thanks for shopping live on ${BRAND}. ${
        cod
          ? "Keep the amount below ready for the delivery agent — it includes the delivery charge."
          : "We've received your payment in full, and the seller is preparing your parcel."
      }</p>
      ${rowsTable(rows)}
      ${progressTrack(0)}
      ${addressBlock}
      <p style="margin:20px 0 0 0;font-size:13px;color:${MUTED};">Order ID · ${esc(input.orderId)}</p>
      ${button(appUrl("/orders"), "Track your order", accent)}`,
    }),
    text: `Hi ${input.buyerName}, your ${BRAND} order is ${cod ? "placed" : "confirmed"}.
${input.productTitle} x${input.quantity} — ${formatPrice(input.itemsInPaise)}
${input.deliveryFeeInPaise > 0 ? `Delivery charge — ${formatPrice(input.deliveryFeeInPaise)}\n` : ""}Total — ${formatPrice(input.totalInPaise)}${cod ? " (pay on delivery)" : " (paid)"}
Order ID: ${input.orderId}
Track it: ${appUrl("/orders")}`,
  };
}

/** Shipped / delivered — each gets its own hero, colour and copy. */
export function orderStatusEmail(input: {
  buyerName: string;
  productTitle: string;
  status: "SHIPPED" | "DELIVERED";
  orderId: string;
  courierName?: string | null;
  trackingId?: string | null;
  expectedDeliveryDate?: Date | null;
}): EmailContent {
  const shipped = input.status === "SHIPPED";
  const accent = shipped ? COLORS.blue : COLORS.green;

  // Courier block only renders once there's an AWB to show.
  const courierRows: Row[] = [];
  if (input.courierName) {
    courierRows.push({ label: "Courier", value: input.courierName });
  }
  if (input.trackingId) {
    courierRows.push({
      label: "Tracking number",
      value: input.trackingId,
      strong: true,
    });
  }
  if (shipped && input.expectedDeliveryDate) {
    courierRows.push({
      label: "Expected by",
      value: input.expectedDeliveryDate.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
    });
  }

  return {
    subject: shipped
      ? `On its way — ${input.productTitle}`
      : `Delivered — ${input.productTitle}`,
    html: layout({
      preheader: shipped
        ? `${input.productTitle} has left the seller.`
        : `${input.productTitle} was delivered.`,
      emoji: shipped ? "📦" : "✅",
      eyebrow: shipped ? "On the way" : "Delivered",
      heading: shipped ? "Your order has shipped" : "Your order was delivered",
      accent,
      body: `<p style="margin:0 0 4px 0;">Hi ${esc(input.buyerName)},</p>
      <p style="margin:0;">${
        shipped
          ? `<strong>${esc(input.productTitle)}</strong> is on its way to you. We'll let you know the moment it lands.`
          : `<strong>${esc(input.productTitle)}</strong> has been delivered. We hope you love it!`
      }</p>
      ${progressTrack(shipped ? 1 : 2)}
      ${courierRows.length > 0 ? rowsTable(courierRows) : ""}
      <p style="margin:18px 0 0 0;font-size:13px;color:${MUTED};">Order ID · ${esc(input.orderId)}</p>
      ${
        shipped
          ? ""
          : callout(
              `Something not right? Reply to this email within 7 days and we'll sort it out.`,
              accent,
            )
      }
      ${button(appUrl("/orders"), "Track your order", accent)}`,
    }),
    text: `Hi ${input.buyerName}, ${input.productTitle} has been ${shipped ? "shipped" : "delivered"}.
${input.courierName ? `Courier: ${input.courierName}\n` : ""}${input.trackingId ? `Tracking: ${input.trackingId}\n` : ""}Order ID: ${input.orderId}
${appUrl("/orders")}`,
  };
}

/** Parcel is being returned to the seller (RTO) — explain, don't alarm. */
export function orderReturningEmail(input: {
  buyerName: string;
  productTitle: string;
  orderId: string;
}): EmailContent {
  const accent = COLORS.amber;
  return {
    subject: `Your order is being returned — ${input.productTitle}`,
    html: layout({
      preheader: `${input.productTitle} is on its way back to the seller.`,
      emoji: "↩️",
      eyebrow: "Delivery unsuccessful",
      heading: "Your order is coming back to us",
      accent,
      body: `<p style="margin:0 0 16px 0;">Hi ${esc(input.buyerName)}, the courier couldn't complete delivery of <strong>${esc(input.productTitle)}</strong>, so it's being returned to the seller.</p>
      <p style="margin:0;">This usually happens after several failed delivery attempts, or when the address couldn't be reached.</p>
      ${callout(
        `If you paid online, your refund is processed automatically once the parcel reaches the seller — typically 5–7 working days after it arrives.`,
        accent,
      )}
      <p style="margin:20px 0 0 0;font-size:13px;color:${MUTED};">Order ID · ${esc(input.orderId)}</p>
      ${button(appUrl("/orders"), "View order", accent)}`,
    }),
    text: `Hi ${input.buyerName}, delivery of ${input.productTitle} was unsuccessful and it's being returned to the seller.
If you paid online, your refund starts automatically once it arrives (5-7 working days).
Order ID: ${input.orderId}
${appUrl("/orders")}`,
  };
}

/** Payment failed — urgent, and the reservation is still recoverable. */
export function paymentFailedEmail(input: {
  buyerName: string;
  productTitle: string;
  totalInPaise: number;
}): EmailContent {
  const accent = COLORS.rose;
  return {
    subject: `Payment didn't go through — ${input.productTitle}`,
    html: layout({
      preheader: `Retry your payment for ${input.productTitle}.`,
      emoji: "⚠️",
      eyebrow: "Action needed",
      heading: "Your payment didn't go through",
      accent,
      body: `<p style="margin:0 0 16px 0;">Hi ${esc(input.buyerName)}, we couldn't complete your payment of <strong>${formatPrice(input.totalInPaise)}</strong> for <strong>${esc(input.productTitle)}</strong>.</p>
      <p style="margin:0;">Nothing was charged. Your item is still reserved for a few more minutes — retry now and it's yours.</p>
      ${callout(
        `If money did leave your account, it was only an authorisation hold and your bank will release it automatically within 5–7 working days.`,
        accent,
      )}
      ${button(appUrl("/orders"), "Retry payment", accent)}`,
    }),
    text: `Hi ${input.buyerName}, your payment of ${formatPrice(input.totalInPaise)} for ${input.productTitle} didn't go through. Nothing was charged and your item is still reserved for a few more minutes.
Retry: ${appUrl("/orders")}`,
  };
}

// -------------------------------------------------------------- account

export function addressAddedEmail(input: {
  name: string;
  label: string;
  fullName: string;
  phone: string;
  line1: string;
  city: string;
  pincode: string;
}): EmailContent {
  const accent = COLORS.violet;
  return {
    subject: "New delivery address saved",
    html: layout({
      preheader: `${input.label} · ${input.city} — ${input.pincode}`,
      emoji: "📍",
      eyebrow: "Address book",
      heading: "A new address was saved",
      accent,
      body: `<p style="margin:0 0 20px 0;">Hi ${esc(input.name)}, we've added this address to your ${BRAND} account. Future orders can be delivered here.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE};border-radius:14px;">
        <tr><td style="padding:16px;">
          <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${accent};">${esc(input.label)}</p>
          <p style="margin:8px 0 0 0;font-size:14px;line-height:1.55;">${esc(input.fullName)} · ${esc(input.phone)}<br>${esc(input.line1)}<br>${esc(input.city)} — ${esc(input.pincode)}</p>
        </td></tr>
      </table>
      ${callout(
        `Didn't do this? Open your address book and remove anything you don't recognise.`,
        accent,
      )}
      ${button(appUrl("/addresses"), "Manage addresses", accent)}`,
    }),
    text: `Hi ${input.name}, a new address was saved on ${BRAND}.
${input.label}: ${input.fullName}, ${input.line1}, ${input.city} — ${input.pincode}
Manage: ${appUrl("/addresses")}`,
  };
}

/** Profile change — framed as a security notice, because that's its value. */
export function profileUpdatedEmail(input: {
  name: string;
  username: string;
  changed: string[];
}): EmailContent {
  const accent = COLORS.slate;
  const list =
    input.changed.length > 0
      ? rowsTable(
          input.changed.map((field) => ({ label: "Updated", value: field })),
        )
      : rowsTable([{ label: "Username", value: `@${input.username}`, strong: true }]);

  return {
    subject: "Your liveWAB profile was updated",
    html: layout({
      preheader: `Profile changes saved for @${input.username}.`,
      emoji: "👤",
      eyebrow: "Security notice",
      heading: "Profile updated",
      accent,
      body: `<p style="margin:0 0 20px 0;">Hi ${esc(input.name)}, your ${BRAND} profile was just updated. Here's what changed:</p>
      ${list}
      ${callout(
        `If this wasn't you, change your password immediately and review your account activity.`,
        COLORS.rose,
      )}
      ${button(appUrl("/profile"), "View profile", accent)}`,
    }),
    text: `Hi ${input.name}, your ${BRAND} profile was updated (@${input.username}).
Changed: ${input.changed.join(", ") || "profile details"}
If this wasn't you, change your password: ${appUrl("/profile")}`,
  };
}

export function welcomeEmail(input: { name: string }): EmailContent {
  const accent = COLORS.rose;
  return {
    subject: `Welcome to ${BRAND} 👋`,
    html: layout({
      preheader: "Watch sellers go live and shop in real time.",
      emoji: "👋",
      eyebrow: "Welcome",
      heading: `Welcome to ${BRAND}!`,
      accent,
      body: `<p style="margin:0 0 18px 0;">Hi ${esc(input.name)}, you're in. ${BRAND} is live shopping — sellers broadcast, you watch, chat, and grab things before they sell out.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:10px 0;border-bottom:1px solid ${LINE};font-size:14px;">🎥 &nbsp;Watch sellers live and ask questions in chat</td></tr>
        <tr><td style="padding:10px 0;border-bottom:1px solid ${LINE};font-size:14px;">⚡ &nbsp;Buy Now reserves your item instantly — no overselling</td></tr>
        <tr><td style="padding:10px 0;font-size:14px;">💸 &nbsp;Pay online, or choose cash on delivery</td></tr>
      </table>
      ${button(appUrl("/discover"), "Browse live streams", accent)}`,
    }),
    text: `Hi ${input.name}, welcome to ${BRAND}! Watch sellers go live and shop in real time.
Browse: ${appUrl("/discover")}`,
  };
}

export function accountStatusEmail(input: {
  name: string;
  active: boolean;
}): EmailContent {
  const accent = input.active ? COLORS.green : COLORS.rose;
  return {
    subject: input.active
      ? "Your liveWAB account was reactivated"
      : "Your liveWAB account was suspended",
    html: layout({
      preheader: input.active
        ? "You can shop and sell again."
        : "Access to your account is paused.",
      emoji: input.active ? "🔓" : "🔒",
      eyebrow: "Account status",
      heading: input.active ? "Your account is active again" : "Your account is suspended",
      accent,
      body: input.active
        ? `<p style="margin:0;">Hi ${esc(input.name)}, your ${BRAND} account has been reactivated. Everything is back to normal — welcome back.</p>
           ${button(appUrl("/"), "Open liveWAB", accent)}`
        : `<p style="margin:0 0 16px 0;">Hi ${esc(input.name)}, an administrator has suspended your ${BRAND} account. You can still sign in, but you can't buy, sell, or go live.</p>
           ${callout(
             `Think this is a mistake? Reply to this email and our team will review it.`,
             accent,
           )}`,
    }),
    text: input.active
      ? `Hi ${input.name}, your ${BRAND} account has been reactivated.`
      : `Hi ${input.name}, your ${BRAND} account has been suspended. Reply to this email if you think it's a mistake.`,
  };
}

// --------------------------------------------------------------- seller

export function sellerApplicationEmail(input: {
  name: string;
  brandName: string;
  category: string;
}): EmailContent {
  const accent = COLORS.amber;
  return {
    subject: "We've received your seller application",
    html: layout({
      preheader: `${input.brandName} is under review.`,
      emoji: "🛍️",
      eyebrow: "Under review",
      heading: "Application received",
      accent,
      body: `<p style="margin:0 0 20px 0;">Hi ${esc(input.name)}, thanks for applying to sell on ${BRAND}. Here's what we have on file:</p>
      ${rowsTable([
        { label: "Brand", value: input.brandName, strong: true },
        { label: "Category", value: input.category },
        { label: "Status", value: "Pending review" },
      ])}
      ${callout(
        `Most applications are reviewed within a day. We'll email and message you the moment there's a decision — no need to apply again.`,
        accent,
      )}
      ${button(appUrl("/become-a-seller"), "Check status", accent)}`,
    }),
    text: `Hi ${input.name}, we've received your ${BRAND} seller application for ${input.brandName} (${input.category}). We'll let you know once it's reviewed.
${appUrl("/become-a-seller")}`,
  };
}

export function sellerApprovedEmail(input: { name: string }): EmailContent {
  const accent = COLORS.green;
  return {
    subject: `You're approved to sell on ${BRAND} 🎉`,
    html: layout({
      preheader: "Your seller dashboard is unlocked.",
      emoji: "🎊",
      eyebrow: "Approved",
      heading: "You're approved to sell!",
      accent,
      body: `<p style="margin:0 0 18px 0;">Hi ${esc(input.name)}, your seller application was approved and your dashboard is unlocked. Here's how to get your first sale:</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:10px 0;border-bottom:1px solid ${LINE};font-size:14px;"><strong>1.</strong> &nbsp;Add products with a clear photo and price</td></tr>
        <tr><td style="padding:10px 0;border-bottom:1px solid ${LINE};font-size:14px;"><strong>2.</strong> &nbsp;Set your shop address so buyers know where you ship from</td></tr>
        <tr><td style="padding:10px 0;font-size:14px;"><strong>3.</strong> &nbsp;Hit <strong>Go live</strong> and pin products as you show them</td></tr>
      </table>
      ${button(appUrl("/dashboard"), "Open seller dashboard", accent)}`,
    }),
    text: `Hi ${input.name}, you're approved to sell on ${BRAND}!
1. Add products  2. Set your shop address  3. Go live
${appUrl("/dashboard")}`,
  };
}

export function sellerRejectedEmail(input: { name: string }): EmailContent {
  const accent = COLORS.slate;
  return {
    subject: "About your liveWAB seller application",
    html: layout({
      preheader: "Your application wasn't approved this time.",
      emoji: "📋",
      eyebrow: "Application update",
      heading: "We couldn't approve your application",
      accent,
      body: `<p style="margin:0 0 16px 0;">Hi ${esc(input.name)}, thanks for your interest in selling on ${BRAND}. We weren't able to approve your application this time.</p>
      <p style="margin:0;">This usually comes down to incomplete business details. You're welcome to update your application and submit it again — reapplying is always allowed.</p>
      ${callout(
        `Tip: a specific description of what you sell, where you source it, and your experience makes an application much easier to approve.`,
        accent,
      )}
      ${button(appUrl("/become-a-seller"), "Update and reapply", accent)}`,
    }),
    text: `Hi ${input.name}, your ${BRAND} seller application wasn't approved this time. You can update your details and apply again: ${appUrl("/become-a-seller")}`,
  };
}

/**
 * Seller alert: a parcel failed to book, or is being returned. Both need the
 * seller to actually do something, so the reason is front and centre.
 */
export function shipmentIssueEmail(input: {
  name: string;
  productTitle: string;
  orderId: string;
  reason: string;
  kind: "booking-failed" | "returning";
}): EmailContent {
  const failed = input.kind === "booking-failed";
  const accent = failed ? COLORS.rose : COLORS.amber;

  return {
    subject: failed
      ? `Shipment couldn't be booked — ${input.productTitle}`
      : `Parcel returning to you — ${input.productTitle}`,
    html: layout({
      preheader: input.reason.slice(0, 120),
      emoji: failed ? "⚠️" : "↩️",
      eyebrow: failed ? "Action needed" : "Return to origin",
      heading: failed
        ? "We couldn't book this shipment"
        : "A parcel is coming back to you",
      accent,
      body: `<p style="margin:0 0 16px 0;">Hi ${esc(input.name)}, ${
        failed
          ? `the courier rejected the booking for <strong>${esc(input.productTitle)}</strong>.`
          : `<strong>${esc(input.productTitle)}</strong> couldn't be delivered and is being returned to your pickup address.`
      }</p>
      ${callout(esc(input.reason), accent)}
      ${
        failed
          ? `<p style="margin:20px 0 0 0;">Fix the issue above, then retry from your Sales dashboard. Common causes are an unserviceable PIN code or parcel dimensions outside the courier's limits.</p>`
          : `<p style="margin:20px 0 0 0;">No action is needed until it arrives. Once you receive it, restock the item so it can be sold again.</p>`
      }
      <p style="margin:20px 0 0 0;font-size:13px;color:${MUTED};">Order ID · ${esc(input.orderId)}</p>
      ${button(appUrl("/dashboard/sales"), "Open Sales dashboard", accent)}`,
    }),
    text: `Hi ${input.name}, ${
      failed
        ? `the courier rejected the shipment booking for ${input.productTitle}.`
        : `${input.productTitle} is being returned to you.`
    }
Reason: ${input.reason}
Order ID: ${input.orderId}
${appUrl("/dashboard/sales")}`,
  };
}

export function shopAddressUpdatedEmail(input: {
  name: string;
  shopName: string;
  city: string;
  pincode: string;
}): EmailContent {
  const accent = COLORS.violet;
  return {
    subject: "Your shop address was updated",
    html: layout({
      preheader: `${input.shopName} · ${input.city} — ${input.pincode}`,
      emoji: "🏬",
      eyebrow: "Seller settings",
      heading: "Shop address updated",
      accent,
      body: `<p style="margin:0 0 20px 0;">Hi ${esc(input.name)}, your shop details were updated. Buyers see your city on your public shop page — your full address is never shown.</p>
      ${rowsTable([
        { label: "Shop", value: input.shopName, strong: true },
        { label: "Location", value: `${input.city} — ${input.pincode}` },
      ])}
      ${button(appUrl("/shop-address"), "Review shop address", accent)}`,
    }),
    text: `Hi ${input.name}, your ${BRAND} shop address was updated.
${input.shopName} — ${input.city} ${input.pincode}
${appUrl("/shop-address")}`,
  };
}
