/** Spreadsheet columns, in order. Product names and descriptions have one column per language. */
export const PRODUCT_COLUMNS = [
  "sku", "status", "slug", "category",
  "name_fr", "name_ar", "name_en",
  "short_fr", "short_ar", "short_en",
  "description_fr", "description_ar", "description_en",
  "materials_fr", "materials_ar", "materials_en",
  "price_mad", "compare_at_price_mad", "stock", "low_stock_threshold",
  "colors", "patterns", "craft_type",
  "width_cm", "height_cm", "depth_cm", "diameter_cm", "capacity_ml", "weight_g",
  "featured", "giftable", "images",
] as const;

export const VARIANT_COLUMNS = ["product_sku", "variant_sku", "name_fr", "name_ar", "name_en", "color", "pattern", "size", "price_mad", "stock", "active"] as const;
