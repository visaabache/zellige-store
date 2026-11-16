// Uploads public/ to the STATIC KV namespace (see src/static.js). Only new or changed files are written, so a
// deploy uses few of the free plan's daily KV writes; files removed from public/ are deleted.
//
//   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... node scripts/upload-static.mjs
//
// The namespace id is read from wrangler.jsonc (kv_namespaces, binding STATIC).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { createHash } from 'node:crypto';

const root = new URL('..', import.meta.url).pathname;
const config = JSON.parse(readFileSync(join(root, 'wrangler.jsonc'), 'utf8').replace(/^\s*\/\/.*$/gm, ''));
const ns = (config.kv_namespaces || []).find((k) => k.binding === 'STATIC')?.id;
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!ns || !account || !token) {
  console.error('Needs CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN and a STATIC kv namespace in wrangler.jsonc.');
  process.exit(1);
}
const api = `https://api.cloudflare.com/client/v4/accounts/${account}/storage/kv/namespaces/${ns}`;
const auth = { authorization: `Bearer ${token}` };

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.mp4': 'video/mp4',
};

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (name !== '_headers' && !name.startsWith('.')) files.push(full);
  }
})(join(root, 'public'));

// What is there now (key -> etag), from the key listing.
const existing = new Map();
let cursor = '';
do {
  const r = await fetch(`${api}/keys?limit=1000${cursor ? `&cursor=${cursor}` : ''}`, { headers: auth });
  const j = await r.json();
  if (!j.success) throw new Error(`list keys: ${JSON.stringify(j.errors)}`);
  for (const k of j.result) existing.set(k.name, k.metadata?.etag || '');
  cursor = j.result_info?.cursor || '';
} while (cursor);

const puts = [];
const keep = new Set();
for (const full of files) {
  const key = '/' + relative(join(root, 'public'), full).split('\\').join('/');
  const data = readFileSync(full);
  const etag = createHash('sha256').update(data).digest('hex').slice(0, 24);
  keep.add(key);
  if (existing.get(key) === etag) continue;
  puts.push({ key, value: data.toString('base64'), base64: true, metadata: { type: TYPES[extname(full).toLowerCase()] || 'application/octet-stream', etag } });
}
const gone = [...existing.keys()].filter((k) => !keep.has(k));

// Bulk writes, in batches that stay well under the 100 MB request limit.
for (let i = 0; i < puts.length; ) {
  const batch = [];
  let size = 0;
  while (i < puts.length && batch.length < 500 && size < 40e6) {
    size += puts[i].value.length;
    batch.push(puts[i++]);
  }
  const r = await fetch(`${api}/bulk`, { method: 'PUT', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify(batch) });
  const j = await r.json();
  if (!j.success) throw new Error(`bulk write: ${JSON.stringify(j.errors)}`);
}
if (gone.length) {
  const r = await fetch(`${api}/bulk/delete`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify(gone) });
  const j = await r.json();
  if (!j.success) throw new Error(`bulk delete: ${JSON.stringify(j.errors)}`);
}
console.log(`static files: ${files.length} total, ${puts.length} written, ${gone.length} deleted, ${files.length - puts.length} unchanged`);
