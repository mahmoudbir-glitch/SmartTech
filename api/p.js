/*
 * Product page — `/p/<id>`.
 *
 * WhatsApp and Facebook never run JavaScript and never send the #fragment, so a
 * shared product link has to be a real URL that already carries its own tags.
 * Nothing is hard-coded here: the copy comes from i18n.js and catalog.js, which
 * are bundled with this function.
 *
 * What this function now does that it did not:
 *
 *   Measured, every one of the 312 product URLs served the home page's body.
 *   `/p/35141`'s body differed from index.html by 24 bytes; occurrences of the
 *   product name: 0. Of the price: 0. The JSON-LD described a product the
 *   document did not contain. So the body is rendered here — <h1>, price,
 *   availability, summary, feature list and the gallery as real <img alt> —
 *   and `data-route="product"` is set so the shop's own script knows not to
 *   build the home page behind it.
 *
 *   The hero photo is preloaded. LCP measured 2,500 ms / 3,844 ms because the
 *   image was only discoverable after 78 KB of JavaScript parsed.
 *
 *   The two strings the first screen needs are inlined as ~400 bytes of JSON,
 *   so assets/copy.ar.json (77,621 bytes, to render one <h1>) leaves the
 *   critical path.
 *
 *   All 32 variant groups were self-canonical: 82 near-duplicate URLs
 *   competing, 13 of them for one iPhone case. The non-lead variants now point
 *   their canonical at the lead and the lead emits ProductGroup/hasVariant.
 *
 *   An unknown id answers 404, not a redirect.
 */
let store = null;
let shellHtml = null;

// The bundled files are read from disk. A request's Host header must never
// decide where code is loaded from, so the HTTP fallback uses Vercel's own
// deployment URL.
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

/*
 * Data files that are deliberately NOT bundled.
 *
 * `readSource` is the bundled path, and a config test asserts that every name
 * passed to it appears in vercel.json's includeFiles. These three are a
 * different case: assets/details holds 936 files (312 products × 3 languages)
 * and only one of them is ever wanted, and taxonomy/product-cat/gallery are
 * read once per cold start. They come off the CDN over the same origin the
 * function already uses for /api/products, and each is cached in module scope
 * for the life of the instance. Disk is still tried first so the dev server and
 * a future includeFiles entry both short-circuit the request.
 */
const dataCache = new Map();
async function readData(name) {
  if (dataCache.has(name)) return dataCache.get(name);
  const promise = (async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const bases = [];
    if (typeof __dirname !== "undefined") bases.push(path.join(__dirname, ".."), __dirname);
    bases.push(process.cwd());
    for (const base of bases) {
      try { return JSON.parse(await fs.readFile(path.join(base, name), "utf8")); } catch (e) { /* next */ }
    }
    const res = await fetch(trustedOrigin() + "/" + name);
    if (!res.ok) return null;
    return res.json();
  })().catch(() => null);
  dataCache.set(name, promise);
  return promise;
}

