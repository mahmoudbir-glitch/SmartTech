/*
 * Category, brand and index landing pages.
 * =======================================
 *
 * The shop had 313 URLs — one home page and 312 products — and not a single
 * category page. Arabic commercial queries are category-shaped, not
 * SKU-shaped: people type "كاميرا مراقبة", "باور بانك", "شاحن انكر",
 * "انفرتر 5 كيلو". Nothing in the store could rank for one of them because
 * the page did not exist. These are those pages.
 *
 *   /c/:dept                 → /api/c?path=:dept
 *   /c/:dept/:cat            → /api/c?path=:dept/:cat
 *   /b/:slug                 → /api/c?brand=:slug
 *   /browse                  → /api/c?index=1
 *   /brands                  → /api/c?brands=1
 *
 * Each serves index.html with the head rewritten and the body seeded, exactly
 * as api/p.js does for a product: the real <h1>, the description, a visible
 * breadcrumb and the first 24 products as real <a href="/p/<id>"> links. That
 * last part is 3–4 KB of HTML and it is the whole reason the internal link
 * graph exists for a crawler that does not execute JavaScript.
 *
 * Nothing here is hard-coded visible text: every string comes from i18n.js.
 */
let store = null;
let shellHtml = null;

// Where this shop lives. Set SITE_ORIGIN when it moves to its own domain;
// the Vercel variables are only present when a project exposes them, and this
// one does not, so the constant is the dependable answer. A request's Host
// header is never consulted: it is attacker-controlled and these pages are
// cached and served on to other visitors.
const SITE_FALLBACK = "https://syriatech-store.vercel.app";

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
  /* The dictionary is split by surface so a page pays only for the words
     it shows; this function renders the category descriptions it writes into the page, so it loads that
     chunk as well as the base file. A missing chunk would put a raw key
     in front of a crawler. */
  const CHUNKS = ["i18n-cat.js"];
  const [i18nSrc, catalogSrc, ...chunkSrc] = await Promise.all(
    [readSource("i18n.js"), readSource("catalog.js")]
      .concat(CHUNKS.map(f => readSource(f).catch(() => ""))));
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
  /* Each chunk merges into the same window.I18N.dict, so every key
     resolves from here on exactly as it does in a browser. */
  chunkSrc.filter(Boolean).forEach(run);
  run(catalogSrc);
  store = win;
  return store;
}

const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const jsonCache = {};
async function loadJson(name) {
  if (jsonCache[name]) return jsonCache[name];
  try {
    jsonCache[name] = JSON.parse(await readSource(name));
  } catch (e) {
    console.error("cannot parse " + name, e);
    jsonCache[name] = null;
  }
  return jsonCache[name];
}

// The product's name in the language the link was opened in, so the seeded
// list reads the same as the pages it links to.
const copyCache = {};
async function loadCopy(code) {
  if (copyCache[code]) return copyCache[code];
  try {
    copyCache[code] = JSON.parse(await readSource("assets/copy." + code + ".json"));
  } catch (e) { copyCache[code] = {}; }
  return copyCache[code];
}

/* ------------------------------------------------------------ variants
 *
 * Colourways arrive from the supplier as separate products. The grid shows one
 * card per colourway group, so this surface — and the sitemap, and the counts
 * that decide whether a node redirects — must group with exactly the same
 * rule, or the page would advertise a number the grid does not show.
 *
 * This is core.js's SY.groupVariants transcribed, not a second rule: BRACKET,
 * SPEC_BRACKET, variantKey, variantLabel and pickLead are byte-for-byte the
 * client's. Keyed on `p.name`, the catalogue name — NEVER the translated one,
 * which made the shop a different size in every language. If core.js's
 * SPEC_BRACKET was corrected once already — it read "600D Black/Grey-Twill"
 * as a spec because of the 600, so the commonest colourway never grouped and
 * only 3 groups collapsed instead of 26. tests/design-test.mjs now asserts
 * that all three copies are identical, so a future correction cannot land in
 * one file only. If SPEC_BRACKET is ever corrected again, correct it here in the same commit.
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
// One entry per card: the lead of each colourway group, every other product
// unchanged. Order is preserved, so a sorted list stays sorted.
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

function tree(taxonomy) {
  const byId = Object.create(null);
  const children = Object.create(null);
  const nodes = (taxonomy && Array.isArray(taxonomy.nodes)) ? taxonomy.nodes : [];
  for (const n of nodes) {
    byId[n.id] = n;
    children[n.id] = children[n.id] || [];
  }
  for (const n of nodes) {
    if (n.parent) (children[n.parent] = children[n.parent] || []).push(n);
  }
  const order = (a, b) => (a.order || 0) - (b.order || 0) || String(a.id).localeCompare(String(b.id));
  for (const k of Object.keys(children)) children[k].sort(order);
  const departments = nodes.filter(n => !n.parent).sort(order);
  const aliases = (taxonomy && taxonomy.aliases) || {};
  return { byId, children, departments, aliases };
}

// Ancestors deepest first: ["cameras", "security"].
function chain(t, id) {
  const out = [];
  let node = t.byId[id];
  let guard = 0;
  while (node && guard++ < 8) {
    out.push(node);
    node = node.parent ? t.byId[node.parent] : null;
  }
  return out;
}
// The one canonical URL of a node, ancestry from the tree and never from the id.
function nodePath(t, id) {
  return "/c/" + chain(t, id).map(n => n.id).reverse().join("/");
}
// An id, or an alias of one. Aliases are never removed, so nothing that was
// ever indexed 404s.
function resolveNode(t, id) {
  const key = String(id || "");
  if (t.byId[key]) return t.byId[key];
  const target = t.aliases[key];
  return (target && t.byId[target]) || null;
}

/* ------------------------------------------------------ products in a node */

