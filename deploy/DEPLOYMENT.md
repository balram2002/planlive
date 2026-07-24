# Deploying liveWAB to `livewab.planwab.com`

Target: Hostinger KVM 2 VPS, Docker, behind the Nginx that already serves
`planwab.com`, with DNS on Cloudflare (domain registered at GoDaddy).

Nothing here touches the existing `planwab.com` deployment — the two run side
by side, separated by Nginx `server_name` routing and different local ports.

---

## Architecture

```
Browser
   │  https://livewab.planwab.com
   ▼
Cloudflare  (DNS + proxy + TLS to visitor)
   │  https  → VPS public IP
   ▼
Nginx on VPS  (TLS termination, vhost by server_name)
   ├── planwab.com            → existing app
   └── livewab.planwab.com    → 127.0.0.1:3100
                                     │
                                     ▼
                            Docker: livewab-web
                            + livewab-sweeper
                            + livewab-shipsync
```

**LiveKit video never passes through this VPS.** Browsers connect straight to
your LiveKit Cloud `wss://` endpoint. The VPS only mints access tokens, so
video quality is unaffected by VPS bandwidth.

---

## Step 1 — DNS in Cloudflare

Cloudflare is authoritative for `planwab.com` (GoDaddy just points the
nameservers there), so the record is added in Cloudflare, **not** GoDaddy.

Cloudflare dashboard → `planwab.com` → **DNS** → **Add record**:

| Field | Value |
|---|---|
| Type | `A` |
| Name | `livewab` |
| IPv4 address | your VPS public IP (Hostinger hPanel → VPS → Overview) |
| Proxy status | **Proxied** (orange cloud) |
| TTL | Auto |

Verify from your machine:

```bash
dig +short livewab.planwab.com
# Proxied records resolve to Cloudflare IPs (104.x / 172.67.x) — that's correct.
```

### SSL/TLS mode — important

Cloudflare → **SSL/TLS** → **Overview** → set **Full (strict)**.

- *Flexible* would make Cloudflare talk plain HTTP to your origin. Next.js
  would then see `http`, generate `http://` callback URLs, and Clerk's OAuth
  redirects would break in a redirect loop.
- *Full (strict)* requires a valid origin certificate — Step 4 installs one.

---

## Step 2 — Prepare the VPS

SSH in as a non-root sudo user.

```bash
# Docker (skip if the main app already uses it)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
newgrp docker            # or log out and back in

docker --version && docker compose version
```

Clone the project:

```bash
sudo mkdir -p /srv && sudo chown "$USER":"$USER" /srv
cd /srv
git clone <your-repo-url> livewab
cd livewab
```

### Check the port is free

`docker-compose.yml` binds `127.0.0.1:3100`. If the main app already uses it,
change both that file and `upstream livewab_app` in the Nginx config.

```bash
sudo ss -tlnp | grep -E ':(3000|3100)\b'   # no output = free
```

---

## Step 3 — Environment

```bash
cp deploy/env.production.example .env.production
nano .env.production
chmod 600 .env.production     # contains live payment and DB credentials
```

Fill in every value. Two that are easy to get wrong:

- `NEXT_PUBLIC_APP_URL=https://livewab.planwab.com` — no trailing slash. It's
  compiled into the client bundle **at build time**, so changing it later
  requires a rebuild, not just a restart.
- `DATABASE_URL` — MongoDB Atlas must allow the VPS IP:
  Atlas → **Network Access** → **Add IP Address** → your VPS public IP.
  Without this the container starts and every request 500s.

---

## Step 4 — TLS certificate

Cloudflare's proxy needs a valid certificate at the origin for *Full (strict)*.

Because the DNS record is proxied, the HTTP-01 challenge must reach your
server — so **temporarily grey-cloud** the `livewab` record (click the orange
cloud to disable proxy), issue the certificate, then re-enable it.

```bash
sudo apt update && sudo apt install -y certbot python3-certbot-nginx
sudo mkdir -p /var/www/certbot

# With the record grey-clouded (DNS only):
sudo certbot certonly --webroot -w /var/www/certbot \
  -d livewab.planwab.com \
  --email you@planwab.com --agree-tos --no-eff-email
```

Re-enable the orange cloud in Cloudflare afterwards.

Renewal is automatic via certbot's systemd timer. Confirm:

```bash
systemctl list-timers | grep certbot
sudo certbot renew --dry-run
```

> Alternative: a **Cloudflare Origin Certificate** (SSL/TLS → Origin Server)
> is valid 15 years and never needs the grey-cloud dance. Point
> `ssl_certificate` / `ssl_certificate_key` at it instead. It's only trusted
> by Cloudflare, which is fine when all traffic is proxied.

