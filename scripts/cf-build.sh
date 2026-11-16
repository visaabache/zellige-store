#!/usr/bin/env bash
# Builds the Cloudflare Workers bundle. OpenNext embeds .env* files into the bundle, so local env files are
# moved aside during the build (production values come from wrangler.jsonc vars and Wrangler secrets).
set -euo pipefail
cd "$(dirname "$0")/.."
moved=()
restore() { for f in "${moved[@]:-}"; do if [[ -n "$f" && -f "$f.cf-build-bak" ]]; then mv "$f.cf-build-bak" "$f"; fi; done; return 0; }
trap restore EXIT
for f in .env .env.local .env.production .env.production.local; do
  if [[ -f "$f" ]]; then mv "$f" "$f.cf-build-bak"; moved+=("$f"); fi
done
export CF_BUILD=1
export NEXT_PUBLIC_SITE_URL="${NEXT_PUBLIC_SITE_URL:-https://zellige-store.visa-abache.workers.dev}"
npx prisma generate
npx opennextjs-cloudflare build