function leafOf(map, p) {
  // The product carries exactly one field naming its deepest node. `cat` on
  // the record wins so an admin-added product can be placed without a rebuild.
  return String((p && p.cat) || map[String(p && p.id)] || "");
}
function inNode(t, map, p, id) {
  const leaf = leafOf(map, p);
  if (!leaf) return false;
  if (leaf === id) return true;
  return chain(t, leaf).some(n => n.id === id);
}

const slugify = value => String(value || "").toLowerCase().trim()
  .replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

/* --------------------------------------------------------------- ordering
 *
 * "Popular" with no analytics is completeness and availability — the products
 * that look best are the ones shown first. This is study 10 §8.1 minus its
 * photo-count term, which would cost a second data file for a tie-break.
 */
function ranked(list, copy) {
  const brandSeen = Object.create(null);
  const cheapest = Object.create(null);
  for (const p of list) {
    const b = p.brand || "";
    brandSeen[b] = (brandSeen[b] || 0) + 1;
  }
  const brandPos = Object.create(null);
  const scored = list.map(p => {
    const b = p.brand || "";
    brandPos[b] = (brandPos[b] || 0);
    const pos = brandPos[b]++;
    const entry = copy[String(p.id)];
    let score = 100;
    if (p.inStock) score += 40;
    if (entry && entry.s) score += 20;
    score += 15 * Math.min(p.discount || 0, 40) / 40;
    score -= 5 * (pos / Math.max(brandSeen[b], 1));
    return { p, score };
  });
  const min = Object.create(null);
  for (const p of list) {
    const key = p.category || "";
    if (min[key] === undefined || p.price < min[key]) min[key] = p.price;
  }
  for (const s of scored) if (s.p.price === min[s.p.category || ""]) s.score += 10;
  scored.sort((a, b) => b.score - a.score || b.p.id - a.p.id);
  return scored.map(s => s.p);
}

// No more than 4 from one brand and 6 from one leaf in the first 24. Without
// it PITAKA's cases and eufy's spare parts own the default view of the store.
function unflood(list, size) {
  const byBrand = Object.create(null);
  const byLeaf = Object.create(null);
  const head = [];
  const tail = [];
  for (const p of list) {
    const b = p.brand || "";
    const c = p.category || "";
    if (head.length < size && (byBrand[b] || 0) < 4 && (byLeaf[c] || 0) < 6) {
      byBrand[b] = (byBrand[b] || 0) + 1;
      byLeaf[c] = (byLeaf[c] || 0) + 1;
      head.push(p);
    } else tail.push(p);
  }
  return head.concat(tail);
}

const SORTS = {
  popular: null,
  "price-asc": (a, b) => (a.inStock === b.inStock ? 0 : a.inStock ? -1 : 1) || a.price - b.price || b.id - a.id,
  "price-desc": (a, b) => (a.inStock === b.inStock ? 0 : a.inStock ? -1 : 1) || b.price - a.price || b.id - a.id,
  newest: (a, b) => b.id - a.id,
  discount: (a, b) => (b.discount || 0) - (a.discount || 0) || b.id - a.id
};

function ordered(list, sort, copy) {
  const cmp = SORTS[sort];
  if (cmp) return list.slice().sort(cmp);
  return unflood(ranked(list, copy), PAGE);
}

/* ---------------------------------------------------------------- strings */

