/*
 * SmartTech — the storefront.
 * ===========================
 * One document, seven surfaces, selected by `body[data-route]`. This file owns
 * the chrome (header, bottom bar, departments sheet), the product card, the
 * grid and its pager, the facets, search, sorting, the computed merchandising
 * and the empty states. It owns nothing else: the product page is `product.js`
 * and the basket is `cart.js`.
 *
 * Load order: i18n.js → catalog.js → core.js → this file.
 *
 * Three rules this file exists to hold:
 *
 *  1. **Nothing pages itself.** The old grid auto-fired "load more" from a
 *     scroll observer *and* a rAF handler; flick down and the document reached
 *     49,772px with 230 images in one DOM and a measured CLS of 0.546. There is
 *     no IntersectionObserver and no scroll handler here. 24, one "show 24
 *     more" to 48, then a numbered pager of real <a href>.
 *  2. **Every block is bounded.** A rail is capped, the department grid is 8
 *     tiles at 8 departments and 8 at 40, the brand strip is 9 tiles at 7
 *     brands and 9 at 40. Page height must be a constant, not a function of
 *     inventory.
 *  3. **No number is ever built by hand.** SY.money / SY.num / SY.percent /
 *     SY.code emit `<bdi dir="ltr">`; a bare price inside an Arabic paragraph
 *     renders "129.98$".
 */
