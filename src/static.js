// Static files (photos, CSS, JS, the admin app). With Workers Static Assets (the ASSETS binding) they are served
// from there. Otherwise they come from the STATIC KV namespace, filled by `npm run upload:static`
// (scripts/upload-static.mjs), with the same headers as public/_headers.

const SECURITY = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'x-frame-options': 'DENY',
  'cross-origin-opener-policy': 'same-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
};
const ADMIN = {
  'x-robots-tag': 'noindex',
  'cache-control': 'no-cache',
  'content-security-policy':
    "default-src 'self'; img-src 'self' data: blob: https:; media-src 'self' blob: https:; frame-src https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};

// URL path -> KV key: "/admin/" is "/admin/index.html"; no "..", no hidden files.
export function staticKey(pathname) {
  let p;
  try {
    p = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (p.includes('..') || /\/\./.test(p) || p === '/_headers') return null;
  if (p.endsWith('/')) p += 'index.html';
  return p;
}

function cacheFor(key, versioned) {
  if (key.startsWith('/admin/')) return null;
  if (key.startsWith('/assets/photos/') || key.startsWith('/assets/brand/') || versioned) return 'public, max-age=604800, stale-while-revalidate=86400';
  return 'public, max-age=3600, stale-while-revalidate=86400';
}

export async function serveStatic(request, env) {
  if (env.ASSETS) return env.ASSETS.fetch(request);
  const url = new URL(request.url);
  const notFound = () => new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', ...SECURITY } });
  if (!env.STATIC || (request.method !== 'GET' && request.method !== 'HEAD')) return notFound();
  const key = staticKey(url.pathname);
  if (!key) return notFound();
  // A folder without its slash: send it to the folder (e.g. /admin -> /admin/ is handled by the worker).
  const { value, metadata } = await env.STATIC.getWithMetadata(key, { type: 'arrayBuffer', cacheTtl: 3600 });
  if (value == null) {
    if (!key.split('/').pop().includes('.') && (await env.STATIC.get(`${key}/index.html`, { cacheTtl: 3600 })) != null) {
      return Response.redirect(`${url.origin}${url.pathname}/`, 301);
    }
    return notFound();
  }
  const meta = metadata || {};
  const headers = new Headers(SECURITY);
  headers.set('content-type', meta.type || 'application/octet-stream');
  if (meta.etag) headers.set('etag', `"${meta.etag}"`);
  if (key.startsWith('/admin/')) for (const [k, v] of Object.entries(ADMIN)) headers.set(k, v);
  const cache = cacheFor(key, url.searchParams.has('v'));
  if (cache) headers.set('cache-control', cache);
  const inm = request.headers.get('if-none-match');
  if (meta.etag && inm && inm.replace(/^W\//, '') === `"${meta.etag}"`) return new Response(null, { status: 304, headers });
  return new Response(request.method === 'HEAD' ? null : value, { headers });
}

// Bytes and type of a static file, for the AI description writer (photos of the product).
export async function staticFile(env, origin, path) {
  if (env.ASSETS) {
    const res = await env.ASSETS.fetch(new Request(origin + path));
    if (!res.ok) return null;
    return { type: (res.headers.get('content-type') || '').split(';')[0], data: await res.arrayBuffer() };
  }
  const key = staticKey(path.split('?')[0]);
  if (!env.STATIC || !key) return null;
  const { value, metadata } = await env.STATIC.getWithMetadata(key, { type: 'arrayBuffer' });
  return value == null ? null : { type: (metadata && metadata.type) || '', data: value };
}