// The label of a node. `cat.<id>` is the dictionary key the shop declares for
// all 38 nodes; until that merge lands, an id that an alias points at can
// still be read out of the legacy `category.<oldId>` block, and the last
// resort is i18n's own ⟦key⟧ marker, which the language test fails on.
function labelOf(win, t, id, code) {
  const direct = win.I18N.t("cat." + id, null, code);
  if (direct.charAt(0) !== "⟦") return direct;
  for (const old of Object.keys(t.aliases)) {
    if (t.aliases[old] !== id) continue;
    const legacy = win.I18N.t("category." + old, null, code);
    if (legacy.charAt(0) !== "⟦") return legacy;
  }
  const same = win.I18N.t("category." + id, null, code);
  return same.charAt(0) !== "⟦" ? same : direct;
}

// Arabic has four plural shapes and the dictionary carries all of them. This
// is SY.plural's branch table; `n` is substituted by the caller so the same
// key can produce plain text for a <title> and <bdi>-isolated markup in the
// body.
function countPhrase(win, n, code, rendered) {
  let suffix;
  if (code !== "ar") suffix = n === 1 ? "One" : "Many";
  else if (n === 1) suffix = "One";
  else if (n === 2) suffix = "Two";
  else if (n <= 10) suffix = "Few";
  else suffix = "Many";
  return win.I18N.t("routeCount" + suffix, { n: rendered }, code);
}

let currencyFormat = null;
function formatMoney(value) {
  const n = Number(value) || 0;
  if (!currencyFormat) {
    try {
      currencyFormat = new Intl.NumberFormat("en-US", {
        style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2
      });
    } catch (e) {
      currencyFormat = { format: v => "$" + Number(v).toFixed(2) };
    }
  }
  return currencyFormat.format(n);
}
// dir="ltr" and not a bare <bdi>: <bdi> defaults to dir="auto", sees no strong
// character in "$129.98" and falls back to the paragraph's RTL.
const money = v => '<bdi dir="ltr">' + esc(formatMoney(v)) + "</bdi>";
const num = v => '<bdi dir="ltr">' + esc(String(v)) + "</bdi>";

function nameOf(copy, p) {
  const edits = Array.isArray(p.edits) ? p.edits : [];
  const entry = p.added ? null : copy[String(p.id)];
  return (!edits.includes("name") && entry && entry.n) || p.name;
}

/* ------------------------------------------------------------------ images */

// STORE.imageFor returns null when a product has no photograph — the sixteen
// category drawings are gone, twelve of them carried a competitor's wordmark
// as SVG text. A missing photo is skipped, never replaced with a URL to a file
// that does not exist.
function photoOf(win, origin, p) {
  const raw = win.STORE.imageFor(p);
  if (!raw) return null;
  return raw.startsWith("http") ? raw : origin + (raw.startsWith("/") ? "" : "/") + raw;
}
// WhatsApp and Facebook render WebP unreliably, so every catalogue photo also
// has a 1200x630 JPEG card at /assets/og/<id>.jpg.
function ogCardOf(win, origin, p) {
  const raw = String(win.STORE.imageFor(p) || "");
  const card = /^\/?assets\/products\/(\d+)\.webp$/.exec(raw);
  if (card) return origin + "/assets/og/" + card[1] + ".jpg";
  if (raw.startsWith("http")) return raw;
  return raw ? origin + (raw.startsWith("/") ? "" : "/") + raw : null;
}

/* ------------------------------------------------------------------- urls */

function withParams(path, params) {
  const parts = [];
  for (const k of Object.keys(params)) {
    if (params[k] === undefined || params[k] === null || params[k] === "") continue;
    parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(params[k]));
  }
  return parts.length ? path + "?" + parts.join("&") : path;
}

const LOCALE = { ar: "ar_AR", en: "en_US", tr: "tr_TR" };
const DIR = { ar: "rtl", en: "ltr", tr: "ltr" };
const PAGE = 24;
const MIN_CARDS = 4;   // rule T2, loosened: a node under 4 cards is a chip on its
                       // parent, not a page. At 8 it hid 21 of 30 categories.

/* ----------------------------------------------------------------- output */

function redirect(res, to) {
  res.statusCode = 301;
  res.setHeader("Location", to);
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=86400");
  return res.end("");
}

/* ------------------------------------------------------------------ render */

function breadcrumbHtml(win, crumbs, code) {
  const rows = crumbs.map((c, i) => {
    const last = i === crumbs.length - 1;
    const label = c.key
      ? ' data-i18n="' + esc(c.key) + '">' + esc(c.label)
      : ">" + esc(c.label);
    return "<li>" + (last
      ? '<span aria-current="page"' + label + "</span>"
      : '<a href="' + esc(c.href) + '"' + label + "</a>") + "</li>";
  }).join("");
  return '<nav class="crumbs" aria-label="' + esc(win.I18N.t("routeCrumbLabel", null, code)) + '"><ol>' + rows + "</ol></nav>";
}

