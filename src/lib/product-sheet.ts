import "server-only";
import { readXlsx, writeXlsx } from "./xlsx";
import type { CraftType, Prisma, ProductStatus } from "@prisma/client";
import { prisma } from "./db";
import { parseCsv, rowsToObjects } from "./csv";
import { parseMoney } from "./money";
import { slugify } from "./utils";

export { PRODUCT_COLUMNS, VARIANT_COLUMNS } from "./sheet-columns";

const I18N = (r: Record<string, string>, base: string) => {
  const o: Record<string, string> = {};
  for (const l of ["fr", "ar", "en"]) if (r[`${base}_${l}`]) o[l] = r[`${base}_${l}`];
  return o;
};
const yes = (v?: string) => /^(1|yes|oui|true|x|نعم)$/i.test((v || "").trim());
const numOrNull = (v?: string) => {
  if (!v) return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const splitList = (v?: string) => [...new Set((v || "").split(/[,;|]/).map((x) => x.trim().toLowerCase()).filter(Boolean))];

export async function readSheet(file: File): Promise<{ products: Record<string, string>[]; variants: Record<string, string>[] }> {
  const buf = Buffer.from(await file.arrayBuffer());
  if (/\.csv$/i.test(file.name) || file.type === "text/csv") return { products: rowsToObjects(parseCsv(buf.toString("utf8"))), variants: [] };
  const sheets = readXlsx(new Uint8Array(buf));
  const find = (n: string) => sheets.find((x) => x.name.trim().toLowerCase() === n);
  const products = find("products") ?? sheets[0];
  return { products: products ? rowsToObjects(products.rows) : [], variants: rowsToObjects(find("variants")?.rows ?? []) };
}

export type ImportReport = { created: number; updated: number; variants: number; errors: { row: number; sku: string; message: string }[] };

const STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"];
const CRAFT = ["UNSPECIFIED", "ARTISAN_INSPIRED", "ARTISAN_MADE", "HANDMADE_VERIFIED"];

/** Creates or updates products by SKU. Empty cells leave existing values untouched on update. */
/** A problem with one row: reported and skipped, the rest of the file is imported. */
class RowError extends Error {}

export async function importProducts(sheet: Awaited<ReturnType<typeof readSheet>>, opts: { publish: boolean }): Promise<ImportReport> {
  const report: ImportReport = { created: 0, updated: 0, variants: 0, errors: [] };
  const categories = await prisma.category.findMany({ select: { id: true, slug: true } });
  const catBySlug = new Map(categories.map((c) => [c.slug, c.id]));
  // One interactive transaction: on Cloudflare Workers it runs over a single WebSocket, so a large file stays within
  // the per-request subrequest limit, and a database error leaves the catalog unchanged.
  await prisma.$transaction(async (tx) => {

  for (const [i, r] of sheet.products.slice(0, 5000).entries()) {
    const rowNo = i + 2;
    const sku = (r.sku || "").toUpperCase();
    try {
      if (!sku) throw new RowError("Missing SKU");
      const existing = await tx.product.findUnique({ where: { sku } });
      const name = I18N(r, "name");
      const price = parseMoney(r.price_mad);
      if (!existing && !Object.keys(name).length) throw new RowError("Missing name (name_fr, name_ar or name_en)");
      if (!existing && (price === null || price <= 0)) throw new RowError("Missing or invalid price_mad");
      const status = (STATUSES.includes((r.status || "").toUpperCase()) ? r.status.toUpperCase() : existing ? existing.status : opts.publish ? "PUBLISHED" : "DRAFT") as ProductStatus;
      const craft = CRAFT.includes((r.craft_type || "").toUpperCase()) ? (r.craft_type.toUpperCase() as CraftType) : undefined;
      if (craft === "ARTISAN_MADE" || craft === "HANDMADE_VERIFIED") throw new RowError("craft_type ARTISAN_MADE / HANDMADE_VERIFIED needs a craft note: set it in the product form");
      const categoryId = r.category ? catBySlug.get(slugify(r.category)) ?? null : undefined;
      if (r.category && !categoryId) throw new RowError(`Unknown category "${r.category}" (use the category slug)`);
      const compare = parseMoney(r.compare_at_price_mad);
      const data: Prisma.ProductUncheckedUpdateInput = {
        status,
        ...(Object.keys(name).length ? { name: { ...((existing?.name as object) || {}), ...name } } : {}),
        ...(Object.keys(I18N(r, "short")).length ? { shortDescription: { ...((existing?.shortDescription as object) || {}), ...I18N(r, "short") } } : {}),
        ...(Object.keys(I18N(r, "description")).length ? { description: { ...((existing?.description as object) || {}), ...I18N(r, "description") } } : {}),
        ...(Object.keys(I18N(r, "materials")).length ? { materials: { ...((existing?.materials as object) || {}), ...I18N(r, "materials") } } : {}),
        ...(price !== null ? { price } : {}),
        ...(r.compare_at_price_mad !== undefined && r.compare_at_price_mad !== "" ? { compareAtPrice: compare } : {}),
        ...(r.stock ? { stock: Math.max(0, Math.round(Number(r.stock)) || 0) } : {}),
        ...(r.low_stock_threshold ? { lowStockThreshold: Math.round(Number(r.low_stock_threshold)) || null } : {}),
        ...(r.colors ? { colors: splitList(r.colors) } : {}),
        ...(r.patterns ? { patterns: splitList(r.patterns) } : {}),
        ...(craft ? { craftType: craft } : {}),
        ...(categoryId !== undefined ? { categoryId } : {}),
        ...(r.width_cm ? { widthCm: numOrNull(r.width_cm) } : {}),
        ...(r.height_cm ? { heightCm: numOrNull(r.height_cm) } : {}),
        ...(r.depth_cm ? { depthCm: numOrNull(r.depth_cm) } : {}),
        ...(r.diameter_cm ? { diameterCm: numOrNull(r.diameter_cm) } : {}),
        ...(r.capacity_ml ? { capacityMl: Math.round(numOrNull(r.capacity_ml) ?? 0) || null } : {}),
        ...(r.weight_g ? { weightG: Math.round(numOrNull(r.weight_g) ?? 0) || null } : {}),
        ...(r.featured ? { featured: yes(r.featured) } : {}),
        ...(r.giftable ? { giftable: yes(r.giftable) } : {}),
        ...(status === "PUBLISHED" && !existing?.publishedAt ? { publishedAt: new Date() } : {}),
      };
      const images = (r.images || "").split(/[\s,|]+/).filter((u) => /^(https:\/\/|\/)/.test(u)).slice(0, 20);
      let productId: string;
      if (existing) {
        await tx.product.update({ where: { id: existing.id }, data });
        productId = existing.id;
        report.updated++;
      } else {
        let slug = slugify(r.slug || name.fr || name.en || sku) || slugify(sku);
        for (let n = 2; await tx.product.findUnique({ where: { slug }, select: { id: true } }); n++) slug = `${slugify(r.slug || name.fr || name.en || sku)}-${n}`;
        const created = await tx.product.create({ data: { ...(data as Prisma.ProductUncheckedCreateInput), sku, slug, name, price: price! } });
        productId = created.id;
        report.created++;
      }
      if (images.length) {
        const have = new Set((await tx.productImage.findMany({ where: { productId }, select: { url: true } })).map((x) => x.url));
        const base = await tx.productImage.count({ where: { productId } });
        const fresh = images.filter((u) => !have.has(u));
        if (fresh.length) await tx.productImage.createMany({ data: fresh.map((url, k) => ({ productId, url, sortOrder: base + k, alt: name })) });
      }
    } catch (e) {
      if (!(e instanceof RowError)) throw e;
      report.errors.push({ row: rowNo, sku, message: e.message.slice(0, 200) });
    }
  }

  for (const [i, r] of sheet.variants.slice(0, 10000).entries()) {
    const sku = (r.variant_sku || "").toUpperCase();
    try {
      const product = await tx.product.findUnique({ where: { sku: (r.product_sku || "").toUpperCase() }, select: { id: true } });
      if (!product) throw new RowError(`Unknown product_sku "${r.product_sku}"`);
      if (!sku) throw new RowError("Missing variant_sku");
      const name = I18N(r, "name");
      if (!Object.keys(name).length) throw new RowError("Missing variant name");
      const price = parseMoney(r.price_mad);
      const data = { name, color: r.color || null, pattern: r.pattern || null, size: r.size || null, price: price && price > 0 ? price : null, stock: Math.max(0, Math.round(Number(r.stock)) || 0), isActive: r.active ? yes(r.active) : true };
      await tx.productVariant.upsert({ where: { sku }, create: { ...data, sku, productId: product.id }, update: data });
      report.variants++;
    } catch (e) {
      if (!(e instanceof RowError)) throw e;
      report.errors.push({ row: i + 2, sku: `variants:${sku}`, message: e.message.slice(0, 200) });
    }
  }
  }, { timeout: 120_000, maxWait: 15_000 });
  return report;
}

export async function exportRows() {
  const products = await prisma.product.findMany({ orderBy: { createdAt: "asc" }, include: { category: true, images: { orderBy: { sortOrder: "asc" } }, variants: { orderBy: { sortOrder: "asc" } } } });
  const t = (v: unknown, l: string) => ((v as Record<string, string> | null)?.[l] ?? "");
  const money = (c: number | null) => (c === null ? "" : (c / 100).toFixed(2));
  const productRows = products.map((p) => [
    p.sku, p.status, p.slug, p.category?.slug ?? "",
    t(p.name, "fr"), t(p.name, "ar"), t(p.name, "en"),
    t(p.shortDescription, "fr"), t(p.shortDescription, "ar"), t(p.shortDescription, "en"),
    t(p.description, "fr"), t(p.description, "ar"), t(p.description, "en"),
    t(p.materials, "fr"), t(p.materials, "ar"), t(p.materials, "en"),
    money(p.price), money(p.compareAtPrice), p.stock, p.lowStockThreshold ?? "",
    p.colors.join(", "), p.patterns.join(", "), p.craftType,
    p.widthCm ?? "", p.heightCm ?? "", p.depthCm ?? "", p.diameterCm ?? "", p.capacityMl ?? "", p.weightG ?? "",
    p.featured ? "yes" : "no", p.giftable ? "yes" : "no", p.images.map((i) => i.url).join(" "),
  ]);
  const variantRows = products.flatMap((p) => p.variants.map((v) => [p.sku, v.sku, t(v.name, "fr"), t(v.name, "ar"), t(v.name, "en"), v.color ?? "", v.pattern ?? "", v.size ?? "", money(v.price), v.stock, v.isActive ? "yes" : "no"]));
  return { productRows, variantRows };
}

export async function toXlsx(sheets: { name: string; header: readonly string[]; rows: unknown[][] }[]) {
  return writeXlsx(sheets.map((s) => ({ name: s.name, rows: [[...s.header], ...s.rows.map((r) => r.map((v) => (v === null || v === undefined ? "" : typeof v === "number" ? v : String(v))))] })));
}