(function () {
  "use strict";

  const qs = SY.qs, qsa = SY.qsa, esc = SY.esc, t = SY.t, icon = SY.icon;
  const doc = document;
  const PAGE = 24;

  /* ------------------------------------------------------------------ state */

  /* Every discovery state is in the URL: node, brand, query, facets, sort and
     page. A shared link resumes, the back button works, and an order record
     can say where the shopper was. */
  const st = {
    route: "home",       // home|category|brand|browse|brands|search|product
    node: "",
    brand: "",
    q: "",
    view: "",            // "" | all | deals | fav   (modifiers on the search surface)
    sort: "",
    page: 1,
    shown: PAGE,         // 24, or 48 after one "show 24 more"
    f: { brands: [], device: "", min: null, max: null, inStock: false },
    similar: false
  };

  let settings = window.STORE.settings;
  let SYN = {};                 // the Arabic synonym map
  let SYN_KEYS = [];            // built once when the file lands, not per render
  let POPULAR = [];             // owner-editable "most searched" chips
  let GALLERY = {};             // id -> photo manifest, for the rank
  let COPY = {};                // the translated names and summaries
  let RANK = new Map();
  let ready = false;            // taxonomy + brands + copy are in
  let lastCount = 0;            // the live result count the filter foot reports
  const ENTRY = location.pathname + location.search;   // what the server rendered

  /* ------------------------------------------------------------------- text */

  /* core.js's nameOf() prefers p.name for Arabic, and p.name is the supplier's
     English name — so the Arabic name in assets/copy.ar.json never wins. This
     is a three-line shim over that bug, not a second implementation: when the
     bug is fixed in core.js both branches return the same string and this can
     be deleted. Reported with the hand-off. */
  function nameOf(p) {
    const entry = p && COPY[String(p.id)];
    return (entry && entry.n) || SY.nameOf(p);
  }

  /* The name a CARD shows. The catalogue name carries the colourway and often
     a second bracket the supplier added for its own filing —
     "…Edge Case (600D Black/Grey-Twill) (Aaron Button)" — and at two clamped
     lines in a 173px card that pushed a four-line Arabic title to showing
     half of itself. The colour is already on the card, in the note row, and
     the full name is on the product page, so the card drops trailing
     brackets until it fits.
     At most two are removed, and never below 48 characters, so a name whose
     bracket is the specification — "(26K, 300W)" — keeps it. */
  function cardName(p) {
    let name = nameOf(p);
    for (let i = 0; i < 2 && name.length > 48; i++) {
      const shorter = name.replace(/\s*\([^()]*\)\s*$/, "").trim();
      if (shorter === name || shorter.length < 12) break;
      name = shorter;
    }
    return name;
  }
  function summaryOf(p) {
    const entry = p && COPY[String(p.id)];
    return (entry && entry.s) || SY.summaryOf(p);
  }
  function label(nodeId) { return SY.labelOf(nodeId); }

  function waLink(text) {
    return "https://wa.me/" + settings.whatsapp + "?text=" + encodeURIComponent(text);
  }

  /* --------------------------------------------------------- the URL, both ways */

  function readUrl() {
    const path = location.pathname;
    const p = new URLSearchParams(location.search);
    const data = doc.body.dataset;
    let m;

    st.node = data.node || "";
    st.brand = data.brand || "";
    st.q = p.get("q") || "";
    st.view = "";

    if ((m = /^\/c\/([^/]+)(?:\/([^/]+))?\/?$/.exec(path))) {
      st.route = "category";
      st.node = decodeURIComponent(m[2] || m[1]);
    } else if ((m = /^\/b\/([^/]+)\/?$/.exec(path))) {
      st.route = "brand";
      st.brand = decodeURIComponent(m[1]);
    } else if (/^\/browse\/?$/.test(path)) {
      st.route = "browse";
    } else if (/^\/brands\/?$/.test(path)) {
      st.route = "brands";
    } else if (data.productId || data.route === "product") {
      st.route = "product";
    } else {
      const view = p.get("view");
      if (view === "fav" || view === "all") { st.route = "search"; st.view = view; }
      else if (p.get("deal")) { st.route = "search"; st.view = "deals"; }
      else if (st.q) { st.route = "search"; }
      else if (data.route === "search") { st.route = "search"; }
      else st.route = "home";
    }

    st.sort = p.get("sort") || "";
    st.page = Math.max(1, parseInt(p.get("page"), 10) || 1);
    st.f.brands = (p.get("brand") || "").split(",").filter(Boolean);
    st.f.device = p.get("device") || "";
    st.f.min = p.has("min") ? Number(p.get("min")) : null;
    st.f.max = p.has("max") ? Number(p.get("max")) : null;
    st.f.inStock = p.get("stock") === "1";
    st.similar = false;
  }

  function href(over) {
    const s = Object.assign({}, st, over || {});
    const f = Object.assign({}, st.f, (over && over.f) || {});
    let path = "/";
    if (s.route === "category" && s.node) {
      const node = SY.resolveNode(s.node);
      path = node && node.parent ? "/c/" + node.parent + "/" + node.id : "/c/" + s.node;
    } else if (s.route === "brand" && s.brand) {
      path = "/b/" + SY.slug(s.brand);
    } else if (s.route === "browse") path = "/browse";
    else if (s.route === "brands") path = "/brands";

    const p = new URLSearchParams();
    if (s.q) p.set("q", s.q);
    if (s.view === "fav" || s.view === "all") p.set("view", s.view);
    if (s.view === "deals") p.set("deal", "1");
    if (s.sort) p.set("sort", s.sort);
    if (f.brands.length) p.set("brand", f.brands.join(","));
    if (f.device) p.set("device", f.device);
    if (f.min != null) p.set("min", String(f.min));
    if (f.max != null) p.set("max", String(f.max));
    if (f.inStock) p.set("stock", "1");
    if (s.page > 1) p.set("page", String(s.page));
    const query = p.toString();
    return path + (query ? "?" + query : "");
  }

  /* A navigation resets the page window; a facet change does not move the
     shopper. Both write the URL, so both are shareable and both come back. */
  function go(over, opts) {
    const o = opts || {};
    const patch = Object.assign({}, over || {});
    const facets = patch.f;
    delete patch.f;
    Object.assign(st, patch);
    if (facets) Object.assign(st.f, facets);
    if (!o.keepPage) st.shown = PAGE;
    SY.route.go(href(), { shown: st.shown }, !!o.replace);
    render();
    if (!o.keepScroll) SY.scrollToY(0);
  }

  /* -------------------------------------------------------------- the search */

  /* Arabic is written with several spellings of the same word; fold them
     together before anything is compared. The characters are \u escapes
     because Arabic belongs in the dictionary and a test enforces that — the
     table is here so the escapes are still readable:

       \u064B-\u0652  harakat        ً ٌ ٍ َ ُ ِ ّ ْ   removed
       \u0670         superscript alef ٰ               removed
       \u0640         tatweel          ـ               removed
       \u0622 \u0623 \u0625 \u0671   آ أ إ ٱ  →  \u0627  ا
       \u0649        alif maqsura     ى       →  \u064A  ي
       \u0629        taa marbuta      ة       →  \u0647  ه
       \u200C-\u200F zero-width joiners and bidi marks  removed
  */
  function fold(text) {
    return String(text || "").toLowerCase()
      .replace(/[\u064B-\u0652\u0670\u0640]/g, "")
      .replace(/[\u0622\u0623\u0625\u0671]/g, "\u0627")
      .replace(/\u0649/g, "\u064A")
      .replace(/\u0629/g, "\u0647")
      .replace(/[\u200C-\u200F]/g, "")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  }

  /* Arabic glues the article and common particles onto the front of a word:
     wal-, bal-, fal-, al-, lil-, wa-, bi-, li-, fa-, ka-. */
  /* The prefixes a shopper leaves on a word: وال بال فال ال لل و ب ل ف ك.
     Escaped, because the dictionary is the only place Arabic text belongs
     and a rule with an exception is one nobody can check. */
  const PREFIX = /^(?:\u0648\u0627\u0644|\u0628\u0627\u0644|\u0641\u0627\u0644|\u0627\u0644|\u0644\u0644|[\u0648\u0628\u0644\u0641\u0643])(?=.{3})/;
  const LATIN = /^[a-z0-9]+$/;
  const DIGITS = /^\d+$/;

  /* One group per thing the shopper asked for, with all its spellings. A
     product must satisfy every group; any spelling within a group will do — so
     "كفر ايفون" means (كفر OR غطاء) AND (ايفون OR iphone).
     Called ONCE per render; it used to be called twice and rebuilt the sorted
     synonym key list each time, which was the bulk of a measured 26.5 ms. */
  function groupsFor(query) {
    let text = fold(query);
    const groups = [];
    for (let i = 0; i < SYN_KEYS.length; i++) {
      const key = SYN_KEYS[i][0];
      if (!key || text.indexOf(key) === -1) continue;
      groups.push({ alts: [key].concat(SYN_KEYS[i][1]), numeric: false });
      text = text.split(key).join(" ");
    }
    const words = [];
    for (const word of text.split(" ")) {
      /* The old `word.length < 2` filter threw away the "c" in "usb c". A
         single Latin or digit character survives now. */
      if (!word || (word.length < 2 && !LATIN.test(word))) continue;
      words.push(word);
    }
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const next = words[i + 1];
      const alts = [word];
      let phrases = null;
      /* Two adjacent Latin tokens whose second is 1–2 characters are also one
         token: "usb c" is "usbc" on the box. The joined form is matched
         against the name with its separators stripped. */
      if (next && next.length <= 2 && LATIN.test(word) && LATIN.test(next)) {
        phrases = [word + " " + next, word + next];
        alts.push(phrases[0], phrases[1]);
        i++;
      }
      const bare = word.replace(PREFIX, "");
      if (bare !== word) alts.push(bare);
      if (SYN[word]) alts.push.apply(alts, SYN[word]);
      if (SYN[bare]) alts.push.apply(alts, SYN[bare]);
      groups.push({ alts, numeric: DIGITS.test(word), phrases });
    }
    return groups;
  }

  /* The haystacks are built once per product per render, not once per group. */
  function hay(p) {
    if (p.__hay && p.__hayLang === SY.lang()) return p.__hay;
    const node = SY.nodeOf(p);
    const name = fold(nameOf(p) + " " + p.name);
    const built = {
      name,
      tight: name.replace(/ /g, ""),
      sku: fold(p.sku),
      brand: fold(p.brand),
      cat: fold(node ? label(node.id) + " " + (node.parent ? label(node.parent) : "") : ""),
      sum: fold(summaryOf(p))
    };
    try { Object.defineProperty(p, "__hay", { value: built, configurable: true }); } catch (e) { p.__hay = built; }
    p.__hayLang = SY.lang();
    return built;
  }

  function wholeWord(text, term) {
    const i = text.indexOf(term);
    if (i === -1) return false;
    const before = i === 0 ? " " : text[i - 1];
    const after = i + term.length >= text.length ? " " : text[i + term.length];
    return before === " " && after === " ";
  }

  /* Study 10 §6.1, exactly: the single best field hit per group, summed. */
  function scoreOf(p, groups, deviceWanted) {
    const h = hay(p);
    let raw = 0;
    let allStrong = groups.length > 0;
    let catOnly = false;
    for (const g of groups) {
      let best = 0;
      let strong = false;
      for (const alt of g.alts) {
        if (!alt) continue;
        if (wholeWord(h.name, alt)) { best = Math.max(best, 10); strong = true; }
        else if (alt.length >= 3 && h.name.indexOf(alt) === 0) { best = Math.max(best, 7); strong = true; }
        else if (h.name.indexOf(alt) !== -1 || h.tight.indexOf(alt.replace(/ /g, "")) !== -1) { best = Math.max(best, 5); strong = true; }
        if (h.sku && h.sku.indexOf(alt) !== -1) { best = Math.max(best, 8); strong = true; }
        if (h.brand && h.brand.indexOf(alt) !== -1) { best = Math.max(best, 6); strong = true; }
        if (h.cat && h.cat.indexOf(alt) !== -1) { best = Math.max(best, 4); catOnly = best === 4; }
        /* A bare number may never score against the summary. That is why
           "ايفون 20" used to return iPhone 18 cases: "20" appears in a
           sentence about 20W charging. With the guard it returns nothing,
           which is the truth, and the no-result state offers "ايفون 18". */
        if (!g.numeric && h.sum && h.sum.indexOf(alt) !== -1) best = Math.max(best, 1);
      }
      if (!best) return 0;
      /* A joined phrase is more specific than either of its words: without this
         "usb c" scores a Micro-USB cable exactly as high as a USB-C one, since
         both contain the word "usb". */
      if (g.phrases && g.phrases.some(a => h.name.indexOf(a) !== -1 || h.tight.indexOf(a.replace(/ /g, "")) !== -1)) best += 2;
      if (!strong) allStrong = false;
      raw += best;
    }
    if (allStrong) raw *= 1.5;
    if (groups.length === 1 && catOnly) raw *= 1.3;
    if (p.inStock) raw += 3;
    if (p.discount > 0) raw += 1;
    if (deviceWanted && deviceOf(p) === deviceWanted) raw += 4;
    return raw;
  }

  /* ------------------------------------------------ which phone is it for? */

  /* A third of the catalogue is phone cases and the model is already in every
     supplier title, so it can be a facet without any new data. */
  const DEVICE = /\b(iPhone|Galaxy Z Fold|Galaxy Z Flip|Galaxy S|Galaxy A|Galaxy|Pixel|AirPods Pro|AirPods|Apple Watch Ultra|Apple Watch|MacBook Pro|MacBook Air|iPad Pro|iPad)\s*(\d{1,2})?((?:\s+[A-Za-z]+)*)/i;
  const DEVICE_SUFFIX = { pro: 1, plus: 1, ultra: 1, max: 1, air: 1, mini: 1, se: 1, fe: 1 };
  const CANONICAL = { airpods: "AirPods", iphone: "iPhone", ipad: "iPad", macbook: "MacBook" };

  function deviceOf(p) {
    if (p.__device !== undefined) return p.__device;
    const m = DEVICE.exec((p && p.name) || "");
    let model = "";
    if (m) {
      const kept = [];
      for (const word of (m[3] || "").trim().split(/\s+/).filter(Boolean)) {
        if (!DEVICE_SUFFIX[word.toLowerCase()]) break;
        kept.push(word);
      }
      const family = m[1];
      const number = m[2] || "";
      const head = /Galaxy S$|Galaxy A$/i.test(family) ? family + number : [family, number].filter(Boolean).join(" ");
      model = [head].concat(kept).join(" ").replace(/\s+/g, " ").trim()
        .split(" ").map(w => CANONICAL[w.toLowerCase()] || w).join(" ");
      if (!/\d/.test(model)) model = "";
    }
    p.__device = model;
    return model;
  }

  /* ---------------------------------------------------------------- the rank */

  /* "Most popular" with no analytics is completeness and availability — which
     has the useful property that the products that look best are shown first.
     Deterministic: the same catalogue always produces the same order. */
  function photoCount(id) {
    const manifest = GALLERY[String(id)];
    if (!manifest) return 1;
    const found = String(manifest).match(/\d+[ps]/g);
    return found ? found.length : 1;
  }

  function buildRank() {
    const all = SY.products();
    const cheapest = {}, brandSize = {}, seen = {};
    for (const p of all) {
      const leaf = SY.catOf(p);
      if (!(leaf in cheapest) || p.price < cheapest[leaf]) cheapest[leaf] = p.price;
      brandSize[p.brand] = (brandSize[p.brand] || 0) + 1;
    }
    RANK = new Map();
    for (const p of all) {
      const index = seen[p.brand] || 0;
      seen[p.brand] = index + 1;
      let r = 100;
      if (p.inStock) r += 40;
      r += 25 * Math.min(photoCount(p.id), 4) / 4;
      if (COPY[String(p.id)] && COPY[String(p.id)].s) r += 20;
      r += 15 * Math.min(p.discount, 40) / 40;
      if (cheapest[SY.catOf(p)] === p.price) r += 10;
      r -= 5 * (index / Math.max(1, brandSize[p.brand]));
      RANK.set(p.id, r);
    }
  }
  const rankOf = p => RANK.get(p.id) || 0;

  /* Without a cap, PITAKA's 121 case cards and eufy's 34 spare parts own the
     default view of the whole store. Four per brand, six per leaf, in the
     first 24 and in every rail. */
  /* Takes either products or {p, members} rows — the grid works in rows and the
     rails work in products, and the cap is the same rule for both. */
  function capped(list, max) {
    const byBrand = {}, byLeaf = {}, out = [];
    for (const item of list) {
      const p = item.p || item;
      const brand = p.brand, leaf = SY.catOf(p);
      if ((byBrand[brand] || 0) >= 4 || (byLeaf[leaf] || 0) >= 6) continue;
      byBrand[brand] = (byBrand[brand] || 0) + 1;
      byLeaf[leaf] = (byLeaf[leaf] || 0) + 1;
      out.push(item);
      if (max && out.length >= max) break;
    }
    return out;
  }

  /* The cap shapes the first 24 of the default grid and then gets out of the
     way — page two is the rest of the list in its own order, not a re-cap. */
  function antiFlood(rows) {
    if (rows.length <= PAGE) return rows;
    const front = capped(rows, PAGE);
    const taken = new Set(front.map(r => r.p.id));
    return front.concat(rows.filter(r => !taken.has(r.p.id)));
  }

  /* ------------------------------------------------------------- the card */

  /* The single most-used function in the shop. Every row below the photo has a
     reserved height, so every card in the grid is the same height and the CLS
     from the grid is zero by construction. */
  function card(item, eager) {
    /* Takes a {p, members, min, max} group row, or a bare product from a rail. */
    const row = item && item.p ? item : { p: item, members: null, min: null, max: null };
    const p = row.p;
    const image = SY.imageSet(p);
    const src = image.small || image.full;
    const favourite = SY.favourites.has(p.id);
    const colours = row.members && row.members.length > 1 ? row.members.length : 0;
    const dept = SY.deptOf(p);
    /* Two groups genuinely span a range. Showing the lead's price bare would
       understate them silently, so a ranged group says "from". */
    const ranged = row.min != null && row.max != null && row.min !== row.max;

    let note = "", noteClass = "";
    if (!p.inStock) { note = esc(t("cardOut")); noteClass = " is-out"; }
    else if (colours) note = SY.plural("cardColours", colours);

    return '<article class="pcard" data-product="' + p.id + '">' +
      '<a class="pcard__hit" href="/p/' + p.id + '">' +
        /* data-photo on the wrapper is what core.js's delegated capture-phase
           error handler looks for: it removes the broken <img> and marks the
           box .is-missing. A product with no photograph at all is marked here
           and emits no <img>, so the two states are one state. */
        '<span class="pcard__photo' + (src ? "" : " is-missing") + '" data-photo>' +
          (dept ? icon(dept.icon || "dept-" + dept.id, { className: "pcard__glyph" }) : "") +
          (src
            ? '<img src="' + esc(src) + '"' +
              (image.srcset ? ' srcset="' + esc(image.srcset) + '"' : "") +
              ' sizes="(max-width:767px) 45vw, (max-width:1279px) 31vw, 23vw"' +
              ' width="360" height="360" alt="" decoding="async" ' +
              (eager ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"') + ">"
            : "") +
        "</span>" +
        /* alt="" because the <h3> inside the same link already names it; an alt
           that repeats the name makes a screen reader say every product twice. */
        '<span class="pcard__brand">' + SY.bdi(p.brand) + "</span>" +
        '<h3 class="pcard__name">' + SY.bdi(cardName(p)) + "</h3>" +
        '<span class="pcard__price"><b>' +
          (ranged ? t("cardPriceFrom", { price: SY.money(row.min) }) : SY.money(p.price)) + "</b>" +
          /* No struck price and no badge on something nobody can buy: a
             discount a shopper cannot take is a hostile message, and it is
             the loudest thing on the one card that cannot convert. The
             price itself stays — it is why they will come back. */
          (!ranged && p.discount && p.inStock !== false
            ? "<del>" + SY.money(p.oldPrice) + "</del>" : "") + "</span>" +
        /* Always rendered, even empty. Reserving this row is what makes every
           card the same height in every state. */
        '<span class="pcard__note' + noteClass + '">' + note + "</span>" +
      "</a>" +
      /* A percentage off a range is not a fact, so a ranged group carries no chip. */
      (!ranged && p.discount && p.inStock !== false ? '<span class="pcard__off">' + t("cardOff", { n: SY.percent(p.discount) }) + "</span>" : "") +
      '<button class="pcard__fav" type="button" data-fav="' + p.id + '"' +
        ' aria-pressed="' + (favourite ? "true" : "false") + '"' +
        ' aria-label="' + esc(t(favourite ? "cardUnfav" : "cardFav", { name: nameOf(p) })) + '">' +
        icon(favourite ? "heart-on" : "heart") + "</button>" +
      "</article>";
  }

  /* Colourways arrive from the supplier as separate products. One card, four
     colours — never four cards. */
  function collapse(list) {
    /* min/max travel with the row: only the group knows that an "iPhone 17 Pro
       and Pro Max Edge Case" is $59.99–$69.99 and not one price. */
    return SY.groupVariants(list)
      .map(g => ({ p: g.lead, members: g.members, min: g.min, max: g.max }));
  }

  /* --------------------------------------------------------------- the list */

  function scope() {
    let list = SY.products();
    if (st.view === "fav") {
      const ids = {};
      SY.favourites.ids().forEach(id => { ids[id] = 1; });
      list = list.filter(p => ids[String(p.id)]);
    }
    if (st.view === "deals") list = list.filter(p => p.discount > 0);
    if (st.route === "category" && st.node) {
      const node = SY.resolveNode(st.node);
      if (node) list = list.filter(p => SY.inNode(p, node.id));
    }
    if (st.route === "brand" && st.brand) {
      const slug = SY.slug(st.brand);
      list = list.filter(p => SY.slug(p.brand) === slug);
    }
    return list;
  }

  function applyFacets(list, skip) {
    const f = st.f;
    if (f.inStock && skip !== "stock") list = list.filter(p => p.inStock);
    if (f.brands.length && skip !== "brand") {
      const wanted = {};
      f.brands.forEach(b => { wanted[b] = 1; });
      list = list.filter(p => wanted[SY.slug(p.brand)]);
    }
    if (f.device && skip !== "device") list = list.filter(p => deviceOf(p) === f.device);
    if (skip !== "price") {
      if (f.min != null) list = list.filter(p => p.price >= f.min);
      if (f.max != null) list = list.filter(p => p.price <= f.max);
    }
    return list;
  }

  const TIE = (a, b) =>
    Number(b.p.inStock) - Number(a.p.inStock) ||
    b.p.discount - a.p.discount ||
    a.p.price - b.p.price ||
    b.p.id - a.p.id;

  function sortRows(rows, sort, scored) {
    if (sort === "relevance" && scored) rows.sort((a, b) => b.score - a.score || TIE(a, b));
    else if (sort === "price-asc") rows.sort((a, b) => Number(b.p.inStock) - Number(a.p.inStock) || a.p.price - b.p.price || b.p.id - a.p.id);
    else if (sort === "price-desc") rows.sort((a, b) => Number(b.p.inStock) - Number(a.p.inStock) || b.p.price - a.p.price || b.p.id - a.p.id);
    else if (sort === "newest") rows.sort((a, b) => Number(b.p.inStock) - Number(a.p.inStock) || b.p.id - a.p.id);
    else if (sort === "discount") rows.sort((a, b) => b.p.discount - a.p.discount || TIE(a, b));
    else rows.sort((a, b) => rankOf(b.p) - rankOf(a.p) || TIE(a, b));
    return rows;
  }

  /* One pass: scope → facets → search (one groupsFor call) → sort → cap. */
  function build() {
    const base = scope();
    const facetSource = base;
    let list = applyFacets(base);
    const groups = st.q ? groupsFor(st.q) : [];
    const wanted = st.q ? deviceFromQuery(st.q) : "";
    let rows = collapse(list);
    let similar = [];

    if (groups.length) {
      rows = rows.map(r => { r.score = scoreOf(r.p, groups, wanted); return r; }).filter(r => r.score > 0);
      const best = rows.reduce((m, r) => Math.max(m, r.score), 0);
      /* Everything under a third of the best hit is a different question.
         "شاشة" went from a flat list of 51 with one relevant result to 1
         result and a collapsed block of 50. */
      const floor = 0.34 * best;
      const main = [];
      for (const r of rows) (r.score >= floor ? main : similar).push(r);
      rows = main;
    }

    const sort = effectiveSort();
    sortRows(rows, sort, groups.length > 0);
    if (similar.length) sortRows(similar, sort, groups.length > 0);
    if (sort === "popular") rows = antiFlood(rows);

    lastCount = rows.length;
    return { rows, similar, groups, facetSource, filtered: list };
  }

  function deviceFromQuery(query) {
    const m = DEVICE.exec(query);
    if (!m) return "";
    const fake = { name: query };
    return deviceOf(fake);
  }

  /* --------------------------------------------------------------- sorting */

  function sortOptions() {
    const list = [];
    if (st.q) list.push(["relevance", "sortRelevance"]);
    list.push(["popular", "sortPopular"], ["price-asc", "sortCheap"], ["price-desc", "sortDear"], ["newest", "sortNewest"]);
    /* "أعلى خصم" only exists where there is something to discount. And there is
       no "حسب الاسم": its first eight Arabic results were a UV laminator and
       seven kinds of dust bag. */
    if (applyFacets(scope()).filter(p => p.discount > 0).length >= 4) list.push(["discount", "sortDiscount"]);
    return list;
  }

  function effectiveSort() {
    const allowed = sortOptions().map(o => o[0]);
    if (st.sort && allowed.indexOf(st.sort) !== -1) return st.sort;
    return st.q ? "relevance" : "popular";
  }

  /* ------------------------------------------------------------- the grid */

  function renderGrid(model) {
    const grid = qs("#grid");
    const total = model.rows.length;
    const start = (st.page - 1) * PAGE;
    const slice = model.rows.slice(start, start + st.shown);
    const phone = SY.isPhone();

    if (!total) {
      grid.innerHTML = "";
      qs("#pager").innerHTML = "";
      toggle(qs("#similar"), false);
      qs("#resultLine").innerHTML = "";
      renderEmpty(model);
      toggle(qs("#empty"), true);
      SY.say("results", t("a11yNoResults"));
      return;
    }
    toggle(qs("#empty"), false);
    qs("#empty").innerHTML = "";

    grid.innerHTML = slice.map((r, i) => card(r, i < (phone ? 2 : 4))).join("");
    releaseGrid();
    renderSimilar(model);
    renderPager(total, start);

    const from = start + 1;
    const to = Math.min(start + slice.length, total);
    const line = t("resultRange", { range: SY.num(from + "–" + to), total: SY.num(total) });
    qs("#resultLine").innerHTML = line;
    SY.say("results", t("a11yResults", { n: String(total) }));
  }

  /* The range is ONE <bdi>, never two: "عرض 1-12 منتج" rendered 12-1. */

  function renderSimilar(model) {
    const wrap = qs("#similar");
    const btn = qs("#similarToggle");
    const grid = qs("#similarGrid");
    if (!model.similar.length) { toggle(wrap, false); grid.innerHTML = ""; return; }
    toggle(wrap, true);
    btn.innerHTML = t("searchSimilar", { n: SY.num(model.similar.length) });
    btn.setAttribute("aria-expanded", st.similar ? "true" : "false");
    toggle(grid, st.similar);
    grid.innerHTML = st.similar ? model.similar.slice(0, PAGE).map(r => card(r, false)).join("") : "";
  }

  /* No IntersectionObserver, no scroll handler. One optional append to 48,
     then real links a crawler can follow and a shopper can share. */
  function renderPager(total, start) {
    const pager = qs("#pager");
    const pages = Math.ceil(total / PAGE);
    let html = "";

    if (st.shown === PAGE && start + PAGE < total) {
      html += '<button class="btn btn--secondary pager__more" type="button" id="showMore">' +
        t("pagerMore", { n: SY.num(Math.min(PAGE, total - start - PAGE)) }) + "</button>";
    }
    if (pages > 1) {
      /* After the one append the window covers two pages, so "next" is the page
         after both of them — otherwise it points at 24 cards already on screen. */
      const span = Math.max(1, Math.round(st.shown / PAGE));
      const last = Math.min(pages, st.page + span - 1);
      const window_ = pageWindow(st.page, pages);
      html += '<nav class="pager__nav" aria-label="' + esc(t("pagerLabel")) + '">';
      if (st.page > 1) html += '<a class="pager__link" href="' + esc(href({ page: st.page - 1 })) + '" rel="prev">' + esc(t("pagerPrev")) + "</a>";
      for (const n of window_) {
        if (n === 0) { html += '<span class="pager__gap" aria-hidden="true">…</span>'; continue; }
        const here = n >= st.page && n <= last;
        html += '<a class="pager__link' + (here ? " is-on" : "") + '" href="' + esc(href({ page: n })) + '"' +
          (n === st.page ? ' aria-current="page"' : "") + ">" + SY.num(n) + "</a>";
      }
      if (last < pages) html += '<a class="pager__link" href="' + esc(href({ page: last + 1 })) + '" rel="next">' + esc(t("pagerNext")) + "</a>";
      html += "</nav>";
    }
    pager.innerHTML = html;
  }

  function pageWindow(current, pages) {
    if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
    const out = [1];
    if (current > 3) out.push(0);
    for (let n = Math.max(2, current - 1); n <= Math.min(pages - 1, current + 1); n++) out.push(n);
    if (current < pages - 2) out.push(0);
    out.push(pages);
    return out;
  }

  /* ------------------------------------------------------------ empty states */

  /* A glyph, a heading, one sentence and at least one thing to do. Never a bare
     sentence in grey, which is what all of them used to be. */
  function shell(glyph, title, text, actions) {
    return '<div class="empty">' +
      '<span class="empty__glyph">' + icon(glyph, { size: 48 }) + "</span>" +
      '<h2 class="empty__title">' + title + "</h2>" +
      '<p class="empty__text">' + text + "</p>" +
      (actions ? '<div class="empty__actions">' + actions + "</div>" : "") +
      "</div>";
  }
  const btn = (kind, label, attrs) => '<a class="btn ' + kind + '" ' + attrs + ">" + label + "</a>";

  function renderEmpty(model) {
    const box = qs("#empty");
    if (st.view === "fav") {
      box.innerHTML = shell("heart", esc(t("emptyFavTitle")), esc(t("emptyFavText")),
        btn("btn--primary", esc(t("emptyFavAction")), 'href="' + esc(href({ view: "all", route: "search" })) + '"'));
      return;
    }
    if (st.q) {
      /* On a shop with no online payment a zero-result search is a lead, not a
         loss: the WhatsApp button carries the query the shopper typed. */
      const chips = didYouMean(st.q);
      const relaxed = relaxedResults(model);
      box.innerHTML = shell("search",
        t("emptySearchTitle", { q: SY.bdi(clip(st.q, 30)) }),
        esc(t("emptySearchText")),
        btn("btn--wa", esc(t("emptySearchAsk")), 'href="' + esc(waLink(t("waAskSearch", { q: st.q }))) + '" target="_blank" rel="noopener noreferrer"') +
        btn("btn--secondary", esc(t("emptyBrowse")), 'href="/browse"')) +
        (chips.length ? '<div class="empty__chips"><b>' + esc(t("emptyDidYouMean")) + "</b>" +
          chips.map(c => '<a class="chip" href="' + esc(href({ q: c, page: 1 })) + '">' + SY.bdi(c) + "</a>").join("") + "</div>" : "") +
        (relaxed.length ? '<div class="empty__near"><b>' + esc(t("emptyNear")) + '</b><div class="grid">' +
          relaxed.map(r => card(r, false)).join("") + "</div></div>" : "");
      return;
    }
    if (st.f.brands.length || st.f.device || st.f.min != null || st.f.max != null || st.f.inStock) {
      box.innerHTML = shell("filter", esc(t("emptyFilterTitle")), esc(t("emptyFilterText")),
        '<button class="btn btn--primary" type="button" id="emptyClear">' + esc(t("filterClear")) + "</button>");
      return;
    }
    const name = st.route === "category" && st.node ? label(SY.resolveNode(st.node) ? SY.resolveNode(st.node).id : st.node) : "";
    box.innerHTML = shell("box",
      esc(t("emptyNodeTitle", { name })),
      esc(t("emptyNodeText")),
      btn("btn--wa", esc(t("emptyNodeAsk")), 'href="' + esc(waLink(t("waAskNode", { name: name || t("navBrowse") }))) + '" target="_blank" rel="noopener noreferrer"') +
      btn("btn--secondary", esc(t("emptyBrowse")), 'href="/browse"'));
  }

  function clip(text, n) {
    const s = String(text);
    return s.length <= n ? s : s.slice(0, n - 1) + "…";
  }

  /* Damerau-Levenshtein ≤ 2 over ~130 short strings: the synonym keys, the
     brand names and the category labels. Under a millisecond, no index. */
  function distance(a, b) {
    if (Math.abs(a.length - b.length) > 2) return 9;
    const prev = [], cur = [];
    let last = [];
    for (let j = 0; j <= b.length; j++) prev[j] = j;
    for (let i = 1; i <= a.length; i++) {
      cur[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], last[j - 2] + 1);
      }
      last = prev.slice();
      for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
    }
    return prev[b.length];
  }

  let POOL = null;
  function correctionPool() {
    if (POOL) return POOL;
    POOL = Object.keys(SYN).slice();
    const seen = {};
    SY.products().forEach(p => { if (!seen[p.brand]) { seen[p.brand] = 1; POOL.push(p.brand); } });
    const tx = window.__TX;
    if (tx) Object.keys(tx.byId).forEach(id => POOL.push(label(id)));
    return POOL;
  }

  function didYouMean(query) {
    const word = fold(query);
    if (word.length < 4) return [];
    const out = [];
    for (const candidate of correctionPool()) {
      const folded = fold(candidate);
      if (!folded || folded === word) continue;
      if (distance(word, folded) <= 2) out.push(candidate);
      if (out.length >= 3) break;
    }
    return out;
  }

  /* Drop the weakest group and try again: "كفر ايفون 25" becomes iPhone cases
     instead of nothing at all. */
  function relaxedResults(model) {
    if (!model.groups.length || model.groups.length < 2) return [];
    const kept = model.groups.filter(g => !g.numeric);
    const groups = kept.length && kept.length < model.groups.length ? kept : model.groups.slice(0, -1);
    if (!groups.length) return [];
    const rows = collapse(applyFacets(scope()))
      .map(r => { r.score = scoreOf(r.p, groups, ""); return r; })
      .filter(r => r.score > 0);
    sortRows(rows, "relevance", true);
    return rows.slice(0, 6);
  }

  /* ---------------------------------------------------------- the facet bar */

  function countFor(list) { return collapse(list).length; }

  function renderFacetBar(model) {
    const bar = qs("#facetbar");
    toggle(bar, true);
    const active = activeCount();
    const tally = qs("#filterTally");
    tally.hidden = !active;
    tally.innerHTML = active ? SY.num(active) : "";

    const select = qs("#sortSelect");
    const current = effectiveSort();
    select.innerHTML = sortOptions()
      .map(o => '<option value="' + o[0] + '"' + (o[0] === current ? " selected" : "") + ">" + esc(t(o[1])) + "</option>")
      .join("");

    const chips = [];
    st.f.brands.forEach(slug => {
      const name = brandName(slug);
      chips.push(chipFor(name, () => {
        st.f.brands = st.f.brands.filter(b => b !== slug);
      }));
    });
    if (st.f.device) chips.push(chipFor(st.f.device, () => { st.f.device = ""; }));
    if (st.f.inStock) chips.push(chipFor(t("filterInStock"), () => { st.f.inStock = false; }));
    if (st.f.min != null || st.f.max != null) {
      chips.push(chipFor(SY.moneyText(st.f.min || 0) + " – " + (st.f.max != null ? SY.moneyText(st.f.max) : "…"), () => {
        st.f.min = null; st.f.max = null;
      }));
    }
    const holder = qs("#activeChips");
    holder.innerHTML = chips.map((c, i) => c.html(i)).join("");
    holder.__undo = chips.map(c => c.undo);
  }

  let chipSeq = 0;
  function chipFor(text, undo) {
    const id = chipSeq++;
    return {
      undo,
      html: i => '<button class="chip is-on facetbar__chip" type="button" data-chip="' + i + '" data-id="' + id + '">' +
        SY.bdi(text) + icon("close") + '<span class="vh">' + esc(t("filterRemove")) + "</span></button>"
    };
  }

  function activeCount() {
    return st.f.brands.length + (st.f.device ? 1 : 0) + (st.f.inStock ? 1 : 0) + (st.f.min != null || st.f.max != null ? 1 : 0);
  }

  function brandName(slug) {
    const found = SY.products().find(p => SY.slug(p.brand) === slug);
    return found ? found.brand : slug;
  }

  /* ------------------------------------------------------- the filter sheet */

  /* A sheet, never an inline panel. The old one was position:static and 833px
     tall and pushed every result off the screen the moment it opened; at
     60svh, 40% of the results stay visible while the shopper filters. */
  function renderFilters() {
    const model = build();
    const base = model.facetSource;
    const body = qs("#filtersBody");

    const brandCounts = {};
    collapse(applyFacets(base, "brand")).forEach(r => {
      const slug = SY.slug(r.p.brand);
      brandCounts[slug] = (brandCounts[slug] || 0) + 1;
    });
    const brands = {};
    base.forEach(p => { brands[SY.slug(p.brand)] = p.brand; });

    let html = '<fieldset class="facet"><legend>' + esc(t("filterBrandLegend")) + "</legend>";
    Object.keys(brands).sort((a, b) => (brandCounts[b] || 0) - (brandCounts[a] || 0)).forEach(slug => {
      const n = brandCounts[slug] || 0;
      const on = st.f.brands.indexOf(slug) !== -1;
      /* A value with no results is disabled, not removed: removing it reflows
         the list under the shopper's thumb between one tap and the next. */
      html += '<label class="facet__row' + (n ? "" : " is-empty") + '">' +
        '<input type="checkbox" data-facet="brand" value="' + esc(slug) + '"' +
        (on ? " checked" : "") + (n || on ? "" : " disabled") + ">" +
        "<span>" + SY.bdi(brands[slug]) + "</span>" +
        '<span class="facet__n">' + SY.num(n) + "</span></label>";
    });
    html += "</fieldset>";

    const devices = {};
    collapse(applyFacets(base, "device")).forEach(r => {
      const d = deviceOf(r.p);
      if (d) devices[d] = (devices[d] || 0) + 1;
    });
    const deviceKeys = Object.keys(devices).sort((a, b) => devices[b] - devices[a]);
    if (deviceKeys.length > 1) {
      html += '<fieldset class="facet"><legend>' + esc(t("filterDeviceLegend")) + "</legend>";
      deviceKeys.slice(0, 24).forEach(d => {
        html += '<label class="facet__row"><input type="radio" name="device" data-facet="device" value="' + esc(d) + '"' +
          (st.f.device === d ? " checked" : "") + '><span dir="ltr">' + esc(d) + "</span>" +
          '<span class="facet__n">' + SY.num(devices[d]) + "</span></label>";
      });
      html += "</fieldset>";
    }

    html += '<fieldset class="facet"><legend>' + esc(t("filterPriceLegend")) + "</legend>" +
      '<div class="facet__range">' +
      '<label><span class="vh">' + esc(t("filterPriceFrom")) + '</span>' +
      '<input type="number" inputmode="numeric" min="0" step="1" id="facetMin" data-facet="min" value="' +
      (st.f.min != null ? st.f.min : "") + '" placeholder="' + esc(t("filterPriceFrom")) + '"></label>' +
      '<label><span class="vh">' + esc(t("filterPriceTo")) + '</span>' +
      '<input type="number" inputmode="numeric" min="0" step="1" id="facetMax" data-facet="max" value="' +
      (st.f.max != null ? st.f.max : "") + '" placeholder="' + esc(t("filterPriceTo")) + '"></label>' +
      "</div></fieldset>";

    const stockCount = countFor(applyFacets(base, "stock").filter(p => p.inStock));
    html += '<fieldset class="facet"><legend>' + esc(t("filterStockLegend")) + "</legend>" +
      '<label class="facet__row"><input type="checkbox" data-facet="stock"' + (st.f.inStock ? " checked" : "") +
      (stockCount || st.f.inStock ? "" : " disabled") + "><span>" + esc(t("filterInStock")) + "</span>" +
      '<span class="facet__n">' + SY.num(stockCount) + "</span></label></fieldset>";

    body.innerHTML = html;
    updateFilterFoot();
  }

  /* The primary button is a dismiss with a live count, not an "apply". The grid
     behind has already changed. */
  function updateFilterFoot() {
    const model = build();
    qs("#filtersDone").innerHTML = t("filterShow", { n: SY.num(model.rows.length) });
  }

  /* --------------------------------------------------------------- the rails */

  /* Reserve the grid before the cards arrive.
     The names come from copy.<lang>.json, so the grid used to render about
     200 ms in — and the trust block and the footer beneath it were pushed
     down a full page, scoring a layout shift of 0.81 against a 0.05 budget.
     How many cards there will be is known synchronously from catalog.js, and
     a card's height is fixed by construction, so the box can be the right
     size from the first paint. The reservation is dropped once the real cards
     are in, so a shorter page never keeps a gap. */
  const CARD_H = () => (innerWidth >= 1280 ? 440 : innerWidth >= 768 ? 383 : 312);
  const COLS = () => (innerWidth >= 1600 ? 5 : innerWidth >= 1280 ? 4 : innerWidth >= 768 ? 3 : 2);
  const GAP = () => (innerWidth >= 1280 ? 20 : innerWidth >= 768 ? 16 : 12);

  function reserveGrid() {
    /* Drop the crawler's fallback list here, in the same synchronous pass, so
       it is gone before the first paint. It is a real <ul> of product links,
       written by the server for anything that does not run JavaScript; taking
       it away later — once the grid had rendered — collapsed its height and
       moved everything below it, 0.22 of layout shift on a category page. A
       crawler that does not execute this never sees the removal. */
    const seed = qs("#seo-seed");
    if (seed) qsa("#seo-list, .seo-aisles, .browse__dept", seed).forEach(el => el.remove());

    /* The server wrote this block in one language — Arabic unless the link
       carried ?lang= — and a shopper reading the shop in English or Turkish
       was left with an Arabic heading and an Arabic product count above an
       otherwise English page. The parts carrying a dictionary key are handled
       by i18n.apply(); the heading and the count are written from values only
       the server had, so they are rewritten here, in the same pass that runs
       before the first paint, rather than swapped afterwards. */
    if (seed && seed.dataset.seoLang && seed.dataset.seoLang !== SY.lang()) {
      const h1 = qs("h1", seed);
      if (h1) { h1.dataset.own = "1"; h1.textContent = titleFor(); }
      /* A description with no key is the server's generic sentence in its own
         language. There is no translation of it to put here, and a paragraph
         in the wrong language is worse than none. */
      const desc = qs(".seo-desc", seed);
      if (desc && !desc.dataset.i18n) desc.remove();
      /* This branch only runs on a page that is now English or Turkish, so
         the phrase needs no <bdi>: the whole line reads left to right. */
      const count = qs(".seo-count", seed);
      if (count) count.textContent = SY.plural("routeCount", expectedRows());
    }

    /* The browse and brands indexes render from script too, so their box is
       reserved the same way. */
    const index = qs("#indexView");
    if (index && /^(browse|brands)$/.test(st.route) && !index.children.length) {
      index.style.minBlockSize = "60vh";
    }

    const grid = qs("#grid");
    if (!grid || !/^(category|brand|search|browse|brands)$/.test(st.route)) return;
    const count = Math.min(PAGE, expectedRows());
    if (!count) return;
    const rows = Math.ceil(count / COLS());
    grid.style.minBlockSize = (rows * CARD_H() + (rows - 1) * GAP()) + "px";
  }

  /* What the server already told us, or what the catalogue says. Either way it
     needs nothing over the network. */
  function expectedRows() {
    const seeded = Number(doc.body.dataset.count || 0);
    if (seeded) return seeded;
    try { return collapse(SY.products()).length; } catch (e) { return PAGE; }
  }

  /* Decide which rails exist BEFORE the first paint.
     They used to be revealed when the translated names arrived, about 210 ms
     in — which pushed the trust block and the footer down and scored a
     cumulative layout shift of 0.59 against a budget of 0.05. Whether a rail
     has enough to say depends only on counts in catalog.js, which is already
     parsed by the time this runs, so the decision needs nothing async. The
     cards land inside a track whose height the stylesheet has reserved, so
     filling one costs no movement either. */
  function reserveRails() {
    const rows = collapse(SY.products());
    const discounted = rows.filter(r => r.p.discount > 0).length;
    toggle(qs("#railPopular"), rows.length > 0);
    toggle(qs("#railOffers"), discounted >= 4);
    toggle(qs("#railNew"), rows.length >= 6);
  }

  function renderRails() {
    const all = SY.products();
    const rows = collapse(all);
    fillRail("railPopular", capped(rows.slice().sort((a, b) => rankOf(b.p) - rankOf(a.p) || TIE(a, b)), 12), true);

    const offerPool = rows.filter(r => r.p.discount > 0).sort((a, b) => b.p.discount - a.p.discount || TIE(a, b));
    fillRail("railOffers", offerPool.length >= 4 ? capped(offerPool, 12) : []);

    /* The supplier feed carries no date, so the id order is the arrival order —
       the same proxy the "newest" sort uses. */
    const newPool = rows.slice().sort((a, b) => b.p.id - a.p.id);
    fillRail("railNew", newPool.length >= 6 ? capped(newPool, 12) : []);
  }

  /* Once the cards are in, the box sizes itself; a reservation left behind
     would hold a gap open under a short category. */
  function releaseGrid() {
    const grid = qs("#grid");
    if (grid && grid.children.length) grid.style.minBlockSize = "";
    const index = qs("#indexView");
    if (index && index.children.length) index.style.minBlockSize = "";
  }

  function fillRail(id, list, eagerFirst) {
    const section = qs("#" + id);
    const track = qs("#" + id + "Track");
    if (!list.length) { toggle(section, false); track.innerHTML = ""; return; }
    toggle(section, true);
    const eager = SY.isPhone() ? 2 : 4;
    track.innerHTML = list.map((r, i) => card(r, !!eagerFirst && i < eager)).join("");
  }

  /* ----------------------------------------------------------- the brand strip */

  /* Top 8 by count plus an "all brands" tile. Nine tiles at 7 brands and nine
     at 40, so the block's height never depends on the brand count. */
  function renderBrandStrip() {
    const counts = {};
    SY.products().forEach(p => { counts[p.brand] = (counts[p.brand] || 0) + 1; });
    const top = Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, 8);
    if (!top.length) { toggle(qs("#brandstrip"), false); return; }
    toggle(qs("#brandstrip"), true);
    qs("#brandstripTrack").innerHTML = top.map(brandTile).join("") +
      '<a class="brandtile brandtile--all" href="/brands"><span class="brandtile__word">' +
      esc(t("brandStripAll")) + "</span></a>";
  }

  function brandTile(name) {
    const logo = SY.brandLogo(name);
    return '<a class="brandtile" href="/b/' + esc(SY.slug(name)) + '" aria-label="' + esc(name) + '">' +
      (logo
        ? '<img src="' + esc(logo) + '" alt="" width="120" height="40" loading="lazy" decoding="async">'
        /* logo: null means render a wordmark. Never an <img>, so there is never
           a broken-image glyph and never a reflow when a new brand arrives. */
        : '<span class="brandtile__word" dir="ltr">' + esc(name) + "</span>") +
      "</a>";
  }

  /* ------------------------------------------------------- the browse index */

  function renderIndex() {
    const view = qs("#indexView");
    toggle(view, true);
    qs("#grid").innerHTML = "";
    qs("#pager").innerHTML = "";
    toggle(qs("#facetbar"), false);
    toggle(qs("#empty"), false);

    if (st.route === "brands") {
      const counts = {};
      SY.products().forEach(p => { counts[p.brand] = (counts[p.brand] || 0) + 1; });
      view.innerHTML = '<div class="brandstrip__track">' +
        Object.keys(counts).sort((a, b) => counts[b] - counts[a]).map(brandTile).join("") + "</div>";
      return;
    }
    const tx = window.__TX;
    view.innerHTML = (tx ? tx.departments : []).map(d =>
      '<section class="browse__dept"><h2><a href="/c/' + esc(d.id) + '">' + esc(label(d.id)) + "</a> " +
      '<span class="browse__n">' + SY.num(countIn(d.id)) + "</span></h2>" +
      '<ul class="browse__list">' + d.children.map(c =>
        '<li><a href="/c/' + esc(d.id) + "/" + esc(c.id) + '">' + esc(label(c.id)) +
        '<span class="browse__n">' + SY.num(countIn(c.id)) + "</span></a></li>").join("") +
      "</ul></section>").join("");
  }

  function countIn(nodeId) {
    return SY.products().filter(p => SY.inNode(p, nodeId)).length;
  }

  /* ---------------------------------------------------- the departments sheet */

  /* A single-column drilldown, never a grid of columns: a drilldown's height is
     rows × 56px and stays bounded at 8 departments and at 40. Three levels,
     hard stop — anything deeper is a filter, not a level. */
  const sheet = { level: 1, dept: null };

  function openDepts(opener) {
    sheet.level = 1;
    sheet.dept = null;
    drawDepts();
    SY.openDialog(qs("#depts"), opener);
  }

  function drawDepts() {
    const body = qs("#deptsBody");
    const title = qs("#deptsTitle");
    const back = qs("#deptsBack");
    const tx = window.__TX;
    back.hidden = sheet.level === 1;

    if (sheet.level === 1 || !sheet.dept) {
      title.textContent = t("deptsTitle");
      body.innerHTML = (tx ? tx.departments : []).map(d => row("/c/" + d.id, label(d.id), countIn(d.id), d.children.length ? d.id : "")).join("");
      return;
    }
    const dept = sheet.dept;
    if (sheet.level === 3) {
      title.textContent = t("deptsBrands");
      const counts = {};
      SY.products().filter(p => SY.inNode(p, dept.id)).forEach(p => { counts[p.brand] = (counts[p.brand] || 0) + 1; });
      body.innerHTML = Object.keys(counts).sort((a, b) => counts[b] - counts[a])
        .map(b => row("/b/" + SY.slug(b), b, counts[b], "")).join("");
      return;
    }
    title.textContent = label(dept.id);
    /* A pinned "everything in this department" row first, because the shopper
       who taps a department often wants the department, not one of its leaves. */
    body.innerHTML =
      row("/c/" + dept.id, t("deptsAllIn", { name: label(dept.id) }), countIn(dept.id), "") +
      dept.children.map(c => row("/c/" + dept.id + "/" + c.id, label(c.id), countIn(c.id), "")).join("") +
      '<button class="deptrow deptrow--more" type="button" data-level3="1">' +
      '<span class="deptrow__label">' + esc(t("deptsBrands")) + "</span>" +
      icon("chevron", { className: "deptrow__chev icon--flip" }) + "</button>";
  }

  function row(url, text, count, drill) {
    if (drill) {
      return '<button class="deptrow" type="button" data-drill="' + esc(drill) + '">' +
        '<span class="deptrow__label">' + esc(text) + "</span>" +
        '<span class="deptrow__n">' + SY.num(count) + "</span>" +
        icon("chevron", { className: "deptrow__chev icon--flip" }) + "</button>";
    }
    return '<a class="deptrow" href="' + esc(url) + '">' +
      '<span class="deptrow__label">' + SY.bdi(text) + "</span>" +
      '<span class="deptrow__n">' + SY.num(count) + "</span></a>";
  }

  /* -------------------------------------------------------------- suggestions */

  let suggestTimer = null;
  let suggestRows = [];
  let suggestIndex = -1;

  function onType() {
    const field = qs("#q");
    qs("#searchClear").hidden = !field.value;
    clearTimeout(suggestTimer);
    /* 150 ms and two characters: below either the list flickers under the
       thumb and the shopper reads a different answer than the one they see. */
    suggestTimer = setTimeout(() => drawSuggest(field.value.trim()), 150);
  }

  function drawSuggest(query) {
    const box = qs("#suggest");
    if (query.length < 2 || !ready) return closeSuggest();
    const groups = groupsFor(query);
    if (!groups.length) return closeSuggest();

    const rows = [];
    const tx = window.__TX;
    const folded = fold(query);

    /* Taxonomy first, always. A category row turns a search into a browse,
       which is how a shopper with a vague need gets somewhere. */
    if (tx) {
      const nodes = Object.keys(tx.byId)
        .filter(id => fold(label(id)).indexOf(folded) !== -1)
        .sort((a, b) => countIn(b) - countIn(a))
        .slice(0, 3);
      nodes.forEach(id => {
        const node = tx.byId[id];
        rows.push({
          url: node.parent ? "/c/" + node.parent + "/" + node.id : "/c/" + node.id,
          kind: t("searchInDepts"),
          text: label(id),
          meta: SY.num(countIn(id))
        });
      });
    }
    const brandCounts = {};
    SY.products().forEach(p => { brandCounts[p.brand] = (brandCounts[p.brand] || 0) + 1; });
    Object.keys(brandCounts).filter(b => fold(b).indexOf(folded) !== -1).slice(0, 2).forEach(b => {
      rows.push({ url: "/b/" + SY.slug(b), kind: t("searchInBrands"), text: b, meta: SY.num(brandCounts[b]) });
    });

    const wanted = deviceFromQuery(query);
    const products = collapse(SY.products())
      .map(r => { r.score = scoreOf(r.p, groups, wanted); return r; })
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score || TIE(a, b))
      .slice(0, Math.max(0, 8 - rows.length));
    products.forEach(r => {
      const image = SY.imageSet(r.p);
      rows.push({
        url: "/p/" + r.p.id,
        thumb: image.small || image.full || "",
        text: nameOf(r.p),
        meta: SY.money(r.p.price)
      });
    });

    if (!rows.length) return closeSuggest();
    suggestRows = rows;
    suggestIndex = -1;
    box.innerHTML = rows.map((r, i) =>
      '<a class="suggest__row" role="option" id="sg' + i + '" aria-selected="false" href="' + esc(r.url) + '">' +
      (r.thumb ? '<img src="' + esc(r.thumb) + '" alt="" width="40" height="40" loading="lazy" decoding="async">' : "") +
      (r.kind ? '<span class="suggest__kind">' + esc(r.kind) + "</span>" : "") +
      '<span class="suggest__text">' + SY.bdi(r.text) + "</span>" +
      '<span class="suggest__meta">' + r.meta + "</span></a>").join("");
    box.hidden = false;
    qs("#q").setAttribute("aria-expanded", "true");
  }

  function closeSuggest() {
    const box = qs("#suggest");
    box.hidden = true;
    box.innerHTML = "";
    suggestRows = [];
    suggestIndex = -1;
    qs("#q").setAttribute("aria-expanded", "false");
    qs("#q").removeAttribute("aria-activedescendant");
  }

  function moveSuggest(delta) {
    if (!suggestRows.length) return;
    const span = suggestRows.length + 1;
    suggestIndex = (suggestIndex + 1 + delta + span) % span - 1;
    qsa(".suggest__row").forEach((el, i) => el.setAttribute("aria-selected", i === suggestIndex ? "true" : "false"));
    const field = qs("#q");
    if (suggestIndex >= 0) field.setAttribute("aria-activedescendant", "sg" + suggestIndex);
    else field.removeAttribute("aria-activedescendant");
  }

  /* ------------------------------------------------------------- the chrome */

  function renderChrome() {
    /* A badge reading "0" is noise on every screen of a shop nobody has put
       anything into yet. Hide it until there is something to count — the
       control keeps its accessible name either way. */
    const count = SY.cart.count();
    const favs = SY.favourites.count();
    for (const [sel, n] of [["#cartCount", count], ["#cartCount2", count], ["#favCount", favs]]) {
      const el = qs(sel);
      if (!el) continue;
      el.hidden = !n;
      el.innerHTML = n ? SY.num(n) : "";
    }
    qs("#slotWa").href = waLink(t("waHello"));
    ["#heroWa", "#navWholesale", "#navContact"].forEach(sel => { const el = qs(sel); if (el) el.href = waLink(t("waHello")); });
    const rights = qs("#footerRights");
    if (rights) rights.innerHTML = t("footerRights", { year: SY.num(new Date().getFullYear()) });
    const select = qs("#langSelect");
    if (select) select.value = SY.lang();
  }

  function renderStoreline() {
    const tx = window.__TX;
    qs("#deptTally").innerHTML = SY.num(tx ? tx.departments.length : 8);
    qs("#itemTally").innerHTML = SY.num(SY.products().length);
    qsa("[data-tally]").forEach(el => { el.innerHTML = SY.num(countIn(el.dataset.tally)); });
  }

  /* The bottom bar is the phone's only permanent chrome — 56px against the
     200px sticky slab it replaces. It hides whenever any dialog is open,
     because two layers of chrome over one sheet is worse than none. */
  function syncBottomBar(open) {
    const bar = qs("#bottombar");
    if (!bar) return;
    const hide = open > 0 || st.route === "product";
    toggle(bar, !hide);
  }

  /* ------------------------------------------------------------- the router */

  function surfaces() {
    const r = st.route;
    const home = r === "home";
    const listing = r === "category" || r === "brand" || r === "search";
    const index = r === "browse" || r === "brands";
    const product = r === "product";

    doc.body.dataset.route = r;
    show("#storeline", home);
    show("#deptGrid", home);
    show("#railPopular", home);
    show("#railOffers", home);
    show("#railNew", home);
    show("#listing", listing || index);
    show("#indexView", index);
    show("#facetbar", listing);
    show("#brandstrip", home);
    show("#trust", !product);
    show("#homeTitle", home);
    show(".hero", home);
    /* product.js owns what goes inside; the shell owns whether it is on screen. */
    show("#productView", product);
    syncBottomBar(SY.topDialog() ? 1 : 0);
  }

  function show(sel, on) { toggle(qs(sel), on); }

  /* The attribute alone loses to any display rule in the stylesheet — .depts is
     display:grid and stayed on screen on every category page. The attribute is
     the semantics; the inline display is the guarantee. */
  function toggle(el, on) {
    if (!el) return;
    el.hidden = !on;
    el.style.display = on ? "" : "none";
  }

  /* The heading a crawler was served stays; the <ul> of links under it was the
     no-JS fallback and its job is done once the real grid is on screen. */
  function heading() {
    const box = qs("#seoHost");
    const seed = qs("#seo-seed");
    if (seed) {
      /* The server wrote the page's real <h1>. The home page's own one is now a
         second h1 in the same document, so it goes rather than merely hides. */
      const own = qs("#homeTitle");
      if (own) own.remove();
      /* The <ul> of product links and the aisle list were the no-JS fallback;
         their job ends the moment the real grid renders. The breadcrumb, the
         heading and the description are the page and they stay. */
      /* Already removed in reserveGrid(), before the first paint. */
      if (seed.parentElement !== box) box.appendChild(seed);
    }
    let h1 = qs("#seoHost h1");
    if (!h1) { h1 = doc.createElement("h1"); h1.dataset.own = "1"; box.appendChild(h1); }
    if (h1.dataset.own || location.pathname + location.search !== ENTRY) {
      h1.dataset.own = "1";
      h1.textContent = titleFor();
    }
    return h1;
  }

  function titleFor() {
    if (st.view === "fav") return t("favTitle");
    if (st.view === "deals") return t("dealsTitle");
    if (st.q) return t("searchTitle", { q: st.q });
    if (st.route === "brand") return brandName(SY.slug(st.brand));
    if (st.route === "category" && st.node) {
      const node = SY.resolveNode(st.node);
      return node ? label(node.id) : st.node;
    }
    return t("allTitle");
  }

  function render() {
    surfaces();
    if (!ready) return;
    renderChrome();

    if (st.route === "product") return;
    if (st.route === "home") {
      renderStoreline();
      renderRails();
      renderBrandStrip();
      SY.say("route", t("brandName"));
      return;
    }
    if (st.route === "browse" || st.route === "brands") {
      heading();
      renderIndex();
      SY.say("route", titleFor());
      return;
    }
    toggle(qs("#indexView"), false);
    const h1 = heading();
    const model = build();
    renderFacetBar(model);
    renderGrid(model);
    if (qs("#filters").open) renderFilters();
    SY.say("route", h1.textContent);
  }

  /* --------------------------------------------------------------- events */

  function internal(a) {
    if (!a || a.target === "_blank" || a.hasAttribute("download")) return false;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin) return false;
    /* Routes this script does not render are ordinary navigations and must be
       allowed through. /checkout is its own document — the cart's continue
       button is a plain link to it, and swallowing that link left the shopper
       on the product page with the address bar reading /checkout. /o/ is the
       order confirmation, also its own document. */
    if (/^\/(p\/|o\/|checkout|admin|api\/|assets\/|help)/.test(url.pathname)) return false;
    if (/\.(html?|xml|json)$/.test(url.pathname)) return false;
    return true;
  }

  function bindAll() {
    /* One delegated listener for every internal link, so a category, a brand,
       a facet chip and a pager page all go through the same path. */
    SY.bind(doc, "click", e => {
      if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest("a[href]");
      if (a && internal(a)) {
        e.preventDefault();
        SY.closeAllDialogs();
        closeSuggest();
        const url = new URL(a.href, location.href);
        history.pushState({ y: scrollY, shown: PAGE }, "", url.pathname + url.search);
        readUrl();
        st.shown = PAGE;
        render();
        SY.scrollToY(0);
        return;
      }

      const fav = e.target.closest("[data-fav]");
      if (fav) {
        const added = SY.favourites.toggle(fav.dataset.fav);
        fav.setAttribute("aria-pressed", added ? "true" : "false");
        fav.innerHTML = icon(added ? "heart-on" : "heart");
        const product = SY.productById(fav.dataset.fav);
        fav.setAttribute("aria-label", t(added ? "cardUnfav" : "cardFav", { name: product ? nameOf(product) : "" }));
        SY.say("fav", t(added ? "a11yFavAdded" : "a11yFavRemoved"));
        if (st.view === "fav") render();
        return;
      }

      const drill = e.target.closest("[data-drill]");
      if (drill) {
        const tx = window.__TX;
        sheet.dept = tx ? tx.byId[drill.dataset.drill] : null;
        sheet.level = 2;
        drawDepts();
        return;
      }
      if (e.target.closest("[data-level3]")) { sheet.level = 3; drawDepts(); return; }

      const chip = e.target.closest("[data-chip]");
      if (chip) {
        const undo = qs("#activeChips").__undo;
        if (undo && undo[Number(chip.dataset.chip)]) undo[Number(chip.dataset.chip)]();
        refine();
        return;
      }
      if (e.target.closest("#showMore")) {
        st.shown = PAGE * 2;
        SY.route.go(href(), { shown: st.shown }, true);
        render();
        SY.say("results", t("a11yMore"));
        return;
      }
      if (e.target.closest("#similarToggle")) {
        st.similar = !st.similar;
        render();
        return;
      }
      if (e.target.closest("#emptyClear")) { clearFilters(); return; }
    });

    SY.bind(qs("#slotDepts"), "click", e => openDepts(e.currentTarget));
    SY.bind(qs("#deptsBack"), "click", () => { sheet.level = Math.max(1, sheet.level - 1); drawDepts(); });
    SY.bind(qs("#deptsClose"), "click", () => SY.closeDialog(qs("#depts")));

    SY.bind(qs("#slotSearch"), "click", () => {
      SY.scrollToY(0);
      qs("#q").focus();
    });
    SY.bind(qs("#slotCart"), "click", e => openCart(e.currentTarget));
    SY.bind(qs("#cartBtn"), "click", e => openCart(e.currentTarget));

    SY.bind(qs("#filterBtn"), "click", e => {
      renderFilters();
      SY.openDialog(qs("#filters"), e.currentTarget);
    });
    SY.bind(qs("#filtersClose"), "click", () => SY.closeDialog(qs("#filters")));
    SY.bind(qs("#filtersDone"), "click", () => SY.closeDialog(qs("#filters")));
    SY.bind(qs("#filtersClear"), "click", clearFilters);

    /* Every tap changes the grid behind immediately; the footer button only
       counts and dismisses. */
    SY.bind(qs("#filtersBody"), "change", e => {
      const el = e.target.closest("[data-facet]");
      if (!el) return;
      const kind = el.dataset.facet;
      if (kind === "brand") {
        const slug = el.value;
        st.f.brands = el.checked ? st.f.brands.concat([slug]) : st.f.brands.filter(b => b !== slug);
      } else if (kind === "device") st.f.device = el.checked ? el.value : "";
      else if (kind === "stock") st.f.inStock = el.checked;
      else if (kind === "min") st.f.min = el.value === "" ? null : Number(el.value);
      else if (kind === "max") st.f.max = el.value === "" ? null : Number(el.value);
      refine();
      SY.say("filter", t("a11yFiltered", { n: String(lastCount) }));
    });

    SY.bind(qs("#sortSelect"), "change", e => {
      st.sort = e.target.value;
      refine();
    });

    SY.bind(qs("#searchForm"), "submit", e => {
      e.preventDefault();
      runSearch(qs("#q").value.trim());
    });
    SY.bind(qs("#q"), "input", onType);
    SY.bind(qs("#q"), "focus", onType);
    SY.bind(qs("#q"), "keydown", e => {
      if (e.key === "ArrowDown") { e.preventDefault(); moveSuggest(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); moveSuggest(-1); }
      else if (e.key === "Enter" && suggestIndex >= 0) {
        e.preventDefault();
        const row = suggestRows[suggestIndex];
        closeSuggest();
        history.pushState({ y: 0, shown: PAGE }, "", row.url);
        if (/^\/p\//.test(row.url)) location.assign(row.url);
        else { readUrl(); render(); }
      } else if (e.key === "Escape") closeSuggest();
    });
    /* mousedown, not click: blurring the field first would tear the list down
       before the click ever landed. */
    SY.bind(qs("#suggest"), "mousedown", e => e.preventDefault());
    SY.bind(doc, "focusout", e => {
      if (!qs("#searchForm").contains(e.relatedTarget)) closeSuggest();
    });
    SY.bind(qs("#searchClear"), "click", () => {
      qs("#q").value = "";
      qs("#searchClear").hidden = true;
      closeSuggest();
      qs("#q").focus();
    });

    SY.bind(qs("#langSelect"), "change", e => SY.setLang(e.target.value));

    SY.on("cart", renderChrome);
    SY.on("favourites", renderChrome);
    SY.on("overlay", syncBottomBar);
    SY.on("route", () => {
      readUrl();
      /* The page count is restored BEFORE the offset. Restoring the offset
         first lands the shopper in a document thousands of pixels shorter than
         the one they left. */
      st.shown = (history.state && history.state.shown) || PAGE;
      render();
      const y = history.state && history.state.y;
      if (typeof y === "number") scrollTo(0, y);
    });
    SY.on("catalog", () => {
      POOL = null;
      buildRank();
      render();
    });
  }

  /* Searching inside a category is the most common thing a shopper does, and
     until now it was impossible: runSearch() cleared every filter first. */
  function runSearch(query) {
    closeSuggest();
    st.q = query;
    st.page = 1;
    st.similar = false;
    if (!query && st.route === "search" && !st.view) st.view = "all";
    if (query && st.route === "home") st.route = "search";
    go({}, { keepScroll: false });
  }

  function refine() {
    st.page = 1;
    SY.route.go(href(), { shown: st.shown }, true);
    render();
    if (qs("#filters").open) updateFilterFoot();
  }

  function clearFilters() {
    st.f = { brands: [], device: "", min: null, max: null, inStock: false };
    refine();
    if (qs("#filters").open) renderFilters();
    SY.say("filter", t("a11yFiltersCleared"));
  }

  /* cart.js is not on the page until the shopper reaches for the cart. The
     badge and the basket itself live in core.js, so the count is right from
     the first paint whether or not the drawer's code has arrived. */
  function openCart(opener) {
    if (window.CART && typeof window.CART.open === "function") {
      window.CART.open(opener);
      return;
    }
    SY.require("cart.js").then(() => {
      if (window.CART && typeof window.CART.open === "function") window.CART.open(opener);
      else SY.openDialog(qs("#cart"), opener);
    }).catch(() => SY.openDialog(qs("#cart"), opener));
  }

  /* ----------------------------------------------------------------- boot */

  function loadJson(url) {
    return fetch(url, { cache: "force-cache" }).then(r => (r.ok ? r.json() : null)).catch(() => null);
  }

  function boot() {
    window.I18N.apply();
    readUrl();
    surfaces();
    bindAll();

    const field = qs("#q");
    if (field && st.q) { field.value = st.q; qs("#searchClear").hidden = false; }

    reserveRails();
    reserveGrid();

    Promise.all([
      SY.taxonomy(),
      SY.brands(),
      SY.primeCopy(),
      loadJson("/assets/gallery.json"),
      loadJson("/assets/search-terms.json")
    ]).then(([tx, brands, copy, gallery, terms]) => {
      window.__TX = tx;
      COPY = copy || {};
      GALLERY = gallery || {};
      SYN = {};
      if (terms && terms.ar) {
        Object.keys(terms.ar).forEach(key => { SYN[fold(key)] = [].concat(terms.ar[key]).map(fold); });
        /* Sorted longest first, once, when the file lands — not per keystroke.
           Rebuilding it on every render was the bulk of a measured 26.5 ms. */
        SYN_KEYS = Object.keys(SYN).map(k => [k, SYN[k]]).sort((a, b) => b[0].length - a[0].length);
      }
      POPULAR = (terms && terms.popular) || [];
      buildRank();
      ready = true;
      render();
    }).catch(() => {
      ready = true;
      render();
      SY.say("error", t("a11yLoadFailed"));
    });

    /* The admin's price and stock edits arrive after the first paint. The page
       is already usable; SY.setState re-emits "catalog" and we re-render. */
    fetch("/api/products", { cache: "no-store" })
      .then(r => (r.ok ? r.json() : null))
      .then(state => {
        if (!state) return;
        settings = window.STORE.mergeSettings(state);
        SY.setState(state);
      })
      .catch(() => {});
  }

  /* ------------------------------------------------- fetching a surface late */

  /* Two files are deferred: product.js draws the product page, cart.js draws
     the basket. Each arrives on the tap that opens it, and speculatively on
     the pointer or touch just before — which on a phone is 80–140 ms of head
     start for nothing. Never speculatively on a slow link: there the guess
     costs the shopper more than it saves.
     On the product route the file is needed immediately, and api/p.js has
     already linked it server-side, so this only tells the loader it is here. */
  function wireLazySurfaces() {
    if (window.PRODUCT) SY.provide("product.js");
    if (window.CART) SY.provide("cart.js");

    if (st.route === "product") SY.require("product.js").catch(() => {});
    /* Category descriptions are 8 KB gzipped and appear on one surface.
       They travel separately and arrive with the page that shows them. */
    if (/^(category|brand|browse|brands)$/.test(st.route)) {
      SY.require("i18n-cat.js").then(() => render()).catch(() => {});
    }
    SY.on("route", next => {
      if (/^\/(c|b|browse|brands)/.test(next.path)) SY.require("i18n-cat.js").catch(() => {});
    });

    const warmProduct = () => SY.warm("product.js");
    const warmCart = () => SY.warm("cart.js");

    for (const type of ["pointerenter", "touchstart", "focusin"]) {
      doc.addEventListener(type, e => {
        const t = e.target.closest && e.target.closest(".pcard__hit, [data-open]");
        if (t) warmProduct();
        else if (e.target.closest && e.target.closest("[data-cart], .bottombar__slot--cart, #cartButton")) warmCart();
      }, { passive: true, capture: true });
    }

    /* A shopper who has something in the basket will open it. Fetch the
       drawer while the connection is idle rather than when they tap. */
    if (SY.cart.count() > 0) warmCart();
    SY.on("cart", n => { if (n > 0) warmCart(); });

    /* Anything that navigates to a product needs the renderer before it can
       draw. Intercepting here keeps every entry point — a card, a rail, a
       related shelf, a search suggestion — on one path. */
    doc.addEventListener("click", e => {
      const link = e.target.closest && e.target.closest('a[href^="/p/"]');
      if (!link || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
      if (window.PRODUCT) return;                 // already here, let it through
      e.preventDefault();
      SY.require("product.js")
        .then(() => { location.assign(link.href); })
        .catch(() => { location.assign(link.href); });
    }, true);
  }

  /* The second skip link goes to whatever is listing products on this route —
     a rail on the home page, the grid on a category — so it cannot be a fixed
     anchor. Focus moves to the first card itself, which is what the shopper
     wanted; scrolling alone would leave the next Tab back at the top. */
  function wireSkipToProducts() {
    doc.addEventListener("click", e => {
      const link = e.target.closest && e.target.closest('a[href="#products"]');
      if (!link) return;
      e.preventDefault();
      const first = qs(".pcard__hit") ||
        qs("#grid .pcard") || qs(".rail:not([hidden]) .pcard") || qs("#main");
      if (!first) return;
      if (!first.hasAttribute("tabindex") && first.tagName !== "A" && first.tagName !== "BUTTON") {
        first.setAttribute("tabindex", "-1");
      }
      first.focus({ preventScroll: true });
      SY.scrollToEl(first.closest(".pcard") || first);
    });
  }

  SY.ready(() => { boot(); wireLazySurfaces(); wireSkipToProducts(); });
})();