async function loadStore() {
  if (store) return store;
  /* The dictionary is split by surface so a page pays only for the words
     it shows; this function renders the product page's own words, so it loads that
     chunk as well as the base file. A missing chunk would put a raw key
     in front of a crawler. */
  const CHUNKS = ["i18n-pdp.js"];
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
// A value that is about to sit inside a <script> block, so `</script>` and a
// lone `<` can never end it early.
const jsonInline = value => JSON.stringify(value).replace(/</g, "\\u003c");

// The product's name and summary in the language the link was shared in, so a
// WhatsApp preview reads the same as the page it opens.
const copyCache = {};
async function loadCopy(code) {
  if (copyCache[code]) return copyCache[code];
  try {
    copyCache[code] = JSON.parse(await readSource("assets/copy." + code + ".json"));
  } catch (e) { copyCache[code] = {}; }
  return copyCache[code];
}

/* ------------------------------------------------------------------ variants
 *
 * core.js's SY.groupVariants transcribed, not a second rule: BRACKET,
 * SPEC_BRACKET, variantKey, colourBrackets, describe and pickLead are
 * byte-for-byte the client's, so the canonical this page declares points at
 * exactly the card the grid shows and the sitemap lists. Keyed on `p.name`,
 * the catalogue name — NEVER the translated one. If core.js's SPEC_BRACKET is
 * ever corrected, correct it here, in api/c.js and in api/sitemap.js in the
 * same commit.
 *
 * Why it matters here: 26 groups cover over 110 products, so ~84 near-
 * duplicate URLs were competing with each other — 16 of them for one iPhone
 * 17 Pro Max case with the same name, the same summary and the same price.
 */
const BRACKET = /\(([^()]*)\)/g;
const SPEC_BRACKET = /\b\d+(?:\.\d+)?\s*(?:w|k|v|a|ah|wh|mah|gb|tb|mm|cm|m|ft|in|qt|l)\b|\b\d+\s*-?\s*in\s*-?\s*\d\b|\bpack\b|\bpieces?\b|\bpairs?\b|\bbottles?\b|\bports?\b|\u0648\u0627\u0637|\u0648\u0627\u062A|\u0639\u0628\u0648\u0629|\u0642\u0637\u0639|\u0642\u0637\u0639\u0629/i;

function variantKey(name) {
  return String(name || "").replace(BRACKET, "").replace(/\s+/g, " ").trim().toLowerCase();
}
function baseName(name) {
  return String(name).replace(BRACKET, "").replace(/\s+/g, " ").trim();
}
function colourBrackets(name) {
  const found = String(name || "").match(BRACKET) || [];
  return found.map(b => b.slice(1, -1).trim()).filter(b => b && !SPEC_BRACKET.test(b));
}
function pickLead(members) {
  const pool = members.filter(m => m.inStock);
  return (pool.length ? pool : members).slice().sort((a, b) => a.price - b.price)[0];
}
function describe(members) {
  const lists = members.map(m => colourBrackets(m.name));
  const depth = Math.max(...lists.map(l => l.length));
  let at = -1;
  for (let i = depth - 1; i >= 0; i--) {
    const values = new Set(lists.map(l => l[i] || ""));
    if (values.size > 1) { at = i; break; }
  }
  const labels = new Map();
  members.forEach((m, i) => {
    const list = lists[i];
    labels.set(m.id, at === -1 ? (list[list.length - 1] || "") : (list[at] || list[list.length - 1] || ""));
  });
  const prices = members.map(m => m.price);
  return { lead: pickLead(members), members, labels, min: Math.min(...prices), max: Math.max(...prices) };
}

function variantIndex(products) {
  const buckets = new Map();
  for (const p of products) {
    const key = p.brand.toLowerCase() + "|" + variantKey(p.name);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(p);
  }
  const byId = new Map();
  for (const members of buckets.values()) {
    if (members.length < 2) continue;
    if (!members.every(m => colourBrackets(m.name).length)) continue;
    const group = describe(members);
    for (const m of members) byId.set(m.id, group);
  }
  return byId;
}

/* ---------------------------------------------------------------- breadcrumb */

/* `الرئيسية / department / category`, matching the visible trail exactly.
   A label whose dictionary key is missing falls back to the node id, which is
   what SY.labelOf does in the browser — the two must not disagree. */
async function breadcrumb(win, product, code) {
  const [tree, map] = await Promise.all([
    readData("assets/taxonomy.json"),
    readData("assets/product-cat.json")
  ]);
  if (!tree || !map) return { trail: null, dept: "" };
  const byId = {};
  (tree.nodes || []).forEach(n => { byId[n.id] = n; });
  const nodeId = map[String(product.id)] ||
    (tree.aliases && tree.aliases[product.category]) || "";
  const node = byId[nodeId];
  if (!node) return { trail: null, dept: "" };
  const dept = node.parent ? byId[node.parent] : node;
  const label = id => {
    const value = win.I18N.t("cat." + id, null, code);
    return /^⟦/.test(value) ? String(id) : value;
  };
  const trail = [{ name: win.I18N.t("navHome", null, code), url: "/" }];
  if (dept) trail.push({ name: label(dept.id), url: "/c/" + dept.id });
  if (dept && node.id !== dept.id) trail.push({ name: label(node.id), url: "/c/" + dept.id + "/" + node.id });
  return { trail, dept: (dept && dept.id) || "" };
}

/* ------------------------------------------------------------------ gallery */

function shotsFor(id, code, main) {
  const shots = [];
  const seen = new Set();
  if (main) { shots.push({ url: main, kind: "pack" }); seen.add(main); }
  for (let i = 0; code && i + 1 < code.length; i += 2) {
    const at = Number(code[i]);
    if (!at) continue;
    const url = "/assets/products/" + id + (at === 1 ? "" : "-" + at) + ".webp";
    if (seen.has(url)) continue;
    seen.add(url);
    shots.push({ url, kind: code[i + 1] === "s" ? "scene" : "pack" });
  }
  return shots;
}

/* ------------------------------------------------------------------- body */

/*
 * The markup product.js will replace, in the same order, with the same class
 * names — so a visitor with JavaScript sees the page rearrange nothing, and a
 * crawler (or a shopper on a dead connection) gets the real product.
 */
function renderBody(o) {
  const t = o.t;
  const p = o.product;
  const cut = p.inStock && p.discount > 0 && p.oldPrice > p.price;
  // The same shape SY.money emits: <bdi dir="ltr"> and two decimals. A bare
  // <bdi> defaults to dir="auto", finds no strong character in "$229.99" and
  // falls back to the paragraph's RTL, putting the dollar on the wrong side.
  const price = v => '<bdi dir="ltr">$' + Number(v).toFixed(2) + "</bdi>";

  const crumbs = o.trail
    ? '<nav class="pdp__crumbs" aria-label="' + esc(t("pdpBreadcrumb")) + '">' +
      o.trail.map(c => '<a href="' + esc(c.url) + '">' + esc(c.name) + "</a>")
        .join('<span aria-hidden="true">/</span>') + "</nav>"
    : "";

  /* No photograph means no <img>. The sixteen category drawings are deleted —
     twelve carried a competitor's wordmark — so the department glyph and this
     product's OWN brand are drawn into the same box instead. */
  const slides = o.shots.length
    ? o.shots.map((s, n) =>
      '<div class="pdp__slide" data-slide="' + n + '" data-photo' +
      (s.kind === "scene" ? ' data-kind="scene"' : "") + ">" +
      '<img src="' + esc(s.url) + '" alt="' + (n === 0 ? esc(o.name) : "") + '" width="700" height="700"' +
      (n === 0 ? ' fetchpriority="high"' : ' loading="lazy" decoding="async" fetchpriority="low"') + ">" +
      (s.kind === "scene" ? '<span class="pdp__badge">' + esc(t("galleryInUse")) + "</span>" : "") +
      (n === 0 && !p.inStock ? '<span class="pdp__band">' + esc(t("outOfStock")) + "</span>" : "") +
      "</div>").join("")
    : '<div class="pdp__slide is-missing" data-photo>' +
      '<span class="pdp__blank" role="img" aria-label="' + esc(t("galleryNoPhoto")) + '">' +
      '<svg class="icon pdp__glyph" aria-hidden="true" focusable="false">' +
      '<use href="/assets/icons.svg#ic-' + esc(o.dept ? "dept-" + o.dept : "box") + '"></use></svg>' +
      '<span class="pdp__blankword" dir="ltr">' + esc(p.brand || "") + "</span></span></div>";

  /* The same three-way split product.js makes, from the same dictionary keys:
     73 pairs titled "what is in the box" are an inventory list and 15 are
     disclaimers. Rendering all three as feature cards is the defect. */
  const split = splitPairs(o.pairs, t);
  const specs = (split.features.length || split.box.length || split.notes.length)
    ? '<section class="pdp__details"><h2>' + esc(t("detailsTitle")) + "</h2>" +
      (split.features.length
        ? '<dl class="pdp__specs">' + split.features.map(pair =>
          '<div class="spec-card"><dt>' + esc(pair[0]) + "</dt><dd>" + esc(pair[1]) + "</dd></div>").join("") + "</dl>"
        : "") +
      (split.box.length
        ? '<div class="pdp__box"><h3>' + esc(t("specInTheBox")) + "</h3>" +
          split.box.map(pair => '<p class="prose">' + esc(pair[1]) + "</p>").join("") + "</div>"
        : "") +
      (split.notes.length
        ? '<div class="pdp__notes">' + split.notes.map(pair =>
          '<p class="meta"><b>' + esc(pair[0]) + "</b> " + esc(pair[1]) + "</p>").join("") + "</div>"
        : "") + "</section>"
    : "";

  return '<div class="pdp-page">' +
    crumbs +
    '<div class="pdp">' +
    '<div class="pdp__media"><div class="pdp__gallery">' + slides + "</div></div>" +
    '<div class="pdp__info">' +
    '<a class="meta pdp__brand" href="/b/' + esc(o.brandSlug) + '" dir="ltr">' + esc(p.brand) + "</a>" +
    "<h1><bdi>" + esc(o.name) + "</bdi></h1>" +
    '<div class="pdp__price"><b>' + price(p.price) + "</b>" +
    (cut ? "<del>" + price(p.oldPrice) + "</del>" : "") +
    (cut ? '<span class="pcard__off">' +
      t("pdpDiscount", { p: '<bdi dir="ltr">' + p.discount + "%</bdi>" }) + "</span>" : "") +
    '<span class="chip ' + (p.inStock ? "is-on" : "is-out") + '">' +
    esc(t(p.inStock ? "inStock" : "outOfStock")) + "</span></div>" +
    '<p class="prose">' + esc(o.description) + "</p>" +
    "</div></div>" + specs +
    '<p class="vh" data-live role="status" aria-live="polite"></p>' +
    "</div>";
}

/* The box-contents and disclaimer title sets live in the dictionary as a JSON
   array inside a string, so no Arabic is hard-coded here either. An entry
   ending in * matches a prefix, one starting with * matches a suffix. */
function titleSet(t, key) {
  const raw = t(key);
  if (raw.charCodeAt(0) === 0x27E6) return [];
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.map(String) : [];
  } catch (e) { return raw.split("|").map(s => s.trim()).filter(Boolean); }
}
function titleMatches(title, patterns) {
  const value = String(title || "").trim();
  return patterns.some(pattern => {
    if (pattern.length > 1 && pattern.slice(-1) === "*") return value.indexOf(pattern.slice(0, -1)) === 0;
    if (pattern.length > 1 && pattern.charAt(0) === "*") {
      const tail = pattern.slice(1);
      return value.length >= tail.length && value.slice(-tail.length) === tail;
    }
    return value === pattern;
  });
}
function splitPairs(pairs, t) {
  const out = { features: [], box: [], notes: [] };
  if (!Array.isArray(pairs)) return out;
  const box = titleSet(t, "specBoxContentsTitles");
  const notes = titleSet(t, "specNoteTitles");
  for (const pair of pairs) {
    if (!pair || !pair.length) continue;
    if (titleMatches(pair[0], box)) out.box.push(pair);
    else if (titleMatches(pair[0], notes)) out.notes.push(pair);
    else out.features.push(pair);
  }
  return out;
}

