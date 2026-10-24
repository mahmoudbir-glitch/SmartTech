/*
 * Sitemap that follows the catalogue automatically, including admin changes.
 *
 * Three things it now carries that it did not:
 *
 *  1. The taxonomy nodes and the brands. It listed 1 home + 312 products and
 *     zero category URLs, which is the same as saying the store has nothing to
 *     offer for "كاميرا مراقبة" — a query no product page can answer.
 *  2. The hreflang triplet on every entry. Measured before this: 313 <url>,
 *     0 <xhtml:link>, while three languages compete for the same ranking.
 *  3. Only the lead of each colourway group. The same iPhone case at the same
 *     price, listed once per colour, is 13 near-identical URLs competing with
 *     each other for one query.
 *
 * A URL that redirects is not listed: a node under 8 cards 301s to its parent
 * (rule T2) and a node with none 404s (rule T1), so neither belongs here.
 */
let store = null;

// The bundled files are read from disk. A request's Host header must never
// decide where code is loaded from, so the HTTP fallback uses Vercel's own
// deployment URL.
// Where this shop lives. Set SITE_ORIGIN when it moves to its own domain;
// the Vercel variables are only present when a project exposes them, and this
// one does not, so the constant is the dependable answer. A request's Host
// header is never consulted: it is attacker-controlled and these pages are
// cached and served on to other visitors.
const SITE_FALLBACK = "https://smarttech-mahmoudbir.vercel.app";

function trustedOrigin() {
  const host = process.env.SITE_ORIGIN || process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL || SITE_FALLBACK;
  return /^https?:\/\//.test(host) ? host : "https://" + host;
}

async function readSource(name) {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  /*
   * Vercel compiles these functions from ESM to CommonJS, where import.meta
   * does not exist — using it here made every product page throw in
   * production while working perfectly under the dev server. __dirname is
   * present in the compiled output and points at the api directory, and the
   * files named in includeFiles sit one level above it.
   */
  const bases = [];
  if (typeof __dirname !== "undefined") bases.push(path.join(__dirname, ".."), __dirname);
  bases.push(process.cwd());
  for (const base of bases) {
    try {
      return await fs.readFile(path.join(base, name), "utf8");
    } catch (e) { /* try the next one */ }
  }
  // Last resort: our own deployment over HTTP, never a Host-derived address.
  return fetch(trustedOrigin() + "/" + name).then(r => {
    if (!r.ok) throw new Error("cannot read " + name + ": HTTP " + r.status);
    return r.text();
  });
}

async function loadStore() {
  if (store) return store;
  const [i18nSrc, catalogSrc] = await Promise.all([readSource("i18n.js"), readSource("catalog.js")]);
  const win = {};
  const nav = { languages: ["ar"] };
  const storage = { getItem: () => null, setItem: () => {} };
  const loc = { search: "" };
  const doc = {
    addEventListener() {}, removeEventListener() {},
    querySelector: () => null, querySelectorAll: () => [],
    documentElement: { dataset: {}, style: { setProperty() {} }, classList: { add() {}, remove() {} } },
    body: null, title: ""
  };
  const run = src => new Function("window", "navigator", "localStorage", "location", "document", src)(win, nav, storage, loc, doc);
  run(i18nSrc);
  run(catalogSrc);
  store = win;
  return store;
}

const jsonCache = {};
async function loadJson(name) {
  if (jsonCache[name] !== undefined) return jsonCache[name];
  try {
    jsonCache[name] = JSON.parse(await readSource(name));
  } catch (e) {
    console.error("cannot parse " + name, e);
    jsonCache[name] = null;
  }
  return jsonCache[name];
}

/* ------------------------------------------------------------ variants
 *
 * core.js's SY.groupVariants transcribed, not a second rule: BRACKET,
 * SPEC_BRACKET, variantKey, variantLabel and pickLead are byte-for-byte the
 * client's, so the sitemap lists exactly the cards the grid shows. Keyed on
 * `p.name`, the catalogue name — NEVER the translated one. If core.js's
 * SPEC_BRACKET was corrected once already — it read "600D Black/Grey-Twill"
 * as a spec because of the 600, so the commonest colourway never grouped and
 * only 3 groups collapsed instead of 26. tests/design-test.mjs now asserts
 * that all three copies are identical, so a future correction cannot land in
 * one file only. If SPEC_BRACKET is ever corrected again, correct it here and in api/c.js in the same
 * commit.
 */
const BRACKET = /\(([^()]*)\)/g;
const SPEC_BRACKET = /\b\d+(?:\.\d+)?\s*(?:w|k|v|a|ah|wh|mah|gb|tb|mm|cm|m|ft|in|qt|l)\b|\b\d+\s*-?\s*in\s*-?\s*\d\b|\bpack\b|\bpieces?\b|\bpairs?\b|\bbottles?\b|\bports?\b|\u0648\u0627\u0637|\u0648\u0627\u062A|\u0639\u0628\u0648\u0629|\u0642\u0637\u0639|\u0642\u0637\u0639\u0629/i;

