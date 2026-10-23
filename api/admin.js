/*
 * SmartTech — the administration console's server.
 *
 * Everything the console does goes through this one function behind
 * `?action=`, so the project stays inside its Vercel function budget. The
 * parts that were already right are kept exactly as they were and are marked
 * PRESERVED below:
 *
 *   - sessions signed with a key derived from the password, plus a revocation
 *     stamp so "sign out" invalidates the cookie and not just the browser copy;
 *   - brute-force lockout: five tries, then a doubling wait, with the caller
 *     keyed by a hash so no address is ever written to storage;
 *   - `ifMatch` optimistic concurrency on the state blob, with a retry;
 *   - a per-product `seenAt` check that answers `edited_elsewhere`;
 *   - `action=stock`, which flips only `inStock` and never writes a stale
 *     snapshot of everything else.
 *
 * Two things were wrong and are fixed here:
 *
 *   1. `mutate()` wrote the backup *after* the change, so the newest backup was
 *      the mistake and the one recovery button restored it. Measured: save 111,
 *      save 222, restore -> 222. The snapshot is now taken from the body as it
 *      was *before* the change, and every backup is reachable by name.
 *   2. The category allow-list was a hard-coded Set, so a new department needed
 *      a deploy. Categories are validated against the stored taxonomy.
 *
 * Orders live in their own blobs and never touch `data/store-state.json`: a
 * customer checking out while the owner edits a price must not make the owner's
 * save fail, and twenty orders must not flush every catalogue backup he has.
 *
 * The session helpers are exported so `api/orders.js` can reuse them rather
 * than inventing a second way to be logged in.
 *
 * Vercel compiles this file from ESM to CommonJS, where `import.meta` does not
 * exist. Anything read from disk goes through `readSource` / `readAsset`, which
 * use `__dirname`.
 */
import crypto from "crypto";
import { get, put, list, del, issueSignedToken, presignUrl, parseStoreIdFromDelegationToken, BlobPreconditionFailedError } from "@vercel/blob";

const COOKIE = "syriatech_admin";
const STATE_PATH = "data/store-state.json";
const BACKUP_PREFIX = "data/backups/store-state.";
const DAILY_PREFIX = "data/backups/daily/store-state.";
const TAXONOMY_PATH = "data/taxonomy.json";
const CONTENT_PATH = "data/content.json";
const GALLERY_PATH = "data/gallery.json";
const ORDERS_OPEN = "data/orders/open.json";
const SESSION_MS = 12 * 60 * 60 * 1000;
const IMAGE_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const PAGE_SIZE = 40;
const MAX_GALLERY = 12;

/* The console never renders a sentence the server sent. It answers with a code
   and `i18n-admin.js` turns it into the owner's language. */
const CODES = new Set([
  "missing_env", "invalid_password", "unauthorized", "forbidden", "product_required", "name_required",
  "invalid_price", "invalid_category", "invalid_image", "invalid_id", "invalid_whatsapp",
  "invalid_email", "unsupported_image", "image_too_large", "corrupt_state", "no_backup",
  "edited_elsewhere", "too_many_attempts", "unknown_action", "server_error",
  "invalid_order", "order_not_found", "bad_transition", "reason_required", "phone_required",
  "customer_name_required", "city_required", "address_required", "invalid_qty",
  "refund_too_large", "payment_too_large", "invalid_node", "node_has_products",
  "slug_taken", "invalid_answer", "answer_too_long", "brackets_not_allowed",
  "too_many_images", "confirm_mismatch", "last_owner", "login_taken", "weak_password",
  "no_lines", "discount_too_large", "invalid_date"
]);

const fail = (res, status, code) => res.status(status).json({ ok: false, error: code });
const env = () => ({ password: process.env.ADMIN_PASSWORD || "", secret: process.env.ADMIN_SECRET || "" });
const digest = (key, value) => crypto.createHmac("sha256", key).update(String(value)).digest();
const safeEqual = (a, b) => crypto.timingSafeEqual(digest("compare", a), digest("compare", b));

/* ------------------------------------------------------------- sessions ----
 * PRESERVED. The signing key includes the password, so changing
 * ADMIN_PASSWORD (or ADMIN_SECRET) in Vercel logs every open session out.
 * The payload now carries a user id and a role so a second account is possible
 * without a second mechanism; the break-glass password is always the owner.
 */
