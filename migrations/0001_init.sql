-- Dar Zellij store schema (Cloudflare D1 / SQLite). Prices are whole Moroccan dirhams (MAD).

CREATE TABLE categories (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name_ar TEXT NOT NULL DEFAULT '',
  name_fr TEXT NOT NULL DEFAULT '',
  name_en TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  name_ar TEXT NOT NULL DEFAULT '',
  name_fr TEXT NOT NULL DEFAULT '',
  name_en TEXT NOT NULL DEFAULT '',
  desc_ar TEXT NOT NULL DEFAULT '',
  desc_fr TEXT NOT NULL DEFAULT '',
  desc_en TEXT NOT NULL DEFAULT '',
  desc_media TEXT NOT NULL DEFAULT '[]',
  price INTEGER NOT NULL CHECK (price >= 0),
  compare_price INTEGER,
  -- NULL means unlimited. The CHECK makes an order fail (and roll back) rather than oversell.
  stock INTEGER CHECK (stock IS NULL OR stock >= 0),
  options TEXT NOT NULL DEFAULT '',
  images TEXT NOT NULL DEFAULT '[]',
  featured INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0,
  -- How the piece is made, as the store can truthfully say it:
  --   inspired  = zellige-inspired design, no handmade claim
  --   artisan   = made by artisans (needs a craft note)
  --   handmade  = handmade, verified (needs a craft note)
  craft TEXT NOT NULL DEFAULT 'inspired' CHECK (craft IN ('inspired', 'artisan', 'handmade')),
  craft_note_ar TEXT NOT NULL DEFAULT '',
  craft_note_fr TEXT NOT NULL DEFAULT '',
  craft_note_en TEXT NOT NULL DEFAULT '',
  materials_ar TEXT NOT NULL DEFAULT '',
  materials_fr TEXT NOT NULL DEFAULT '',
  materials_en TEXT NOT NULL DEFAULT '',
  width_cm REAL,
  height_cm REAL,
  diameter_cm REAL,
  capacity_ml INTEGER,
  weight_g INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX products_category ON products(category_id);

CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,          -- also the customer's tracking code
  token TEXT NOT NULL,                  -- secret part of the customer's order link
  status TEXT NOT NULL DEFAULT 'new',
  name TEXT NOT NULL,
  phone TEXT NOT NULL,                  -- international form, 2126XXXXXXXX
  email TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL,
  address TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  admin_note TEXT NOT NULL DEFAULT '',
  lang TEXT NOT NULL DEFAULT 'fr',
  subtotal INTEGER NOT NULL,
  shipping INTEGER NOT NULL,
  total INTEGER NOT NULL,
  carrier TEXT NOT NULL DEFAULT '',
  tracking_number TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX orders_status ON orders(status, id);
CREATE INDEX orders_phone ON orders(phone, created_at);

-- What the customer sees on their tracking page: each status with its date.
CREATE TABLE order_events (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX order_events_order ON order_events(order_id, id);

CREATE TABLE order_items (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER, -- kept as a plain number so deleting a product keeps its past orders
  name TEXT NOT NULL,
  option TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL,
  qty INTEGER NOT NULL CHECK (qty > 0)
);
CREATE INDEX order_items_order ON order_items(order_id);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

-- Photos uploaded from the admin (shrunk in the browser first), so no R2 bucket is needed.
CREATE TABLE images (
  key TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  data BLOB NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Videos are stored in 1.5 MB pieces (a D1 value is limited to 2 MB).
CREATE TABLE media_chunks (
  key TEXT NOT NULL,
  idx INTEGER NOT NULL,
  data BLOB NOT NULL,
  PRIMARY KEY (key, idx)
);

-- Recent attempts (admin logins, orders, order lookups) per hashed visitor, to slow down guessing and spam.
CREATE TABLE rate_hits (
  bucket TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX rate_hits_bucket_at ON rate_hits (bucket, at);

CREATE TABLE posts (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title_ar TEXT NOT NULL DEFAULT '',
  title_fr TEXT NOT NULL DEFAULT '',
  title_en TEXT NOT NULL DEFAULT '',
  excerpt_ar TEXT NOT NULL DEFAULT '',
  excerpt_fr TEXT NOT NULL DEFAULT '',
  excerpt_en TEXT NOT NULL DEFAULT '',
  body_ar TEXT NOT NULL DEFAULT '',
  body_fr TEXT NOT NULL DEFAULT '',
  body_en TEXT NOT NULL DEFAULT '',
  cover TEXT NOT NULL DEFAULT '',
  published INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX posts_published ON posts(published, created_at);

CREATE TABLE redirects (
  path TEXT PRIMARY KEY,
  target TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Delivery fees are placeholders: set your courier's real rates in the admin (Réglages).
INSERT INTO settings (key, value) VALUES
  ('store_name', 'Dar Zellij'),
  ('whatsapp', ''),
  ('contact_email', ''),
  ('shipping_fee', '45'),
  ('shipping_rates', '{"Casablanca": 25, "Mohammedia": 25, "Rabat": 30, "Salé": 30, "Témara": 30, "Kénitra": 30, "Marrakech": 35, "Fès": 35, "Meknès": 35, "Tanger": 35, "El Jadida": 35, "Agadir": 40, "Tétouan": 40, "Oujda": 40, "Safi": 40, "Essaouira": 40, "Béni Mellal": 40, "Nador": 45, "Ouarzazate": 45, "Laâyoune": 60, "Dakhla": 70}'),
  ('free_shipping_over', '500'),
  ('announcement_ar', 'توصيل لجميع مدن المغرب · مجاني ابتداءً من 500 درهم · الدفع عند الاستلام'),
  ('announcement_fr', 'Livraison partout au Maroc · offerte dès 500 DH · Paiement à la livraison'),
  ('announcement_en', 'Delivery across Morocco · free from MAD 500 · Cash on delivery'),
  ('email_from', ''),
  ('notify_email', ''),
  ('email_status_updates', '1'),
  -- Urgency features from the original engine stay off: no countdown that restarts for every visitor,
  -- no "pieces left" number that is not the real stock.
  ('countdown', '0'),
  ('offer_left', '');
