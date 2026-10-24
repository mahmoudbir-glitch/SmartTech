/*
 * POST /api/order — create an order.
 * ==================================
 * The only unauthenticated write path in the system, which is why every line
 * of it is defensive and why it never touches `store-state.json`:
 *
 *  - the owner's product save is guarded by an ETag on the state blob, so an
 *    order written into it would fail his save with «غُيّر هذا المنتج من جهاز
 *    آخر» while he edits a price — a lie he cannot act on;
 *  - `mutate()` keeps twenty rolling backups of that document, so twenty
 *    orders would flush every catalogue backup he has, in an afternoon;
 *  - and an anonymous write path has no business anywhere near
 *    `state.logins`, the admin's own brute-force table.
 *
 * Orders live in their own blobs: one per order, a per-month index that also
 * carries the day counters, and `open.json` as the working set.
 *
 * The reference is `SY-YYMMDD-NNN`, sequential within the day. Not random:
 * two random suffixes collide on the same day and the shop never learns which
 * order it was looking at; a sequence is a free daily count; and a gap in a
 * sequence is how a lost write gets noticed. The order blob is written first
 * with `allowOverwrite: false`, so a duplicate reference fails loudly and the
 * blob itself is the lock that makes the number unique.
 */
import crypto from "crypto";
import { get, put, BlobPreconditionFailedError } from "@vercel/blob";

const V = 1;
const STATE_PATH = "data/store-state.json";
const RATE_PATH = "data/orders/rate.json";
const OPEN_PATH = "data/orders/open.json";

const MAX_LINES = 40;
const MAX_QTY = 20;
const RETRIES = 3;

/* Fifteen attempts an hour from one caller is far more than a shopper makes
   and far less than a script wants; the minute window stops a double-tap
   storm. Six a minute, not three, because a rejected attempt costs quota too
   and a customer mistyping a phone number must not lock themselves out. */
const HOUR = 3600000;
const HOUR_MAX = 15;
const MINUTE = 60000;
const MINUTE_MAX = 6;

/* Keys, never labels. `deliveryPrices["sy-aleppo"]` can be added later without
   touching one stored order, and the `sy-` prefix is what makes the first
   order shipped abroad a select change rather than a data migration. */
const CITIES = new Set([
  "sy-damascus", "sy-rural-damascus", "sy-aleppo", "sy-homs", "sy-hama",
  "sy-latakia", "sy-tartus", "sy-idlib", "sy-deir-ez-zor", "sy-raqqa",
  "sy-hasakah", "sy-daraa", "sy-as-suwayda", "sy-quneitra"
]);
const LANGS = new Set(["ar", "en", "tr"]);
const CHANNELS = new Set(["web", "phone", "store", "whatsapp"]);

const fail = (res, status, code, extra) =>
  res.status(status).json(Object.assign({ ok: false, error: code }, extra || {}));

const digest = (key, value) => crypto.createHmac("sha256", key).update(String(value)).digest();

/* Callers are keyed by a hash, so no stored document ever holds an address. */
function callerKey(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const ip = forwarded || (req.socket && req.socket.remoteAddress) || "unknown";
  return digest("caller", ip).toString("hex").slice(0, 16);
}

/* A request's Host header is attacker-controlled and must never decide where
   this function loads code from. */
const SITE_FALLBACK = "https://smarttech-mahmoudbir.vercel.app";
function trustedOrigin() {
  const host = process.env.SITE_ORIGIN || process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL || SITE_FALLBACK;
  return /^https?:\/\//.test(host) ? host : "https://" + host;
}

/*
 * Vercel compiles these functions from ESM to CommonJS, where import.meta does
 * not exist — using it made every product page throw in production while
 * working perfectly under the dev server. __dirname is what the compiled
 * output provides, and the files named in includeFiles sit one level above it.
 */
async function readSource(name) {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const bases = [];
  if (typeof __dirname !== "undefined") bases.push(path.join(__dirname, ".."), __dirname);
  bases.push(process.cwd());
  for (const base of bases) {
    try { return await fs.readFile(path.join(base, name), "utf8"); } catch (e) { /* next */ }
  }
  // Last resort: our own deployment over HTTP, never a Host-derived address.
  return fetch(trustedOrigin() + "/" + name).then(r => {
    if (!r.ok) throw new Error("cannot read " + name + ": HTTP " + r.status);
    return r.text();
  });
}