function signSession(payload) {
  const { password, secret } = env();
  return digest(secret + "|" + digest("pw", password).toString("hex"), payload).toString("base64url");
}
export function newSessionCookie(user) {
  const claims = {
    exp: Date.now() + SESSION_MS, iat: Date.now(),
    u: (user && user.id) || "owner", r: (user && user.role) || "owner"
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${COOKIE}=${payload}.${signSession(payload)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_MS / 1000}`;
}

/*
 * Brute force protection. PRESERVED.
 *
 * The only defence used to be an 800ms pause inside each request, which does
 * nothing against an attacker running attempts in parallel — thirty wrong
 * passwords finished in 1.2 seconds. The owner picks this password, so it has
 * to be a real counter: five tries, then a wait that doubles.
 */
const MAX_TRIES = 5;
const FIRST_LOCK = 60000;      // a minute after the fifth wrong password
const MAX_LOCK = 3600000;      // never more than an hour

// Callers are keyed by a hash, so the stored document never holds an address.
export function callerKey(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const ip = forwarded || req.socket?.remoteAddress || "unknown";
  return digest("caller", ip).toString("hex").slice(0, 16);
}
function lockedUntil(entry) {
  return entry && Number(entry.until) > Date.now() ? Number(entry.until) : 0;
}
// Drop entries nobody is waiting on, so the map cannot grow without bound.
function pruneLogins(logins) {
  const now = Date.now();
  for (const [key, entry] of Object.entries(logins)) {
    if (!lockedUntil(entry) && Number(entry.seen || 0) < now - 86400000) delete logins[key];
  }
  const keys = Object.keys(logins);
  if (keys.length > 500) keys.slice(0, keys.length - 500).forEach(k => delete logins[k]);
}

/* Cached per warm instance. PRESERVED — Vercel runs many instances and only the
   one that handled the sign-out learned about it, so a revoked cookie stayed
   valid elsewhere for the rest of its 12 hours. A short TTL bounds that to
   seconds without reading the blob on every request. */
let revokedBefore = null;
let revokedAt = 0;
const STAMP_TTL = 10000;

/* Returns the signed-in user ({id, role}) or null. Exported for api/orders.js. */
export async function sessionUser(req) {
  const { password, secret } = env();
  if (!password || !secret) return null;
  if (revokedBefore === null || Date.now() - revokedAt > STAMP_TTL) {
    try { await readState(); } catch (e) { if (revokedBefore === null) revokedBefore = 0; }
  }
  // A second cookie of the same name must not be able to lock the owner out,
  // so every candidate is checked rather than only the first.
  const candidates = (req.headers.cookie || "").split(";").map(x => x.trim())
    .filter(x => x.startsWith(COOKIE + "="))
    .map(x => x.slice(COOKIE.length + 1));
  for (const value of candidates) {
    const [payload, signature] = value.split(".");
    if (!payload || !signature || !safeEqual(signature, signSession(payload))) continue;
    try {
      const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
      if (!(claims.exp > Date.now())) continue;
      if (revokedBefore && Number(claims.iat || 0) <= revokedBefore) continue;
      return { id: String(claims.u || "owner"), role: String(claims.r || "owner") };
    } catch { continue; }
  }
  return null;
}
export async function isAuthed(req) { return (await sessionUser(req)) !== null; }

/* Hiding a button is a courtesy; this is the control. */
const GRANTS = {
  owner: ["*"],
  staff: ["orders.view", "orders.status", "orders.cancel", "orders.note", "stock.edit", "products.view", "reports.none"],
  editor: ["products.view", "products.edit", "media.edit", "content.edit", "taxonomy.edit"]
};
export function may(user, permission) {
  const role = (user && user.role) || "";
  const grants = GRANTS[role] || [];
  return grants.includes("*") || grants.includes(permission);
}
function requireRole(user, permission) {
  if (!may(user, permission)) throw new Error("forbidden");
}

/* ----------------------------------------------------------- blob helpers */

function normalizeState(s) {
  const state = s && typeof s === "object" ? s : {};
  return {
    overrides: state.overrides && typeof state.overrides === "object" && !Array.isArray(state.overrides) ? state.overrides : {},
    additions: Array.isArray(state.additions) ? state.additions : [],
    deleted: Array.isArray(state.deleted) ? state.deleted.map(Number).filter(Boolean) : [],
    settings: state.settings && typeof state.settings === "object" ? state.settings : {},
    // Failed sign-in attempts per caller. Never served to anyone: api/products.js
    // publishes only the public settings.
    logins: state.logins && typeof state.logins === "object" && !Array.isArray(state.logins) ? state.logins : {}
  };
}

// Missing file = empty store. PRESERVED: any other failure throws, so a
// temporary Blob error can never be mistaken for "no data" and overwrite the
// saved products.
async function readState() {
  const blob = await get(STATE_PATH, { access: "private", useCache: false });
  if (!blob) { revokedBefore = 0; revokedAt = Date.now(); return { state: normalizeState({}), etag: null, exists: false, raw: "" }; }
  const body = await new Response(blob.stream).text();
  let parsed;
  try { parsed = JSON.parse(body); } catch { throw new Error("corrupt_state"); }
  // A structurally wrong document must not be silently emptied and saved back.
  const usable = parsed && typeof parsed === "object" && !Array.isArray(parsed) &&
    ["overrides", "additions", "deleted", "settings"].some(k => k in parsed);
  if (!usable) throw new Error("corrupt_state");
  const normalized = normalizeState(parsed);
  revokedBefore = Number(normalized.settings.revokedBefore || 0);
  revokedAt = Date.now();
  return { state: normalized, etag: blob.blob.etag || null, exists: true, raw: body };
}

/*
 * THE FIX. Read → snapshot → change → write, with an ETag check and a retry.
 *
 * The snapshot is of `before`, the body as it stood when this save started.
 * The old code wrote the backup from the body it had just saved, which made
 * the newest backup byte-identical to the mistake and the recovery button a
 * no-op for the only case it exists for.
 */
async function mutate(change, note) {
  for (let attempt = 0; ; attempt++) {
    const { state, etag, exists, raw } = await readState();
    const before = exists ? raw : "";
    change(state);
    const body = JSON.stringify(state);
    try {
      await put(STATE_PATH, body, {
        access: "private",
        contentType: "application/json",
        addRandomSuffix: false,
        ...(etag ? { ifMatch: etag } : exists ? { allowOverwrite: true } : { allowOverwrite: false })
      });
      // This instance must not keep trusting the stamp it read a moment ago.
      revokedBefore = Number((state.settings && state.settings.revokedBefore) || 0);
      revokedAt = Date.now();
      /* A write that changed nothing is not a restore point. The console
         saves a product and then, for any product with photographs, saves its
         gallery too; that second write took a snapshot of the state AFTER the
         price had already changed, so it became the newest backup and
         «استعادة نسخة سابقة» handed the owner back his mistake. Verified:
         saved 111, saved 222, restored, got 222.
         Skipping a no-op snapshot fixes it for every future double write, not
         just this one. */
      if (before && before !== body && note !== false) await snapshot(before, note || {});
      return state;
    } catch (e) {
      const conflict = e instanceof BlobPreconditionFailedError || (!etag && /exist/i.test(e?.message || ""));
      if (conflict && attempt < 3) continue;
      throw e;
    }
  }
}

/* A backup is the state as it was *before* a change, named with who made the
   change, in what area, and a one-line summary the owner can read. Twenty
   rolling copies plus one daily kept for thirty days — a mistake noticed on
   Thursday is not in the last twenty saves if he has been working. */
async function snapshot(beforeBody, note) {
  try {
    const at = Date.now();
    const stamp = new Date(at).toISOString().replace(/[:.]/g, "-");
    const wrapped = JSON.stringify({
      v: 2, at, by: String(note.by || "owner"), area: String(note.area || "state"),
      summary: String(note.summary || ""), summaryKey: String(note.summaryKey || ""),
      summaryVars: note.summaryVars || {}, state: JSON.parse(beforeBody)
    });
    await put(BACKUP_PREFIX + stamp + ".json", wrapped, {
      access: "private", contentType: "application/json", addRandomSuffix: false, allowOverwrite: true
    });
    const { blobs } = await list({ prefix: BACKUP_PREFIX });
    const rolling = blobs.filter(b => b.pathname.startsWith(BACKUP_PREFIX));
    const old = rolling.sort((a, b) => (a.pathname < b.pathname ? 1 : -1)).slice(20);
    if (old.length) await del(old.map(b => b.url));

    // One daily snapshot. Written only when today has none.
    const day = new Date(at).toISOString().slice(0, 10);
    const daily = await list({ prefix: DAILY_PREFIX });
    if (!daily.blobs.some(b => b.pathname === DAILY_PREFIX + day + ".json")) {
      await put(DAILY_PREFIX + day + ".json", wrapped, {
        access: "private", contentType: "application/json", addRandomSuffix: false, allowOverwrite: true
      });
      const stale = daily.blobs.sort((a, b) => (a.pathname < b.pathname ? 1 : -1)).slice(30);
      if (stale.length) await del(stale.map(b => b.url));
    }
  } catch (backupError) {
    console.error("state backup failed", backupError);
  }
}

/* A generic ETag-guarded read-modify-write for any other JSON blob. */
async function readJson(path, fallback) {
  const blob = await get(path, { access: "private", useCache: false });
  if (!blob) return { value: fallback, etag: null, exists: false };
  const body = await new Response(blob.stream).text();
  try { return { value: JSON.parse(body), etag: blob.blob.etag || null, exists: true }; }
  catch { return { value: fallback, etag: blob.blob.etag || null, exists: true }; }
}
async function mutateJson(path, fallback, change) {
  for (let attempt = 0; ; attempt++) {
    const { value, etag, exists } = await readJson(path, fallback);
    const next = change(value) || value;
    try {
      await put(path, JSON.stringify(next), {
        access: "private", contentType: "application/json", addRandomSuffix: false,
        ...(etag ? { ifMatch: etag } : exists ? { allowOverwrite: true } : { allowOverwrite: false })
      });
      return next;
    } catch (e) {
      const conflict = e instanceof BlobPreconditionFailedError || (!etag && /exist/i.test(e?.message || ""));
      if (conflict && attempt < 4) continue;
      throw e;
    }
  }
}

/* --------------------------------------------------------- bundled files */

/* The bundled files are read from disk. A request's Host header must never
   decide where code is loaded from, so the HTTP fallback uses our own origin. */
const SITE_FALLBACK = "https://syriatech-store.vercel.app";
function trustedOrigin() {
  const host = process.env.SITE_ORIGIN || process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL || SITE_FALLBACK;
  return /^https?:\/\//.test(host) ? host : "https://" + host;
}
async function fromDisk(name) {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  // Vercel compiles this to CommonJS; `__dirname` is what the output provides
  // and it points at the api directory, one level below the bundled files.
  const bases = [];
  if (typeof __dirname !== "undefined") bases.push(path.join(__dirname, ".."), __dirname);
  bases.push(process.cwd());
  for (const base of bases) {
    try { return await fs.readFile(path.join(base, name), "utf8"); } catch (e) { /* next */ }
  }
  return null;
}
async function readSource(name) {
  const local = await fromDisk(name);
  if (local !== null) return local;
  return fetch(trustedOrigin() + "/" + name).then(r => {
    if (!r.ok) throw new Error("cannot read " + name);
    return r.text();
  });
}
/* Static assets are not bundled with the function; they are served by the same
   deployment, so reading them over our own origin is the dependable route and
   the result is held for the life of the instance. */
const assetCache = {};
async function readAsset(name) {
  if (assetCache[name] !== undefined) return assetCache[name];
  let text = await fromDisk(name);
  if (text === null) {
    try {
      const r = await fetch(trustedOrigin() + "/" + name);
      text = r.ok ? await r.text() : null;
    } catch (e) { text = null; }
  }
  assetCache[name] = text;
  return text;
}
async function readAssetJson(name, fallback) {
  const text = await readAsset(name);
  if (!text) return fallback;
  try { return JSON.parse(text); } catch { return fallback; }
}

/* The catalogue is parsed once per warm instance and folded into a search
   index. This is what lets the console page rows instead of shipping 312
   products (11.5KB gz, growing linearly) to the browser on every load. */
let catalogue = null;
async function loadCatalogue() {
  if (catalogue) return catalogue;
  const src = await readSource("catalog.js");
  const win = {};
  new Function("window", src)(win);
  const rows = win.STORE.merge({});
  catalogue = { rows, byId: new Map(rows.map(p => [String(p.id), p])) };
  return catalogue;
}

/* Arabic folding, so the console finds what the customer finds: the search
   has to match with or without the diacritics, and alef in any of its four
   written forms is one letter to a person typing in a hurry.
   Written as code points, because no source file in this project carries a
   letter of Arabic — every one of them belongs in the dictionary. */
const ch = String.fromCharCode;
const MARKS = new RegExp("[" + ch(0x640) + ch(0x64b) + "-" + ch(0x652) + "]", "g");   // tatweel + harakat
const ALEFS = new RegExp("[" + ch(0x622) + ch(0x623) + ch(0x625) + ch(0x671) + "]", "g");
const ALEF = ch(0x627), YEH = ch(0x64a), MAQSURA = new RegExp(ch(0x649), "g"), MARBUTA = new RegExp(ch(0x629), "g"), HEH = ch(0x647);
function fold(value) {
  return String(value || "").toLowerCase()
    .replace(MARKS, "")
    .replace(ALEFS, ALEF)
    .replace(MAQSURA, YEH).replace(MARBUTA, HEH)
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/* ------------------------------------------------------------- taxonomy */

/* The hard-coded CATEGORIES Set is gone. The stored taxonomy is the single
   source, seeded once from the files the build tools already produce, and a new
   department costs the owner four fields and no deploy. */
/* The names in the shop dictionary are defaults the stored taxonomy overrides
   (study 11 §7.1). They are read here rather than in the browser, so the
   console still never downloads the shop's dictionary. */
let dictLabels = null;
async function labelsFromDictionary() {
  if (dictLabels) return dictLabels;
  dictLabels = {};
  try {
    const src = await readSource("i18n.js");
    const win = {};
    new Function("window", "navigator", "localStorage", src)(win,
      { languages: ["ar"] }, { getItem: () => null, setItem: () => {} });
    for (const code of ["ar", "en", "tr"]) {
      const d = (win.I18N && win.I18N.dict && win.I18N.dict[code]) || {};
      for (const [id, label] of Object.entries(Object.assign({}, d.category, d.cat))) {
        dictLabels[id] = dictLabels[id] || {};
        dictLabels[id][code] = label;
      }
    }
  } catch (e) { /* the node id shows until the owner names it */ }
  return dictLabels;
}

async function loadTaxonomy() {
  const stored = await readJson(TAXONOMY_PATH, null);
  if (stored.value && Array.isArray(stored.value.nodes)) return stored.value;
  const seedNodes = await readAssetJson("assets/taxonomy.json", { nodes: [], aliases: {} });
  const seedBrands = await readAssetJson("assets/brands.json", {});
  const labels = await labelsFromDictionary();
  return {
    v: 1,
    nodes: (seedNodes.nodes || []).map(n => ({
      id: n.id, parent: n.parent || null, order: Number(n.order || 0),
      icon: n.icon || "", visible: n.hidden !== true,
      name: n.name || labels[n.id] || {}, description: n.description || {}
    })),
    aliases: seedNodes.aliases || {},
    brands: Object.entries(seedBrands).map(([slug, b]) => ({
      slug, name: b.name, logo: b.logo || null, order: Number(b.order || 0),
      visible: b.hidden !== true, authorised: b.authorised === true, tagline: b.tagline || {}, about: b.about || {}
    }))
  };
}
/* Legacy `category` ids used by catalog.js stay valid for ever: 312 product
   URLs are indexed and the storefront still reads them. */
async function validCategories() {
  const tax = await loadTaxonomy();
  const ids = new Set(tax.nodes.map(n => String(n.id)));
  Object.keys(tax.aliases || {}).forEach(a => ids.add(String(a)));
  const cat = await loadCatalogue();
  cat.rows.forEach(p => ids.add(String(p.category)));
  return ids;
}

/* -------------------------------------------------------------- content */

/*
 * The unanswered questions are not a list in this file. They are read out of
 * `assets/policies.json`, which is where they already live: every point that
 * still carries a `[[placeholder]]` is a question the customer cannot see.
 * Deriving them has three virtues — the list cannot drift from the document,
 * a twelfth question needs no code, and no Arabic or Turkish string is typed
 * into a source file, which is the rule for the whole project.
 *
 * Within one point the placeholders line up across the three languages
 * (`[[مدة التوصيل]]` / `[[the delivery time]]` / `[[teslimat süresi]]` is one
 * question), so the English token names the field and the other two come with
 * it. Twelve of the twenty-two points are blocked by eleven of these.
 */
const EMPTY_CONTENT = { v: 1, policies: {}, pages: {}, home: {} };
const tokensIn = value => [...String(value || "").matchAll(/\[\[([^\]]+)\]\]/g)].map(m => m[1]);
const fieldKey = token => String(token).toLowerCase().replace(/^the\s+/, "")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

function policyFields(doc) {
  const out = new Map();
  for (const [group, section] of Object.entries(doc || {})) {
    const parts = [section.intro || {}].concat((section.points || []).flatMap(p => [p.q || {}, p.a || {}]));
    for (const part of parts) {
      const ar = tokensIn(part.ar), en = tokensIn(part.en), tr = tokensIn(part.tr);
      if (!en.length || en.length !== ar.length || en.length !== tr.length) continue;
      en.forEach((token, i) => {
        const key = fieldKey(token);
        if (key && !out.has(key)) out.set(key, { key, group, tokens: { ar: ar[i], en: token, tr: tr[i] } });
      });
    }
  }
  return [...out.values()];
}
async function POLICY_FIELDS() {
  return policyFields(await readAssetJson("assets/policies.json", {}));
}

/* How many of the customer-facing questions the answers unblock. */
async function policyStatus(content) {
  const doc = await readAssetJson("assets/policies.json", {});
  const fields = policyFields(doc);
  const answers = (content && content.policies) || {};
  const filled = fields.filter(f => {
    const a = answers[f.key];
    return a && typeof a.ar === "string" && a.ar.trim().length >= 2;
  }).map(f => f.key);
  let total = 0, hidden = 0;
  for (const section of Object.values(doc || {})) {
    for (const point of (section.points || [])) {
      total++;
      if (/\[\[/.test(substituteWith(JSON.stringify(point), answers, fields))) hidden++;
    }
  }
  return {
    fields: fields.map(f => ({ key: f.key, group: f.group, value: answers[f.key] || { ar: "", en: "", tr: "" } })),
    filled, total, hidden
  };
}
/* Substitution is textual on the serialised JSON, so one pass fills every
   language at once and the answer is escaped the way JSON.stringify escapes. */
function substituteWith(text, answers, fields) {
  let out = String(text);
  for (const field of fields) {
    const value = answers[field.key];
    if (!value) continue;
    for (const code of ["ar", "en", "tr"]) {
      const replacement = String(value[code] || value.ar || "").trim();
      if (!replacement) continue;
      out = out.split("[[" + field.tokens[code] + "]]").join(jsonSafe(replacement));
    }
  }
  return out;
}
async function substitute(text, answers) {
  return substituteWith(text, answers, await POLICY_FIELDS());
}
const jsonSafe = value => JSON.stringify(String(value)).slice(1, -1);

/* ---------------------------------------------------------------- orders */

const FULFILMENT = ["new", "confirmed", "packed", "shipped", "delivered", "cancelled", "returned"];
const CHAIN = ["new", "confirmed", "packed", "shipped", "delivered"];
const PAY_STATES = ["unpaid", "partial", "paid", "partial_refund", "refunded", "failed"];
const PAY_METHODS = ["cod", "transfer", "card", "cash"];
const CHANNELS = ["web", "phone", "store", "whatsapp"];
const CANCEL_REASONS = ["changed-mind", "out-of-stock", "unreachable", "price", "no-delivery", "other"];
const TERMINAL = new Set(["delivered", "cancelled", "returned"]);

function canMove(from, to) {
  if (from === to) return false;
  if (to === "cancelled") return from !== "delivered" && from !== "cancelled" && from !== "returned";
  if (to === "returned") return from === "delivered";
  const a = CHAIN.indexOf(from), b = CHAIN.indexOf(to);
  if (a === -1 || b === -1) return false;
  return b === a + 1 || b === a - 1;   // forward one, or back one with a confirm
}
const isBack = (from, to) => CHAIN.indexOf(to) === CHAIN.indexOf(from) - 1 && CHAIN.indexOf(from) > 0;

/*
 * The customer key. `0949 951 985`, `+963 949 951 985` and `963949951985` are
 * one person and must land on one record, so the key is the last nine digits:
 * the subscriber number, which every one of those forms ends with. Stripping
 * the leading zero is not enough — it leaves the national and international
 * forms different — and prefixing a country code guesses at a number the shop
 * never asked for. The full number as the customer wrote it is kept beside it
 * in `customer.phone`, and that is what a call or a message uses.
 */
const phoneKeyOf = v => {
  const digits = String(v || "").replace(/\D/g, "");
  return digits.length > 9 ? digits.slice(-9) : digits.replace(/^0+/, "");
};
const monthOf = no => String(no || "").split("-")[1] ? String(no).split("-")[1].slice(0, 4) : "";
const indexPath = ym => `data/orders/${ym}/index.json`;
const orderPath = no => `data/orders/${monthOf(no)}/${no}.json`;

/* `SY-YYMMDD-NNN`, sequential within the day. A random suffix can collide, it
   cannot be counted, and a gap in a sequence is how a lost write gets noticed.
   The counter lives in the month's index and is bumped under the same ETag
   retry as the row append. */
async function nextOrderNumber(prefix) {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const ym = yy + mm, day = yy + mm + dd;
  let no = "";
  await mutateJson(indexPath(ym), { seq: {}, rows: [] }, doc => {
    doc.seq = doc.seq || {};
    const next = Number(doc.seq[day] || 0) + 1;
    doc.seq[day] = next;
    no = `${prefix}-${day}-${String(next).padStart(3, "0")}`;
    return doc;
  });
  return no;
}
function indexRow(order) {
  return {
    no: order.no, at: order.createdAt, st: order.status, pay: order.payment.state,
    pm: order.payment.method, ch: order.channel, name: order.customer.name,
    phone: order.customer.phone, pk: order.customer.phoneKey, city: order.customer.city,
    grand: order.totals.grand, n: order.lines.reduce((s, l) => s + Number(l.qty || 0), 0),
    contacted: !!order.contacted, statusAt: order.statusAt,
    // The "out for delivery" label reads "ready for collection" when the
    // customer collects, so the row needs to know without opening the order.
    pu: order.delivery && order.delivery.method === "pickup"
  };
}
/* An order leaves the working set when fulfilment is terminal AND the money is
   settled. A delivered-but-unpaid order stays: it is exactly the one to chase. */
function isSettled(order) {
  const p = order.payment || {};
  if (p.state === "paid" || p.state === "refunded") return true;
  if (order.status === "cancelled" && p.method === "cod" && p.state === "unpaid") return true;
  return false;
}
const isOpen = order => !(TERMINAL.has(order.status) && isSettled(order));

async function writeOrder(order) {
  await put(orderPath(order.no), JSON.stringify(order), {
    access: "private", contentType: "application/json", addRandomSuffix: false, allowOverwrite: true
  });
  const row = indexRow(order);
  await mutateJson(indexPath(monthOf(order.no)), { seq: {}, rows: [] }, doc => {
    doc.rows = Array.isArray(doc.rows) ? doc.rows : [];
    const at = doc.rows.findIndex(r => r.no === order.no);
    if (at >= 0) doc.rows[at] = row; else doc.rows.push(row);
    return doc;
  });
  await mutateJson(ORDERS_OPEN, { rows: [] }, doc => {
    doc.rows = Array.isArray(doc.rows) ? doc.rows : [];
    const at = doc.rows.findIndex(r => r.no === order.no);
    if (isOpen(order)) { if (at >= 0) doc.rows[at] = row; else doc.rows.push(row); }
    else if (at >= 0) doc.rows.splice(at, 1);
    return doc;
  });
  return order;
}
async function readOrder(no) {
  if (!/^[A-Z0-9]{1,8}-\d{6}-\d{3}$/.test(String(no || ""))) throw new Error("invalid_order");
  const found = await readJson(orderPath(no), null);
  if (!found.value) throw new Error("order_not_found");
  return found.value;
}
function note(order, by, field, from, to, extra) {
  order.history.push({ at: Date.now(), by, field, from: String(from ?? ""), to: String(to ?? ""), ...(extra || {}) });
}
function recomputeTotals(order) {
  const items = order.lines.reduce((s, l) => s + Math.round(Number(l.unit || 0) * Number(l.qty || 0) * 100) / 100, 0);
  order.lines.forEach(l => { l.total = Math.round(Number(l.unit || 0) * Number(l.qty || 0) * 100) / 100; });
  const discount = Math.min(Number(order.totals.discount || 0), items);
  const fee = order.totals.delivery === null || order.totals.delivery === undefined ? 0 : Number(order.totals.delivery);
  order.totals.items = Math.round(items * 100) / 100;
  order.totals.discount = Math.round(discount * 100) / 100;
  order.totals.grand = Math.round((items - discount + fee) * 100) / 100;
  return order;
}

/* Stock is committed at مؤكَّد, not at جديد: an order the shop has not agreed
   to is not a sale, and committing at جديد lets an unanswered order empty the
   shelf. Cancelling before delivery releases it; a return asks first. */
async function moveStock(lines, direction, by) {
  const ids = lines.map(l => Number(l.pid)).filter(Boolean);
  if (!ids.length) return;
  const cat = await loadCatalogue();
  await mutate(s => {
    for (const line of lines) {
      const id = Number(line.pid);
      if (!id) continue;
      const qty = Number(line.qty || 0);
      const target = s.additions.find(x => Number(x.id) === id) || s.overrides[String(id)] ||
        (s.overrides[String(id)] = { id, savedAt: Date.now() });
      const base = cat.byId.get(String(id));
      const current = target.stock !== undefined ? Number(target.stock)
        : (base && base.inStock === false ? 0 : 1);
      const next = Math.max(0, current + direction * qty);
      target.stock = next;
      target.inStock = next > 0;
      target.savedAt = Date.now();
    }
  }, { by, area: "stock", summaryKey: "admin.bkStockFromOrder" });
}

/* ----------------------------------------------------------------- audit */

/* Append-only. One line per write path, so "who changed what" has an answer. */
async function audit(entry) {
  const day = new Date().toISOString().slice(0, 10);
  const path = `data/audit/${day}.jsonl`;
  const line = JSON.stringify({ at: Date.now(), ...entry }) + "\n";
  for (let attempt = 0; ; attempt++) {
    const blob = await get(path, { access: "private", useCache: false });
    const body = blob ? await new Response(blob.stream).text() : "";
    try {
      await put(path, body + line, {
        access: "private", contentType: "application/x-ndjson", addRandomSuffix: false,
        ...(blob ? { ifMatch: blob.blob.etag } : { allowOverwrite: true })
      });
      return;
    } catch (e) {
      if (attempt < 4) continue;
      console.error("audit append failed", e);
      return;
    }
  }
}

/* ------------------------------------------------------------ validation */

const text = (value, max) => String(value ?? "").trim().slice(0, max);
function money(value, allowZero) {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? "").trim());
  if (!Number.isFinite(n) || n < 0 || n > 1e6) return NaN;
  if (!allowZero && n <= 0) return NaN;
  return Math.round(n * 100) / 100;
}
function cleanImage(value) {
  // PRESERVED: both accepted shapes get the same traversal check.
  if (typeof value === "string" && /(\.\.|%2e%2e)/i.test(value)) return "";
  const url = text(value, 1000);
  if (!url) return "";
  if (/^\/api\/image\?pathname=products%2F[\w.%-]+$/.test(url)) return url;
  if (/^assets\/[\w./-]+$/.test(url) && !url.includes("..")) return url;
  // A remote URL puts a third-party request on the storefront; the gallery
  // replaces the "paste a link" field and nothing else may write one.
  throw new Error("invalid_image");
}
async function cleanProduct(p) {
  if (!p || typeof p !== "object") throw new Error("product_required");
  const name = text(p.name, 200);
  if (!name) throw new Error("name_required");
  const price = money(p.price);
  if (Number.isNaN(price)) throw new Error("invalid_price");
  const old = money(p.oldPrice, true);
  const category = text(p.category, 60);
  const allowed = await validCategories();
  if (!allowed.has(category)) throw new Error("invalid_category");
  const stock = Number.isFinite(Number(p.stock)) ? Math.max(0, Math.min(99999, Math.round(Number(p.stock)))) : null;
  const lowAt = Number.isFinite(Number(p.lowAt)) ? Math.max(0, Math.min(9999, Math.round(Number(p.lowAt)))) : null;
  const images = Array.isArray(p.images) ? p.images.slice(0, MAX_GALLERY).map(cleanImage).filter(Boolean) : null;
  return {
    name,
    brand: text(p.brand, 60),
    category,
    price,
    oldPrice: Number.isNaN(old) || old < price ? price : old,
    // PRESERVED: one name field made an Arabic rename show to English and
    // Turkish shoppers as well. Each language keeps its own.
    ...(text(p.nameEn, 200) ? { nameEn: text(p.nameEn, 200) } : {}),
    ...(text(p.nameTr, 200) ? { nameTr: text(p.nameTr, 200) } : {}),
    description: text(p.description, 2000),
    descriptionAr: text(p.descriptionAr, 2000),
    descriptionTr: text(p.descriptionTr, 2000),
    // PRESERVED: writing an empty string here overwrote the catalogue's real
    // code on every price change, so only send a real one.
    ...(text(p.sku, 60) ? { sku: text(p.sku, 60) } : {}),
    badge: text(p.badge, 30),
    image: cleanImage(p.image),
    ...(images ? { images } : {}),
    ...(stock === null ? {} : { stock }),
    ...(lowAt === null ? {} : { lowAt }),
    ...(p.status ? { status: ["draft", "published", "archived"].includes(p.status) ? p.status : "published" } : {}),
    inStock: stock === null ? p.inStock !== false : stock > 0
  };
}

function readBody(req) {
  if (typeof req.body === "string") { try { return JSON.parse(req.body || "{}"); } catch { return {}; } }
  return req.body || {};
}

/* ----------------------------------------------------- the merged listing */

/* One row is ~140 bytes; forty rows is about 1.4KB gzipped, against 11.5KB gz
   of catalogue before anything was shown, growing linearly with the shop. */
function mergeRows(cat, state) {
  const hidden = new Set(state.deleted.map(Number));
  const rows = [];
  for (const base of cat.rows) {
    if (hidden.has(Number(base.id))) continue;
    const over = state.overrides[String(base.id)];
    rows.push(over ? { ...base, ...over } : base);
  }
  for (const added of state.additions) {
    if (hidden.has(Number(added.id))) continue;
    rows.push(added);
  }
  return rows;
}
function stockOf(p) {
  if (p.stock !== undefined && p.stock !== null) return Number(p.stock);
  return p.inStock === false ? 0 : 1;   // the conservative migration
}
const lowAtOf = (p, fallback) => (p.lowAt === undefined || p.lowAt === null ? fallback : Number(p.lowAt));

/* ------------------------------------------------------------------ main */

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const action = String((req.query && req.query.action) || "");
    const query = req.query || {};
    const body = req.method === "POST" ? readBody(req) : {};

    /* ------------------------------------------------------------ login */
    if (req.method === "POST" && action === "login") {
      const { password, secret } = env();
      if (!password || !secret) {
        console.error("ADMIN_PASSWORD / ADMIN_SECRET are not set in the Vercel project");
        return fail(res, 401, "invalid_password");
      }
      const key = callerKey(req);
      const { state: current } = await readState().catch(() => ({ state: normalizeState({}) }));
      const waiting = lockedUntil(current.logins[key]);
      if (waiting) {
        res.setHeader("Retry-After", String(Math.ceil((waiting - Date.now()) / 1000)));
        return fail(res, 429, "too_many_attempts");
      }

      const given = String(body.password || "");
      const login = text(body.user, 40).toLowerCase();
      let user = null;
      const users = Array.isArray(current.settings.users) ? current.settings.users : [];
      if (login) {
        const found = users.find(u => u.login === login && u.enabled !== false);
        if (found && found.salt && found.hash && verifyPassword(given, found.salt, found.hash)) {
          user = { id: found.id, role: found.role };
        }
      } else if (safeEqual(given, password)) {
        // The break-glass owner login. A misconfigured user table can never
        // lock the owner out of his own shop.
        user = { id: "owner", role: "owner", breakGlass: true };
      }

      if (!user) {
        await new Promise(r => setTimeout(r, 800));
        try {
          await mutate(s => {
            pruneLogins(s.logins);
            const entry = s.logins[key] || { tries: 0 };
            entry.tries = Number(entry.tries || 0) + 1;
            entry.seen = Date.now();
            if (entry.tries >= MAX_TRIES) {
              // Doubles with each further failure, capped so a mistyped
              // password never locks the owner out for the rest of the day.
              const over = entry.tries - MAX_TRIES;
              entry.until = Date.now() + Math.min(FIRST_LOCK * Math.pow(2, over), MAX_LOCK);
            }
            s.logins[key] = entry;
          }, false);
        } catch (e) { console.error("could not record the failed sign-in", e); }
        return fail(res, 401, "invalid_password");
      }

      if (current.logins[key]) {
        try { await mutate(s => { delete s.logins[key]; }, false); } catch (e) { /* not worth failing the login */ }
      }
      try {
        await mutate(s => {
          const list2 = Array.isArray(s.settings.users) ? s.settings.users : [];
          const found = list2.find(u => u.id === user.id);
          if (found) found.lastSeen = Date.now();
          s.settings = { ...s.settings, users: list2 };
        }, false);
      } catch (e) { /* the login still works */ }
      res.setHeader("Set-Cookie", newSessionCookie(user));
      return res.status(200).json({ ok: true, user: { id: user.id, role: user.role, breakGlass: !!user.breakGlass } });
    }

    if (req.method === "POST" && action === "logout") {
      res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
      // PRESERVED: invalidate the signed cookie itself, not just the copy.
      if (await isAuthed(req)) {
        try { await mutate(s => { s.settings = { ...s.settings, revokedBefore: Date.now() }; }, false); }
        catch (e) { console.error("session revoke failed", e); }
      }
      return res.status(200).json({ ok: true });
    }

    const user = await sessionUser(req);
    if (!user) return fail(res, 401, "unauthorized");
    const who = user.id;

    /* ------------------------------------------------------------ boot */
    if (req.method === "GET" && action === "state") {
      const { state } = await readState();
      const cat = await loadCatalogue();
      const rows = mergeRows(cat, state);
      const content = (await readJson(CONTENT_PATH, EMPTY_CONTENT)).value;
      const policy = await policyStatus(content);
      const open = (await readJson(ORDERS_OPEN, { rows: [] })).value.rows || [];
      const lowDefault = Number(state.settings.lowAt || 3);
      return res.status(200).json({
        ok: true,
        user,
        settings: publicish(state.settings),
        counts: {
          products: rows.length,
          drafts: rows.filter(p => p.status === "draft").length,
          out: rows.filter(p => stockOf(p) === 0).length,
          low: rows.filter(p => { const s2 = stockOf(p); return s2 > 0 && s2 <= lowAtOf(p, lowDefault); }).length,
          orders: open.length,
          newOrders: open.filter(r => r.st === "new").length,
          noPhoto: rows.filter(p => !p.image || !/^assets\/products\//.test(p.image)).length,
          policyFilled: policy.filled.length, policyTotal: policy.fields.length, policyHidden: policy.hidden
        }
      });
    }

    /* --------------------------------------------------------- products */
    if (req.method === "GET" && action === "list") {
      requireRole(user, "products.view");
      const { state } = await readState();
      const cat = await loadCatalogue();
      let rows = mergeRows(cat, state);
      const lowDefault = Number(state.settings.lowAt || 3);

      const q = fold(query.q);
      if (q) {
        const terms = q.split(" ").filter(Boolean);
        rows = rows.filter(p => {
          const hay = fold([p.name, p.nameEn, p.nameTr, p.brand, p.sku, p.category].join(" "));
          return terms.every(term => hay.includes(term));
        });
      }
      if (query.cat) rows = rows.filter(p => String(p.category) === String(query.cat));
      if (query.brand) rows = rows.filter(p => String(p.brand) === String(query.brand));
      if (query.status) rows = rows.filter(p => (p.status || "published") === String(query.status));
      if (query.stock === "out") rows = rows.filter(p => stockOf(p) === 0);
      if (query.stock === "low") rows = rows.filter(p => { const s2 = stockOf(p); return s2 > 0 && s2 <= lowAtOf(p, lowDefault); });
      if (query.stock === "in") rows = rows.filter(p => stockOf(p) > 0);
      if (query.img === "auto") rows = rows.filter(p => !p.image || !/^assets\/products\//.test(p.image));
      if (query.img === "real") rows = rows.filter(p => p.image && /^assets\/products\//.test(p.image));
      if (query.offer === "sale") rows = rows.filter(p => Number(p.oldPrice || 0) > Number(p.price || 0));

      const sort = String(query.sort || "name");
      const cmp = {
        name: (a, b) => String(a.name).localeCompare(String(b.name)),
        priceUp: (a, b) => a.price - b.price,
        priceDown: (a, b) => b.price - a.price,
        stockUp: (a, b) => stockOf(a) - stockOf(b),
        newest: (a, b) => Number(b.savedAt || b.id || 0) - Number(a.savedAt || a.id || 0)
      }[sort] || ((a, b) => String(a.name).localeCompare(String(b.name)));
      rows.sort(cmp);

      const total = rows.length;
      const page = Math.max(1, Number(query.page) || 1);
      const slice = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
      const facets = { brand: {}, cat: {} };
      rows.forEach(p => {
        facets.brand[p.brand] = (facets.brand[p.brand] || 0) + 1;
        facets.cat[p.category] = (facets.cat[p.category] || 0) + 1;
      });
      return res.status(200).json({
        ok: true, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)), facets,
        rows: slice.map(p => ({
          id: p.id, n: p.name, b: p.brand, c: p.category, p: p.price,
          o: Number(p.oldPrice || 0) > Number(p.price || 0) ? p.oldPrice : 0,
          s: stockOf(p), la: lowAtOf(p, lowDefault), st: p.status || "published",
          img: p.image || "", sku: p.sku || "", v: Number(p.savedAt || 0),
          edited: !!state.overrides[String(p.id)], added: state.additions.some(a => Number(a.id) === Number(p.id))
        }))
      });
    }

    if (req.method === "GET" && action === "product") {
      requireRole(user, "products.view");
      const { state } = await readState();
      const cat = await loadCatalogue();
      const id = String(query.id || "");
      const found = mergeRows(cat, state).find(p => String(p.id) === id);
      if (!found) return fail(res, 404, "invalid_id");
      const gallery = await galleryFor(id);
      const base = cat.byId.get(id) || null;
      return res.status(200).json({
        ok: true,
        product: { ...found, stock: stockOf(found), lowAt: lowAtOf(found, Number(state.settings.lowAt || 3)), status: found.status || "published" },
        gallery, seenAt: Number((state.overrides[id] || state.additions.find(a => String(a.id) === id) || {}).savedAt || 0),
        isCatalogue: !!base, isOverridden: !!state.overrides[id]
      });
    }

    if (req.method === "POST" && action === "save") {
      requireRole(user, "products.edit");
      const product = await cleanProduct(body.product);
      const rawId = body.product && body.product.id;
      const requestedId = rawId === undefined || rawId === null || rawId === "" ? 0 : Number(rawId);
      if (requestedId !== 0 && (!Number.isSafeInteger(requestedId) || requestedId <= 0)) return fail(res, 400, "invalid_id");
      let savedId = 0;
      let conflict = false;
      // PRESERVED: what the editor was looking at when it opened the product.
      const seenAt = Number(body.seenAt || 0);
      await mutate(s => {
        conflict = false;
        savedId = 0;
        if (requestedId && !body.isNew && body.seenAt !== undefined) {
          const current = s.additions.find(x => Number(x.id) === requestedId) || s.overrides[String(requestedId)];
          const changedAt = Number(current && current.savedAt) || 0;
          // seenAt 0 means "there was no saved version when I opened this", so
          // any stored version at all is somebody else's work.
          if (changedAt > seenAt) { conflict = true; return; }
        }
        if (body.isNew || !requestedId) {
          let id = Date.now();
          while (s.additions.some(x => Number(x.id) === id)) id++;
          savedId = id;
          s.additions.push({ id, status: "draft", ...product, savedAt: Date.now() });
          return;
        }
        savedId = requestedId;
        const index = s.additions.findIndex(x => Number(x.id) === requestedId);
        if (index >= 0) {
          s.additions[index] = { id: requestedId, ...product, savedAt: Date.now() };
          delete s.overrides[String(requestedId)];
        } else {
          s.overrides[String(requestedId)] = { id: requestedId, ...product, savedAt: Date.now() };
        }
      }, { by: who, area: "product", summaryKey: "admin.bkProduct", summaryVars: { name: product.name } });
      if (conflict) return fail(res, 409, "edited_elsewhere");
      await audit({ by: who, area: "product", target: String(savedId), action: body.isNew ? "create" : "update", label: product.name });
      return res.status(200).json({ ok: true, id: savedId });
    }

    /* Inline price and stock cells, batched and flushed as one request. */
    if (req.method === "POST" && action === "inline") {
      const edits = Array.isArray(body.edits) ? body.edits.slice(0, 200) : [];
      if (!edits.length) return res.status(200).json({ ok: true, applied: [] });
      if (edits.some(e => e.field === "price")) requireRole(user, "products.edit");
      if (edits.some(e => e.field === "stock" || e.field === "lowAt")) requireRole(user, "stock.edit");
      const cat = await loadCatalogue();
      const applied = [];
      await mutate(s => {
        applied.length = 0;
        for (const edit of edits) {
          const id = Number(edit.id);
          if (!Number.isSafeInteger(id) || id <= 0) continue;
          const target = s.additions.find(x => Number(x.id) === id) || s.overrides[String(id)] ||
            (s.overrides[String(id)] = { id, savedAt: Date.now() });
          const base = cat.byId.get(String(id)) || {};
          if (edit.field === "price") {
            const value = money(edit.value);
            if (Number.isNaN(value)) continue;
            target.price = value;
            if (Number(target.oldPrice ?? base.oldPrice ?? 0) < value) target.oldPrice = value;
          } else if (edit.field === "stock") {
            const value = Math.max(0, Math.min(99999, Math.round(Number(edit.value))));
            if (!Number.isFinite(value)) continue;
            target.stock = value;
            target.inStock = value > 0;
          } else if (edit.field === "lowAt") {
            const value = Math.max(0, Math.min(9999, Math.round(Number(edit.value))));
            if (!Number.isFinite(value)) continue;
            target.lowAt = value;
          } else continue;
          target.savedAt = Date.now();
          applied.push({ id, field: edit.field, value: target[edit.field] });
        }
      }, { by: who, area: "product", summaryKey: "admin.bkInline", summaryVars: { n: edits.length } });
      await audit({ by: who, area: "product", action: "inline", fields: applied });
      return res.status(200).json({ ok: true, applied });
    }

    /* PRESERVED: flipping availability must not carry a stale copy of
       everything else. */
    if (req.method === "POST" && action === "stock") {
      requireRole(user, "stock.edit");
      const id = Number(body.id);
      if (!Number.isSafeInteger(id) || id <= 0) return fail(res, 400, "invalid_id");
      const inStock = body.inStock !== false;
      await mutate(s => {
        const added = s.additions.find(x => Number(x.id) === id);
        if (added) { added.inStock = inStock; if (!inStock) added.stock = 0; added.savedAt = Date.now(); return; }
        const existing = s.overrides[String(id)];
        if (existing) { existing.inStock = inStock; if (!inStock) existing.stock = 0; existing.savedAt = Date.now(); return; }
        // A catalogue product with no override yet needs one, holding only this.
        s.overrides[String(id)] = { id, inStock, ...(inStock ? {} : { stock: 0 }), savedAt: Date.now() };
      }, { by: who, area: "stock", summaryKey: "admin.bkStock" });
      await audit({ by: who, area: "stock", target: String(id), action: "toggle", fields: { inStock } });
      return res.status(200).json({ ok: true, id });
    }

    if (req.method === "POST" && (action === "delete" || action === "restore" || action === "revert")) {
      requireRole(user, "products.edit");
      const id = Number(body.id);
      if (!Number.isSafeInteger(id) || id <= 0) return fail(res, 400, "invalid_id");
      await mutate(s => {
        if (action !== "revert") s.deleted = s.deleted.filter(x => x !== id);
        if (action === "delete") s.deleted.push(id);
        if (action === "revert") delete s.overrides[String(id)];
      }, { by: who, area: "product", summaryKey: "admin.bk_" + action });
      await audit({ by: who, area: "product", target: String(id), action });
      return res.status(200).json({ ok: true });
    }

    /* Bulk price and bulk stock, with the before-values kept so the toast can
       offer an undo rather than being terrifying. */
    if (req.method === "POST" && action === "bulk") {
      const ids = (Array.isArray(body.ids) ? body.ids : []).map(Number).filter(Boolean).slice(0, 2000);
      if (!ids.length) return fail(res, 400, "invalid_id");
      const kind = String(body.kind || "");
      if (kind === "price") requireRole(user, "products.edit");
      else requireRole(user, "stock.edit");
      const cat = await loadCatalogue();
      const before = [];
      await mutate(s => {
        before.length = 0;
        for (const id of ids) {
          const target = s.additions.find(x => Number(x.id) === id) || s.overrides[String(id)] ||
            (s.overrides[String(id)] = { id, savedAt: Date.now() });
          const base = cat.byId.get(String(id)) || {};
          const price = Number(target.price ?? base.price ?? 0);
          const stock = target.stock !== undefined ? Number(target.stock) : ((target.inStock ?? base.inStock) === false ? 0 : 1);
          if (kind === "price") {
            let next = price;
            if (body.mode === "percent") next = price * (1 + Number(body.amount) / 100);
            else if (body.mode === "amount") next = price + Number(body.amount);
            else if (body.mode === "fixed") next = Number(body.amount);
            next = round(next, body.rounding);
            if (!(next > 0)) continue;                       // named and skipped by the preview
            before.push({ id, field: "price", from: price, to: next });
            target.price = next;
            if (Number(target.oldPrice ?? base.oldPrice ?? 0) < next) target.oldPrice = next;
          } else if (kind === "stock") {
            let next = stock;
            if (body.mode === "set") next = Number(body.amount);
            else if (body.mode === "add") next = stock + Number(body.amount);
            else if (body.mode === "sub") next = stock - Number(body.amount);
            else if (body.mode === "out") next = 0;
            else if (body.mode === "in") next = Math.max(1, stock);
            next = Math.max(0, Math.round(next));
            before.push({ id, field: "stock", from: stock, to: next });
            target.stock = next;
            target.inStock = next > 0;
          } else if (kind === "status") {
            const next = ["draft", "published", "archived"].includes(body.amount) ? body.amount : "published";
            before.push({ id, field: "status", from: target.status || base.status || "published", to: next });
            target.status = next;
          } else if (kind === "cat") {
            const allowed = null;   // validated below, outside the mutate
            before.push({ id, field: "category", from: target.category || base.category || "", to: String(body.amount) });
            target.category = String(body.amount);
          }
          target.savedAt = Date.now();
        }
      }, { by: who, area: "product", summaryKey: "admin.bkBulk", summaryVars: { n: ids.length } });
      await audit({ by: who, area: "product", action: "bulk-" + kind, fields: before, undoable: true });
      return res.status(200).json({ ok: true, changed: before.length, before });
    }

    if (req.method === "POST" && action === "undo-bulk") {
      requireRole(user, "products.edit");
      const entries = Array.isArray(body.before) ? body.before : [];
      if (!entries.length) return fail(res, 400, "invalid_id");
      await mutate(s => {
        for (const e of entries) {
          const id = Number(e.id);
          const target = s.additions.find(x => Number(x.id) === id) || s.overrides[String(id)];
          if (!target) continue;
          target[e.field] = e.from;
          if (e.field === "stock") target.inStock = Number(e.from) > 0;
          target.savedAt = Date.now();
        }
      }, { by: who, area: "product", summaryKey: "admin.bkUndo" });
      await audit({ by: who, area: "product", action: "undo", fields: entries });
      return res.status(200).json({ ok: true });
    }

    /* ----------------------------------------------------------- orders */
    if (req.method === "GET" && action === "orders") {
      requireRole(user, "orders.view");
      const rows = await orderRows(query);
      const total = rows.length;
      const page = Math.max(1, Number(query.page) || 1);
      return res.status(200).json({
        ok: true, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
        rows: rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
      });
    }

    /* The morning strip: four saved filters, one blob read. */
    if (req.method === "GET" && action === "today") {
      requireRole(user, "orders.view");
      const open = (await readJson(ORDERS_OPEN, { rows: [] })).value.rows || [];
      const yesterday = Date.now() - 86400000;
      const { state } = await readState();
      const cat = await loadCatalogue();
      const merged = mergeRows(cat, state);
      const outIds = new Set(merged.filter(p => stockOf(p) === 0).map(p => String(p.id)));
      let withOut = 0;
      if (outIds.size) {
        for (const row of open) {
          const order = await readOrder(row.no).catch(() => null);
          if (order && order.lines.some(l => outIds.has(String(l.pid)))) withOut++;
        }
      }
      return res.status(200).json({
        ok: true,
        newOrders: open.filter(r => r.st === "new").length,
        awaitingPayment: open.filter(r => (r.pay === "unpaid" && r.pm !== "cod") || r.pay === "failed").length,
        stuckShipped: open.filter(r => r.st === "shipped" && Number(r.statusAt || r.at) < yesterday).length,
        withOutOfStock: withOut,
        inFlight: open.filter(r => r.st === "confirmed" || r.st === "packed" || r.st === "shipped").length
      });
    }

    if (req.method === "GET" && action === "order") {
      requireRole(user, "orders.view");
      const order = await readOrder(query.no);
      const cat = await loadCatalogue();
      const { state } = await readState();
      const merged = mergeRows(cat, state);
      const stock = {};
      order.lines.forEach(l => {
        const p = merged.find(x => String(x.id) === String(l.pid));
        stock[String(l.pid)] = p ? stockOf(p) : null;
      });
      const history = await customerOrders(order.customer.phoneKey);
      return res.status(200).json({ ok: true, order, stock, customer: history });
    }

    /* Manual entry: a phone call or a counter sale. Route A (checkout) creates
       the identical object from api/order.js, which is why nothing here is
       shaped around any one channel. */
    if (req.method === "POST" && action === "order-create") {
      requireRole(user, "orders.status");
      const { state } = await readState();
      const prefix = text(state.settings.orderPrefix, 8).toUpperCase().replace(/[^A-Z0-9]/g, "") || "SY";
      const lines = (Array.isArray(body.lines) ? body.lines : []).map(l => ({
        pid: Number(l.pid) || 0, variant: text(l.variant, 40), sku: text(l.sku, 60),
        name: text(l.name, 200), qty: Math.max(1, Math.min(99, Math.round(Number(l.qty) || 1))),
        unit: money(l.unit, true) || 0, total: 0
      })).filter(l => l.name);
      if (!lines.length) return fail(res, 400, "no_lines");
      const phone = text(body.phone, 40);
      if (phoneKeyOf(phone).length < 9) return fail(res, 400, "phone_required");
      const now = Date.now();
      const no = await nextOrderNumber(prefix);
      const order = {
        no, v: 1, createdAt: now,
        channel: CHANNELS.includes(body.channel) ? body.channel : "phone",
        lang: ["ar", "en", "tr"].includes(body.lang) ? body.lang : "ar",
        status: FULFILMENT.includes(body.status) ? body.status : "new",
        statusAt: now,
        customer: {
          name: text(body.name, 80), phone, phoneKey: phoneKeyOf(phone),
          city: text(body.city, 60), address: text(body.address, 300),
          email: text(body.email, 120), note: text(body.note, 400)
        },
        lines,
        totals: { items: 0, delivery: body.delivery === "" || body.delivery === undefined || body.delivery === null ? null : money(body.delivery, true), discount: money(body.discount, true) || 0, grand: 0, currency: "USD" },
        delivery: { method: body.method === "pickup" ? "pickup" : "courier", city: text(body.city, 60), fee: null, promisedAt: null, note: "" },
        payment: {
          method: PAY_METHODS.includes(body.payMethod) ? body.payMethod : "cod",
          state: PAY_STATES.includes(body.payState) ? body.payState : "unpaid",
          paid: money(body.paid, true) || 0, at: null, ref: "", provider: ""
        },
        contacted: true, cancelReason: "", assignedTo: "",
        notes: [], history: [],
        email: { lastType: "", lastAt: 0, lastState: "" }
      };
      order.totals.delivery = order.totals.delivery === null ? null : order.totals.delivery;
      order.delivery.fee = order.totals.delivery;
      recomputeTotals(order);
      if (order.payment.state === "paid") order.payment.paid = order.totals.grand;
      note(order, who, "status", "", order.status, { created: order.channel });
      await writeOrder(order);
      if (CHAIN.indexOf(order.status) >= CHAIN.indexOf("confirmed")) await moveStock(order.lines, -1, who);
      await audit({ by: who, area: "order", target: no, action: "create", label: order.customer.name });
      return res.status(200).json({ ok: true, no, order });
    }

    if (req.method === "POST" && action === "order-status") {
      requireRole(user, "orders.status");
      const order = await readOrder(body.no);
      const to = String(body.status || "");
      if (!FULFILMENT.includes(to)) return fail(res, 400, "bad_transition");
      const from = order.status;
      if (!canMove(from, to)) return res.status(400).json({ ok: false, error: "bad_transition", from, to });
      if (to === "cancelled") {
        if (!CANCEL_REASONS.includes(String(body.reason || ""))) return fail(res, 400, "reason_required");
        if (!may(user, "orders.cancel")) return fail(res, 403, "forbidden");
        order.cancelReason = String(body.reason);
        order.cancelNote = text(body.reasonNote, 200);
      }
      if (to === "confirmed" && !order.customer.name) return fail(res, 400, "customer_name_required");
      if (to === "confirmed" && !order.customer.city) return fail(res, 400, "city_required");
      if (to === "packed" && order.delivery.method === "courier" && !order.customer.address) return fail(res, 400, "address_required");

      const committed = CHAIN.indexOf(from) >= CHAIN.indexOf("confirmed");
      order.status = to;
      order.statusAt = Date.now();
      order.contacted = true;
      note(order, who, "status", from, to, order.cancelReason ? { reason: order.cancelReason } : undefined);
      await writeOrder(order);

      // Stock is committed at مؤكَّد, released on a cancel before delivery, and
      // a return asks whether the pieces go back on the shelf.
      if (!committed && CHAIN.indexOf(to) >= CHAIN.indexOf("confirmed")) await moveStock(order.lines, -1, who);
      if (committed && to === "cancelled") await moveStock(order.lines, 1, who);
      if (to === "returned" && body.restock === true) await moveStock(order.lines, 1, who);
      await audit({ by: who, area: "order", target: order.no, action: "status", fields: { status: [from, to] } });
      return res.status(200).json({ ok: true, order });
    }

    if (req.method === "POST" && action === "order-payment") {
      // The one control through which money can quietly disappear. Owner only,
      // always, with the amount and the actor in the order's own history.
      requireRole(user, "*");
      const order = await readOrder(body.no);
      const before = { state: order.payment.state, paid: order.payment.paid };
      if (body.amount !== undefined && body.amount !== null && body.amount !== "") {
        const amount = money(body.amount, true);
        if (Number.isNaN(amount)) return fail(res, 400, "invalid_price");
        const paid = Math.round((Number(order.payment.paid || 0) + amount) * 100) / 100;
        if (paid > order.totals.grand + 0.001) return fail(res, 400, "payment_too_large");
        order.payment.paid = paid;
        order.payment.at = Date.now();
        order.payment.ref = text(body.ref, 60);
        if (body.method && PAY_METHODS.includes(body.method)) order.payment.method = body.method;
        order.payment.state = paid >= order.totals.grand - 0.001 ? "paid" : paid > 0 ? "partial" : "unpaid";
      } else if (body.state) {
        if (!PAY_STATES.includes(String(body.state))) return fail(res, 400, "invalid_order");
        if (String(body.state) === "refunded" && Number(order.payment.paid || 0) <= 0) return fail(res, 400, "refund_too_large");
        order.payment.state = String(body.state);
        if (order.payment.state === "paid") order.payment.paid = order.totals.grand;
        if (order.payment.state === "refunded") order.payment.paid = 0;
      } else if (body.method) {
        if (!PAY_METHODS.includes(String(body.method))) return fail(res, 400, "invalid_order");
        order.payment.method = String(body.method);
      }
      note(order, who, "payment", before.state, order.payment.state, { paid: order.payment.paid });
      await writeOrder(order);
      await audit({ by: who, area: "order", target: order.no, action: "payment", fields: { state: [before.state, order.payment.state], paid: [before.paid, order.payment.paid] } });
      return res.status(200).json({ ok: true, order });
    }

    if (req.method === "POST" && action === "order-note") {
      requireRole(user, "orders.note");
      const order = await readOrder(body.no);
      const value = text(body.text, 600);
      if (!value) return fail(res, 400, "invalid_order");
      order.notes.push({ at: Date.now(), by: who, text: value });
      order.contacted = true;
      await writeOrder(order);
      await audit({ by: who, area: "order", target: order.no, action: "note" });
      return res.status(200).json({ ok: true, order });
    }

    if (req.method === "POST" && action === "order-update") {
      requireRole(user, "*");
      const order = await readOrder(body.no);
      const changes = {};
      if (body.customer && typeof body.customer === "object") {
        const c = body.customer;
        const before = { ...order.customer };
        if (c.name !== undefined) order.customer.name = text(c.name, 80);
        if (c.phone !== undefined) {
          const phone = text(c.phone, 40);
          if (phoneKeyOf(phone).length < 9) return fail(res, 400, "phone_required");
          order.customer.phone = phone;
          order.customer.phoneKey = phoneKeyOf(phone);
        }
        if (c.city !== undefined) order.customer.city = text(c.city, 60);
        if (c.address !== undefined) order.customer.address = text(c.address, 300);
        if (c.email !== undefined) {
          const email = text(c.email, 120);
          if (email && !/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(email)) return fail(res, 400, "invalid_email");
          order.customer.email = email;
        }
        changes.customer = [before.name + " " + before.phone, order.customer.name + " " + order.customer.phone];
      }
      if (body.delivery !== undefined) {
        const fee = body.delivery === "" || body.delivery === null ? null : money(body.delivery, true);
        if (fee !== null && Number.isNaN(fee)) return fail(res, 400, "invalid_price");
        changes.delivery = [order.totals.delivery, fee];
        order.totals.delivery = fee;
        order.delivery.fee = fee;
      }
      if (body.discount !== undefined) {
        const discount = money(body.discount, true) || 0;
        if (discount > order.totals.items) return fail(res, 400, "discount_too_large");
        changes.discount = [order.totals.discount, discount];
        order.totals.discount = discount;
      }
      if (body.method) order.delivery.method = body.method === "pickup" ? "pickup" : "courier";
      if (body.promisedAt !== undefined) order.delivery.promisedAt = body.promisedAt ? String(body.promisedAt).slice(0, 10) : null;
      if (Array.isArray(body.lines)) {
        order.lines = body.lines.map(l => ({
          pid: Number(l.pid) || 0, variant: text(l.variant, 40), sku: text(l.sku, 60),
          name: text(l.name, 200), qty: Math.max(1, Math.min(99, Math.round(Number(l.qty) || 1))),
          unit: money(l.unit, true) || 0, total: 0
        })).filter(l => l.name);
        if (!order.lines.length) return fail(res, 400, "no_lines");
      }
      recomputeTotals(order);
      Object.entries(changes).forEach(([field, [from, to]]) => note(order, who, field, from, to));
      await writeOrder(order);
      await audit({ by: who, area: "order", target: order.no, action: "update", fields: changes });
      return res.status(200).json({ ok: true, order });
    }

    /* -------------------------------------------------------- customers */
    if (req.method === "GET" && action === "customers") {
      requireRole(user, "*");
      const rows = await orderRows({});
      const by = new Map();
      for (const row of rows) {
        const key = row.pk || row.phone;
        if (!key) continue;
        const found = by.get(key) || { key, name: row.name, phone: row.phone, city: row.city, orders: 0, spent: 0, last: 0, first: Infinity };
        found.orders++;
        found.spent = Math.round((found.spent + Number(row.grand || 0)) * 100) / 100;
        found.last = Math.max(found.last, row.at);
        found.first = Math.min(found.first, row.at);
        if (row.name) found.name = row.name;
        if (row.city) found.city = row.city;
        by.set(key, found);
      }
      let out = [...by.values()].sort((a, b) => b.last - a.last);
      const q = fold(query.q);
      if (q) out = out.filter(c => fold(c.name).includes(q) || String(c.phone).replace(/\D/g, "").includes(q.replace(/\D/g, "")));
      return res.status(200).json({ ok: true, total: out.length, rows: out.slice(0, 200) });
    }

    /* --------------------------------------------------------- taxonomy */
    if (req.method === "GET" && action === "taxonomy") {
      const tax = await loadTaxonomy();
      const { state } = await readState();
      const cat = await loadCatalogue();
      const rows = mergeRows(cat, state);
      const counts = {};
      rows.forEach(p => { counts[p.category] = (counts[p.category] || 0) + 1; });
      const brandCounts = {};
      rows.forEach(p => { brandCounts[p.brand] = (brandCounts[p.brand] || 0) + 1; });
      // The imported catalogue still carries the old category ids, and they are
      // valid for ever (312 indexed URLs). Their names come from the shop
      // dictionary, read here so the console never downloads it.
      const labels = {};
      const dict = await labelsFromDictionary();
      for (const id of Object.keys(counts)) if (dict[id]) labels[id] = dict[id];
      return res.status(200).json({ ok: true, taxonomy: tax, counts, brandCounts, labels });
    }

    if (req.method === "POST" && action === "taxonomy-save") {
      requireRole(user, "taxonomy.edit");
      const op = String(body.op || "");
      const tax = await loadTaxonomy();
      const nodes = tax.nodes;
      const { state } = await readState();
      const cat = await loadCatalogue();
      const rows = mergeRows(cat, state);
      const countOf = id => rows.filter(p => String(p.category) === String(id)).length;

      if (op === "add" || op === "edit") {
        const slug = text(body.id, 40).toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "");
        if (!slug) return fail(res, 400, "invalid_node");
        const existing = nodes.find(n => n.id === slug);
        if (op === "add" && existing) return fail(res, 400, "slug_taken");
        if (op === "edit" && !existing) return fail(res, 400, "invalid_node");
        const target = existing || { id: slug };
        target.parent = body.parent ? String(body.parent) : null;
        target.order = Number(body.order || (nodes.length + 1) * 10);
        target.visible = body.visible !== false;
        target.icon = text(body.icon, 40);
        target.name = { ar: text(body.nameAr, 80), en: text(body.nameEn, 80), tr: text(body.nameTr, 80) };
        target.description = { ar: text(body.descAr, 400), en: text(body.descEn, 400), tr: text(body.descTr, 400) };
        if (!target.name.ar) return fail(res, 400, "name_required");
        if (!existing) nodes.push(target);
      } else if (op === "move") {
        const node = nodes.find(n => n.id === String(body.id));
        if (!node) return fail(res, 400, "invalid_node");
        if (body.parent !== undefined) node.parent = body.parent ? String(body.parent) : null;
        if (body.order !== undefined) node.order = Number(body.order);
      } else if (op === "hide") {
        const node = nodes.find(n => n.id === String(body.id));
        if (!node) return fail(res, 400, "invalid_node");
        node.visible = body.visible === true;
      } else if (op === "delete") {
        const node = nodes.find(n => n.id === String(body.id));
        if (!node) return fail(res, 400, "invalid_node");
        const n = countOf(node.id) + nodes.filter(x => x.parent === node.id).reduce((s, x) => s + countOf(x.id), 0);
        if (n > 0) return res.status(400).json({ ok: false, error: "node_has_products", count: n });
        tax.nodes = nodes.filter(x => x.id !== node.id);
      } else if (op === "merge") {
        // A move writes an alias, so the old URL 301s for ever.
        const from = String(body.id), to = String(body.into);
        if (!nodes.find(n => n.id === to)) return fail(res, 400, "invalid_node");
        tax.aliases = tax.aliases || {};
        tax.aliases[from] = to;
        tax.nodes = nodes.filter(x => x.id !== from);
        await mutate(s => {
          for (const p of rows) {
            if (String(p.category) !== from) continue;
            const id = Number(p.id);
            const target = s.additions.find(x => Number(x.id) === id) || s.overrides[String(id)] ||
              (s.overrides[String(id)] = { id, savedAt: Date.now() });
            target.category = to;
            target.savedAt = Date.now();
          }
        }, { by: who, area: "taxonomy", summaryKey: "admin.bkMerge" });
      } else return fail(res, 400, "unknown_action");

      tax.nodes.sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
      await mutateJson(TAXONOMY_PATH, tax, () => tax);
      await audit({ by: who, area: "taxonomy", target: String(body.id || ""), action: op });
      return res.status(200).json({ ok: true, taxonomy: tax });
    }

    if (req.method === "POST" && action === "brand-save") {
      requireRole(user, "taxonomy.edit");
      const tax = await loadTaxonomy();
      tax.brands = Array.isArray(tax.brands) ? tax.brands : [];
      const slug = text(body.slug, 40).toLowerCase().replace(/[^a-z0-9-]/g, "-") ||
        text(body.name, 40).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      if (!slug) return fail(res, 400, "name_required");
      if (body.op === "delete") {
        tax.brands = tax.brands.filter(b => b.slug !== slug);
      } else {
        const found = tax.brands.find(b => b.slug === slug) || (tax.brands.push({ slug }), tax.brands[tax.brands.length - 1]);
        found.name = text(body.name, 60) || found.name || slug;
        // A missing logo is normal: the row renders a wordmark, never a broken
        // image, and the editor says so.
        found.logo = body.logo ? cleanImage(body.logo) : null;
        found.order = Number(body.order || found.order || (tax.brands.length + 1) * 10);
        found.visible = body.visible !== false;
        found.authorised = body.authorised === true;
        found.tagline = { ar: text(body.taglineAr, 120), en: text(body.taglineEn, 120), tr: text(body.taglineTr, 120) };
      }
      tax.brands.sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
      await mutateJson(TAXONOMY_PATH, tax, () => tax);
      await audit({ by: who, area: "brand", target: slug, action: body.op || "save" });
      return res.status(200).json({ ok: true, taxonomy: tax });
    }

    /* ----------------------------------------------------------- content */
    if (req.method === "GET" && action === "content") {
      const content = (await readJson(CONTENT_PATH, EMPTY_CONTENT)).value;
      const status = await policyStatus(content);
      const preview = await previewPolicies(content);
      return res.status(200).json({ ok: true, content, status, preview });
    }

    if (req.method === "POST" && action === "content-save") {
      requireRole(user, "content.edit");
      const answers = body.policies && typeof body.policies === "object" ? body.policies : {};
      const clean = {};
      for (const field of await POLICY_FIELDS()) {
        const given = answers[field.key];
        if (!given) continue;
        const ar = text(given.ar, 400);
        if (!ar) continue;
        if (ar.length < 2) return fail(res, 400, "invalid_answer");
        if (/\[\[|\]\]/.test(ar + (given.en || "") + (given.tr || ""))) return fail(res, 400, "brackets_not_allowed");
        if (ar.length > 400 || text(given.en, 500).length > 400 || text(given.tr, 500).length > 400) return fail(res, 400, "answer_too_long");
        clean[field.key] = { ar, en: text(given.en, 400) || ar, tr: text(given.tr, 400) || ar, reviewed: given.reviewed === true };
      }
      const next = await mutateJson(CONTENT_PATH, EMPTY_CONTENT, doc => {
        doc.policies = clean;
        if (body.pages && typeof body.pages === "object") doc.pages = body.pages;
        if (body.home && typeof body.home === "object") doc.home = body.home;
        return doc;
      });
      await audit({ by: who, area: "content", action: "policies", fields: { filled: Object.keys(clean) } });
      const status = await policyStatus(next);
      return res.status(200).json({ ok: true, content: next, status });
    }

    /* ------------------------------------------------------------- media */
    if (req.method === "GET" && action === "gallery") {
      const id = String(query.id || "");
      return res.status(200).json({ ok: true, images: await galleryFor(id) });
    }

    if (req.method === "GET" && action === "library") {
      const stored = (await readJson(GALLERY_PATH, { products: {} })).value;
      const used = {};
      Object.entries(stored.products || {}).forEach(([pid, shots]) =>
        (shots || []).forEach(s => { used[s.url] = (used[s.url] || 0) + 1; }));
      const { blobs } = await list({ prefix: "products/" });
      const rows = blobs.map(b => ({
        url: "/api/image?pathname=" + encodeURIComponent(b.pathname),
        pathname: b.pathname, size: b.size || 0
      }));
      rows.forEach(r => { r.uses = used[r.url] || 0; });
      return res.status(200).json({
        ok: true, rows, total: rows.length,
        bytes: rows.reduce((s, r) => s + r.size, 0)
      });
    }

    if (req.method === "POST" && action === "gallery-save") {
      requireRole(user, "media.edit");
      const id = String(body.id || "");
      if (!id) return fail(res, 400, "invalid_id");
      const images = (Array.isArray(body.images) ? body.images : []).slice(0, MAX_GALLERY).map(img => ({
        url: cleanImage(img.url), kind: img.kind === "scene" ? "scene" : "pack", alt: text(img.alt, 160)
      })).filter(img => img.url);
      if ((Array.isArray(body.images) ? body.images.length : 0) > MAX_GALLERY) return fail(res, 400, "too_many_images");
      await mutateJson(GALLERY_PATH, { products: {} }, doc => {
        doc.products = doc.products || {};
        if (images.length) doc.products[id] = images; else delete doc.products[id];
        return doc;
      });
      // The first image is the main one, and it is what the card shows.
      if (images.length) {
        const numeric = Number(id);
        if (Number.isSafeInteger(numeric) && numeric > 0) {
          await mutate(s => {
            const target = s.additions.find(x => Number(x.id) === numeric) || s.overrides[id] ||
              (s.overrides[id] = { id: numeric, savedAt: Date.now() });
            target.image = images[0].url;
            target.savedAt = Date.now();
          }, { by: who, area: "media", summaryKey: "admin.bkMedia" });
        }
      }
      await audit({ by: who, area: "media", target: id, action: "gallery", fields: { count: images.length } });
      return res.status(200).json({ ok: true, images });
    }

    /* ---------------------------------------------------------- settings */
    if (req.method === "GET" && action === "settings") {
      requireRole(user, "*");
      const { state } = await readState();
      return res.status(200).json({ ok: true, settings: publicish(state.settings, true) });
    }

    if (req.method === "POST" && action === "settings") {
      // A member of staff who can change the shop's contact number can redirect
      // every enquiry to their own phone. Owner only, always, with an entry in
      // the log.
      requireRole(user, "*");
      const whatsapp = String(body.whatsapp || "").replace(/\D/g, "").replace(/^0+/, "");
      if (whatsapp.length < 10 || whatsapp.length > 15) return fail(res, 400, "invalid_whatsapp");
      const email = text(body.email, 120);
      if (email && !/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(email)) return fail(res, 400, "invalid_email");
      const whatsapp2 = String(body.whatsapp2 || "").replace(/\D/g, "").replace(/^0+/, "");
      if (whatsapp2 && (whatsapp2.length < 10 || whatsapp2.length > 15)) return fail(res, 400, "invalid_whatsapp");
      const prefix = text(body.orderPrefix, 8).toUpperCase().replace(/[^A-Z0-9]/g, "") || "SY";
      const lowAt = Math.max(0, Math.min(9999, Math.round(Number(body.lowAt) || 3)));
      // Empty must render «يُتفق عليه», never $0.00 — so an empty box stores
      // null and is never coerced to a number.
      const delivery = {};
      if (body.delivery && typeof body.delivery === "object") {
        for (const [city, value] of Object.entries(body.delivery)) {
          const key = String(city).slice(0, 40);
          if (value === "" || value === null || value === undefined) { delivery[key] = null; continue; }
          const fee = money(value, true);
          if (Number.isNaN(fee)) return fail(res, 400, "invalid_price");
          delivery[key] = fee;
        }
      }
      const paused = body.paused === true;
      const pauseMessage = { ar: text(body.pauseAr, 300), en: text(body.pauseEn, 300), tr: text(body.pauseTr, 300) };
      if (paused && !pauseMessage.ar) return fail(res, 400, "invalid_answer");
      await mutate(s => {
        s.settings = {
          ...s.settings, whatsapp, whatsapp2, email, orderPrefix: prefix, lowAt,
          deliveryPrices: delivery, paused, pauseMessage,
          storeName: text(body.storeName, 60), address: text(body.address, 200),
          mapUrl: text(body.mapUrl, 300), freeOver: money(body.freeOver, true) || 0,
          soldOut: ["show", "hide", "preorder"].includes(body.soldOut) ? body.soldOut : "show"
        };
      }, { by: who, area: "settings", summaryKey: "admin.bkSettings" });
      await audit({ by: who, area: "settings", action: "update", fields: { whatsapp, email } });
      const { state } = await readState();
      return res.status(200).json({ ok: true, settings: publicish(state.settings, true) });
    }

    /* ------------------------------------------------------------ users */
    if (req.method === "GET" && action === "users") {
      requireRole(user, "*");
      const { state } = await readState();
      const users = Array.isArray(state.settings.users) ? state.settings.users : [];
      return res.status(200).json({
        ok: true,
        rows: users.map(u => ({ id: u.id, name: u.name, login: u.login, role: u.role, enabled: u.enabled !== false, lastSeen: u.lastSeen || 0 }))
      });
    }

    if (req.method === "POST" && action === "user-save") {
      requireRole(user, "*");
      const login = text(body.login, 40).toLowerCase().replace(/[^a-z0-9._-]/g, "");
      if (!login) return fail(res, 400, "name_required");
      const role = ["owner", "staff", "editor"].includes(body.role) ? body.role : "staff";
      const password = String(body.password || "");
      if (body.op !== "delete" && body.op !== "toggle" && !body.id && password.length < 10) return fail(res, 400, "weak_password");
      let outcome = null;
      await mutate(s => {
        const users = Array.isArray(s.settings.users) ? s.settings.users : [];
        if (body.op === "delete") {
          const owners = users.filter(u => u.role === "owner" && u.id !== body.id);
          const target = users.find(u => u.id === body.id);
          if (target && target.role === "owner" && !owners.length) { outcome = "last_owner"; return; }
          s.settings = { ...s.settings, users: users.filter(u => u.id !== body.id) };
          return;
        }
        const found = body.id ? users.find(u => u.id === body.id) : null;
        if (body.op === "toggle" && found) { found.enabled = body.enabled !== false; }
        else if (found) {
          if (found.id === who && found.role !== role) { outcome = "forbidden"; return; }
          found.name = text(body.name, 60); found.login = login; found.role = role;
          if (password) { const s2 = crypto.randomBytes(16).toString("hex"); found.salt = s2; found.hash = hashPassword(password, s2); }
        } else {
          if (users.some(u => u.login === login)) { outcome = "login_taken"; return; }
          const salt = crypto.randomBytes(16).toString("hex");
          users.push({ id: "u" + Date.now().toString(36), name: text(body.name, 60), login, role, enabled: true, salt, hash: hashPassword(password, salt), lastSeen: 0 });
        }
        s.settings = { ...s.settings, users };
      }, { by: who, area: "users", summaryKey: "admin.bkUsers" });
      if (outcome) return fail(res, outcome === "forbidden" ? 403 : 400, outcome);
      await audit({ by: who, area: "users", target: login, action: body.op || "save" });
      return res.status(200).json({ ok: true });
    }

    /* ---------------------------------------------------------- reports */
    if (req.method === "GET" && action === "reports") {
      requireRole(user, "*");
      const rows = await orderRows({});
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
      const window30 = Date.now() - 30 * 86400000;
      const sold = rows.filter(r => r.st !== "cancelled");
      const sum = list2 => Math.round(list2.reduce((s, r) => s + Number(r.grand || 0), 0) * 100) / 100;
      const thisMonth = sold.filter(r => r.at >= monthStart);
      const lastMonth = sold.filter(r => r.at >= prevStart && r.at < monthStart);

      // The top-seller and profit reports need the lines, so only the recent
      // orders are opened — the index alone cannot answer them.
      const recent = sold.filter(r => r.at >= window30).slice(0, 400);
      const byProduct = new Map();
      for (const row of recent) {
        const order = await readOrder(row.no).catch(() => null);
        if (!order) continue;
        for (const line of order.lines) {
          const key = String(line.pid || line.name);
          const found = byProduct.get(key) || { pid: line.pid, name: line.name, qty: 0, revenue: 0 };
          found.qty += Number(line.qty || 0);
          found.revenue = Math.round((found.revenue + Number(line.total || 0)) * 100) / 100;
          byProduct.set(key, found);
        }
      }
      const { state } = await readState();
      const cat = await loadCatalogue();
      const merged = mergeRows(cat, state);
      const stockById = new Map(merged.map(p => [String(p.id), stockOf(p)]));
      const top = [...byProduct.values()].sort((a, b) => b.qty - a.qty).slice(0, 10)
        .map(p => ({ ...p, stock: stockById.get(String(p.pid)) ?? null }));

      const stale = Date.now() - 48 * 3600000;
      const open = (await readJson(ORDERS_OPEN, { rows: [] })).value.rows || [];
      const byCity = {}, byChannel = {}, byPay = {}, byDay = {};
      thisMonth.forEach(r => {
        byCity[r.city || ""] = (byCity[r.city || ""] || 0) + 1;
        byChannel[r.ch || "web"] = (byChannel[r.ch || "web"] || 0) + 1;
        byPay[r.pay || "unpaid"] = (byPay[r.pay || "unpaid"] || 0) + 1;
        const d = new Date(r.at).toISOString().slice(0, 10);
        byDay[d] = Math.round(((byDay[d] || 0) + Number(r.grand || 0)) * 100) / 100;
      });
      const cancelled = rows.filter(r => r.st === "cancelled");
      const reasons = {};
      for (const row of cancelled.slice(0, 300)) {
        const order = await readOrder(row.no).catch(() => null);
        if (order && order.cancelReason) reasons[order.cancelReason] = (reasons[order.cancelReason] || 0) + 1;
      }
      const lowDefault = Number(state.settings.lowAt || 3);
      return res.status(200).json({
        ok: true,
        month: { revenue: sum(thisMonth), orders: thisMonth.length, aov: thisMonth.length ? Math.round(sum(thisMonth) / thisMonth.length * 100) / 100 : 0 },
        previous: { revenue: sum(lastMonth), orders: lastMonth.length, aov: lastMonth.length ? Math.round(sum(lastMonth) / lastMonth.length * 100) / 100 : 0 },
        top,
        outWanted: merged.filter(p => stockOf(p) === 0)
          .map(p => ({ id: p.id, name: p.name, inOpen: open.length ? null : 0 })).slice(0, 10),
        stuck: open.filter(r => Number(r.statusAt || r.at) < stale).sort((a, b) => a.at - b.at).slice(0, 20),
        owed: rows.filter(r => r.st === "delivered" && r.pay !== "paid" && r.pay !== "refunded")
          .sort((a, b) => a.at - b.at).slice(0, 20),
        owedTotal: Math.round(rows.filter(r => r.st === "delivered" && r.pay !== "paid" && r.pay !== "refunded")
          .reduce((s, r) => s + Number(r.grand || 0), 0) * 100) / 100,
        byCity, byChannel, byPay, byDay, reasons,
        debt: {
          noPhoto: merged.filter(p => !p.image || !/^assets\/products\//.test(p.image)).length,
          noArabicDesc: merged.filter(p => !String(p.descriptionAr || "").trim()).length,
          low: merged.filter(p => { const s2 = stockOf(p); return s2 > 0 && s2 <= lowAtOf(p, lowDefault); }).length
        }
      });
    }

    /* --------------------------------------------------- audit + backups */
    if (req.method === "GET" && action === "audit") {
      requireRole(user, "*");
      const days = [];
      for (let i = 0; i < 14; i++) days.push(new Date(Date.now() - i * 86400000).toISOString().slice(0, 10));
      const out = [];
      for (const day of days) {
        const blob = await get(`data/audit/${day}.jsonl`, { access: "private", useCache: false });
        if (!blob) continue;
        const body2 = await new Response(blob.stream).text();
        for (const line of body2.split("\n")) {
          if (!line.trim()) continue;
          try { out.push(JSON.parse(line)); } catch { /* a truncated line */ }
        }
      }
      out.sort((a, b) => b.at - a.at);
      return res.status(200).json({ ok: true, rows: out.slice(0, 300) });
    }

    /* Every backup is reachable by name, with what it holds, and what
       restoring it would undo. Nineteen of twenty used to be unreachable. */
    if (req.method === "GET" && action === "backups") {
      requireRole(user, "*");
      const rolling = (await list({ prefix: BACKUP_PREFIX })).blobs.filter(b => b.pathname.startsWith(BACKUP_PREFIX));
      const daily = (await list({ prefix: DAILY_PREFIX })).blobs;
      const describe = async (blob, tier) => {
        const found = await get(blob.pathname, { access: "private", useCache: false });
        if (!found) return null;
        let doc = null;
        try { doc = JSON.parse(await new Response(found.stream).text()); } catch { return null; }
        const wrapped = doc && doc.v === 2 && doc.state;
        return {
          name: blob.pathname, tier,
          at: wrapped ? doc.at : Date.parse(blob.pathname.slice(blob.pathname.lastIndexOf(".json") - 24, blob.pathname.lastIndexOf(".json")).replace(/-(\d\d)-(\d\d)-(\d\d\d)Z$/, ":$1:$2.$3Z")) || 0,
          by: wrapped ? doc.by : "", area: wrapped ? doc.area : "",
          summaryKey: wrapped ? doc.summaryKey : "", summaryVars: wrapped ? doc.summaryVars : {}
        };
      };
      const rows = [];
      for (const b of rolling.sort((a, b) => (a.pathname < b.pathname ? 1 : -1))) {
        const row = await describe(b, "rolling");
        if (row) rows.push(row);
      }
      for (const b of daily.sort((a, b) => (a.pathname < b.pathname ? 1 : -1))) {
        const row = await describe(b, "daily");
        if (row) rows.push(row);
      }
      return res.status(200).json({ ok: true, rows });
    }

    /* Plain language, before anything happens. */
    if (req.method === "GET" && action === "backup-diff") {
      requireRole(user, "*");
      const name = String(query.name || "");
      if (!name.startsWith("data/backups/")) return fail(res, 400, "no_backup");
      const blob = await get(name, { access: "private", useCache: false });
      if (!blob) return fail(res, 400, "no_backup");
      let doc = null;
      try { doc = JSON.parse(await new Response(blob.stream).text()); } catch { return fail(res, 400, "no_backup"); }
      const snap = normalizeState(doc && doc.v === 2 ? doc.state : doc);
      const { state } = await readState();
      const cat = await loadCatalogue();
      const now = mergeRows(cat, state);
      const then = mergeRows(cat, snap);
      const byId = new Map(then.map(p => [String(p.id), p]));
      const changes = [];
      for (const p of now) {
        const old = byId.get(String(p.id));
        if (!old) { changes.push({ kind: "added", id: p.id, name: p.name }); continue; }
        for (const field of ["price", "stock", "name", "inStock", "category"]) {
          const a = old[field], b = p[field];
          if (a === undefined && b === undefined) continue;
          if (String(a) !== String(b)) changes.push({ kind: "field", id: p.id, name: p.name, field, from: a === undefined ? "" : a, to: b === undefined ? "" : b });
        }
      }
      for (const p of then) if (!now.some(x => String(x.id) === String(p.id))) changes.push({ kind: "removed", id: p.id, name: p.name });
      return res.status(200).json({ ok: true, at: doc && doc.at, changes: changes.slice(0, 60), total: changes.length });
    }

    if (req.method === "POST" && (action === "reset" || action === "restore-backup")) {
      requireRole(user, "*");
      // PRESERVED: deliberately does not read the current state, so it still
      // works when the stored document is unreadable. The revocation stamp is
      // carried across, or every session that was signed out comes back.
      const keepRevoked = Number(revokedBefore || 0);
      let restored = { overrides: {}, additions: [], deleted: [], settings: { revokedBefore: keepRevoked } };
      if (action === "restore-backup") {
        const name = String(body.name || "");
        let chosen = name;
        if (!chosen) {
          const { blobs } = await list({ prefix: BACKUP_PREFIX });
          const newest = blobs.filter(b => b.pathname.startsWith(BACKUP_PREFIX)).sort((a, b) => (a.pathname < b.pathname ? 1 : -1))[0];
          if (!newest) return fail(res, 400, "no_backup");
          chosen = newest.pathname;
        }
        if (!chosen.startsWith("data/backups/")) return fail(res, 400, "no_backup");
        const backup = await get(chosen, { access: "private", useCache: false });
        if (!backup) return fail(res, 400, "no_backup");
        let doc = null;
        try { doc = JSON.parse(await new Response(backup.stream).text()); } catch { return fail(res, 400, "no_backup"); }
        restored = doc && doc.v === 2 && doc.state ? doc.state : doc;
        restored = restored && typeof restored === "object" ? restored : null;
        if (!restored) return fail(res, 400, "no_backup");
        restored.settings = restored.settings && typeof restored.settings === "object" ? restored.settings : {};
        // A backup predates the revocation it is being restored over.
        restored.settings.revokedBefore = Math.max(Number(restored.settings.revokedBefore || 0), keepRevoked);
      }
      // Restoring never loses the present: the current state is snapshotted
      // first, so the restore itself can be undone.
      try {
        const current = await get(STATE_PATH, { access: "private", useCache: false });
        if (current) await snapshot(await new Response(current.stream).text(), { by: who, area: "restore", summaryKey: "admin.bkBeforeRestore" });
      } catch (e) { console.error("pre-restore snapshot failed", e); }
      const body2 = JSON.stringify(restored);
      await put(STATE_PATH, body2, { access: "private", contentType: "application/json", addRandomSuffix: false, allowOverwrite: true });
      revokedBefore = Number(restored.settings.revokedBefore || keepRevoked);
      revokedAt = Date.now();
      await audit({ by: who, area: "backup", action, target: String(body.name || "") });
      return res.status(200).json({ ok: true });
    }

    /* Export: the owner's insurance against the shop, the host and the
       developer all at once, and it costs one branch. */
    if (req.method === "GET" && action === "export") {
      requireRole(user, "*");
      const { state } = await readState();
      const tax = await loadTaxonomy();
      const content = (await readJson(CONTENT_PATH, EMPTY_CONTENT)).value;
      const gallery = (await readJson(GALLERY_PATH, { products: {} })).value;
      const rows = await orderRows({});
      const orders = [];
      for (const row of rows.slice(0, 1000)) {
        const order = await readOrder(row.no).catch(() => null);
        if (order) orders.push(order);
      }
      const clean = { ...state };
      delete clean.logins;
      clean.settings = { ...clean.settings };
      delete clean.settings.users;
      return res.status(200).json({ ok: true, exportedAt: Date.now(), state: clean, taxonomy: tax, content, gallery, orders });
    }

    /* ------------------------------------------------------------ upload */
    if (req.method === "POST" && action === "presign") {
      requireRole(user, "media.edit");
      const contentType = String(body.contentType || "").toLowerCase();
      const ext = IMAGE_TYPES[contentType];
      if (!ext) return fail(res, 400, "unsupported_image");
      const size = Number(body.size || 0);
      if (!size || size > MAX_IMAGE_BYTES) return fail(res, 400, "image_too_large");
      const base = String(body.filename || "").replace(/\.[^.]*$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "image";
      const pathname = `products/${Date.now()}-${crypto.randomBytes(3).toString("hex")}-${base}.${ext}`;
      const validUntil = Date.now() + 15 * 60 * 1000;
      const token = await issueSignedToken({
        pathname, operations: ["put"], validUntil,
        allowedContentTypes: [contentType], maximumSizeInBytes: MAX_IMAGE_BYTES
      });
      const { presignedUrl } = await presignUrl(token, { operation: "put", pathname, access: "private", validUntil });
      let storeId = "";
      try { storeId = parseStoreIdFromDelegationToken(token.delegationToken) || ""; } catch {}
      return res.status(200).json({ ok: true, pathname, presignedUrl, storeId });
    }

    return fail(res, 404, "unknown_action");
  } catch (e) {
    const code = CODES.has(e?.message) ? e.message : "server_error";
    if (code === "server_error") console.error("admin api error", e);
    return fail(res, code === "forbidden" ? 403 : code === "server_error" ? 500 : 400, code);
  }
}

/* ------------------------------------------------------------- helpers */

function round(value, mode) {
  const n = Number(value);
  if (!Number.isFinite(n)) return NaN;
  if (mode === "99") return Math.max(0, Math.floor(n) + 0.99);
  if (mode === "95") return Math.max(0, Math.floor(n) + 0.95);
  if (mode === "int") return Math.round(n);
  return Math.round(n * 100) / 100;
}
function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), String(salt), 32).toString("hex");
}
function verifyPassword(password, salt, hash) {
  try { return safeEqual(hashPassword(password, salt), String(hash)); } catch { return false; }
}
/* The console shows settings; `logins` and the password hashes never leave. */
function publicish(settings, full) {
  const s = settings && typeof settings === "object" ? settings : {};
  const out = {
    whatsapp: String(s.whatsapp || ""), whatsapp2: String(s.whatsapp2 || ""),
    email: String(s.email || ""), orderPrefix: String(s.orderPrefix || "SY"),
    lowAt: Number(s.lowAt || 3), deliveryPrices: s.deliveryPrices && typeof s.deliveryPrices === "object" ? s.deliveryPrices : {},
    paused: s.paused === true, pauseMessage: s.pauseMessage || { ar: "", en: "", tr: "" },
    storeName: String(s.storeName || ""), address: String(s.address || ""),
    mapUrl: String(s.mapUrl || ""), freeOver: Number(s.freeOver || 0),
    soldOut: String(s.soldOut || "show")
  };
  if (full) out.userCount = Array.isArray(s.users) ? s.users.length : 0;
  return out;
}

/* Scanning the monthly indexes is how every order list and every report is
   computed: no aggregation store, no cron. Comfortable to ~5,000 a month. */
async function orderRows(query) {
  const { blobs } = await list({ prefix: "data/orders/" });
  const indexes = blobs.filter(b => /\/index\.json$/.test(b.pathname)).map(b => b.pathname).sort().reverse();
  let rows = [];
  for (const path of indexes.slice(0, 24)) {
    const doc = (await readJson(path, { rows: [] })).value;
    rows = rows.concat(Array.isArray(doc.rows) ? doc.rows : []);
  }
  rows.sort((a, b) => b.at - a.at);
  const q = fold(query.q);
  if (q) {
    const digits = String(query.q).replace(/\D/g, "");
    rows = rows.filter(r =>
      String(r.no).toLowerCase().includes(String(query.q).toLowerCase()) ||
      fold(r.name).includes(q) ||
      (digits.length >= 4 && String(r.pk || "").includes(digits)));
  }
  if (query.status === "open") rows = rows.filter(r => !TERMINAL.has(r.st) || (r.st === "delivered" && r.pay !== "paid" && r.pay !== "refunded"));
  else if (query.status && query.status !== "all") rows = rows.filter(r => r.st === query.status);
  if (query.pay === "unpaid") rows = rows.filter(r => r.pay === "unpaid");
  else if (query.pay === "cod") rows = rows.filter(r => r.pay === "unpaid" && r.pm === "cod");
  else if (query.pay === "awaiting") rows = rows.filter(r => (r.pay === "unpaid" && r.pm !== "cod") || r.pay === "failed");
  else if (query.pay && query.pay !== "all") rows = rows.filter(r => r.pay === query.pay);
  if (query.city) rows = rows.filter(r => r.city === query.city);
  if (query.channel && query.channel !== "all") rows = rows.filter(r => (r.ch || "web") === query.channel);
  if (query.stuck === "1") {
    const yesterday = Date.now() - 86400000;
    rows = rows.filter(r => r.st === "shipped" && Number(r.statusAt || r.at) < yesterday);
  }
  if (query.from) rows = rows.filter(r => r.at >= Date.parse(query.from));
  if (query.to) rows = rows.filter(r => r.at <= Date.parse(query.to) + 86400000);
  return rows;
}
async function customerOrders(phoneKey) {
  if (!phoneKey) return { orders: 0, spent: 0 };
  const rows = await orderRows({});
  const mine = rows.filter(r => r.pk === phoneKey);
  return { orders: mine.length, spent: Math.round(mine.reduce((s, r) => s + Number(r.grand || 0), 0) * 100) / 100, rows: mine.slice(0, 20) };
}

/* The gallery the storefront already draws: `assets/gallery.json` maps 294
   products to 1,598 shots in a compact "position + kind" code. The console
   reads it, so those photographs are reachable on day one, and writes its own
   list over the top once the owner touches a product. */
async function galleryFor(id) {
  const stored = (await readJson(GALLERY_PATH, { products: {} })).value;
  const mine = (stored.products || {})[String(id)];
  if (Array.isArray(mine) && mine.length) return mine;
  const seed = await readAssetJson("assets/gallery.json", {});
  const code = seed[String(id)];
  if (!code) return [];
  const out = [];
  for (let i = 0; i + 1 < code.length; i += 2) {
    const position = Number(code[i]);
    if (!position) continue;
    out.push({
      url: "assets/products/" + id + (position === 1 ? "" : "-" + position) + ".webp",
      kind: code[i + 1] === "s" ? "scene" : "pack", alt: ""
    });
  }
  return out;
}

/* What the customer will see once the answers are saved. */
async function previewPolicies(content) {
  const text2 = await readAsset("assets/policies.json");
  if (!text2) return {};
  try { return JSON.parse(await substitute(text2, (content && content.policies) || {})); }
  catch { return {}; }
}

/* Exported so api/orders.js and api/order.js reuse one definition of every one
   of these rather than inventing a second. */
export {
  FULFILMENT, CHAIN, PAY_STATES, PAY_METHODS, CHANNELS, CANCEL_REASONS,
  canMove, isBack, isOpen, writeOrder, readOrder, nextOrderNumber, recomputeTotals,
  phoneKeyOf, indexRow, mutate, readState, readJson, mutateJson, audit, orderRows,
  substitute, POLICY_FIELDS, loadCatalogue, mergeRows, stockOf, fold
};