function listHtml(win, copy, items, listLabel) {
  const rows = items.map(p =>
    '<li><a href="/p/' + p.id + '"><bdi>' + esc(nameOf(copy, p)) + "</bdi> " + money(p.price) + "</a></li>"
  ).join("");
  return '<ul id="seo-list" class="seo-list" aria-label="' + esc(listLabel) + '">' + rows + "</ul>";
}

/* --------------------------------------------------------------- the handler */

export default async function handler(req, res) {
  // Never let a request's Host header decide the canonical, og:url or the
  // origin this function fetches from: the answer is cached and served to
  // everyone else. Without a configured origin the page does not render.
  const origin = trustedOrigin();
  if (!origin) {
    console.error("no SITE_ORIGIN or VERCEL_URL; refusing to build a landing page");
    res.statusCode = 500;
    return res.end("");
  }

  const q = (req.query || {});
  const one = v => (Array.isArray(v) ? v[0] : v);
  const asked = String(one(q.lang) || "").toLowerCase();
  const code = ["ar", "en", "tr"].includes(asked) ? asked : "ar";

  const notFound = () => {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=60");
    return res.end('<!doctype html><html lang="' + code + '"><head><meta charset="utf-8">' +
      '<meta name="robots" content="noindex"><meta http-equiv="refresh" content="0;url=/">' +
      "<title>404</title></head><body></body></html>");
  };

  try {
    const win = await loadStore();
    const [taxonomy, catMap, registry, copy, state] = await Promise.all([
      loadJson("assets/taxonomy.json"),
      loadJson("assets/product-cat.json"),
      loadJson("assets/brands.json"),
      loadCopy(code),
      fetch(origin + "/api/products").then(r => r.json()).catch(() => ({}))
    ]);
    if (!taxonomy || !catMap) throw new Error("taxonomy or product map missing");
    const t = tree(taxonomy);
    const products = win.STORE.merge(state);
    const brandsReg = registry || {};

    const site = win.I18N.t("brandName", null, "ar");
    const lang = code === "ar" ? {} : { lang: code };

    /* ---- which surface ---- */
    // The rewrite carries the whole path in one parameter, and Vercel
    // percent-encodes the separator on the way through.
    let rawPath = String(one(q.path) || "");
    try { rawPath = decodeURIComponent(rawPath); } catch (e) { /* keep it raw */ }
    rawPath = rawPath.replace(/^\/+|\/+$/g, "");
    const brandSlug = slugify(one(q.brand) || "");
    const isBrowse = one(q.index) !== undefined && !rawPath;
    const isBrands = one(q.brands) !== undefined && !rawPath && !brandSlug;

    // Everything that is not routing or language is a facet, and a facet is
    // noindex unless it is the one whitelisted pair.
    const routeKeys = { path: 1, index: 1, brands: 1, lang: 1 };
    if (!rawPath) routeKeys.brand = 1;              // /b/<slug>: brand IS the route
    /* Vercel appends every *named* rewrite parameter to the destination query
       unless the destination already uses that name: a source written
       /c/:dept/:cat arrives as ?path=…&dept=…&cat=…, and `cat` is also the
       name of the chip facet. vercel.json therefore names its parameters
       :path and :brand, after the destination keys, so nothing is appended —
       and a parameter that only restates the route this request has already
       resolved is treated as routing, never as a facet, so a rename can never
       silently noindex every category page. That is the class of bug that only
       shows up in production. */
    const echoes = new Set(rawPath ? rawPath.split("/") : []);
    if (!rawPath && brandSlug) echoes.add(brandSlug);   // only when brand IS the route
    const facets = Object.keys(q).filter(k => {
      const v = String(one(q[k]));
      return !routeKeys[k] && v !== "" && !echoes.has(v);
    });

    const page = Math.max(1, Math.floor(Number(one(q.page)) || 1));
    const sort = SORTS[String(one(q.sort) || "")] !== undefined ? String(one(q.sort)) : "popular";

    /* ================================================================ browse */
    if (isBrowse || isBrands) {
      const route = isBrowse ? "browse" : "brands";
      const self = isBrowse ? "/browse" : "/brands";
      const cards = leads(products);
      const countOf = list => list.length;

      let bodyRows = "";
      let itemList = [];
      let total = 0;

      if (isBrowse) {
        // The crawlable skeleton: every department with all its categories and
        // counts, one page. A node with 0 products is rendered nowhere (T1).
        const blocks = [];
        for (const dept of t.departments) {
          const dc = countOf(cards.filter(p => inNode(t, catMap, p, dept.id)));
          if (!dc) continue;
          total += dc;
          const label = labelOf(win, t, dept.id, code);
          itemList.push({ url: origin + withParams(nodePath(t, dept.id), lang), name: label });
          const kids = (t.children[dept.id] || []).map(child => {
            const cc = countOf(cards.filter(p => inNode(t, catMap, p, child.id)));
            if (!cc) return "";
            const clabel = labelOf(win, t, child.id, code);
            // Under 8 cards the node lives as a chip on its parent, so link
            // the crawler at the URL it will actually get.
            const href = cc < MIN_CARDS
              ? withParams(nodePath(t, dept.id), Object.assign({ cat: child.id }, lang))
              : withParams(nodePath(t, child.id), lang);
            if (cc >= MIN_CARDS) itemList.push({ url: origin + href, name: clabel });
            return '<li><a href="' + esc(href) + '" data-i18n="cat.' + esc(child.id) + '">' + esc(clabel) +
              "</a> " + num(cc) + "</li>";
          }).join("");
          blocks.push('<section class="browse__dept"><h2><a href="' +
            esc(withParams(nodePath(t, dept.id), lang)) + '" data-i18n="cat.' + esc(dept.id) + '">' +
            esc(label) + "</a></h2> " + num(dc) + "<ul>" + kids + "</ul></section>");
        }
        bodyRows = blocks.join("");
      } else {
        const rows = Object.keys(brandsReg)
          .filter(slug => !brandsReg[slug].hidden)
          .map(slug => ({ slug, entry: brandsReg[slug], n: countOf(cards.filter(p => slugify(p.brand) === slug)) }))
          .filter(b => b.n > 0)                    // T1, applied to brands
          .sort((a, b) => b.n - a.n || (a.entry.order || 0) - (b.entry.order || 0));
        for (const b of rows) {
          total += b.n;
          const href = withParams("/b/" + b.slug, lang);
          itemList.push({ url: origin + href, name: b.entry.name });
          bodyRows += '<li><a href="' + esc(href) + '"><bdi>' + esc(b.entry.name) + "</bdi></a> " + num(b.n) + "</li>";
        }
        bodyRows = "<ul>" + bodyRows + "</ul>";
      }

      const heading = win.I18N.t(isBrowse ? "routeBrowse" : "routeBrands", null, code);
      const phrase = countPhrase(win, total, code, String(total));
      const title = win.I18N.t(isBrowse ? "routeBrowseTitle" : "routeBrandsTitle",
        { count: phrase, site }, code);
      const description = win.I18N.t(isBrowse ? "routeBrowseDesc" : "routeBrandsDesc",
        { count: phrase }, code);
      const canonical = origin + withParams(self, lang);
      const crumbs = [
        { href: "/", label: win.I18N.t("routeHome", null, code), key: "routeHome" },
        { href: self, label: heading, key: isBrowse ? "routeBrowse" : "routeBrands" }
      ];
      const ld = [
        breadcrumbLd(origin, crumbs),
        {
          "@context": "https://schema.org", "@type": "ItemList",
          numberOfItems: itemList.length,
          itemListElement: itemList.map((x, i) => ({ "@type": "ListItem", position: i + 1, name: x.name, url: x.url }))
        },
        { "@context": "https://schema.org", "@type": "CollectionPage", "@id": canonical + "#page", name: heading, url: canonical }
      ];
      const seed = '<div id="seo-seed" data-seo-seed data-seo-lang="' + code + '">' +
        breadcrumbHtml(win, crumbs, code) +
        '<h1 data-i18n="' + (isBrowse ? "routeBrowse" : "routeBrands") + '">' + esc(heading) + "</h1>" +
        '<p class="seo-count">' + countPhrase(win, total, code, num(total)) + "</p>" +
        bodyRows + "</div>";

      return send(res, await shell(win, {
        code, title, description, canonical, origin, self,
        robots: facets.length ? "noindex, follow" : "",
        route, node: "", brand: "", ld, seed, image: origin + "/assets/og-cover.png",
        ogType: "website"
      }));
    }

    /* ================================================================= brand */
    if (!rawPath && brandSlug) {
      const entry = brandsReg[brandSlug];
      if (!entry || entry.hidden) return notFound();
      const mine = products.filter(p => slugify(p.brand) === brandSlug);
      const cards = leads(mine);
      if (!cards.length) return notFound();          // T1

      const self = "/b/" + brandSlug;
      const sorted = ordered(cards, sort, copy);
      const slice = sorted.slice((page - 1) * PAGE, (page - 1) * PAGE + PAGE);
      if (!slice.length && page > 1) return redirect(res, withParams(self, lang));

      const phrase = countPhrase(win, cards.length, code, String(cards.length));
      const prices = cards.map(p => p.price);
      const heading = win.I18N.t("routeBrandHeading", { brand: entry.name }, code);
      const title = win.I18N.t("routeBrandTitle", { brand: entry.name, count: phrase, site }, code);
      const description = win.I18N.t("routeBrandDesc", {
        brand: entry.name, count: phrase,
        min: formatMoney(Math.min.apply(null, prices)),
        max: formatMoney(Math.max.apply(null, prices))
      }, code);

      const indexable = facets.length === 0;
      const canonical = origin + withParams(self, lang);
      const crumbs = [
        { href: "/", label: win.I18N.t("routeHome", null, code), key: "routeHome" },
        { href: "/brands", label: win.I18N.t("routeBrands", null, code), key: "routeBrands" },
        { href: self, label: entry.name }
      ];
      const ld = [
        breadcrumbLd(origin, crumbs),
        itemListLd(win, origin, copy, slice, cards.length, (page - 1) * PAGE, code),
        {
          "@context": "https://schema.org", "@type": "CollectionPage",
          "@id": canonical + "#page", name: heading, url: canonical, description,
          about: { "@id": canonical + "#brand" }
        },
        {
          "@context": "https://schema.org", "@type": "Brand", "@id": canonical + "#brand",
          name: entry.name, url: canonical,
          logo: entry.logo ? origin + "/assets/brands/" + entry.logo : undefined
        }
      ];

      // The brand's own categories above the products: a shopper on /b/anker
      // sees the aisles, not an unsorted wall of 66 cards.
      const aisles = t.departments.concat(t.departments.reduce((a, d) => a.concat(t.children[d.id] || []), []))
        .map(n => ({ n, c: cards.filter(p => inNode(t, catMap, p, n.id)).length }))
        .filter(x => x.c > 0 && (!x.n.parent || x.c >= MIN_CARDS))
        .map(x => '<li><a href="' + esc(withParams(nodePath(t, x.n.id), Object.assign({ brand: brandSlug }, lang))) +
          '" data-i18n="cat.' + esc(x.n.id) + '">' + esc(labelOf(win, t, x.n.id, code)) + "</a> " + num(x.c) + "</li>")
        .join("");

      const seed = '<div id="seo-seed" data-seo-seed data-seo-lang="' + code + '">' +
        breadcrumbHtml(win, crumbs, code) +
        "<h1><bdi>" + esc(heading) + "</bdi></h1>" +
        '<p class="seo-desc">' + esc(description) + "</p>" +
        '<p class="seo-count">' + countPhrase(win, cards.length, code, num(cards.length)) + "</p>" +
        (aisles ? '<ul class="seo-aisles">' + aisles + "</ul>" : "") +
        listHtml(win, copy, slice, win.I18N.t("routeListLabel", { label: entry.name }, code)) +
        "</div>";

      return send(res, await shell(win, {
        code, title, description, canonical, origin, self,
        robots: indexable ? "" : "noindex, follow",
        route: "brand", node: "", brand: brandSlug, page, ld, seed,
        image: pickOg(win, origin, slice) || origin + "/assets/og-cover.png",
        ogType: "website"
      }));
    }

    /* ============================================================== category */
    if (!rawPath) return notFound();
    const segments = rawPath.split("/");
    if (segments.length > 3 || segments.some(s => !/^[a-z0-9-]+$/.test(s))) return notFound();

    const asking = resolveNode(t, segments[segments.length - 1]);
    if (!asking) return notFound();

    const keep = {};
    for (const k of Object.keys(q)) if (k !== "path") keep[k] = one(q[k]);

    // One 301, never a chain: resolve the alias, the wrong ancestry and the
    // under-8 rule together and send the crawler straight at the answer.
    let target = asking;
    let chip = "";
    let guard = 0;
    while (target.parent && guard++ < 8) {
      const n = leads(products.filter(p => inNode(t, catMap, p, target.id))).length;
      if (n === 0) return notFound();                                   // T1
      if (n >= MIN_CARDS) break;
      chip = target.id;                                                 // T2
      target = t.byId[target.parent];
    }
    const canonicalPath = nodePath(t, target.id);
    if (chip) keep.cat = chip;
    if (canonicalPath !== "/c/" + rawPath || chip) {
      return redirect(res, withParams(canonicalPath, keep));
    }

    const all = leads(products.filter(p => inNode(t, catMap, p, target.id)));
    if (!all.length) return notFound();                                 // T1

    const facetBrand = brandSlug && brandsReg[brandSlug] ? brandSlug : "";
    // `?cat=` is the chip an under-8 node redirected into. Honour it here too,
    // so what a crawler reads and what the shopper sees before hydration are
    // the same list the client will render, not a flash of the whole aisle.
    const facetCat = (function () {
      const asked = resolveNode(t, String(one(q.cat) || ""));
      return asked && chain(t, asked.id).some(n => n.id === target.id) && asked.id !== target.id ? asked.id : "";
    })();
    let shown = all;
    if (facetBrand) shown = shown.filter(p => slugify(p.brand) === facetBrand);
    if (facetCat) shown = shown.filter(p => inNode(t, catMap, p, facetCat));
    // A facet that matches nothing is not a missing page — the aisle exists.
    // Send both the crawler and the shopper to the clean node.
    if (!shown.length) return redirect(res, withParams(canonicalPath, lang));

    const sorted = ordered(shown, sort, copy);
    const slice = sorted.slice((page - 1) * PAGE, (page - 1) * PAGE + PAGE);
    if (!slice.length && page > 1) return redirect(res, withParams(canonicalPath, lang));

    /* Indexation. Only these are indexable: a department, a category, a brand,
       and exactly one whitelisted pair — brand × category — because
       "كاميرات eufy" is a real query. Everything else (price, stock,
       multi-select, ?sort=, ?page=) is noindex, follow with the canonical on
       the clean node. */
    const brandPair = facets.length === 1 && facets[0] === "brand" && facetBrand && !!target.parent;
    const indexable = facets.length === 0 || brandPair;
    const cleanParams = Object.assign(brandPair ? { brand: facetBrand } : {}, lang);
    const canonical = origin + withParams(canonicalPath, cleanParams);

    const label = labelOf(win, t, target.id, code);
    const phrase = countPhrase(win, shown.length, code, String(shown.length));
    const prices = shown.map(p => p.price);
    const topBrand = (function () {
      const tally = Object.create(null);
      for (const p of shown) tally[p.brand] = (tally[p.brand] || 0) + 1;
      return Object.keys(tally).sort((a, b) => tally[b] - tally[a] || a.localeCompare(b))[0] || "";
    })();

    const heading = win.I18N.t("routeCatHeading", { label }, code);
    const title = win.I18N.t("routeCatTitle", { label, count: phrase, site }, code);
    const written = win.I18N.t("catDesc." + target.id, null, code);
    const hasWritten = written.charAt(0) !== "⟦";
    const description = hasWritten ? written : win.I18N.t("routeCatDesc", {
      label, count: phrase, brand: topBrand,
      min: formatMoney(Math.min.apply(null, prices)),
      max: formatMoney(Math.max.apply(null, prices))
    }, code);

    const crumbs = [{ href: "/", label: win.I18N.t("routeHome", null, code), key: "routeHome" }]
      .concat(chain(t, target.id).reverse().map(n => ({
        href: withParams(nodePath(t, n.id), lang),
        label: labelOf(win, t, n.id, code),
        key: "cat." + n.id
      })));

    const ld = [
      breadcrumbLd(origin, crumbs),
      itemListLd(win, origin, copy, slice, shown.length, (page - 1) * PAGE, code)
    ];

    const seed = '<div id="seo-seed" data-seo-seed data-seo-lang="' + code + '">' +
      breadcrumbHtml(win, crumbs, code) +
      "<h1>" + esc(heading) + "</h1>" +
      '<p class="seo-desc"' + (hasWritten ? ' data-i18n="catDesc.' + esc(target.id) + '"' : "") + ">" +
      esc(description) + "</p>" +
      '<p class="seo-count">' + countPhrase(win, shown.length, code, num(shown.length)) + "</p>" +
      listHtml(win, copy, slice, win.I18N.t("routeListLabel", { label }, code)) +
      "</div>";

    return send(res, await shell(win, {
      code, title, description, canonical, origin,
      self: withParams(canonicalPath, brandPair ? { brand: facetBrand } : {}),
      robots: indexable ? "" : "noindex, follow",
      route: "category", node: target.id, brand: facetBrand, chip: facetCat, page, ld, seed,
      image: pickOg(win, origin, slice) || origin + "/assets/og-cover.png",
      ogType: "website"
    }));
  } catch (e) {
    console.error("landing page error", e);
    res.statusCode = 302;
    res.setHeader("Location", "/");
    return res.end();
  }
}