/* ------------------------------------------------------------------ blobs */

async function readJson(pathname, fallback) {
  const blob = await get(pathname, { access: "private", useCache: false });
  if (!blob) return { value: fallback, etag: null, exists: false };
  const body = await new Response(blob.stream).text();
  let parsed;
  try { parsed = JSON.parse(body); } catch (e) { throw new Error("corrupt_blob:" + pathname); }
  return { value: parsed, etag: (blob.blob && blob.blob.etag) || null, exists: true };
}

function writeJson(pathname, value, options) {
  return put(pathname, JSON.stringify(value), Object.assign({
    access: "private", contentType: "application/json", addRandomSuffix: false
  }, options || {}));
}

/* Read → change → write with an ETag check, the same optimistic-concurrency
   pattern api/admin.js uses on the state document. */
async function mutateJson(pathname, fallback, change) {
  for (let attempt = 0; ; attempt++) {
    const { value, etag, exists } = await readJson(pathname, fallback);
    const result = change(value);
    try {
      await writeJson(pathname, value, etag ? { ifMatch: etag } : exists ? { allowOverwrite: true } : { allowOverwrite: false });
      return result;
    } catch (e) {
      const conflict = e instanceof BlobPreconditionFailedError || /exist/i.test((e && e.message) || "");
      if (conflict && attempt < RETRIES) continue;
      throw e;
    }
  }
}

/* ------------------------------------------------------------- rate limit */

async function rateLimited(key) {
  return mutateJson(RATE_PATH, {}, table => {
    const now = Date.now();
    for (const [k, hits] of Object.entries(table)) {
      const kept = (hits || []).filter(at => now - at < HOUR);
      if (kept.length) table[k] = kept; else delete table[k];
    }
    const mine = table[key] || [];
    if (mine.filter(at => now - at < MINUTE).length >= MINUTE_MAX) return Math.ceil(MINUTE / 1000);
    if (mine.length >= HOUR_MAX) return Math.ceil((HOUR - (now - mine[0])) / 1000);
    mine.push(now);
    table[key] = mine;
    return 0;
  });
}

/* -------------------------------------------------------- the catalogue */

/* catalog.js and i18n.js are plain scripts that attach to `window`; running
   them in a bare sandbox is exactly what api/p.js does, and it keeps the
   server's idea of a price identical to the browser's. */
let win = null;
async function loadStore() {
  if (win) return win;
  const [i18nSrc, catalogSrc] = await Promise.all([readSource("i18n.js"), readSource("catalog.js")]);
  const sandbox = {};
  const nav = { languages: ["ar"] };
  const storage = { getItem: () => null, setItem: () => {} };
  const loc = { search: "" };
  const doc = {
    addEventListener() {}, removeEventListener() {},
    querySelector: () => null, querySelectorAll: () => [],
    documentElement: { dataset: {}, style: { setProperty() {} }, classList: { add() {}, remove() {} } },
    body: null, title: ""
  };
  new Function("window", "navigator", "localStorage", "location", "document", i18nSrc)(sandbox, nav, storage, loc, doc);
  new Function("window", "navigator", "localStorage", "location", "document", catalogSrc)(sandbox, nav, storage, loc, doc);
  win = sandbox;
  return win;
}

const copyCache = {};
async function loadCopy(code) {
  if (copyCache[code]) return copyCache[code];
  try { copyCache[code] = JSON.parse(await readSource("assets/copy." + code + ".json")); }
  catch (e) { copyCache[code] = {}; }
  return copyCache[code];
}

async function liveCatalogue() {
  const store = await loadStore();
  let state = {};
  try { state = (await readJson(STATE_PATH, {})).value || {}; } catch (e) { state = {}; }
  const products = store.STORE.merge(state);
  const settings = (state.settings && typeof state.settings === "object") ? state.settings : {};
  return { products, settings, store };
}

