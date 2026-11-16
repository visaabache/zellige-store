import { test } from 'node:test';
import assert from 'node:assert/strict';
import { productPage, trackPage, orderPage } from '../src/render.js';
import { shippingFor } from '../src/lib.js';

const settings = { store_name: 'Dar Zellij', whatsapp: '212600000000', shipping_fee: '45', free_shipping_over: '500', shipping_rates: '{"Casablanca":25,"Rabat":30}' };
const categories = [{ id: 1, slug: 'art-de-la-table', name_fr: 'Art de la table', name_ar: 'فن المائدة', name_en: 'Tableware' }];
const ctx = (lang = 'fr') => ({ lang, settings, categories, origin: 'https://zellige.example' });
const base = { id: 3, slug: 'mug', name_fr: 'Mug zellige', name_ar: 'كوب', name_en: 'Zellige mug', price: 129, images: '["/assets/photos/mug.webp"]', category_id: 1, desc_fr: '' };

test('a zellige-inspired piece never claims to be handmade', () => {
  for (const lang of ['fr', 'en', 'ar']) {
    const html = productPage(ctx(lang), { ...base, craft: 'inspired' }, categories[0], []);
    assert.match(html, /class="craft craft-inspired"/);
    assert.doesNotMatch(html, /craft-handmade|craft-artisan/);
  }
});

test('a handmade claim shows only with its note', () => {
  const without = productPage(ctx(), { ...base, craft: 'handmade' }, categories[0], []);
  assert.match(without, /craft-inspired/);
  assert.doesNotMatch(without, /craft-handmade/);
  const withNote = productPage(ctx(), { ...base, craft: 'handmade', craft_note_fr: 'Peint à la main à Fès <b>' }, categories[0], []);
  assert.match(withNote, /craft-handmade/);
  assert.match(withNote, /Peint à la main à Fès &lt;b&gt;/);
});

test('specifications list only the measurements that are filled in', () => {
  const html = productPage(ctx(), { ...base, width_cm: 9, capacity_ml: 350 }, categories[0], []);
  assert.match(html, /9 cm/);
  assert.match(html, /350 ml/);
  assert.doesNotMatch(html, /undefined|null g/);
});

test('delivery fee by city, default fee elsewhere, free from the threshold', () => {
  assert.equal(shippingFor('Casablanca', 129, settings), 25);
  assert.equal(shippingFor('Rabat', 129, settings), 30);
  assert.equal(shippingFor('Errachidia', 129, settings), 45);
  assert.equal(shippingFor('Casablanca', 500, settings), 0);
});

test('track page has the code and phone form; order page shows the code, parcel and history', () => {
  const tp = trackPage(ctx(), { code: '261116-AB12', error: true });
  assert.match(tp, /action="\/api\/track"/);
  assert.match(tp, /value="261116-AB12"/);
  const order = { id: 1, number: '261116-AB12', token: 't', status: 'shipped', lang: 'fr', name: 'A', phone: '212612345678', city: 'Casablanca', address: 'x', subtotal: 129, shipping: 25, total: 154, carrier: 'Amana', tracking_number: 'AM1<2', created_at: '2026-11-16 10:00:00' };
  const html = orderPage(ctx(), order, [], [{ status: 'new', at: '2026-11-16 10:00:00' }, { status: 'shipped', at: '2026-11-17 09:00:00' }]);
  assert.match(html, /261116-AB12/);
  assert.match(html, /Amana/);
  assert.match(html, /AM1&lt;2/);
  assert.match(html, /class="history"/);
});
