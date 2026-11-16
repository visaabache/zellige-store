import "server-only";
import { randomBytes } from "node:crypto";

/**
 * Image storage, chosen in this order:
 *  1. Supabase Storage when SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set (public bucket SUPABASE_BUCKET, default "products");
 *  2. the Workers KV namespace bound as MEDIA when running on Cloudflare Workers;
 *  3. the local ./storage/uploads folder (Node.js hosting).
 * 2 and 3 are served by the /media route.
 *
 * On Node.js, uploads are re-encoded to WebP (max 2000 px) with sharp. Workers cannot run sharp, so there the file is
 * kept as sent after checking its real type from its first bytes; the admin resizes photos in the browser before
 * uploading, so files stay small either way.
 */

const MAX_BYTES = 15 * 1024 * 1024;

type KV = {
  getWithMetadata(key: string, type: "arrayBuffer"): Promise<{ value: ArrayBuffer | null; metadata: { ct?: string } | null }>;
  put(key: string, value: ArrayBuffer | Uint8Array, opts?: { metadata?: Record<string, string> }): Promise<void>;
  delete(key: string): Promise<void>;
};

/** The MEDIA KV binding when running on Cloudflare Workers, otherwise null. */
export async function mediaKv(): Promise<KV | null> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const env = getCloudflareContext().env as unknown as { MEDIA?: KV };
    return env.MEDIA ?? null;
  } catch {
    return null;
  }
}

const supabase = () => {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key, bucket: process.env.SUPABASE_BUCKET || "products" } : null;
};

export const localDir = async () => (await import("node:path")).join(process.cwd(), "storage", "uploads");

/** Detects the image type from its first bytes (never trusts the file name or the browser's MIME type). */
export function sniffImage(b: Uint8Array): { ext: string; type: string } | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: "jpg", type: "image/jpeg" };
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { ext: "png", type: "image/png" };
  const ascii = (i: number, n: number) => String.fromCharCode(...b.slice(i, i + n));
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return { ext: "webp", type: "image/webp" };
  if (ascii(4, 4) === "ftyp" && /avif|avis/.test(ascii(8, 4))) return { ext: "avif", type: "image/avif" };
  return null;
}

/** Width and height from JPEG, PNG or WebP headers. */
export function imageSize(b: Uint8Array): { width: number; height: number } | null {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const tag = String.fromCharCode(...b.slice(12, 16));
  try {
    if (b[0] === 0x89 && b[1] === 0x50) return { width: v.getUint32(16), height: v.getUint32(20) };
    if (b[0] === 0xff && b[1] === 0xd8) {
      let i = 2;
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) return null;
        const marker = b[i + 1];
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: v.getUint16(i + 5), width: v.getUint16(i + 7) };
        i += 2 + v.getUint16(i + 2);
      }
      return null;
    }
    if (tag === "VP8X") return { width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
    if (tag === "VP8 ") return { width: v.getUint16(26, true) & 0x3fff, height: v.getUint16(28, true) & 0x3fff };
    if (tag === "VP8L") {
      const bits = v.getUint32(21, true);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
  } catch {
    /* truncated or unusual header */
  }
  return null;
}

type Prepared = { data: Uint8Array; ext: string; type: string; width: number | null; height: number | null };

type SharpFn = (input: Uint8Array) => import("sharp").Sharp;

async function loadSharp(): Promise<SharpFn | null> {
  try {
    const name = "sharp";
    const mod = await import(/* webpackIgnore: true */ name);
    return (mod.default ?? mod) as SharpFn;
  } catch {
    return null;
  }
}

async function prepare(input: Uint8Array): Promise<Prepared> {
  const kind = sniffImage(input);
  const sharp = await loadSharp();
  if (sharp) {
    try {
      const { data, info } = await sharp(input).rotate().resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true }).webp({ quality: 84 }).toBuffer({ resolveWithObject: true });
      return { data: new Uint8Array(data), ext: "webp", type: "image/webp", width: info.width, height: info.height };
    } catch {
      throw new Error("Unsupported image format: use JPEG, PNG, WebP or AVIF");
    }
  }
  // No sharp (Cloudflare Workers): keep the file after checking its type.
  if (!kind) throw new Error("Unsupported image format: use JPEG, PNG, WebP or AVIF");
  const size = imageSize(input);
  return { data: input, ...kind, width: size?.width ?? null, height: size?.height ?? null };
}

export type StoredImage = { url: string; width: number | null; height: number | null };

export async function storeImage(file: File, folder = "products"): Promise<StoredImage> {
  if (file.size > MAX_BYTES) throw new Error("Image larger than 15 MB");
  const img = await prepare(new Uint8Array(await file.arrayBuffer()));
  const name = `${folder}/${new Date().toISOString().slice(0, 7)}/${randomBytes(10).toString("hex")}.${img.ext}`;

  const sb = supabase();
  if (sb) {
    const res = await fetch(`${sb.url}/storage/v1/object/${sb.bucket}/${name}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${sb.key}`, "Content-Type": img.type, "x-upsert": "false", "cache-control": "31536000" },
      body: new Blob([img.data as BlobPart], { type: img.type }),
    });
    if (!res.ok) throw new Error(`Supabase upload failed (${res.status}): ${await res.text()}`);
    return { url: `${sb.url}/storage/v1/object/public/${sb.bucket}/${name}`, width: img.width, height: img.height };
  }

  const kv = await mediaKv();
  if (kv) {
    await kv.put(name, img.data, { metadata: { ct: img.type } });
    return { url: `/media/${name}`, width: img.width, height: img.height };
  }

  const { mkdir, writeFile } = await import("node:fs/promises");
  const path = await import("node:path");
  const target = path.join(await localDir(), name);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, img.data);
  return { url: `/media/${name}`, width: img.width, height: img.height };
}

export async function deleteImage(url: string) {
  try {
    const sb = supabase();
    if (sb && url.startsWith(`${sb.url}/storage/v1/object/public/${sb.bucket}/`)) {
      const name = url.slice(`${sb.url}/storage/v1/object/public/${sb.bucket}/`.length);
      await fetch(`${sb.url}/storage/v1/object/${sb.bucket}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${sb.key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ prefixes: [name] }),
      });
      return;
    }
    if (!url.startsWith("/media/")) return;
    const rel = url.slice("/media/".length);
    if (rel.includes("..")) return;
    const kv = await mediaKv();
    if (kv) return await kv.delete(rel);
    const { unlink } = await import("node:fs/promises");
    await unlink((await import("node:path")).join(await localDir(), rel));
  } catch {
    // Missing files are not an error.
  }
}