/* -------------------------------------------------------------------------- */

export default async function handler(req, res) {
  // Never let a request's Host header decide the canonical, og:url or the
  // origin this function fetches from: the answer is cached and served to
  // everyone else. Without a configured origin the page does not render.
  const origin = trustedOrigin();
  if (!origin) {
    console.error("no SITE_ORIGIN or VERCEL_URL; refusing to build a product page");
    res.statusCode = 500;
    return res.end("");
  }
  const id = Number(req.query && req.query.id);
  const asked = String((req.query && req.query.lang) || "").toLowerCase();
  const code = ["ar", "en", "tr"].includes(asked) ? asked : "ar";
  const DIR = { ar: "rtl", en: "ltr", tr: "ltr" };
  try {
    const win = await loadStore();
    const t = (key, vars) => win.I18N.t(key, vars || null, code);
    const [state, copy] = await Promise.all([
      fetch(origin + "/api/products").then(r => r.json()).catch(() => ({})),
      loadCopy(code)
    ]);
    const products = win.STORE.merge(state);
    const product = products.find(p => p.id === id);
    if (!product) {
      /* 404, and it stays 404. The old answer carried a meta refresh to "/",
         which is a soft redirect: a crawler files it as a duplicate of the
         home page instead of removing a dead product from the index. */
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=0, s-maxage=60");
      return res.end('<!doctype html><html lang="' + code + '" dir="' + DIR[code] + '"><head>' +
        '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<meta name="robots" content="noindex"><title>' + esc(t("pdpNotFound")) + "</title></head><body>" +
        "<h1>" + esc(t("pdpNotFound")) + '</h1><p><a href="/">' + esc(t("navHome")) + "</a></p>" +
        "</body></html>");
    }

    const raw = String(product.image || "");
    /* WhatsApp and Facebook render WebP unreliably, so every catalogue photo
       also has a 1200×630 JPEG card at /assets/og/<id>.jpg. A product with no
       photograph falls back to the shop's own cover — never to a category
       drawing, because those files are deleted and twelve of them carried
       another company's wordmark. */
    const card = /^\/?assets\/products\/(\d+)\.webp$/.exec(raw);
    const photo = raw ? (raw.startsWith("http") ? raw : "/" + raw.replace(/^\/+/, "")) : "";
    const image = card
      ? origin + "/assets/og/" + card[1] + ".jpg"
      : raw.startsWith("http") ? raw
      : raw ? origin + "/" + raw.replace(/^\/+/, "")
      : origin + "/assets/og-cover.png";
    const url = origin + "/p/" + product.id;
    const suffix = code === "ar" ? "" : "?lang=" + code;
    const LOCALE = { ar: "ar_AR", en: "en_US", tr: "tr_TR" };
    // Anything the owner edited is theirs, but only the field they changed:
    // editing a price must not drop the product back to its English name.
    const edits = Array.isArray(product.edits) ? product.edits : [];
    const entry = product.added ? null : copy[String(product.id)];
    const name = (!edits.includes("name") && entry && entry.n) || product.name;
    // Only the language the owner wrote in defers to them.
    const descField = { ar: "descriptionAr", en: "description", tr: "descriptionTr" }[code] || "description";
    const wroteThis = edits.includes(descField) && product[descField];
    const description = (wroteThis && product[descField]) || (entry && entry.s) ||
      win.STORE.descFor(product, code) || product.description || "";
    const title = name + " | " + win.I18N.t("brandName", null, code);

    /* ---- variants: one canonical per colourway group -------------------- */
    const index = variantIndex(products);
    const group = index.get(product.id);
    /* The lead is in stock first, then cheapest — so the URL the index keeps
       is one a shopper can actually buy at the price the snippet shows. */
    const lead = group ? group.lead : product;
    const isLead = lead.id === product.id;
    const canonical = origin + "/p/" + lead.id + suffix;
    const colour = group ? (group.labels.get(product.id) || "") : "";

    /* ---- gallery, breadcrumb, features ---------------------------------- */
    const [gallery, crumbs, pairs] = await Promise.all([
      readData("assets/gallery.json"),
      breadcrumb(win, product, code),
      readData("assets/details/" + code + "/" + product.id + ".json")
    ]);
    const trail = crumbs.trail;
    const shots = shotsFor(product.id, gallery && gallery[String(product.id)], photo);

    /* ---- structured data ------------------------------------------------ */
    // Google warns on an offer with no validity window; 30 days is the shop's
    // own review cycle, regenerated on every request so it never goes stale.
    const until = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
    const offerFor = p => ({
      "@type": "Offer",
      url: origin + "/p/" + p.id + suffix,
      priceCurrency: "USD",
      price: p.price.toFixed(2),
      priceValidUntil: until,
      availability: "https://schema.org/" + (p.inStock ? "InStock" : "OutOfStock"),
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@type": "Organization", name: win.I18N.t("brandName", null, "ar") }
    });
    /* No shippingDetails and no hasMerchantReturnPolicy. Both would have to
       state a delivery cost and a return window the owner has not set, and a
       guessed figure in structured data is a published promise. */
    const productLd = {
      "@context": "https://schema.org",
      "@type": "Product",
      "@id": url + "#product",
      name,
      description,
      sku: product.sku || String(product.id),
      brand: { "@type": "Brand", name: product.brand },
      offers: offerFor(product)
    };
    /* No photograph, no image claim. The sixteen category drawings are gone
       and the shop's own cover is not a picture of this product. */
    if (shots.length) productLd.image = shots.map(x => origin + x.url);
    if (colour) productLd.color = colour;
    if (group && !isLead) productLd.isVariantOf = { "@id": origin + "/p/" + lead.id + "#group" };

    const blocks = [productLd];
    if (group && isLead) {
      blocks.push({
        "@context": "https://schema.org",
        "@type": "ProductGroup",
        "@id": url + "#group",
        name: baseName(name),
        description,
        brand: { "@type": "Brand", name: product.brand },
        productGroupID: product.sku || String(product.id),
        variesBy: ["color"],
        /* Two groups span a real range ($59.99–$69.99). Where the colours are
           priced differently the group carries an AggregateOffer and each
           variant keeps its own exact price; where they are not, one Offer. */
        offers: group.min === group.max ? offerFor(lead) : {
          "@type": "AggregateOffer",
          url: canonical,
          priceCurrency: "USD",
          lowPrice: group.min.toFixed(2),
          highPrice: group.max.toFixed(2),
          offerCount: group.members.length,
          availability: "https://schema.org/" +
            (group.members.some(v => v.inStock) ? "InStock" : "OutOfStock")
        },
        hasVariant: group.members.map(v => {
          const vphoto = String(v.image || "").replace(/^\/+/, "");
          const variant = {
            "@type": "Product",
            "@id": origin + "/p/" + v.id + "#product",
            name: (copy[String(v.id)] && copy[String(v.id)].n) || v.name,
            sku: v.sku || String(v.id),
            color: group.labels.get(v.id) || "",
            offers: offerFor(v)
          };
          /* No photograph means no image claim — never a category drawing. */
          if (vphoto) variant.image = origin + "/" + vphoto;
          return variant;
        })
      });
    }
    if (trail) {
      blocks.push({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: trail.map((c, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: c.name,
          item: origin + c.url
        })).concat([{ "@type": "ListItem", position: trail.length + 1, name }])
      });
    }

    const tags =
      '<meta property="og:type" content="product">' +
      '<meta property="og:site_name" content="SmartTech">' +
      '<meta property="og:url" content="' + esc(url) + '">' +
      '<meta property="og:title" content="' + esc(name + " — " + product.price.toFixed(2) + " USD") + '">' +
      '<meta property="og:description" content="' + esc(description) + '">' +
      '<meta property="og:image" content="' + esc(image) + '">' +
      '<meta property="og:image:width" content="1200">' +
      '<meta property="og:image:height" content="630">' +
      '<meta property="og:locale" content="' + LOCALE[code] + '">' +
      '<link rel="alternate" hreflang="ar" href="' + esc(url) + '?lang=ar">' +
      '<link rel="alternate" hreflang="en" href="' + esc(url) + '?lang=en">' +
      '<link rel="alternate" hreflang="tr" href="' + esc(url) + '?lang=tr">' +
      '<link rel="alternate" hreflang="x-default" href="' + esc(url) + '">' +
      '<meta property="product:price:amount" content="' + product.price.toFixed(2) + '">' +
      '<meta property="product:price:currency" content="USD">' +
      '<meta name="twitter:card" content="summary_large_image">' +
      '<meta name="twitter:title" content="' + esc(title) + '">' +
      '<meta name="twitter:description" content="' + esc(description) + '">' +
      '<meta name="twitter:image" content="' + esc(image) + '">' +
      '<link rel="canonical" href="' + esc(canonical) + '">' +
      /* The hero is discoverable at parse time instead of after 78 KB of JS.
         It must be the same URL the <img> asks for or the browser downloads
         the photo twice. */
      (shots.length
        ? '<link rel="preload" as="image" fetchpriority="high" href="' + esc(shots[0].url) + '">' : "") +
      /* ~400 bytes that keep copy.<lang>.json (77,621) off the critical path. */
      '<script type="application/json" id="seed">' +
      /* `l` is the language this document was rendered in. A visitor whose
         browser asks for English gets this Arabic document — the page is
         cached and cannot vary on Accept-Language — and switches client-side,
         so the seed has to say which language it is or the <h1> ends up
         Arabic inside an English page. */
      jsonInline({ id: product.id, l: code, n: name, s: description }) + "</script>" +
      blocks.map(b => '<script type="application/ld+json">' + jsonInline(b) + "</script>").join("") +
      "";

    if (!shellHtml) shellHtml = await readSource("index.html");
    const body = renderBody({
      t, product, name, description, shots, pairs, trail, dept: crumbs.dept,
      brandSlug: String(product.brand || "").toLowerCase().trim()
        .replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")
    });

    let html = shellHtml
      .replace(/<html([^>]*)>/, () =>
        '<html lang="' + code + '" dir="' + DIR[code] + '">')
      .replace(/ data-title-key="[^"]*"/g, "")
      .replace(/<body([^>]*)>/, () =>
        '<body data-route="product" data-product-id="' + product.id + '">')
      .replace(/<title>[^<]*<\/title>/, () => "<title>" + esc(title) + "</title>")
      .replace(/<meta name="description" content="[^"]*">/, () => '<meta name="description" content="' + esc(description) + '">')
      // Drop the site-wide preview tags: a crawler keeps the first one it sees,
      // and this page must advertise the product, not the home page.
      .replace(/[ \t]*<meta property="og:[^>]*>\r?\n?/g, "")
      .replace(/[ \t]*<meta name="twitter:[^>]*>\r?\n?/g, "")
      .replace(/[ \t]*<link rel="canonical"[^>]*>\r?\n?/g, "")
      .replace(/[ \t]*<link rel="alternate" hreflang="[^"]*"[^>]*>\r?\n?/g, "")
      .replace("</head>", () => tags + "</head>");

    /* The container. index.html is written by another hand and is being
       rewritten concurrently, so match whatever element carries the id and
       fall back to appending one — a revenue page must never depend on a
       markup detail landing first. */
    const holder = /(<(section|div|main|article)\b[^>]*\bid="productView"[^>]*>)[\s\S]*?(<\/\2>)/;
    html = holder.test(html)
      ? html.replace(holder, (whole, opening, tag, closing) => opening + body + closing)
      : html.replace("</body>", () => '<div id="productView">' + body + "</div></body>");

    /* The runtime this page needs, if the shell does not already carry it.
       The words go first. Deferred scripts run in document order, so linking
       i18n-pdp.js ahead of product.js is what guarantees the page is drawn
       with its own words — this page used to serve a correct render and then
       have the browser paint ⟦pdpBuyNow⟧ over it, because the chunk was a
       separate request nobody had made yet. It is also one round trip saved:
       the words are fetched beside the code, not after it.
       The hash comes from the shell so the file is cache-busted exactly as
       every other link on the page is. */
    const stamp = (() => {
      const m = /data-js='([^']*)'/.exec(html);
      try { return m ? JSON.parse(m[1]) : {}; } catch (e) { return {}; }
    })();
    const link = file => '<script src="/' + file +
      (stamp[file] ? "?v=" + stamp[file] : "") + '" defer></script>';
    let inject = "";
    if (!/\bsrc="\/core\.js/.test(html)) inject += '<script src="/core.js" defer></script>';
    if (!/\bsrc="\/i18n-pdp\.js/.test(html)) inject += link("i18n-pdp.js");
    if (!/\bsrc="\/product\.js/.test(html)) inject += link("product.js");
    if (inject) html = html.replace("</body>", () => inject + "</body>");

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=86400");
    return res.status(200).send(html);
  } catch (e) {
    /* Not a redirect. A 302 to "/" turned every failure into a silent
       duplicate of the home page in the index and in the logs. */
    console.error("product page error", e);
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    return res.end('<!doctype html><html lang="' + code + '" dir="' + DIR[code] +
      '"><head><meta charset="utf-8"><meta name="robots" content="noindex"></head><body></body></html>');
  }
}