/* A line snapshots what the shopper was shown and never joins back to the
   product, so a rename or a reprice next week cannot rewrite an order placed
   today. All three languages, because the owner reads Arabic and the customer
   may not. */
async function snapshotNames(product) {
  const [ar, en, tr] = await Promise.all([loadCopy("ar"), loadCopy("en"), loadCopy("tr")]);
  const id = String(product.id);
  return {
    ar: (product.name && product.nameAr) || (ar[id] && ar[id].n) || product.name || "",
    en: product.nameEn || (en[id] && en[id].n) || product.name || "",
    tr: product.nameTr || (tr[id] && tr[id].n) || product.name || ""
  };
}

/* -------------------------------------------------------------- cleaning */

const text = (value, max) => String(value == null ? "" : value).trim().slice(0, max);

/* Accepts 09XXXXXXXX, 9XXXXXXXX, +9639XXXXXXXX, 009639XXXXXXXX, and any 8–15
   digits behind a leading + so a Turkish customer is not locked out. */
function e164(raw) {
  let value = String(raw || "").replace(/[\s()\-.\u00a0]/g, "");
  if (/^00\d+$/.test(value)) value = "+" + value.slice(2);
  if (/^\+\d+$/.test(value)) {
    const digits = value.slice(1);
    return digits.length >= 8 && digits.length <= 15 ? "+" + digits : "";
  }
  if (!/^\d+$/.test(value)) return "";
  if (/^09\d{8}$/.test(value)) return "+963" + value.slice(1);
  if (/^9\d{8}$/.test(value)) return "+963" + value;
  if (/^963\d{9}$/.test(value)) return "+" + value;
  return "";
}

/* `0949 951 985`, `+963949951985` and `963949951985` must be one customer. */
const phoneKeyOf = phone => String(phone || "").replace(/\D/g, "");

function cleanCustomer(raw) {
  const c = raw && typeof raw === "object" ? raw : {};
  const phone = e164(c.phone);
  if (!phone) throw new Error("invalid_phone");
  const name = text(c.name, 80);
  if (name.length < 2) throw new Error("invalid_name");
  const city = text(c.city, 40);
  if (!CITIES.has(city)) throw new Error("invalid_city");
  const address = text(c.address, 300);
  if (address.length < 6) throw new Error("invalid_address");
  const email = text(c.email, 120);
  if (email && !/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(email)) throw new Error("invalid_email");
  return { name, phone, phoneKey: phoneKeyOf(phone), city, address, email, note: text(c.note, 500) };
}

/* ---------------------------------------------------------- the reference */

function stamps(now) {
  const d = new Date(now);
  const yy = String(d.getUTCFullYear()).slice(2);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return { day: yy + mm + dd, month: yy + mm };
}

const indexPath = month => "data/orders/" + month + "/index.json";
const orderPath = (month, no) => "data/orders/" + month + "/" + no + ".json";

const DEV_SECRET = "smarttech-order-url-dev-secret";
function orderSecret() {
  const secret = process.env.ORDER_URL_SECRET || process.env.ADMIN_SECRET || "";
  if (secret) return secret;
  console.error("ORDER_URL_SECRET is not set; confirmation links are using a development key");
  return DEV_SECRET;
}
/* Sequential references are guessable by design, so the public URL carries a
   capability rather than relying on the number being secret. */
const tokenFor = ref => crypto.createHmac("sha256", orderSecret()).update(String(ref)).digest("hex").slice(0, 6);

const rowOf = order => ({
  no: order.no, at: order.createdAt, st: order.status, pay: order.payment.state,
  name: order.customer.name, phone: order.customer.phone, city: order.customer.city,
  goods: order.totals.items, grand: order.totals.grand, n: order.lines.length,
  cid: order.meta.clientOrderId, contacted: false
});

/* --------------------------------------------------------------- email */

/*
 * Resend is not in this release. The fields exist so that switching it on is a
 * function change and not a schema change, and nothing anywhere depends on the
 * result of this call.
 */
