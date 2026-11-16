import { localDir, mediaKv } from "@/lib/storage";

export const runtime = "nodejs";

const TYPES: Record<string, string> = { webp: "image/webp", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", avif: "image/avif" };

/** Serves uploaded images from Workers KV (Cloudflare) or local storage (Node.js). */
export async function GET(_: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const rel = (await params).path.join("/");
  const ext = rel.split(".").pop()?.toLowerCase() || "";
  if (rel.includes("..") || rel.startsWith("/") || !TYPES[ext]) return new Response("Not found", { status: 404 });
  const headers = { "Content-Type": TYPES[ext], "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" };
  try {
    const kv = await mediaKv();
    if (kv) {
      const { value, metadata } = await kv.getWithMetadata(rel, "arrayBuffer");
      if (!value) return new Response("Not found", { status: 404 });
      return new Response(value, { headers: { ...headers, "Content-Type": metadata?.ct || TYPES[ext] } });
    }
    const { readFile } = await import("node:fs/promises");
    const file = await readFile((await import("node:path")).join(await localDir(), rel));
    return new Response(new Uint8Array(file), { headers });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
