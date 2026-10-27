/*
 * Unit tests for the money and stock rules — no server, no browser.
 *   npm run test:unit
 *
 * catalog.js is a browser script that attaches to `window`; it is run here
 * the way api/order.js runs it, so these are the functions production uses.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { text, e164, phoneKeyOf } from "../../lib/shop.mjs";
import { recomputeTotals, stockOf } from "../../api/admin.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const win = {};
new Function("window", "navigator", "localStorage", "location", fs.readFileSync(path.join(ROOT, "catalog.js"), "utf8"))(
  win, { languages: ["ar"] }, { getItem: () => null, setItem: () => {} }, { search: "" });
const STORE = win.STORE;
const cc = n => String.fromCharCode(n);

/* ------------------------------------------------------------ delivery */

test("delivery: the governorate's price from the owner's table", () => {
  const s = { deliveryPrices: { "sy-aleppo": 3, "sy-damascus": 5.5 } };
  assert.equal(STORE.deliveryFee(s, "sy-aleppo", 100), 3);
  assert.equal(STORE.deliveryFee(s, "sy-damascus", 100), 5.5);
});

test("delivery: a governorate with no price is null (to be agreed), never 0", () => {
  const s = { deliveryPrices: { "sy-aleppo": 3, "sy-hama": null } };
  assert.equal(STORE.deliveryFee(s, "sy-hama", 100), null);
  assert.equal(STORE.deliveryFee(s, "sy-homs", 100), null);
  assert.equal(STORE.deliveryFee({}, "sy-aleppo", 100), null);
  assert.equal(STORE.deliveryFee(null, "sy-aleppo", 100), null);
});

test("delivery: free at or above the owner's threshold, for any governorate", () => {
  const s = { deliveryPrices: { "sy-aleppo": 3 }, freeOver: 200 };
  assert.equal(STORE.deliveryFee(s, "sy-aleppo", 199.99), 3);
  assert.equal(STORE.deliveryFee(s, "sy-aleppo", 200), 0);
  assert.equal(STORE.deliveryFee(s, "sy-homs", 250), 0);
});

test("delivery: a zero or missing threshold never makes delivery free", () => {
  assert.equal(STORE.deliveryFee({ deliveryPrices: { "sy-aleppo": 3 }, freeOver: 0 }, "sy-aleppo", 9999), 3);
  assert.equal(STORE.deliveryFee({ deliveryPrices: { "sy-aleppo": 3 } }, "sy-aleppo", 9999), 3);
});

test("delivery: a priced zero is the owner's own free delivery, kept as 0", () => {
  assert.equal(STORE.deliveryFee({ deliveryPrices: { "sy-damascus": 0 } }, "sy-damascus", 10), 0);
});

test("delivery: garbage in the table is treated as no price", () => {
  const s = { deliveryPrices: { a: "3", b: -1, c: NaN, d: Infinity } };
  for (const city of ["a", "b", "c", "d"]) assert.equal(STORE.deliveryFee(s, city, 10), null, city);
});

/* -------------------------------------------------------------- totals */

const order = (lines, totals) => ({ lines, totals: { items: 0, delivery: null, discount: 0, grand: 0, ...totals } });

test("totals: line totals and the goods value are rounded to cents", () => {
  const o = recomputeTotals(order([{ unit: 19.99, qty: 3 }, { unit: 0.1, qty: 3 }]));
  assert.deepEqual(o.lines.map(l => l.total), [59.97, 0.3]);
  assert.equal(o.totals.items, 60.27);
  assert.equal(o.totals.grand, 60.27);
});

test("totals: grand = goods − discount + delivery", () => {
  const o = recomputeTotals(order([{ unit: 100, qty: 2 }], { delivery: 5, discount: 20 }));
  assert.equal(o.totals.grand, 185);
});

test("totals: a discount can never exceed the goods", () => {
  const o = recomputeTotals(order([{ unit: 10, qty: 1 }], { discount: 50, delivery: 3 }));
  assert.equal(o.totals.discount, 10);
  assert.equal(o.totals.grand, 3);
});

test("totals: delivery still to be agreed counts as nothing yet, and stays null", () => {
  const o = recomputeTotals(order([{ unit: 10, qty: 1 }], { delivery: null }));
  assert.equal(o.totals.grand, 10);
  assert.equal(o.totals.delivery, null);
});

/* --------------------------------------------------------------- stock */

test("stock: an explicit count wins; otherwise in stock means 1, out means 0", () => {
  assert.equal(stockOf({ stock: 7, inStock: false }), 7);
  assert.equal(stockOf({ stock: 0 }), 0);
  assert.equal(stockOf({ inStock: false }), 0);
  assert.equal(stockOf({ inStock: true }), 1);
  assert.equal(stockOf({}), 1);
});

test("catalogue: the owner's price and availability override the supplier's", () => {
  const base = STORE.merge({}).find(p => p.id === 35141);
  assert.ok(base && base.inStock);
  const merged = STORE.merge({ overrides: { 35141: { id: 35141, price: 199, inStock: false } } }).find(p => p.id === 35141);
  assert.equal(merged.price, 199);
  assert.equal(merged.inStock, false);
});

test("catalogue: a discount is derived from the old price, never invented", () => {
  const p = STORE.merge({ overrides: { 35141: { id: 35141, price: 150, oldPrice: 200 } } }).find(x => x.id === 35141);
  assert.equal(p.oldPrice, 200);
  assert.equal(p.discount, 25);
  const flat = STORE.merge({ overrides: { 35141: { id: 35141, price: 150, oldPrice: 100 } } }).find(x => x.id === 35141);
  assert.equal(flat.oldPrice, 150, "an old price below the price is ignored");
  assert.equal(flat.discount, 0);
});

test("catalogue: deleted products are gone, restored ones are back", () => {
  assert.equal(STORE.merge({ deleted: [35141] }).some(p => p.id === 35141), false);
  assert.equal(STORE.merge({ deleted: [] }).some(p => p.id === 35141), true);
});

/* -------------------------------------------------------- input rules */

test("text: trims, caps, and drops control and bidi-override characters", () => {
  assert.equal(text("  Ahmad  ", 80), "Ahmad");
  assert.equal(text("abcdef", 3), "abc");
  assert.equal(text(cc(0x202e) + "Ahmad" + cc(0x2066), 80), "Ahmad");
  assert.equal(text("a" + cc(7) + "b" + cc(0) + "c", 80), "abc");
  assert.equal(text("line1\r\nline2", 80), "line1\nline2");
  assert.equal(text(null, 80), "");
});

test("text: keeps Arabic and the LRM/RLM marks mixed text needs", () => {
  const arabic = "أحمد " + cc(0x200f) + "0949";
  assert.equal(text(arabic, 80), arabic);
});

test("phone: every way a Syrian number is typed becomes one E.164 number", () => {
  for (const typed of ["0949 951 985", "949951985", "+963949951985", "00963949951985", "963949951985", "(0949) 951-985"]) {
    assert.equal(e164(typed), "+963949951985", typed);
  }
  assert.equal(phoneKeyOf(e164("0949 951 985")), "963949951985");
});

test("phone: a foreign number behind + is kept; junk is refused", () => {
  assert.equal(e164("+90 532 123 4567"), "+905321234567");
  for (const bad of ["", "12345", "abc", "+12", "0949-95"]) assert.equal(e164(bad), "", bad);
});