async function sendEmails(order) {
  if (!process.env.RESEND_API_KEY) {
    return { emailOwner: "unconfigured", emailCustomer: "unconfigured" };
  }
  return { emailOwner: "skipped", emailCustomer: order.customer.email ? "skipped" : "skipped" };
}

/* ---------------------------------------------------------------- handler */

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return fail(res, 405, "method_not_allowed");

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body || "{}"); } catch (e) { body = {}; } }
  if (!body || typeof body !== "object") body = {};

  try {
    const wait = await rateLimited(callerKey(req));
    if (wait) {
      res.setHeader("Retry-After", String(wait));
      return fail(res, 429, "too_many_orders");
    }
  } catch (e) {
    /* A rate-limit blob that cannot be read must not stop a real customer
       buying. It is a guard, not a gate. */
    console.error("rate limit unavailable", e);
  }

  try {
    const clientOrderId = text(body.clientOrderId, 64);
    if (!clientOrderId) return fail(res, 400, "missing_client_order_id");

    const lang = LANGS.has(String(body.lang)) ? String(body.lang) : "ar";
    const channel = CHANNELS.has(String(body.channel)) ? String(body.channel) : "web";
    const customer = cleanCustomer(body.customer);

    const wanted = Array.isArray(body.lines) ? body.lines.slice(0, MAX_LINES) : [];
    if (!wanted.length) return fail(res, 400, "empty_order");

    const { products, settings } = await liveCatalogue();
    const byId = new Map(products.map(p => [String(p.id), p]));

    const out = [];
    const lines = [];
    let drift = false;

    for (const raw of wanted) {
      const id = String((raw && (raw.pid != null ? raw.pid : raw.id)) || "");
      const product = byId.get(id);
      if (!product) { out.push(id); continue; }
      /* Re-checked here and not only in the browser: the customer's tab may
         have been open for an hour. */
      if (product.inStock === false) { out.push(id); continue; }

      const qty = Math.min(MAX_QTY, Math.max(1, Math.round(Number(raw.qty) || 1)));
      const unit = Math.round(Number(product.price) * 100) / 100;
      const claimed = Number(raw.unit);
      if (Number.isFinite(claimed) && Math.abs(claimed - unit) > 0.005) drift = true;

      const names = await snapshotNames(product);
      lines.push({
        pid: product.id,
        variant: text(raw.variant, 60),
        sku: product.sku || "ST" + product.id,
        /* One string, in the language the customer shopped in — the shape the
           admin list and the printed invoice read. `names` carries the other
           two so the owner never has to read a language he does not. */
        name: names[lang] || names.ar || product.name,
        names,
        qty,
        unit,
        total: Math.round(unit * qty * 100) / 100,
        inStockAtOrder: true
      });
    }

    /* An order the shop cannot fill must not become a record. This is the one
       failure the fallback rule does not cover, because the thing that changed
       is the customer's information, not our storage. */
    if (out.length) return fail(res, 409, "out_of_stock", { ids: out });
    if (!lines.length) return fail(res, 400, "empty_order");

    const items = Math.round(lines.reduce((sum, l) => sum + l.total, 0) * 100) / 100;
    const now = Date.now();
    const { day, month } = stamps(now);
    const prefix = (text(settings.orderPrefix, 8) || "SY").toUpperCase();
    const email = await sendEmails({ customer });

    const order = {
      no: "",
      v: V,
      createdAt: now,
      channel,
      lang,

      status: "new",
      statusAt: now,
      contacted: false,
      cancelReason: "",
      assignedTo: "",

      customer,
      lines,

      totals: { items, delivery: null, discount: 0, grand: null, currency: "USD" },
      /* null renders «يُتفق عليه». Zero and unknown are different, and $0.00
         would promise free delivery the shop has not agreed to. */
      delivery: { method: "courier", city: customer.city, fee: null, promisedAt: null, note: "" },
      payment: { method: "cod", state: "unpaid", paid: 0, at: null, ref: "", provider: "" },

      notes: [],
      history: [{ at: now, by: "system", field: "status", from: "", to: "new" }],
      email: { lastType: "", lastAt: 0, lastState: "" },
      meta: {
        source: text(body.source, 20) || "cart",
        clientOrderId,
        priceDrift: drift,
        emailOwner: email.emailOwner,
        emailCustomer: email.emailCustomer,
        recoveredAt: null
      }
    };

    const written = await allocate(order, month, day, prefix);
    if (written.duplicate) {
      return res.status(200).json({
        ok: true, ref: written.no, token: tokenFor(written.no),
        url: "/o/" + written.no + "-" + tokenFor(written.no),
        goods: written.goods, duplicate: true
      });
    }

    await patchOpen(order).catch(e => console.error("open.json patch failed", e));

    return res.status(200).json({
      ok: true, ref: order.no, token: tokenFor(order.no),
      url: "/o/" + order.no + "-" + tokenFor(order.no),
      goods: order.totals.items, priceDrift: drift
    });
  } catch (e) {
    const code = /^invalid_|^missing_|^empty_/.test((e && e.message) || "") ? e.message : "server_error";
    if (code === "server_error") console.error("order api error", e);
    return fail(res, code === "server_error" ? 500 : 400, code);
  }
}