---

## Step 5 — Nginx

```bash
# The WebSocket upgrade map must exist exactly once across all of Nginx.
grep -rn "connection_upgrade" /etc/nginx/ || \
  sudo cp deploy/nginx/00-websocket-upgrade.conf /etc/nginx/conf.d/

sudo cp deploy/nginx/livewab.planwab.com.conf /etc/nginx/sites-available/
sudo ln -sf /etc/nginx/sites-available/livewab.planwab.com.conf \
            /etc/nginx/sites-enabled/

sudo nginx -t          # must pass before reloading
sudo systemctl reload nginx
```

`nginx -t` failing with *"duplicate variable name $connection_upgrade"* means
the map already existed — remove the file you just copied.

---

## Step 6 — Build and start

```bash
chmod +x deploy/deploy.sh
./deploy/deploy.sh
```

The script validates required env vars, builds, starts all three services,
waits for the healthcheck, and prunes dangling images.

First build takes 3–6 minutes on KVM 2.

Verify:

```bash
curl -sS http://127.0.0.1:3100/api/health     # origin directly
curl -sS https://livewab.planwab.com/api/health   # through Cloudflare
# {"status":"ok","dbLatencyMs":12}

docker compose ps        # all three Up, web healthy
docker compose logs -f web
```

---

## Step 7 — Cloudflare rules for webhooks

Cloudflare's bot protection will challenge server-to-server POSTs from
Razorpay, Clerk and Eshopbox. A challenged webhook is a *silently stranded
order*, so add a skip rule.

Cloudflare → **Security** → **WAF** → **Custom rules** → **Create rule**:

- Name: `Skip bot checks for liveWAB webhooks`
- Expression (use the Edit expression tab):
  ```
  (http.host eq "livewab.planwab.com" and starts_with(http.request.uri.path, "/api/webhooks/"))
  ```
- Action: **Skip** → tick *All remaining custom rules*, *Bot Fight Mode*,
  *Rate limiting rules*, *Managed rules*.

Also under **Speed** → **Optimization**, make sure Rocket Loader is **off**
for this host — it rewrites script loading and breaks the LiveKit client.

---

## Step 8 — Register the Eshopbox webhook

Run this **after** the app is live, so the URL it registers actually resolves:

```bash
docker compose exec web sh -c 'echo $NEXT_PUBLIC_APP_URL'   # sanity check
docker compose run --rm sweeper npx tsx scripts/register-eshopbox-webhook.ts
```

---

## Step 9 — Point the providers at the new URLs

See `WEBHOOKS.md` for the full endpoint list and per-provider steps.

---

## Day-to-day operations

```bash
# Deploy new code
cd /srv/livewab && ./deploy/deploy.sh

# Logs
docker compose logs -f web
docker compose logs -f sweeper shipsync

# Restart one service
docker compose restart web

# Stop / start everything
docker compose down
docker compose up -d

# Shell inside the app container
docker compose exec web sh

# One-off maintenance scripts
docker compose run --rm sweeper npx tsx scripts/backfill-defaults.ts
docker compose run --rm sweeper npx tsx scripts/make-admin.ts you@planwab.com
docker compose run --rm sweeper npx tsx scripts/verify-email.ts you@planwab.com
```

### Rollback

```bash
git log --oneline -5
git checkout <previous-commit>
./deploy/deploy.sh --no-git
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| 502 Bad Gateway | Container down, or port mismatch | `docker compose ps`; check `upstream` port matches compose |
| Health returns `degraded` | Atlas blocking the VPS IP | Add the IP under Atlas → Network Access |
| Redirect loop on sign-in | Cloudflare SSL is *Flexible* | Switch to **Full (strict)** |
| "Query engine library not found" | Prisma engine missing for musl | Rebuild — `binaryTargets` in `schema.prisma` covers this |
| Webhooks 403 / never arrive | Cloudflare bot protection | Add the WAF skip rule (Step 7) |
| Emails not sending | SMTP creds or port blocked | `docker compose run --rm sweeper npx tsx scripts/verify-email.ts` |
| Video stuck "Connecting…" | `LIVEKIT_URL` wrong or unset | Must be the `wss://` LiveKit Cloud URL |
| Disk filling up | Old image layers | `docker image prune -af` |

### Memory

KVM 2 has 8 GB. This stack is capped at 2 GB (web) + 512 MB × 2 (workers).
Check headroom alongside the main app with `docker stats` and `free -h`.