/* ------------------------------------------------------------ JSON-LD parts */

function breadcrumbLd(origin, crumbs) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem", position: i + 1, name: c.label,
      item: origin + (c.href === "/" ? "/" : c.href)
    }))
  };
}

function itemListLd(win, origin, copy, slice, total, offset, code) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    numberOfItems: total,
    itemListElement: slice.map((p, i) => {
      const url = origin + "/p/" + p.id + (code === "ar" ? "" : "?lang=" + code);
      const photo = ogCardOf(win, origin, p);
      const item = {
        "@type": "Product",
        "@id": url + "#product",
        name: nameOf(copy, p),
        url,
        sku: p.sku || String(p.id),
        brand: { "@type": "Brand", name: p.brand },
        offers: {
          "@type": "Offer", url, priceCurrency: "USD", price: p.price.toFixed(2),
          availability: "https://schema.org/" + (p.inStock ? "InStock" : "OutOfStock"),
          itemCondition: "https://schema.org/NewCondition"
        }
      };
      // A product with no photograph is listed without one, never with a URL
      // to a file that no longer exists.
      if (photo) item.image = [photo];
      return { "@type": "ListItem", position: offset + i + 1, item };
    })
  };
}

function pickOg(win, origin, slice) {
  for (const p of slice) {
    const card = ogCardOf(win, origin, p);
    if (card) return card;
  }
  return null;
}

