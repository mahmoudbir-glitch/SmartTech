/*
 * What the storefront reads.
 *
 * It answers three things, all from Vercel Blob, all without a deploy:
 *
 *   1. the owner's catalogue overrides, additions and deletions (as before);
 *   2. the policy answers he has filled in, already substituted into
 *      `assets/policies.json` — `?what=policies`. Twelve of the shop's
 *      twenty-two customer-facing answers are hidden because the draft still
 *      carries a `[[placeholder]]`, and `script.js` refuses to render a point
 *      that has one. Filling the field in the console has to unhide the answer
 *      the same minute, which means the document the storefront reads cannot be
 *      a static file;
 *   3. the taxonomy and brands the owner edits, so adding a department is four
 *      fields and no code change — `?what=taxonomy`.
 *
 * Nothing here is authenticated and nothing here writes.
 */
import { get } from "@vercel/blob";

const EMPTY = { overrides: {}, additions: [], deleted: [], settings: {} };

/*
 * The list of unanswered questions is read out of the document rather than
 * typed here — the same derivation api/admin.js uses, so the two cannot drift
 * and no Arabic or Turkish string is written into a source file. Within one
 * point the placeholders line up across the three languages, so the English
 * token names the field and the other two come with it.
 */
const tokensIn = value => [...String(value || "").matchAll(/\[\[([^\]]+)\]\]/g)].map(m => m[1]);
const fieldKey = token => String(token).toLowerCase().replace(/^the\s+/, "")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
function policyFields(doc) {
  const out = new Map();
  for (const section of Object.values(doc || {})) {
    const parts = [section.intro || {}].concat((section.points || []).flatMap(p => [p.q || {}, p.a || {}]));
    for (const part of parts) {
      const ar = tokensIn(part.ar), en = tokensIn(part.en), tr = tokensIn(part.tr);
      if (!en.length || en.length !== ar.length || en.length !== tr.length) continue;
      en.forEach((token, i) => {
        const key = fieldKey(token);
        if (key && !out.has(key)) out.set(key, { key, tokens: { ar: ar[i], en: token, tr: tr[i] } });
      });
    }
  }
  return [...out.values()];
}

// Only the fields the storefront needs; internal bookkeeping stays private.
function publicSettings(settings) {
  const s = settings && typeof settings === "object" ? settings : {};
  return {
    whatsapp: String(s.whatsapp || ""),
    whatsapp2: String(s.whatsapp2 || ""),
    email: String(s.email || ""),
    // Empty is not zero. An unset governorate renders «يُتفق عليه»; printing
    // $0.00 would promise free delivery the shop has not agreed to.
    deliveryPrices: s.deliveryPrices && typeof s.deliveryPrices === "object" ? s.deliveryPrices : {},
    freeOver: Number(s.freeOver || 0),
    soldOut: String(s.soldOut || "show"),
    paused: s.paused === true,
    pauseMessage: s.pauseMessage && typeof s.pauseMessage === "object" ? s.pauseMessage : { ar: "", en: "", tr: "" },
    storeName: String(s.storeName || ""),
    address: String(s.address || ""),
    mapUrl: String(s.mapUrl || "")
  };
}

async function readBlob(path) {
  const blob = await get(path, { access: "private", useCache: false });
  if (!blob) return null;
  return new Response(blob.stream).text();
}
async function readJson(path, fallback) {
  try {
    const body = await readBlob(path);
    return body ? JSON.parse(body) : fallback;
  } catch (e) { return fallback; }
}

/* Where the static asset lives. A request's Host header must never decide, so
   the origin is configured, never derived. */