/*
 * Mint the number and write the record.
 *
 * The order blob goes first with `allowOverwrite: false`, so two callers who
 * read the same counter cannot both keep the number: the loser's write throws
 * and it retries with the next one. The index write is then an ETag retry, and
 * because the blob is already on disk under our reference the retry only has
 * to re-apply the bookkeeping.
 */
async function allocate(order, month, day, prefix) {
  const path = indexPath(month);

  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    const { value, etag, exists } = await readJson(path, { seq: {}, rows: [] });
    const index = normalizeIndex(value);

    /* Idempotency: a double-tap, a retry from the degraded path, or a browser
       that re-sent the request must not create a second order. */
    const seen = index.rows.find(r => r && r.cid && r.cid === order.meta.clientOrderId);
    if (seen) return { duplicate: true, no: seen.no, goods: seen.goods };

    const next = Number(index.seq[day] || 0) + 1;
    const no = prefix + "-" + day + "-" + String(next).padStart(3, "0");
    order.no = no;

    try {
      await writeJson(orderPath(month, no), order, { allowOverwrite: false });
    } catch (e) {
      /* Somebody already holds this number. Re-read and take the next one. */
      if (attempt < RETRIES) continue;
      throw e;
    }

    index.seq[day] = next;
    index.rows.push(rowOf(order));
    try {
      await writeJson(path, index, etag ? { ifMatch: etag } : exists ? { allowOverwrite: true } : { allowOverwrite: false });
      return { duplicate: false, no, goods: order.totals.items };
    } catch (e) {
      const conflict = e instanceof BlobPreconditionFailedError || /exist/i.test((e && e.message) || "");
      if (!conflict) throw e;
      /* The record exists under `no`; only the bookkeeping lost the race.
         Re-apply it onto whatever landed, and never lose the row. */
      const recovered = await mutateJson(path, { seq: {}, rows: [] }, current => {
        const fixed = normalizeIndex(current);
        current.seq = fixed.seq;
        current.rows = fixed.rows;
        if (!current.rows.some(r => r && r.no === no)) current.rows.push(rowOf(order));
        current.seq[day] = Math.max(Number(current.seq[day] || 0), next);
        return true;
      }).catch(err => { console.error("order index write failed for " + no, err); return false; });
      return { duplicate: false, no, goods: order.totals.items, indexed: recovered };
    }
  }
  throw new Error("server_error");
}

function normalizeIndex(value) {
  const v = value && typeof value === "object" ? value : {};
  if (!v.seq || typeof v.seq !== "object") v.seq = {};
  if (!Array.isArray(v.rows)) v.rows = [];
  return v;
}

/* The working set: every order that is not finished. The morning screen must
   be one read, not N. */
function patchOpen(order) {
  return mutateJson(OPEN_PATH, { rows: [] }, current => {
    if (!Array.isArray(current.rows)) current.rows = [];
    if (!current.rows.some(r => r && r.no === order.no)) current.rows.unshift(rowOf(order));
    if (current.rows.length > 500) current.rows.length = 500;
    return true;
  });
}