/* --------------------------------------------------------------- the shell */

async function shell(win, o) {
  const url = o.canonical;
  const base = o.origin + o.self;
  const join = base.indexOf("?") === -1 ? "?" : "&";
  const tags =
    '<meta property="og:type" content="' + o.ogType + '">' +
    '<meta property="og:site_name" content="SmartTech">' +
    '<meta property="og:url" content="' + esc(url) + '">' +
    '<meta property="og:title" content="' + esc(o.title) + '">' +
    '<meta property="og:description" content="' + esc(o.description) + '">' +
    '<meta property="og:image" content="' + esc(o.image) + '">' +
    '<meta property="og:image:width" content="1200">' +
    '<meta property="og:image:height" content="630">' +
    '<meta property="og:locale" content="' + LOCALE[o.code] + '">' +
    '<link rel="alternate" hreflang="ar" href="' + esc(base + join + "lang=ar") + '">' +
    '<link rel="alternate" hreflang="en" href="' + esc(base + join + "lang=en") + '">' +
    '<link rel="alternate" hreflang="tr" href="' + esc(base + join + "lang=tr") + '">' +
    '<link rel="alternate" hreflang="x-default" href="' + esc(base) + '">' +
    '<meta name="twitter:card" content="summary_large_image">' +
    '<meta name="twitter:title" content="' + esc(o.title) + '">' +
    '<meta name="twitter:description" content="' + esc(o.description) + '">' +
    '<meta name="twitter:image" content="' + esc(o.image) + '">' +
    (o.robots ? '<meta name="robots" content="' + esc(o.robots) + '">' : "") +
    '<link rel="canonical" href="' + esc(url) + '">' +
    '<script type="application/ld+json">' + JSON.stringify(o.ld).replace(/</g, "\\u003c") + "</script>";

  if (!shellHtml) shellHtml = await readSource("index.html");
  const attrs = ' data-route="' + esc(o.route) + '"' +
    (o.node ? ' data-node="' + esc(o.node) + '"' : "") +
    (o.brand ? ' data-brand="' + esc(o.brand) + '"' : "") +
    (o.chip ? ' data-chip="' + esc(o.chip) + '"' : "") +
    (o.page && o.page > 1 ? ' data-page="' + o.page + '"' : "");

  return shellHtml
    .replace(/<html([^>]*)>/, () => '<html lang="' + o.code + '" dir="' + DIR[o.code] + '">')
    .replace(/ data-title-key="[^"]*"/g, "")
    .replace(/<body([^>]*)>/, (m, had) => "<body" + String(had || "").replace(/ data-route="[^"]*"/g, "") + attrs + ">")
    .replace(/<title>[^<]*<\/title>/, () => "<title>" + esc(o.title) + "</title>")
    .replace(/<meta name="description" content="[^"]*">/, () => '<meta name="description" content="' + esc(o.description) + '">')
    // Drop the site-wide preview tags: a crawler keeps the first one it sees,
    // and this page must advertise the aisle, not the home page.
    .replace(/[ \t]*<meta property="og:[^>]*>\r?\n?/g, "")
    .replace(/[ \t]*<meta name="twitter:[^>]*>\r?\n?/g, "")
    .replace(/[ \t]*<meta name="robots"[^>]*>\r?\n?/g, "")
    .replace(/[ \t]*<link rel="canonical"[^>]*>\r?\n?/g, "")
    .replace(/[ \t]*<link rel="alternate" hreflang="[^"]*"[^>]*>\r?\n?/g, "")
    .replace("</head>", () => tags + "</head>")
    // The seed goes where the shell asks for it, or straight after <body>.
    // script.js finds #seo-seed and replaces it with the hydrated grid; the
    // 24 links inside #seo-list are what a crawler that runs no JS walks.
    .replace(/<!--\s*seo:slot\s*-->/, () => o.seed)
    .replace(/(<body[^>]*>)/, (m, open) => (shellHtml.indexOf("seo:slot") === -1 ? open + o.seed : open));
}

function send(res, html) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=600, stale-while-revalidate=86400");
  return res.status(200).send(html);
}