const SITE_FALLBACK = "https://smarttech-mahmoudbir.vercel.app";
function trustedOrigin() {
  const host = process.env.SITE_ORIGIN || process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL || SITE_FALLBACK;
  return /^https?:\/\//.test(host) ? host : "https://" + host;
}
const assetCache = {};
async function readAsset(name) {
  if (assetCache[name] !== undefined) return assetCache[name];
  let text = null;
  try {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    // Vercel compiles this to CommonJS; __dirname is what the output provides.
    const bases = [];
    if (typeof __dirname !== "undefined") bases.push(path.join(__dirname, ".."), __dirname);
    bases.push(process.cwd());
    for (const base of bases) {
      try { text = await fs.readFile(path.join(base, name), "utf8"); break; } catch (e) { /* next */ }
    }
  } catch (e) { /* fall through to HTTP */ }
  if (text === null) {
    try {
      const r = await fetch(trustedOrigin() + "/" + name);
      text = r.ok ? await r.text() : null;
    } catch (e) { text = null; }
  }
  assetCache[name] = text;
  return text;
}

/* The substitution runs over the serialised document, so one pass fills every
   language at once and the answer is escaped the way JSON.stringify escapes. */
const jsonSafe = value => JSON.stringify(String(value)).slice(1, -1);
function substitute(text, answers, fields) {
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

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const what = String((req.query && req.query.what) || "");

  // Cached briefly at the edge so a repeat visit does not pay for a function
  // call. The browser always revalidates (an admin edit must show up at once);
  // the edge still absorbs the traffic.
  res.setHeader("Cache-Control", "public, max-age=0, must-revalidate, s-maxage=30, stale-while-revalidate=60");

  try {
    /* The policy answers, already substituted. Same shape as the static file,
       so the storefront's renderer needs no change beyond the URL it reads. */
    if (what === "policies") {
      const source = await readAsset("assets/policies.json");
      if (!source) return res.status(200).json({});
      const content = await readJson("data/content.json", { policies: {} });
      let doc;
      try { doc = JSON.parse(source); } catch (e) { return res.status(200).json({}); }
      const filled = substitute(source, (content && content.policies) || {}, policyFields(doc));
      try { return res.status(200).json(JSON.parse(filled)); }
      catch (e) { return res.status(200).json(doc); }
    }

    /* The taxonomy and brands the owner edits in the console. Falls back to the
       files the build tools produce, so this answers correctly before he has
       ever opened the screen. */
    if (what === "taxonomy") {
      const stored = await readJson("data/taxonomy.json", null);
      if (stored && Array.isArray(stored.nodes)) return res.status(200).json(stored);
      const seed = await readAsset("assets/taxonomy.json");
      return res.status(200).json(seed ? JSON.parse(seed) : { nodes: [], aliases: {} });
    }

    const body = await readBlob("data/store-state.json");
    if (!body) return res.status(200).json(EMPTY);
    const state = JSON.parse(body);
    const deleted = (Array.isArray(state.deleted) ? state.deleted : []).map(Number).filter(Boolean);
    const hidden = new Set(deleted);

    // savedAt only exists to catch two devices overwriting each other, and
    // `users` holds password hashes. Neither is anybody else's business.
    const strip = p => {
      const { savedAt, ...rest } = p || {};
      return rest;
    };
    // A draft is a product the owner has not finished. It must not reach the
    // shop, which is the whole reason the state exists.
    const live = p => p && p.status !== "draft" && p.status !== "archived";

    const overrides = {};
    Object.entries(state.overrides && typeof state.overrides === "object" ? state.overrides : {})
      .forEach(([id, value]) => {
        if (hidden.has(Number(id))) return;
        overrides[id] = strip(value);
      });

    const additions = (Array.isArray(state.additions) ? state.additions : [])
      .filter(x => !hidden.has(Number(x && x.id)) && live(x))
      .map(strip);

    // A draft that only exists as an override of a catalogue product has to be
    // hidden too, or a half-finished edit is live in the shop.
    const draftIds = Object.entries(state.overrides || {})
      .filter(([, v]) => v && (v.status === "draft" || v.status === "archived"))
      .map(([id]) => Number(id));
    draftIds.forEach(id => { delete overrides[String(id)]; });

    return res.status(200).json({
      overrides,
      additions,
      deleted: deleted.concat(draftIds),
      settings: publicSettings(state.settings)
    });
  } catch (e) {
    // The storefront falls back to the default catalog when this fails.
    console.error("products api error", e);
    return res.status(503).json({ error: "Store data unavailable" });
  }
}
