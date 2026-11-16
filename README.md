# Dar Zellij: Moroccan zellige ceramics store

Live at **https://zellige-store.visa-abache.workers.dev**. Admin at `/admin/`.

An online store for zellige-patterned mugs, cups, plates, trays and gift boxes, for customers in Morocco.

- **Arabic (right to left), French and English** at `/ar/`, `/fr/` and `/en/`. Visitors land in their browser's language, and the store remembers the one they pick.
- **Prices in Moroccan dirhams.** Visitors abroad can see an estimate in their own currency, but they always pay in dirhams.
- **Cash on delivery only, no customer accounts.** Customers order as guests from the product page or the cart, giving their name, city, address and phone. The store calls to confirm the order.
- **Delivery fee by city.** The admin sets a default fee, a fee for each city and a free-delivery threshold (500 DH by default). Customers see the fee before they confirm.
- **Track my order.** The order number (e.g. `261116-XN44`) is the tracking code. Customers enter it on `/fr/track` with their phone number and see:
  - the order status and its timeline;
  - the courier and parcel number once the admin adds them;
  - the history of each status change.

  The confirmation page and emails link straight to the order.
- **Wishlist**: a heart on every product, saved in the browser with no account needed, with a `/wishlist` page.
- **Honest craft labels.** Every product says how it is made:
  - "zellige-inspired design" is the default and makes no handmade claim;
  - "made by artisans" and "handmade, verified" can only be chosen with a note saying who made the piece, where, and how it was checked;
  - without that note the store shows "zellige-inspired".

  Products can also list materials, care instructions and measurements (width, height, diameter, capacity, weight). The countdown and "only N left" urgency features are off.
- **Admin** in Arabic, French or English:
  - orders: status (new → confirmed → shipped → delivered / cancelled / returned), courier and tracking number, WhatsApp and call buttons, internal notes, CSV export;
  - products, with photos, options such as "Décor", craft label and measurements;
  - categories, blog, delivery fees and store settings.
- **Password change** from the admin under Settings → Password. The first password is the `ADMIN_PASSWORD` secret. A new password must be at least 10 characters, with a letter and a digit. It is stored as a PBKDF2 hash, and changing it signs out every other device.
- **SEO**: pages rendered on the server, keyword titles and descriptions, hreflang between languages, structured data (store, products with the real delivery fee, breadcrumbs, FAQ), a sitemap and robots.txt.

## How it runs

It runs on **Cloudflare Workers** (plain JavaScript, no framework, no build step) with a **D1** database, and fits the free plan. Pages render in a few milliseconds of CPU, so the store does not hit the free plan's limits that took the previous Next.js version down.

| Part | Where |
|---|---|
| Pages, API, admin API | `src/worker.js`, `src/render.js`, `src/admin.js` |
| Wording (ar/fr/en) | `src/i18n.js`, with the store's own copy in `src/i18n-zellige.js` |
| Database schema / sample catalogue | `migrations/0001_init.sql`, `seed/catalogue.sql` |
| Storefront script (cart, checkout, wishlist) | `public/assets/store.js` |
| Admin app | `public/admin/` |
| Static files (photos, CSS, JS) | `public/`, served from the `STATIC` KV namespace (`src/static.js`) |

The static files are kept in Workers KV rather than Workers Static Assets so that they can be deployed from environments whose proxy blocks the assets upload. `npm run upload:static` sends only files that changed, to save the free plan's KV writes. If you add a Static Assets `ASSETS` binding, the worker uses that instead.

## Run it on your computer

```bash
npm install
cp .dev.vars.example .dev.vars        # local admin password
npm run db:migrate:local
npm run db:seed:local                 # 12 products in 4 categories
npm run dev                           # http://localhost:8787, admin at /admin/
npm test
```

## Deploy

```bash
export CLOUDFLARE_API_TOKEN=...  CLOUDFLARE_ACCOUNT_ID=...
npm run db:migrate                    # new migrations only
npm run deploy                        # uploads changed static files, then deploys the worker
```

First time only:

```bash
npx wrangler d1 create zellige-store            # put the id in wrangler.jsonc
npx wrangler kv namespace create zellige-static # put the id in wrangler.jsonc (binding STATIC)
npm run db:migrate && npm run db:seed
npx wrangler secret put ADMIN_PASSWORD
```

Emails (order confirmation and status updates) are optional: set a `BREVO_API_KEY` secret and the sender address in the admin. The AI description writer in the product form needs an `ANTHROPIC_API_KEY` secret.

## Not included (for later)

Card payment, bank transfer, discount codes, customer reviews and Excel import.
