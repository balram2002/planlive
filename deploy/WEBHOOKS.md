# liveWAB — production webhook endpoints

Base URL: **`https://livewab.planwab.com`**

All three endpoints verify authenticity before doing any work, and all three
return `2xx` even for events they ignore — a provider that receives a `5xx`
retries the whole batch, which turns one bad event into a stuck queue.

> Before configuring these, make sure the Cloudflare WAF skip rule from
> `DEPLOYMENT.md` Step 7 is in place. Without it Cloudflare challenges these
> POSTs and the provider sees a failure.

---

## Summary

| Provider | URL | Method | Auth |
|---|---|---|---|
| Clerk | `https://livewab.planwab.com/api/webhooks/clerk` | POST | Svix signature (`CLERK_WEBHOOK_SECRET`) |
| Razorpay | `https://livewab.planwab.com/api/webhooks/razorpay` | POST | HMAC SHA256 (`RAZORPAY_WEBHOOK_SECRET`) |
| Eshopbox | `https://livewab.planwab.com/api/webhooks/eshopbox` | POST | Shared header (`ESHOPBOX_WEBHOOK_SECRET`) |

Health check (not a webhook, useful for uptime monitoring):
`https://livewab.planwab.com/api/health`

---

## 1. Clerk — user lifecycle

**URL:** `https://livewab.planwab.com/api/webhooks/clerk`

Keeps the local `User` collection in sync with Clerk and sends the welcome
email on first signup.

**Configure:** Clerk Dashboard → your **production** instance → **Webhooks**
→ **Add Endpoint**.

Subscribe to:
- `user.created`
- `user.updated`
- `user.deleted`

Copy the **Signing Secret** (`whsec_…`) into `CLERK_WEBHOOK_SECRET`.

Also required for a production Clerk instance:
1. **Domains** → add `livewab.planwab.com`.
2. **Paths** → sign-in `/sign-in`, sign-up `/sign-up`.
3. Add the CNAME records Clerk gives you (`clerk`, `accounts`, `clkmail`,
   `clk._domainkey`, `clk2._domainkey`) in **Cloudflare DNS**, set to
   **DNS only** (grey cloud) — Clerk validates them directly and proxying
   breaks verification.

---

## 2. Razorpay — payments

**URL:** `https://livewab.planwab.com/api/webhooks/razorpay`

This is the **only** path that marks an order paid. The client-side success
callback is never trusted, so if this webhook isn't configured, online orders
will stay unconfirmed forever even though money was taken.

**Configure:** Razorpay Dashboard → **Account & Settings** → **Webhooks** →
**Add New Webhook**.

- Webhook URL: `https://livewab.planwab.com/api/webhooks/razorpay`
- Secret: generate one, put the same value in `RAZORPAY_WEBHOOK_SECRET`

Subscribe to:
- `payment.captured` — confirms the reservation and marks the order `PAID`
- `payment.failed` — marks the order `FAILED` and emails the buyer to retry

Use **Live Mode** keys and the live-mode webhook. Test-mode webhooks are
configured separately and will not fire for real payments.

---

## 3. Eshopbox — shipment tracking

**URL:** `https://livewab.planwab.com/api/webhooks/eshopbox`

Drives the whole fulfilment track: picked up → in transit → out for delivery
→ delivered / RTO, plus the buyer's shipping emails.

**Configure:** run the registration script — do **not** add this one by hand,
because it also installs the authentication header:

```bash
cd /srv/livewab
docker compose run --rm sweeper npx tsx scripts/register-eshopbox-webhook.ts
```

It registers these events: `shipment.created`, `shipment.updated`,
`shipment.picked_up`, `shipment.delivered`, `returnShipment.updated`.

### Why this one needs a manual secret

Eshopbox does **not** sign its webhook payloads — there is no HMAC or signing
secret anywhere in their API. An unauthenticated endpoint would let anyone on
the internet mark orders delivered.

What they *do* support is arbitrary `webhookHeaders` supplied at registration
time. The script registers `x-livewab-webhook-secret: <ESHOPBOX_WEBHOOK_SECRET>`,
and the route rejects any request without that exact value (compared in
constant time). If you rotate the secret, re-run the script.

