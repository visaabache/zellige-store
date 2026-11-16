"use client";

import { useState } from "react";

const MAX = 1800;

/** Resizes a photo in the browser (max 1800 px, WebP or JPEG) so uploads stay small on every host. */
async function shrink(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 900_000 && /jpeg|webp/.test(file.type)) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.85));
    const out = blob && blob.type === "image/webp" ? blob : await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.86));
    if (!out) return file;
    const base = file.name.replace(/\.[^.]+$/, "");
    return new File([out], `${base}.${out.type === "image/webp" ? "webp" : "jpg"}`, { type: out.type });
  } catch {
    return file; // the browser cannot decode it (e.g. HEIC outside Safari): the server will validate it
  }
}

export function ImageFileInput({ name, multiple = false, required = false, className = "" }: { name: string; multiple?: boolean; required?: boolean; className?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <span className="inline-flex items-center gap-2">
      <input
        type="file"
        name={name}
        accept="image/jpeg,image/png,image/webp,image/avif,image/heic"
        multiple={multiple}
        required={required}
        className={className || "text-sm file:me-3 file:rounded-full file:border-0 file:bg-ivory-200 file:px-4 file:py-2 file:text-sm file:font-semibold"}
        onChange={async (e) => {
          const input = e.currentTarget;
          const files = Array.from(input.files || []);
          if (!files.length) return;
          setBusy(true);
          const resized = await Promise.all(files.map(shrink));
          const dt = new DataTransfer();
          resized.forEach((f) => dt.items.add(f));
          input.files = dt.files;
          setBusy(false);
        }}
      />
      {busy && <span className="text-xs text-charcoal-500">Optimising…</span>}
    </span>
  );
}
