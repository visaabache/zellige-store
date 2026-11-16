# Deployment

## Live deployment: Cloudflare Workers + Neon

The shop runs at **https://zellige-store.visa-abache.workers.dev** (Worker `zellige-store`, Cloudflare account Flyabroadevisa@…), with its database on Neon (project `zellige-store`, Frankfurt).

| Piece | Where |
|---|---|
| App | Cloudflare Worker `zellige-store`, built with OpenNext (`cf-worker.ts` is the entry) |
| Database | Neon PostgreSQL, queried over HTTPS; transactions over one WebSocket (`src/lib/db.ts`) |
| Static files (`/_next/static`, `/catalog`, icon) | Workers KV namespace `zellige-store-static` |
| Uploaded photos (`/media/…`) | Workers KV namespace `zellige-store-media` |
| Secrets | `DATABASE_URL`, `SESSION_SECRET` (Wrangler secrets); add `RESEND_API_KEY`, `CMI_CLIENT_ID`, `CMI_STORE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` the same way |
| Non-secret config | `vars` in `wrangler.jsonc` |

### Redeploy after a change
```bash
export CLOUDFLARE_ACCOUNT_ID=81ab4316522f206e49bd94884d21b968 CLOUDFLARE_API_TOKEN=…   # token with Workers + KV edit rights
export STATIC_KV_ID=4727a3023ddb4287b7667bb40e831d4d
npm run cf:deploy          # build → upload new static files to KV → wrangler deploy
```
Database changes: `DATABASE_URL=… npm run db:migrate:neon` (applies Prisma migrations over HTTPS), or `npm run db:migrate` where port 5432 is reachable.

Add a secret: `npx wrangler secret put RESEND_API_KEY`. Use your own domain: *Workers → zellige-store → Settings → Domains & Routes*, then update `NEXT_PUBLIC_SITE_URL` in `wrangler.jsonc` and redeploy.

### How it differs from Node.js hosting
- **Images** are served as stored (Workers have no image optimizer). Catalog photos are pre-sized, and the admin resizes photos in the browser (max 1800 px, WebP) before uploading.
- **Caching**: cached catalog queries run against the database on every request, so admin changes are visible immediately.
- **Spreadsheets**: XLSX is read and written by `src/lib/xlsx.ts` (pure JavaScript), and an import runs in a single transaction.

### Staying up on Cloudflare
- **Page cache** (`cf-worker.ts`): anonymous storefront pages are served from KV without running Next.js (≈0.1 s instead of 1–3 s). Each admin save invalidates it; entries also expire after 10 minutes. Filtered/search URLs, order pages and admin pages are never cached.
- **No link prefetching** (`src/components/ui/Link.tsx`): avoids dozens of background server renders per visit.
- **Graceful failures**: if Cloudflare cuts a request, forms show "the server is busy" (sign-in and order lookup retry automatically) and pages show a *Try again* screen instead of a crash.

### Cloudflare Free plan limits
The free plan allows ~10 ms of CPU and 50 subrequests (database queries) per request, and a 3 MB compressed Worker. The app fits today (Worker ≈ 2.6 MB), but pages take 1–3 s on a cold request and very large imports may hit the CPU limit. **Workers Paid ($5/month)** raises these limits (30 s CPU, 10,000 subrequests, 10 MB) and is recommended before launch.

## 1. Supabase (database + image storage)

1. Create a project (region close to Morocco, e.g. *West EU (Paris)* or *Central EU (Frankfurt)*).
2. **Database URLs** (*Project Settings → Database → Connection string*):
   - `DATABASE_URL`: **Transaction pooler**, port 6543. On serverless hosts (Vercel) append `?pgbouncer=true&connection_limit=1`.
   - `DIRECT_URL`: **Session pooler** or direct connection, port 5432 (used by `prisma migrate`).
3. **Storage**: *Storage → New bucket* named `products`, set to **Public**. Then set `SUPABASE_URL` (*Project Settings → API → Project URL*) and `SUPABASE_SERVICE_ROLE_KEY` (*service_role* key). This key is used **only on the server**: never expose it in client code.
4. From your machine: `npm run db:migrate && npm run db:seed`.

The app talks to the database only through Prisma on the server; it never uses the Supabase anon key. The `enable_rls` migration turns on row-level security on every table with no policies, so Supabase's public REST API cannot read your tables even if someone has the anon key.

**Authentication** uses the app's own accounts (bcrypt + database sessions) rather than Supabase Auth, so staff roles, guest checkout and order ownership live in one place and the app also runs on any PostgreSQL.

**Backups**: Supabase paid plans include daily backups (*Database → Backups*); point-in-time recovery is an add-on. `npm run backup` also writes a `pg_dump` you can copy elsewhere.

## 2. Hosting

### Vercel
- Import the repository, set **Root Directory** to `zellige-store`.
- Add every variable from `.env.example`. **Supabase Storage is required on Vercel** (its disk is not persistent).
- Build command: `npm run build`. Run `npm run db:migrate` from your machine (or CI) when migrations change.

### Docker / VPS
```bash
docker build -t dar-zellij .
docker run -d -p 3100:3100 --env-file .env -v zellige-uploads:/app/storage --restart unless-stopped dar-zellij
```
Put Nginx or Caddy in front for HTTPS. Without Supabase Storage, uploads stay in the `zellige-uploads` volume: include it in your backups.

## 3. Payments

### CMI (cards in Morocco)
1. Sign a merchant agreement with your bank; CMI sends `CMI_CLIENT_ID` and `CMI_STORE_KEY`.
2. Give CMI your callback URL: `https://your-domain/api/payments/cmi/callback`.
3. Test on `https://testpayment.cmi.co.ma/fim/est3Dgate` (the default `CMI_GATEWAY_URL`), then switch to the production URL CMI gives you.

An order becomes *Paid* only when the callback's hash is valid, the amount matches and `ProcReturnCode` is `00`. The browser return page never confirms a payment by itself. Check the parameter list against the integration kit CMI sends you.

### Stripe (international cards, optional)
Set `STRIPE_SECRET_KEY`, add a webhook to `https://your-domain/api/payments/stripe/webhook` for `checkout.session.completed` and `checkout.session.expired`, then set `STRIPE_WEBHOOK_SECRET`. EUR, USD, GBP, CAD and CHF are charged in that currency; others in MAD.

### Cash on delivery and bank transfer
Enable them in *Settings → Payments*. Bank transfer is offered only once a RIB or IBAN is filled in. COD can be disabled per city.

## 4. Email
Create a [Resend](https://resend.com) account, verify your domain, set `RESEND_API_KEY` and `MAIL_FROM`. The app sends order confirmations (in the customer's language), status and tracking updates, new-order notifications and low-stock alerts.

## 5. Couriers
Each order stores a carrier and tracking number; tracking links are generated for Amana, Aramex, DHL and EMS. To automate shipment creation with a carrier API (Sendit, Cathedis, Amana…), implement the `CourierProvider` interface in `src/lib/couriers.ts`.

## 6. Architecture notes
- `src/app/[locale]/…`: storefront (FR/AR/EN), `src/app/admin/…`: dashboard, `src/app/api/…`: cart quote, checkout, payments, exports, wishlist.
- Prices are integer **centimes of MAD**; other currencies are display conversions stored on each order.
- Every price, stock level, discount and delivery fee is recomputed on the server at checkout. Stock is reserved with conditional updates inside a transaction, so two customers cannot buy the last piece.
- Catalog queries are cached with the tag `catalog`; every admin change revalidates it, so published changes appear immediately.
- Translated fields are JSON `{ "fr", "ar", "en" }` with a French → English → Arabic fallback.