---

## The three Eshopbox values you asked about

### `ESHOPBOX_ACCOUNT_SLUG`

Your Eshopbox workspace subdomain — the part before `.myeshopbox.com` in the
URL you use to log in.

```
https://acmestore.myeshopbox.com   →   ESHOPBOX_ACCOUNT_SLUG=acmestore
```

Used only to build the webhook registration host
(`https://<slug>.myeshopbox.com/api/v1/webhook`) and sent as the `ProxyHost`
header. Registration fails without it; booking and tracking do not use it.

### `ESHOPBOX_PICKUP_LOCATION_CODE`

The warehouse code Eshopbox collects parcels from. **You cannot invent this
value** — it is created in your Eshopbox workspace and must match exactly.

Find it: Eshopbox dashboard → **Settings** → **Locations** (sometimes
**Warehouses** / **Pickup Locations**). The code looks like `MCFL00395` or
`WH-DEL-01` — their API docs use `MCFL00395` in the example.

If you don't have a pickup location yet, ask your Eshopbox point of contact
to create one for your address; it's part of workspace onboarding.

This is the **marketplace-wide default**. Individual sellers can override it
on `/shop-address` (the "Eshopbox pickup location code" field), which is what
you want once sellers ship from their own warehouses. Booking sends
`pickupLocation.locationCode`, resolved as: seller's own code → this default.

A wrong code is rejected at booking time with a message the seller sees, so
it fails loudly rather than silently mis-routing parcels.

### `ESHOPBOX_WEBHOOK_SECRET`

**You generate this yourself** — it is not issued by Eshopbox. It's a random
string we invent so the webhook endpoint can tell real deliveries from
forged ones.

```bash
openssl rand -hex 32
# 7f3a9c1e5b8d2f604a7e9c3b1d5f8a2e6c4b0d9f7a3e1c5b8d2f6a4e0c9b7d3f
```

Paste that into `.env.production`, then run the registration script so
Eshopbox starts sending it as a header. Order matters: register **after**
setting the value, or Eshopbox will send nothing and every delivery will 401.

Treat it like a password — 32 bytes of hex, never committed to git.

---

## Verifying after deployment

```bash
# Endpoint is reachable and rejects unauthenticated calls (401 is correct)
curl -i -X POST https://livewab.planwab.com/api/webhooks/eshopbox \
  -H 'Content-Type: application/json' -d '{}'

# With the right secret it accepts and ignores an empty event (200)
curl -i -X POST https://livewab.planwab.com/api/webhooks/eshopbox \
  -H 'Content-Type: application/json' \
  -H 'x-livewab-webhook-secret: <your secret>' -d '{}'

# Razorpay/Clerk reject unsigned requests (400) — also correct
curl -i -X POST https://livewab.planwab.com/api/webhooks/razorpay \
  -H 'Content-Type: application/json' -d '{}'
```

Watch them arrive:

```bash
docker compose logs -f web | grep -iE "webhook|eshopbox|razorpay|clerk"
```

Each provider also has its own delivery log — Clerk and Razorpay show
response codes and let you replay failed events, which is the fastest way to
diagnose a misconfigured endpoint.

---

## Complete public API surface

For reference, everything reachable on the deployed app:

| Path | Purpose |
|---|---|
| `/api/health` | Liveness + DB check (uptime monitoring) |
| `/api/webhooks/clerk` | User lifecycle |
| `/api/webhooks/razorpay` | Payment capture/failure |
| `/api/webhooks/eshopbox` | Shipment tracking |
| `/api/livekit-token` | Mints room tokens (auth required) |
| `/api/checkout`, `/api/checkout/cod` | Order placement (auth required) |
| `/api/reservations`, `/api/reservations/[id]` | Stock reservation (auth required) |
| `/api/addresses`, `/api/addresses/[id]` | Address book (auth required) |
| `/api/imagekit-auth`, `/api/upload` | Image uploads (auth required) |
| `/api/streams/[id]/products`, `/stats` | Live room polling (public read) |
| `/api/search`, `/api/follow`, `/api/geocode` | Discovery + social |