function variantKey(name) {
  /* Case-folded: the supplier writes both "iPhone" and "Iphone", and a
     case-sensitive key split one product line into groups of 12 and 3. */
  return String(name || "").replace(BRACKET, "").replace(/\s+/g, " ").trim().toLowerCase();
}
function variantLabel(name) {
  const found = String(name || "").match(BRACKET);
  if (!found) return "";
  for (let i = found.length - 1; i >= 0; i--) {
    const inner = found[i].slice(1, -1).trim();
    if (inner && !SPEC_BRACKET.test(inner)) return inner;
  }
  return "";
}
function pickLead(members) {
  /* In stock first, then cheapest, so the one price a card shows is one the
     shopper can actually pay: two groups genuinely span $59.99–$69.99. */
  const pool = members.filter(m => m.inStock);
  return (pool.length ? pool : members).slice().sort((a, b) => a.price - b.price)[0];
}
function leads(list) {
  const buckets = new Map();
  for (const p of list) {
    const key = p.brand.toLowerCase() + "|" + variantKey(p.name);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(p);
  }
  const seen = new Set();
  const out = [];
  for (const p of list) {
    const key = p.brand.toLowerCase() + "|" + variantKey(p.name);
    if (seen.has(key)) continue;
    const members = buckets.get(key);
    /* Only a real colourway groups. If any differing bracket is a spec —
       a wattage, a capacity, a pack size — these are different products
       and selling them as one colour choice would ship the wrong item. */
    if (members.length > 1 && members.every(m => variantLabel(m.name))) {
      seen.add(key);
      out.push(pickLead(members));
    } else {
      out.push(p);
    }
  }
  return out;
}

/* ------------------------------------------------------------- the tree */

function chain(byId, id) {
  const out = [];
  let node = byId[id];
  let guard = 0;
  while (node && guard++ < 8) {
    out.push(node);
    node = node.parent ? byId[node.parent] : null;
  }
  return out;
}

const slugify = value => String(value || "").toLowerCase().trim()
  .replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

const escXml = s => String(s ?? "").replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));

const MIN_CARDS = 4;   // rule T2, loosened: a node under 4 cards is a chip on its
                       // parent, not a page. At 8 it hid 21 of 30 categories.

// Every entry declares its three languages plus x-default. Without them the
// Arabic, English and Turkish view of the same page compete for one ranking.
function entry(origin, path, priority, changefreq) {
  const url = origin + path;
  const join = path.indexOf("?") === -1 ? "?" : "&";
  const alt = code =>
    '<xhtml:link rel="alternate" hreflang="' + code + '" href="' + escXml(url + join + "lang=" + code) + '"/>';
  return "<url><loc>" + escXml(url) + "</loc>" +
    alt("ar") + alt("en") + alt("tr") +
    '<xhtml:link rel="alternate" hreflang="x-default" href="' + escXml(url) + '"/>' +
    (changefreq ? "<changefreq>" + changefreq + "</changefreq>" : "") +
    "<priority>" + priority.toFixed(1) + "</priority></url>";
}

export default async function handler(req, res) {
  const origin = trustedOrigin();
  try {
    const win = await loadStore();
    const [taxonomy, catMap, registry, state] = await Promise.all([
      loadJson("assets/taxonomy.json"),
      loadJson("assets/product-cat.json"),
      loadJson("assets/brands.json"),
      fetch(origin + "/api/products").then(r => r.json()).catch(() => ({}))
    ]);
    const products = win.STORE.merge(state);
    const cards = leads(products);

    const nodes = (taxonomy && Array.isArray(taxonomy.nodes)) ? taxonomy.nodes : [];
    const byId = Object.create(null);
    for (const n of nodes) byId[n.id] = n;
    const map = catMap || {};
    const leafOf = p => String((p && p.cat) || map[String(p && p.id)] || "");
    const countIn = id => cards.filter(p => chain(byId, leafOf(p)).some(n => n.id === id)).length;
    const order = (a, b) => (a.order || 0) - (b.order || 0) || String(a.id).localeCompare(String(b.id));
    const nodePath = id => "/c/" + chain(byId, id).map(n => n.id).reverse().join("/");

    const departments = [];
    const categories = [];
    for (const n of nodes.slice().sort(order)) {
      const count = countIn(n.id);
      if (!count) continue;                                  // T1: 0 products, no URL
      if (!n.parent) departments.push(entry(origin, nodePath(n.id), 0.9, "weekly"));
      else if (count >= MIN_CARDS) categories.push(entry(origin, nodePath(n.id), 0.8, "weekly"));
      // count < MIN_CARDS: rule T2 sends that URL to its parent with a 301, and
      // a redirect has no business in a sitemap.
    }

    const brands = Object.keys(registry || {})
      .filter(slug => !registry[slug].hidden)
      .map(slug => ({ slug, n: cards.filter(p => slugify(p.brand) === slug).length, order: registry[slug].order || 0 }))
      .filter(b => b.n > 0)                                  // T1, applied to brands
      .sort((a, b) => b.n - a.n || a.order - b.order)
      .map(b => entry(origin, "/b/" + b.slug, 0.7, "weekly"));

    // Only the lead of each colourway group: the other 82 are the same product
    // in another colour, at the same price, on the same photograph.
    const items = cards.map(p => entry(origin, "/p/" + p.id, 0.6));

    // Highest priority first.
    const urls = [entry(origin, "/", 1.0, "daily")]
      .concat([entry(origin, "/browse", 0.9, "weekly")])
      .concat(departments)
      .concat(categories)
      .concat([entry(origin, "/brands", 0.7, "weekly")])
      .concat(brands)
      .concat(items);

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400");
    return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">' + urls.join("") + "</urlset>");
  } catch (e) {
    console.error("sitemap error", e);
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml"><url><loc>' + escXml(origin) + "/</loc></url></urlset>");
  }
}
