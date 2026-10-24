/*
 * SmartTech — the product page.
 * =============================
 * `/p/<id>` is where a shared WhatsApp link lands, and it is the only screen in
 * the shop with a revenue event on it. This file renders it into `#productView`
 * as an ordinary in-flow section, under the site's own header.
 *
 * Load order: i18n.js → catalog.js → core.js → product.js.
 * Everything shared lives on `window.SY` and is never reimplemented here.
 * Every class name is the one `style.css` §10 defines; nothing here invents a
 * component.
 *
 * The measured failures this file exists to remove (study 6, 390×844, Arabic):
 *
 *  1. Nothing that converts was above the fold. The primary action sat at
 *     y=922 on a plain product and y=951 on a PITAKA case, and the colour
 *     chooser was 419px BELOW "add to cart". DOM order here is
 *     gallery → brand → h1 → price row → summary → colour → qty + buy + cart,
 *     so reading order, tab order and the fold are the same argument.
 *  2. Tapping a colour called openProduct() → full re-render → scrollTop
 *     1000 → 0. The shopper scrolled 1,025px, tapped, and was thrown to the
 *     top. selectVariant() swaps gallery, price, availability, SKU, favourite,
 *     title and URL in place. Nothing navigates and nothing scrolls.
 *  3. The page was a position:fixed overlay at z-index 95 over an inert home
 *     page — no header, no logo, no search, no cart, no language switch — and
 *     the floating WhatsApp button at z-index 50 was underneath it, so from
 *     y=1006 to y=3102 there was no reachable CTA at all. The page is in flow
 *     and a 64px buy bar takes over when the inline primary leaves.
 *  4. orderReference() was re-minted on every quantity tap: four numbers for
 *     one order. It is minted once, in render(), and cached on the view.
 *  5. relatedProducts() did not collapse variants (three identically-named
 *     PITAKA cards) and included out-of-stock items.
 *  6. fillGallery() read shot.kind from gallery.json and threw it away, so the
 *     manufacturer's English A+ marketing panels were shown as if they were
 *     product photographs.
 *  7. Twelve of sixteen fallback drawings carried a competitor's wordmark.
 *     Those files are deleted and SY.imageSet(p).full is null for a product
 *     with no photograph; no <img> is emitted and the department glyph plus
 *     the product's OWN brand is drawn instead.
 */
(function () {
  "use strict";

  const SY = window.SY;
  if (!SY) return;                       /* core.js is the hard dependency */

  const t = SY.t, esc = SY.esc, qs = SY.qs, qsa = SY.qsa;
  const doc = document;
  const money = v => SY.money(v);

  /* One view at a time. Everything mutable about the page lives here, which is
     what lets the order reference be minted once and the swatch swap have a
     single place to read from. */
  const view = {
    id: null, product: null, colours: [], shots: [], shot: 0,
    ref: null, seed: null, io: null, offs: [], media: [], startShots: null
  };

  /* ------------------------------------------------------------ small tools */

  /* On a `/p/<id>` landing the server inlines the two strings the first screen
     needs as ~400 bytes of JSON, so copy.<lang>.json — 77,621 bytes to render
     one <h1> — is off the critical path and is fetched later, for the shelf. */
  function seedFor(p) {
    const seed = view.seed;
    /* The seed is only good for the language it was rendered in. The server
       cannot vary on Accept-Language — the answer is cached and served on to
       everyone else — so a visitor whose browser asks for English gets the
       Arabic document and switches client-side, and the seed must step aside
       rather than show one Arabic line in an English page. */
    return seed && seed.l === SY.lang() && String(p.id) === String(seed.id) ? seed : null;
  }
  /*
   * Arabic names come from assets/copy.<lang>.json, not from the catalogue:
   * p.name is the supplier's English string. SY.nameOf reads
   * NAME_FIELD = {ar:"name", …} first, so in Arabic it returns p.name and the
   * copy index is never consulted — measured, every related card on an Arabic
   * product page read "Prime Power Bank (20K, 220W)". Until core.js treats
   * "name" as the base field rather than an Arabic override, the index is
   * consulted here, with exactly the rule api/p.js uses server-side: an owner
   * edit wins, a hand-added product has no entry, otherwise the translation.
   */
  let copyIndex = null;
  function nameOf(p) {
    if (!p) return "";
    const seed = seedFor(p);
    if (seed && seed.n) return seed.n;
    if (SY.lang() === "ar" && copyIndex && !p.added) {
      const entry = copyIndex[String(p.id)];
      const edits = Array.isArray(p.edits) ? p.edits : [];
      if (entry && entry.n && edits.indexOf("name") === -1) return entry.n;
    }
    return SY.nameOf(p);
  }
  function summaryOf(p) {
    if (!p) return "";
    const seed = seedFor(p);
    return (seed && seed.s) || SY.summaryOf(p);
  }
  function readSeed() {
    const node = doc.getElementById("seed");
    if (!node) return null;
    try { return JSON.parse(node.textContent || "{}"); } catch (e) { return null; }
  }

  /* SY-YYMMDD-NNNN, minted once per page view and reused by every message this
     page builds. The old code re-rolled it inside refreshProductOrderLink(),
     which runs on every quantity tap — four numbers for one order. */
  function mintReference() {
    const d = new Date();
    return "SY-" + String(d.getFullYear()).slice(2) +
      String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0") +
      "-" + String(Math.floor(Math.random() * 9000) + 1000);
  }

  function waNumber() {
    try { return window.STORE.mergeSettings({}).whatsapp; } catch (e) { return ""; }
  }
  function waLink(text) {
    const n = waNumber();
    return n ? "https://wa.me/" + n + "?text=" + encodeURIComponent(text) : "";
  }
  function productUrl(p) { return location.origin + "/p/" + p.id; }

  /* The Latin code leads the line. Under bidi a line that starts in Arabic puts
     the total anywhere from 27% to 87% across the bubble; leading with the code
     collapses that to 2–9%. */
  function waMessage(p, intro, amount) {
    const n = SY.clamp(amount || 1, 1, 20);
    const code = p.sku || "ST" + p.id;
    const line = "[" + code + "] " + (n > 1 ? n + " × " + SY.moneyText(p.price) + " = " : "") +
      SY.moneyText(p.price * n) + " — " + nameOf(p);
    return intro + "\n\n" + line +
      "\n" + t("orderLink") + " " + productUrl(p) +
      "\n" + t("orderRef") + " " + view.ref;
  }

  /* ------------------------------------------------------------- colourways */

  /*
   * SY.groupVariants is the one rule, used as-is. It returns
   * { lead, members, labels, min, max } per group; `labels` is a Map keyed on
   * the product id, because only the group knows which bracket is the colour —
   * a PITAKA case carries "(600D Black/Grey-Twill) (Aaron Button)" and taking
   * the last bracket made five different colours all read "Aaron Button".
   * Never call SY.variantLabel(p.name) for a swatch's name.
   */
  let groupIndex = null;
  function groups() {
    if (groupIndex) return groupIndex;
    groupIndex = new Map();
    for (const g of SY.groupVariants(SY.products())) {
      for (const m of g.members) groupIndex.set(m.id, g);
    }
    return groupIndex;
  }
  /* The owner's edits arrive after the first paint.
     api/p.js serves a document with the owner's price already merged in, and
     then this file rendered the whole page again from SY.productById() — which
     at that instant is the catalogue as the supplier sent it, before
     /api/products has answered. The correct server render was replaced by a
     stale one: $64.50 on the wire, $84.99 on the screen, and it stayed there,
     because nothing re-rendered when the real state finally arrived.
     A shopper deciding on a price has to be shown the price they will be
     charged, so the page follows the catalogue when, and only when, something
     it displays has actually changed. */
  const VISIBLE = ["price", "oldPrice", "inStock", "stock", "name", "nameEn", "nameTr",
    "image", "badge", "brand", "category", "status", "sku", "description"];
  const sameToLookAt = (a, b) => !!a && !!b && VISIBLE.every(f => String(a[f] == null ? "" : a[f]) === String(b[f] == null ? "" : b[f]));

  SY.on("catalog", () => {
    groupIndex = null;
    if (!view.id) return;
    const fresh = SY.productById(view.id);
    /* Gone from the catalogue is not this file's decision to make: the server
       merges the same state and would not have served the page at all. */
    if (!fresh || sameToLookAt(fresh, view.product)) return;
    const shot = view.shot;
    if (!render(view.id)) return;
    if (shot > 0 && shot < view.shots.length) goToShot(shot);
  });

  const groupOf = p => groups().get(p.id) || null;
  function coloursOf(p) {
    const g = groupOf(p);
    return g && g.members.length > 1 ? g.members : [];
  }
  function colourLabel(p) {
    const g = groupOf(p);
    return (g && g.labels.get(p.id)) || "";
  }

  /* ------------------------------------------------------------- the gallery */

  /*
   * gallery.json is one short code per product — "1p2s3s4s5s6s" — where each
   * pair is <position><kind>: position 1 is <id>.webp, position n is
   * <id>-n.webp, kind p is a studio pack shot and s is an in-use shot. Six
   * kilobytes covers all 294 galleries.
   *
   * The kind is not decoration. The "in-use" shots are the manufacturer's A+
   * marketing panels, in English — 35141-3.webp is a slide reading "140W Max
   * Fast Charging from Any USB-C Port" with an eight-point English footnote.
   * Showing that as a second product photograph in an Arabic shop is the
   * defect; badging it is the fix.
   */
  let galleryPromise = null;
  function loadGallery() {
    if (!galleryPromise) {
      galleryPromise = fetch("/assets/gallery.json", { cache: "force-cache" })
        .then(r => (r.ok ? r.json() : {})).catch(() => ({}));
    }
    return galleryPromise;
  }

  const photoOf = p => (p && SY.imageSet(p).full) || "";

  function shotsFrom(p, code) {
    const out = [];
    const seen = new Set();
    const main = photoOf(p);
    if (main) { out.push({ url: main, kind: "pack" }); seen.add(main); }
    for (let i = 0; code && i + 1 < code.length; i += 2) {
      const at = Number(code[i]);
      if (!at) continue;
      const url = "/assets/products/" + p.id + (at === 1 ? "" : "-" + at) + ".webp";
      if (seen.has(url)) continue;
      seen.add(url);
      out.push({ url, kind: code[i + 1] === "s" ? "scene" : "pack" });
    }
    return out;
  }

  function thumbUrl(url) {
    const dir = "/assets/products/";
    return url && url.startsWith(dir) && !url.startsWith(dir + "thumbs/")
      ? dir + "thumbs/" + url.slice(dir.length) : url;
  }

  /* Brand-neutral, and it prints the product's OWN brand. A Joyroom product
     must never show ANKER, which is what the deleted drawings did. */
  function blankTile(p) {
    const dept = SY.deptOf(p);
    return '<span class="pdp__blank" role="img" aria-label="' + esc(t("galleryNoPhoto")) + '">' +
      SY.icon(dept ? (dept.icon || "dept-" + dept.id) : "box", { className: "pdp__glyph" }) +
      '<span class="pdp__blankword" dir="ltr">' + esc(p.brand || "") + "</span></span>";
  }

  function slideHtml(p, shot, n, total) {
    const first = n === 0;
    return '<div class="pdp__slide" data-slide="' + n + '" data-photo' +
      (shot.kind === "scene" ? ' data-kind="scene"' : "") + ">" +
      /* Only slide 1 carries a src. `loading="lazy"` is not enough inside a
         horizontal scroller: measured, Chrome still pulled slides 2 and 3 —
         55,122 B — because they sit inside its lazy-load distance. The rest
         are hydrated one viewport ahead of the swipe by hydrateSlides(). */
      "<img " + (first ? 'src="' : 'data-src="') + esc(shot.url) +
      '" alt="' + (first ? esc(nameOf(p)) : "") + '"' +
      ' width="700" height="700" data-no-fallback' +
      (first ? ' fetchpriority="high" decoding="sync"' : ' loading="lazy" decoding="async"') + ">" +
      (shot.kind === "scene" ? '<span class="pdp__badge">' + esc(t("galleryInUse")) + "</span>" : "") +
      /* A flat band across the bottom of slide 1, never a desaturated photo:
         the photograph is the thing that sells, even when the sale is later. */
      (first && !p.inStock ? '<span class="pdp__band">' + esc(t("outOfStock")) + "</span>" : "") +
      (total > 1 ? '<span class="pdp__counter" aria-hidden="true">' +
        SY.code(t("galleryCounter", { n: n + 1, total })) + "</span>" : "") +
      "</div>";
  }

  function mediaHtml(p) {
    const shots = view.shots;
    if (!shots.length) {
      return '<div class="pdp__media"><div class="pdp__gallery">' +
        '<div class="pdp__slide is-missing" data-photo>' + blankTile(p) + "</div></div></div>";
    }
    return '<div class="pdp__media"><div class="pdp__gallery" role="group" aria-label="' +
      esc(t("galleryTitle")) + '">' +
      shots.map((s, n) => slideHtml(p, s, n, shots.length)).join("") + "</div>" +
      /* The strip stays on desktop and goes on the phone: 6 × 72 + 5 × 10 =
         482px fits the 507px column, while at 390 the track was 332 wide
         against 438 of content — four of six thumbs, with no affordance. */
      (shots.length > 1
        ? '<div class="pdp__thumbs" role="group" aria-label="' + esc(t("galleryTitle")) + '">' +
          shots.map((s, n) =>
            '<button type="button" class="pdp__thumb' + (n === 0 ? " is-on" : "") + '" data-thumb="' + n + '"' +
            ' aria-current="' + (n === 0 ? "true" : "false") + '"' +
            (s.kind === "scene" ? ' data-kind="scene"' : "") +
            ' aria-label="' + esc(t("imageOf", { n: n + 1, total: shots.length }) +
              (s.kind === "scene" ? " — " + t("galleryInUse") : "")) + '">' +
            '<img src="' + esc(thumbUrl(s.url)) + '" alt="" width="72" height="72" loading="lazy" data-no-fallback>' +
            "</button>").join("") + "</div>"
        : "") + "</div>";
  }

  /*
   * A shot that 404s is REMOVED and the gallery renumbered. The old code
   * substituted a drawing per slide and still labelled them "صورة ١ من ٦" —
   * six identical grey tiles under an honest-looking counter. `data-no-fallback`
   * opts these images out of core.js's shared handler so this one runs instead.
   */
  function bindPhotoErrors(root, p) {
    view.offs.push(SY.bind(root, "error", e => {
      const img = e.target;
      if (!img || img.tagName !== "IMG") return;
      const slide = img.closest(".pdp__slide");
      if (slide) {
        view.shots.splice(Number(slide.dataset.slide), 1);
        redrawMedia(view.product || p);
        return;
      }
      const thumb = img.closest(".pdp__thumb");
      if (thumb) thumb.remove();
      const swatch = img.closest(".swatch");
      if (swatch) { img.remove(); swatch.classList.add("is-missing"); }
    }, true));
  }

  function redrawMedia(p, quiet) {
    const old = qs(".pdp__media", root());
    if (!old) return;
    releaseMedia();
    const at = Math.min(view.shot, Math.max(0, view.shots.length - 1));
    old.outerHTML = mediaHtml(p);
    view.shot = at;
    hydrateSlides();
    bindGallery();
    /* Quiet when the gallery is rebuilt by a colour swap: the shopper has just
       been told which colour they chose, and "image 1 of 6" on top of it is
       the announcement they did not ask for. Loud when a 404 removed a slide,
       because the count they can see has changed. */
    if (!quiet) announceShot();
  }

  /* One viewport ahead of the finger: far enough that a swipe never lands on a
     blank slide, near enough that a shopper who never swipes never pays. */
  function hydrateSlides() {
    const track = qs(".pdp__gallery", root());
    if (!track) return;
    const pending = qsa("img[data-src]", track);
    if (!pending.length) return;
    const swap = img => { if (img.dataset.src) { img.src = img.dataset.src; delete img.dataset.src; } };
    if (!("IntersectionObserver" in window)) { pending.forEach(swap); return; }
    let io = null;
    /* Nothing past slide 1 is fetched until the shopper touches the gallery.
       From that moment the neighbour is always a viewport ahead of the finger,
       so a swipe never lands on a blank slide — and a shopper who never swipes
       never pays for the other five photographs. */
    const start = () => {
      if (io) return;
      io = new IntersectionObserver(entries => {
        for (const e of entries) if (e.isIntersecting) { swap(e.target); io.unobserve(e.target); }
      }, { root: track, rootMargin: "0px 100%" });
      qsa("img[data-src]", track).forEach(img => io.observe(img));
      view.media.push(() => io.disconnect());
    };
    view.startShots = () => { start(); pending.forEach(swap); };
    ["pointerdown", "touchstart", "scroll", "focusin", "keydown"].forEach(type => {
      view.media.push(SY.bind(track, type, start, { once: true, passive: true }));
    });
  }

  /* ------------------------------------------------------------ price + stock */

  function priceRow(p) {
    /* On an out-of-stock product the struck price and the discount chip are
       suppressed: a 33% saving nobody can take is a hostile message. The price
       itself stays, for the enquiry and for the OutOfStock offer in JSON-LD. */
    const cut = p.inStock && p.discount > 0 && p.oldPrice > p.price;
    return "<b>" + money(p.price) + "</b>" +
      (cut ? "<del>" + money(p.oldPrice) + "</del>" : "") +
      (cut ? '<span class="pcard__off">' + t("pdpDiscount", { p: SY.percent(p.discount) }) + "</span>" : "") +
      '<span class="chip ' + (p.inStock ? "is-on" : "is-out") + '">' +
      esc(t(p.inStock ? "inStock" : "outOfStock")) + "</span>";
  }

  /* ----------------------------------------------------------------- trust */

  /*
   * Three chips, each opening a bottom sheet holding the real answer from
   * assets/policies.json through the existing placeholder gate. Ten of the 22
   * points are publishable today and none of them was on this page.
   *
   * No figure is invented: the warranty sheet says you get the brand's own
   * authorised-distributor warranty and what activation needs. It does not
   * state a period, because [[مدة الضمان]] is unfilled. When the owner fills a
   * placeholder in the admin panel the answer appears with no code change.
   *
   * A chip whose section has zero publishable points stays a plain <span>. A
   * claim must never link to an empty answer.
   */
  const CHIPS = [
    { icon: "shield", key: "benefitOriginalTitle", section: "warranty" },
    { icon: "truck", key: "benefitShippingText", section: "shipping" },
    { icon: "chat", key: "benefitSupportTitle", section: "ordering" }
  ];

  let policyPromise = null;
  function loadPolicies(now) {
    if (policyPromise) return policyPromise;
    /* 20,890 bytes, entirely below the fold and behind a tap. It waits for the
       page to be idle unless a chip has actually been pressed. */
    policyPromise = new Promise(resolve => {
      /* The API, not the static file. The owner's answers — delivery time,
         warranty period, the return window — live in the console's own store
         and are merged in by /api/products?what=policies. Reading the static
         file meant an answer he typed never reached a shopper, and twelve of
         the twenty-two points stayed hidden no matter what he did.
         The static file is the fallback, so a function outage costs the ten
         answers that were always publishable, not all of them. */
      const go = () => resolve(
        fetch("/api/products?what=policies", { cache: "no-store" })
          .then(r => (r.ok ? r.json() : Promise.reject()))
          .then(data => (data && data.policies) || data || {})
          .catch(() => fetch("/assets/policies.json", { cache: "force-cache" })
            .then(r => (r.ok ? r.json() : {})).catch(() => ({}))));
      if (now) go(); else afterLoad(go);
    });
    return policyPromise;
  }
  const idle = fn => (window.requestIdleCallback || (f => setTimeout(f, 200)))(fn);
  function afterLoad(fn) {
    if (doc.readyState === "complete") idle(fn);
    else addEventListener("load", () => idle(fn), { once: true });
  }
  const ready = v => typeof v === "string" && v && v.indexOf("[[") === -1;
  const publishable = (section, code) => ((section && section.points) || [])
    .filter(pt => pt && pt.q && pt.a && ready(pt.q[code]) && ready(pt.a[code]));

  function trustHtml() {
    return '<div class="pdp__trust">' + CHIPS.map(c =>
      '<span class="chip" data-policy="' + c.section + '">' +
      SY.icon(c.icon) + "<span>" + esc(t(c.key)) + "</span></span>").join("") + "</div>";
  }

  /* The chips begin as inert spans and are promoted to buttons only for the
     sections that have an answer — never the other way round, so a shopper can
     never tap a chip and be shown an empty sheet. */
  function fillTrust(scope) {
    const code = SY.lang();
    loadPolicies().then(policies => {
      qsa("[data-policy]", scope).forEach(node => {
        const points = publishable(policies && policies[node.dataset.policy], code);
        if (!points.length) return;
        const btn = doc.createElement("button");
        btn.type = "button";
        btn.className = node.className;
        btn.dataset.policy = node.dataset.policy;
        btn.innerHTML = node.innerHTML + '<span class="vh"> — ' + esc(t("pdpPolicyOpen")) + "</span>";
        node.replaceWith(btn);
        SY.bind(btn, "click", () => openPolicy(btn.dataset.policy, btn));
      });
    });
  }

  function policySheet() {
    let dlg = doc.getElementById("pdpPolicy");
    if (dlg) return dlg;
    dlg = doc.createElement("dialog");
    dlg.id = "pdpPolicy";
    dlg.className = "sheet";
    dlg.innerHTML =
      '<span class="sheet__handle" aria-hidden="true"></span>' +
      '<div class="sheet__head"><h2 data-sheet-title data-focus-entry tabindex="-1"></h2>' +
      '<button type="button" class="btn btn--icon" data-sheet-close aria-label="' +
      esc(t("closeLabel")) + '">' + SY.icon("close") + "</button></div>" +
      '<div class="sheet__body" data-sheet-body></div>';
    doc.body.appendChild(dlg);
    SY.bind(qs("[data-sheet-close]", dlg), "click", () => SY.closeDialog(dlg));
    return dlg;
  }

  function openPolicy(name, opener) {
    loadPolicies(true).then(policies => {
      const code = SY.lang();
      const section = policies && policies[name];
      const points = publishable(section, code);
      if (!points.length) return;
      const dlg = policySheet();
      qs("[data-sheet-title]", dlg).textContent = (section.title && section.title[code]) || "";
      qs("[data-sheet-body]", dlg).innerHTML =
        (ready(section.intro && section.intro[code]) ? "<p>" + esc(section.intro[code]) + "</p>" : "") +
        '<dl class="pdp__policy">' + points.map(pt =>
          "<dt>" + esc(pt.q[code]) + "</dt><dd>" + esc(pt.a[code]) + "</dd>").join("") + "</dl>";
      SY.openDialog(dlg, opener);
    });
  }

  /* -------------------------------------------------------- distributor line */

  /*
   * "We are an authorised distributor" is the strongest sentence this shop owns
   * and the product page never said it. The list is generated, never
   * hand-written, and capped at the five largest plus a count, so it is still
   * one line at 20 brands.
   */
  function distributorLine() {
    const counts = new Map();
    for (const p of SY.products()) counts.set(p.brand, (counts.get(p.brand) || 0) + 1);
    const all = [...new Set(SY.products().map(p => p.brand))]
      .sort((a, b) => counts.get(b) - counts.get(a));
    const named = all.slice(0, 5);
    const rest = all.length - named.length;
    const parts = named.map(b => SY.bdi(b));
    let list = parts.length === 1 ? parts[0]
      : parts.slice(0, -1).join(t("pdpListSep")) + t("pdpListAnd") + parts[parts.length - 1];
    if (rest > 0) list += t("pdpListSep") + SY.plural("pdpMoreBrands", rest);
    return '<p class="meta pdp__distributor">' + t("pdpDistributor", { brands: list }) + "</p>";
  }

  /* ------------------------------------------------------------- the specs */

  /*
   * 1,476 pairs across 312 files, mean 4.73 per product. Two kinds are not
   * features and were rendered as if they were: 73 pairs titled "محتويات
   * العلبة", an inventory list, and 15 disclaimers, 13 of them last.
   *
   * The title sets come from the dictionary as a JSON array inside a string, so
   * there is no Arabic in this file and the owner can extend either list from
   * the admin panel. An entry ending in * matches a prefix, one starting with *
   * matches a suffix, anything else is exact.
   */
  function titleSet(key) {
    const raw = t(key);
    if (/^⟦/.test(raw)) return [];
    try {
      const list = JSON.parse(raw);
      return Array.isArray(list) ? list.map(String) : [];
    } catch (e) { return raw.split("|").map(s => s.trim()).filter(Boolean); }
  }
  function matches(title, patterns) {
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
  function splitPairs(pairs) {
    const box = titleSet("specBoxContentsTitles");
    const notes = titleSet("specNoteTitles");
    const out = { features: [], box: [], notes: [] };
    for (const pair of pairs) {
      if (!pair || !pair.length) continue;
      if (matches(pair[0], box)) out.box.push(pair);
      else if (matches(pair[0], notes)) out.notes.push(pair);
      else out.features.push(pair);
    }
    return out;
  }

  /* No "show more". The mean is 4.73 pairs and the p90 body is 177 characters,
     so collapsing hides the page's only indexable prose to save nothing. */
  function specsHtml(pairs, p) {
    if (!pairs || !pairs.length) {
      const own = p && (p.descriptionAr || p.description || p.descriptionTr || "");
      if (!own) return "";
      return "<h2>" + esc(t("detailsTitle")) + '</h2><p class="prose">' + esc(own) + "</p>";
    }
    const split = splitPairs(pairs);
    let html = "<h2>" + esc(t("detailsTitle")) + "</h2>";
    if (split.features.length) {
      html += '<dl class="pdp__specs">' + split.features.map(pair =>
        '<div class="spec-card"><dt>' + esc(pair[0]) + "</dt><dd>" + esc(pair[1]) + "</dd></div>").join("") + "</dl>";
    }
    if (split.box.length) {
      html += '<div class="pdp__box"><h3>' + esc(t("specInTheBox")) + "</h3>" +
        split.box.map(pair => '<p class="prose">' + esc(pair[1]) + "</p>").join("") + "</div>";
    }
    /* A footnote, not a card and not a heading: they are disclaimers. */
    if (split.notes.length) {
      html += '<div class="pdp__notes">' + split.notes.map(pair =>
        '<p class="meta"><b>' + esc(pair[0]) + "</b> " + esc(pair[1]) + "</p>").join("") + "</div>";
    }
    return html;
  }

  const detailCache = {};
  function loadDetails(id, code) {
    const key = code + "/" + id;
    if (!detailCache[key]) {
      detailCache[key] = fetch("/assets/details/" + code + "/" + id + ".json", { cache: "force-cache" })
        .then(r => (r.ok ? r.json() : null)).catch(() => null);
    }
    return detailCache[key];
  }

  /* -------------------------------------------------------------- related */

  /*
   * Candidates are collapsed by SY.groupVariants to one card per colourway,
   * must be inStock, and must sit inside a ±60% price band.
   * A $229.99 power bank does not belong next to a $29.99 one. If fewer than 3
   * survive, no shelf is rendered at all: an empty shelf beats a bad
   * neighbour. Exactly 4.
   */
  function relatedFor(p) {
    const siblings = new Set(coloursOf(p).map(v => v.id).concat([p.id]));
    const pool = SY.products().filter(x => !siblings.has(x.id) && x.inStock);
    const unique = SY.groupVariants(pool).map(g => g.lead);

    const band = 0.6 * p.price;
    const rank = x => {
      if (x.category === p.category && x.brand === p.brand) return 0;
      if (x.category === p.category) return 1;
      if (x.brand === p.brand) return 2;
      return 3;
    };
    const picked = unique
      .filter(x => x.inStock && rank(x) < 3 && Math.abs(x.price - p.price) <= band)
      .sort((a, b) => rank(a) - rank(b) || Math.abs(a.price - p.price) - Math.abs(b.price - p.price))
      .slice(0, 4);
    return picked.length < 3 ? [] : picked;
  }

  /* The same card the grid draws, with the same reserved row heights: brand 30,
     name 52, price 34, note 30. One height, every card, every state. */
  function cardHtml(p) {
    const image = SY.imageSet(p);
    const src = image.small || image.full;
    const dept = SY.deptOf(p);
    const favourite = SY.favourites.has(p.id);
    const colours = coloursOf(p).length;
    const note = !p.inStock ? esc(t("cardOut")) : colours > 1 ? SY.plural("cardColours", colours) : "";
    return '<article class="pcard' + (p.inStock ? "" : " is-out") + '" data-product="' + p.id + '">' +
      '<a class="pcard__hit" href="/p/' + p.id + '">' +
      '<span class="pcard__photo' + (src ? "" : " is-missing") + '" data-photo>' +
      (dept ? SY.icon(dept.icon || "dept-" + dept.id, { className: "pcard__glyph" }) : "") +
      (src ? '<img src="' + esc(src) + '"' +
        (image.srcset ? ' srcset="' + esc(image.srcset) + '"' : "") +
        ' sizes="(max-width:767px) 45vw, (max-width:1279px) 31vw, 23vw"' +
        ' width="360" height="360" alt="" decoding="async" loading="lazy">' : "") +
      "</span>" +
      '<span class="pcard__brand">' + SY.bdi(p.brand) + "</span>" +
      '<h3 class="pcard__name">' + SY.bdi(nameOf(p)) + "</h3>" +
      '<span class="pcard__price"><b>' + money(p.price) + "</b>" +
      /* Same rule as the grid: a discount nobody can take is a hostile
         message. The shelf filters to in-stock anyway, but the guard
         belongs on the card, not on who happens to call it. */
      (p.discount && p.inStock !== false ? "<del>" + money(p.oldPrice) + "</del>" : "") + "</span>" +
      '<span class="pcard__note' + (p.inStock ? "" : " is-out") + '">' + note + "</span></a>" +
      (p.discount && p.inStock !== false ? '<span class="pcard__off">' + t("cardOff", { n: SY.percent(p.discount) }) + "</span>" : "") +
      '<button class="pcard__fav" type="button" data-card-fav="' + p.id + '"' +
      ' aria-pressed="' + (favourite ? "true" : "false") + '"' +
      ' aria-label="' + esc(t(favourite ? "cardUnfav" : "cardFav", { name: nameOf(p) })) + '">' +
      SY.icon(favourite ? "heart-on" : "heart") + "</button></article>";
  }

  function relatedHtml(p, related) {
    if (!related.length) return "";
    /* Out of stock, the shelf is the escape route and it is retitled. Today the
       alternatives are 1,788px down, below the whole feature list. */
    return '<section class="pdp__related"><h2>' +
      esc(t(p.inStock ? "relatedTitle" : "relatedInStockTitle")) + "</h2>" +
      '<div class="grid">' + related.map(cardHtml).join("") + "</div></section>";
  }

  /* ------------------------------------------------------------- breadcrumb */

  function crumbsHtml(p) {
    const node = SY.nodeOf(p);
    const dept = SY.deptOf(p);
    const links = ['<a href="/">' + esc(t("navHome")) + "</a>"];
    if (dept) links.push('<a href="/c/' + esc(dept.id) + '">' + esc(SY.labelOf(dept.id)) + "</a>");
    if (node && dept && node.id !== dept.id) {
      links.push('<a href="/c/' + esc(dept.id) + "/" + esc(node.id) + '">' + esc(SY.labelOf(node.id)) + "</a>");
    }
    return '<nav class="pdp__crumbs" aria-label="' + esc(t("pdpBreadcrumb")) + '">' +
      links.join('<span aria-hidden="true">/</span>') + "</nav>";
  }

  /* ------------------------------------------------------------------ actions */

  /*
   * One primary — "اشترِ الآن" — and one secondary, "أضف إلى السلة". WhatsApp
   * is not a button here: it is one payment method and one control on the
   * confirmation page. The single exception is a product that cannot be sold,
   * where an enquiry is the whole purpose of the screen.
   */
  function actionsHtml(p) {
    if (!p.inStock) {
      const ask = waLink(waMessage(p, t("orderSingleIntro"), 1));
      const tell = waLink(t("stockNotifyIntro") + "\n\n" + nameOf(p) + "\n" + productUrl(p));
      return '<div class="pdp__actions is-out">' +
        '<a class="btn btn--wa" data-primary href="' + esc(ask) + '" target="_blank" rel="noopener noreferrer">' +
        SY.icon("whatsapp") + "<span>" + esc(t("askAboutProduct")) + "</span></a>" +
        '<a class="btn btn--secondary" href="' + esc(tell) + '" target="_blank" rel="noopener noreferrer">' +
        "<span>" + esc(t("stockNotify")) + "</span></a>" +
        '<p class="meta pdp__hint">' + esc(t("outOfStockNote")) + "</p></div>";
    }
    return '<div class="pdp__actions">' +
      '<div class="stepper">' +
      '<button type="button" data-step="-1" aria-label="' + esc(t("cartDecrease")) + '">' + SY.icon("minus") + "</button>" +
      '<input data-qty type="number" inputmode="numeric" min="1" max="20" value="1" aria-label="' + esc(t("quantity")) + '">' +
      '<button type="button" data-step="1" aria-label="' + esc(t("cartIncrease")) + '">' + SY.icon("plus") + "</button></div>" +
      '<button type="button" class="btn btn--primary" data-primary data-buy>' + esc(t("pdpBuyNow")) + "</button>" +
      '<button type="button" class="btn btn--secondary" data-add>' + SY.icon("cart") +
      "<span>" + esc(t("addToCart")) + "</span></button>" +
      '<p class="meta pdp__hint">' + esc(t("pdpCartHint")) + "</p></div>";
  }

  /*
   * A horizontal 44×44 swatch rail, not wrapping chips: thirteen chips measured
   * a 439px eight-row block; the rail is 48px. It comes BEFORE both buttons in
   * DOM order, which is also the keyboard fix.
   */
  function variantsHtml(p) {
    const list = view.colours;
    if (list.length < 2) return "";
    const eager = SY.slowLink() ? 2 : 6;
    /* A radio group, not sixteen buttons. One tab stop, arrow keys to move,
       and the primary action is the next stop instead of the seventeenth. */
    return '<div class="pdp__colour">' +
      '<span class="meta" data-colour>' +
      t("variantColour", { name: '<bdi dir="ltr">' + esc(colourLabel(p)) + "</bdi>" }) + "</span>" +
      '<div class="pdp__variants" role="radiogroup" aria-label="' + esc(t("variantPick")) + '">' +
      list.map((v, n) => {
        const photo = photoOf(v);
        const on = v.id === p.id;
        return '<button type="button" role="radio" class="swatch' + (on ? " is-on" : "") +
          (v.inStock ? "" : " is-out") + '" data-variant="' + v.id + '" data-photo' +
          ' aria-checked="' + (on ? "true" : "false") + '" tabindex="' + (on ? "0" : "-1") + '"' +
          ' aria-label="' + esc(colourLabel(v) + (v.inStock ? "" : " — " + t("variantOut"))) + '">' +
          /* No photograph means no <img>: the swatch falls back to the colour
             name, which is the manufacturer's string and is never translated. */
          (photo
            ? '<img src="' + esc(thumbUrl(photo)) + '" alt="" width="44" height="44" data-no-fallback' +
              (n < eager ? "" : ' loading="lazy"') + ">"
            : '<span class="swatch__word" dir="ltr">' + esc(colourLabel(v).slice(0, 2)) + "</span>") +
          "</button>";
      }).join("") + "</div></div>";
  }

  /* Arrow keys move and select, Home/End jump to the ends, and the direction
     is taken from the document: under RTL the left arrow is the next colour. */
  function variantKeys(e) {
    const rail = e.target.closest(".pdp__variants");
    if (!rail) return;
    const keys = ["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown", "Home", "End"];
    if (keys.indexOf(e.key) === -1) return;
    const items = qsa(".swatch", rail);
    const at = items.indexOf(e.target.closest(".swatch"));
    if (at === -1) return;
    e.preventDefault();
    const forward = SY.isRtl()
      ? e.key === "ArrowLeft" || e.key === "ArrowDown"
      : e.key === "ArrowRight" || e.key === "ArrowDown";
    let next = e.key === "Home" ? 0
      : e.key === "End" ? items.length - 1
      : (at + (forward ? 1 : -1) + items.length) % items.length;
    selectVariant(items[next].dataset.variant);
  }

  function infoHtml(p) {
    const favourite = SY.favourites.has(p.id);
    return '<div class="pdp__info">' +
      '<a class="meta pdp__brand" href="/b/' + esc(SY.slug(p.brand)) + '" dir="ltr">' + esc(p.brand) + "</a>" +
      "<h1>" + SY.bdi(nameOf(p)) + "</h1>" +
      /* One line: price · struck price · discount · availability. Merging the
         availability row away removed a 32px row and a 48px gap. */
      '<div class="pdp__price">' + priceRow(p) + "</div>" +
      '<p class="prose">' + esc(summaryOf(p)) + "</p>" +
      variantsHtml(p) +
      actionsHtml(p) +
      trustHtml() +
      distributorLine() +
      '<div class="pdp__meta">' +
      '<button type="button" class="btn btn--icon" data-fav aria-pressed="' + (favourite ? "true" : "false") +
      '" aria-label="' + esc(t(favourite ? "removeFavorite" : "addFavorite")) + '">' +
      SY.icon(favourite ? "heart-on" : "heart") + "</button>" +
      '<button type="button" class="btn btn--icon" data-share aria-label="' + esc(t("shareProduct")) + '">' +
      SY.icon("share") + "</button>" +
      '<span class="meta pdp__sku">' + esc(t("productCode")) + " " + SY.code(p.sku || p.id) + "</span>" +
      "</div></div>";
  }

  /* ---------------------------------------------------------------- render */

  const root = () => qs("#productView .pdp-page");

  /* The container may not exist: index.html is written by another hand and a
     `/p/<id>` document must never depend on a markup detail landing first. */
  function host() {
    let el = doc.getElementById("productView");
    if (!el) {
      el = doc.createElement("div");
      el.id = "productView";
      (doc.getElementById("main") || doc.getElementById("app-root") || doc.body).appendChild(el);
    }
    el.hidden = false;
    el.removeAttribute("aria-modal");
    el.removeAttribute("role");
    el.removeAttribute("inert");
    return el;
  }

  function render(id) {
    const p = SY.productById(id);
    if (!p) return false;
    gapfill();
    view.offs.forEach(off => off());
    view.offs = [];
    releaseMedia();

    view.id = p.id;
    view.product = p;
    view.seed = view.seed || readSeed();
    view.ref = view.ref || mintReference();
    view.colours = coloursOf(p);
    view.shot = 0;
    const main = photoOf(p);
    view.shots = main ? [{ url: main, kind: "pack" }] : [];

    const box = host();
    const shelf = relatedHtml(p, relatedFor(p));

    box.innerHTML =
      '<div class="pdp-page">' +
      crumbsHtml(p) +
      '<div class="pdp">' + mediaHtml(p) + infoHtml(p) + "</div>" +
      /* Out of stock the alternatives come BEFORE the specifications. */
      (p.inStock ? "" : shelf) +
      '<section class="pdp__details" data-specs hidden></section>' +
      (p.inStock ? shelf : "") +
      '<p class="vh" data-live role="status" aria-live="polite"></p>' +
      "</div>";

    const scope = root();
    adoptServerHero(box);
    bindPhotoErrors(scope, p);
    bindGallery();
    hydrateSlides();
    bindActions(scope);
    fillTrust(scope);
    buyBar(p);
    doc.title = nameOf(p) + " | " + t("brandName");
    doc.body.dataset.route = "product";
    doc.body.dataset.productId = String(p.id);

    /* Everything below is deliberately off the critical path: the gallery
       index, the feature file, and the 77 KB copy index the shelf needs. */
    loadGallery().then(all => {
      if (view.id !== p.id) return;
      const code = all && all[p.id];
      if (!code) return;
      view.shots = shotsFrom(p, code);
      redrawMedia(p, true);
      buyBar(p);
    });
    fillSpecs(p);
    /* 77,621 bytes for four names on a shelf that is 2,000px down. It waits
       for the page to be idle; the first screen is already complete without
       it, because the server seeded the only two strings it carries. */
    afterLoad(() => SY.primeCopy().then(data => {
      copyIndex = data;
      if (view.id === p.id) refreshNames();
    }));
    return true;
  }

  function fillSpecs(p) {
    loadDetails(p.id, SY.lang()).then(pairs => {
      if (view.id !== p.id) return;
      const target = qs("[data-specs]", root());
      if (!target) return;
      const html = specsHtml(pairs, p);
      target.innerHTML = html;
      target.hidden = !html;
    });
  }

  /* The server already painted slide 1 with this exact URL. Moving that element
     into the new tree keeps the LCP element identical instead of retiring it
     and starting a second candidate at the same pixel. */
  function adoptServerHero(box) {
    const fresh = qs(".pdp__slide img", box);
    const old = box.__serverHero;
    box.__serverHero = null;
    if (!fresh || !old || old.getAttribute("src") !== fresh.getAttribute("src")) return;
    old.setAttribute("alt", fresh.getAttribute("alt") || "");
    old.setAttribute("data-no-fallback", "");
    fresh.replaceWith(old);
  }

  /* The shelf's names come from copy.<lang>.json, which is deliberately late.
     Fill them when it lands rather than blocking the first screen on it. */
  function refreshNames() {
    qsa(".pdp__related .pcard").forEach(card => {
      const p = SY.productById(card.dataset.product);
      const h3 = p && qs(".pcard__name", card);
      if (h3) h3.innerHTML = SY.bdi(nameOf(p));
    });
    const p = view.product;
    if (!p || seedFor(p)) return;
    const h1 = qs("h1", root());
    if (h1) h1.innerHTML = SY.bdi(nameOf(p));
    const sum = qs(".pdp__info > .prose", root());
    if (sum) sum.textContent = summaryOf(p);
  }

  /* --------------------------------------------------------- variant swap */

  /*
   * Selecting a colour swaps in place. No navigation, no page re-render, no
   * scroll change — that is the whole point. Measured before: scrollTop
   * 1000 → 0 on every tap, on a page whose only CTA was at y=951.
   */
  function selectVariant(id) {
    const next = SY.productById(id);
    const scope = root();
    if (!next || !scope || String(id) === String(view.id)) return;
    const before = window.scrollY;

    view.id = next.id;
    view.product = next;
    view.shot = 0;
    const main = photoOf(next);
    view.shots = main ? [{ url: main, kind: "pack" }] : [];

    releaseMedia();
    qs(".pdp__media", scope).outerHTML = mediaHtml(next);
    bindGallery();
    hydrateSlides();
    qs(".pdp__price", scope).innerHTML = priceRow(next);
    const h1 = qs("h1", scope);
    if (h1) h1.innerHTML = SY.bdi(nameOf(next));
    const sum = qs(".pdp__info > .prose", scope);
    if (sum) sum.textContent = summaryOf(next);
    const sku = qs(".pdp__sku", scope);
    if (sku) sku.innerHTML = esc(t("productCode")) + " " + SY.code(next.sku || next.id);
    const label = qs("[data-colour]", scope);
    if (label) label.innerHTML = t("variantColour", { name: '<bdi dir="ltr">' + esc(colourLabel(next)) + "</bdi>" });
    const fav = qs("[data-fav]", scope);
    if (fav) {
      const on = SY.favourites.has(next.id);
      fav.setAttribute("aria-pressed", String(on));
      fav.setAttribute("aria-label", t(on ? "removeFavorite" : "addFavorite"));
      fav.innerHTML = SY.icon(on ? "heart-on" : "heart");
    }
    qs(".pdp__actions", scope).outerHTML = actionsHtml(next);
    qsa("[data-variant]", scope).forEach(btn => {
      const on = String(btn.dataset.variant) === String(next.id);
      btn.classList.toggle("is-on", on);
      btn.setAttribute("aria-checked", String(on));
      btn.tabIndex = on ? 0 : -1;
    });

    doc.title = nameOf(next) + " | " + t("brandName");
    doc.body.dataset.productId = String(next.id);
    SY.route.replace("/p/" + next.id);
    buyBar(next);

    const chosen = qs('[data-variant="' + next.id + '"]', scope);
    if (chosen) {
      try { chosen.focus({ preventScroll: true }); } catch (e) {}
      try { chosen.scrollIntoView({ inline: "center", block: "nearest" }); } catch (e) {}
    }
    /* The scroll position is the measurement that mattered: restore it even if
       focus or scrollIntoView moved the document. */
    if (window.scrollY !== before) window.scrollTo(0, before);
    say(t("variantChanged", { name: colourLabel(next), price: SY.moneyText(next.price) }));

    loadGallery().then(all => {
      if (view.id !== next.id) return;
      const code = all && all[next.id];
      if (!code) return;
      view.shots = shotsFrom(next, code);
      redrawMedia(next, true);
      buyBar(next);
    });
    fillSpecs(next);
  }

  /* --------------------------------------------------------------- events */

  function currentQty() {
    const field = qs("[data-qty]", root());
    return SY.clamp(field ? field.value : 1, 1, 20);
  }

  function bindActions(scope) {
    view.offs.push(SY.bind(scope, "keydown", variantKeys));
    view.offs.push(SY.bind(scope, "click", e => {
      const step = e.target.closest("[data-step]");
      if (step) {
        const field = qs("[data-qty]", scope);
        field.value = SY.clamp(Number(field.value) + Number(step.dataset.step), 1, 20);
        return;
      }
      const swatch = e.target.closest("[data-variant]");
      if (swatch) { e.preventDefault(); selectVariant(swatch.dataset.variant); return; }
      const add = e.target.closest("[data-add]");
      if (add) { addToCart(add); return; }
      const buy = e.target.closest("[data-buy]");
      if (buy) { checkout(currentQty()); return; }
      const fav = e.target.closest("[data-fav]");
      if (fav) { toggleFav(fav, view.id); return; }
      const cardFav = e.target.closest("[data-card-fav]");
      if (cardFav) { e.preventDefault(); toggleCardFav(cardFav); return; }
      const share = e.target.closest("[data-share]");
      if (share) { shareProduct(); return; }
      const thumb = e.target.closest("[data-thumb]");
      if (thumb) { if (view.startShots) view.startShots(); goToShot(Number(thumb.dataset.thumb)); return; }
      if (e.target.closest(".pdp__slide img")) openLightbox();
    }));
  }

  function toggleFav(btn, id) {
    const on = SY.favourites.toggle(id);
    btn.setAttribute("aria-pressed", String(on));
    btn.setAttribute("aria-label", t(on ? "removeFavorite" : "addFavorite"));
    btn.innerHTML = SY.icon(on ? "heart-on" : "heart");
    SY.say("fav", t(on ? "removeFavorite" : "addFavorite"));
  }
  function toggleCardFav(btn) {
    const id = btn.dataset.cardFav;
    const p = SY.productById(id);
    const on = SY.favourites.toggle(id);
    btn.setAttribute("aria-pressed", String(on));
    btn.setAttribute("aria-label", t(on ? "cardUnfav" : "cardFav", { name: p ? nameOf(p) : "" }));
    btn.innerHTML = SY.icon(on ? "heart-on" : "heart");
  }

  /* product → cart → /checkout, or product → buy now → /checkout. */
  function checkout(amount) {
    SY.cart.add(view.id, amount);
    location.assign("/checkout");
  }

  /* Adding to cart never opens the cart: the old code threw a full-height
     drawer over the grid and moved focus into it. The button swaps to a check
     for 1,400 ms and the badge pulses — that is the whole feedback. */
  function addToCart(btn) {
    if (!SY.cart.add(view.id, currentQty()) || btn.dataset.busy) return;
    const label = qs("span", btn);
    const done = t("cardAdded");
    btn.dataset.busy = "1";
    btn.classList.add("is-on");
    const was = label ? label.textContent : "";
    if (label && !/^⟦/.test(done)) label.textContent = done;
    setTimeout(() => {
      if (label) label.textContent = was;
      btn.classList.remove("is-on");
      delete btn.dataset.busy;
    }, 1400);
    SY.say("cart", t("addToCart") + " — " + nameOf(view.product));
  }

  function shareProduct() {
    const url = productUrl(view.product);
    if (navigator.share) { navigator.share({ title: nameOf(view.product), url }).catch(() => {}); return; }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => SY.toast(esc(t("pdpLinkCopied")))).catch(() => {});
    }
  }

  /* --------------------------------------------------------------- gallery */

  function say(message) {
    const node = qs("[data-live]", root());
    if (!node) return;
    node.textContent = "";
    requestAnimationFrame(() => { node.textContent = message; });
  }
  function announceShot() {
    if (view.shots.length < 2) return;
    say(t("imageOf", { n: view.shot + 1, total: view.shots.length }));
  }

  /* Every handler bound to the gallery, the slide hydrator or the buy bar goes
     in `view.media`, which is released before each rebuild. A shopper trying
     all sixteen colours would otherwise leave sixteen dead observers and eighty
     listeners behind, each holding a detached DOM tree. */
  function releaseMedia() {
    view.media.forEach(off => off());
    view.media = [];
    if (view.io) { view.io.disconnect(); view.io = null; }
  }

  function bindGallery() {
    const track = qs(".pdp__gallery", root());
    if (!track) return;
    let timer = null;
    view.media.push(SY.bind(track, "scroll", () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const width = track.clientWidth || 1;
        const at = Math.round(Math.abs(track.scrollLeft) / width);
        if (at === view.shot) return;
        view.shot = SY.clamp(at, 0, Math.max(0, view.shots.length - 1));
        markThumb();
        announceShot();
      }, 90);
    }, { passive: true }));
  }

  function markThumb() {
    qsa(".pdp__thumb", root()).forEach(btn => {
      const on = Number(btn.dataset.thumb) === view.shot;
      btn.classList.toggle("is-on", on);
      btn.setAttribute("aria-current", String(on));
    });
    const img = qs(".pdp__buybar img");
    const shot = view.shots[view.shot];
    if (img && shot) img.src = thumbUrl(shot.url);
  }

  function goToShot(n) {
    const track = qs(".pdp__gallery", root());
    if (!track) return;
    view.shot = SY.clamp(n, 0, Math.max(0, view.shots.length - 1));
    const width = track.clientWidth || 0;
    /* Under RTL scrollLeft runs negative, so the sign is measured, not guessed. */
    const sign = SY.isRtl() && track.scrollLeft <= 0 ? -1 : 1;
    track.scrollTo({ left: sign * width * view.shot, behavior: SY.reduceMotion() ? "auto" : "smooth" });
    markThumb();
    announceShot();
  }

  /* -------------------------------------------------------------- lightbox */

  /*
   * Bigger, and flip through them. Nothing here promises magnification the
   * assets cannot deliver: the sources are 700×700, so on a 390 phone the
   * lightbox reaches 367px — a 10.5% gain. No pan and no pinch until the owner
   * re-imports the first shot of each product at 1200×1200.
   */
  function lightbox() {
    let dlg = doc.getElementById("lightbox");
    if (!dlg) {
      dlg = doc.createElement("dialog");
      dlg.id = "lightbox";
      dlg.className = "sheet sheet--full";
      doc.body.appendChild(dlg);
    }
    if (dlg.dataset.pdp) return dlg;
    dlg.dataset.pdp = "1";
    dlg.innerHTML =
      '<div class="sheet__head">' +
      '<button type="button" class="btn btn--icon" data-lb="-1" aria-label="' + esc(t("galleryPrev")) + '">' +
      SY.icon("chevron", { flip: true }) + "</button>" +
      '<h2 data-lb-count data-focus-entry tabindex="-1"></h2>' +
      '<button type="button" class="btn btn--icon" data-lb="1" aria-label="' + esc(t("galleryNext")) + '">' +
      SY.icon("chevron") + "</button>" +
      '<button type="button" class="btn btn--icon" data-lb-close aria-label="' + esc(t("closeLabel")) + '">' +
      SY.icon("close") + "</button></div>" +
      '<div class="sheet__body"><img data-lb-img alt="" width="700" height="700"></div>';
    SY.bind(dlg, "click", e => {
      const nav = e.target.closest("[data-lb]");
      if (nav) { stepShot(Number(nav.dataset.lb)); return; }
      if (e.target.closest("[data-lb-close]")) SY.closeDialog(dlg);
    });
    /* Direction-aware: under RTL the left arrow means "next". */
    SY.bind(dlg, "keydown", e => {
      if (["ArrowLeft", "ArrowRight", "Home", "End"].indexOf(e.key) === -1) return;
      e.preventDefault();
      if (e.key === "Home") return stepTo(0);
      if (e.key === "End") return stepTo(view.shots.length - 1);
      const forward = SY.isRtl() ? e.key === "ArrowLeft" : e.key === "ArrowRight";
      stepShot(forward ? 1 : -1);
    });
    let x0 = null;
    SY.bind(dlg, "touchstart", e => { x0 = e.touches[0].clientX; }, { passive: true });
    SY.bind(dlg, "touchend", e => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0;
      x0 = null;
      if (Math.abs(dx) < 45) return;
      stepShot((dx < 0 ? 1 : -1) * (SY.isRtl() ? -1 : 1));
    }, { passive: true });
    return dlg;
  }

  function paintLightbox() {
    const dlg = doc.getElementById("lightbox");
    const shot = view.shots[view.shot];
    if (!dlg || !shot) return;
    const img = qs("[data-lb-img]", dlg);
    img.src = shot.url;
    img.alt = nameOf(view.product);
    qs("[data-lb-count]", dlg).innerHTML =
      SY.code(t("galleryCounter", { n: view.shot + 1, total: view.shots.length }));
    qsa("[data-lb]", dlg).forEach(b => { b.hidden = view.shots.length < 2; });
    announceShot();
  }
  function stepTo(n) {
    view.shot = SY.clamp(n, 0, Math.max(0, view.shots.length - 1));
    paintLightbox();
    goToShot(view.shot);
  }
  function stepShot(d) {
    if (!view.shots.length) return;
    stepTo((view.shot + d + view.shots.length) % view.shots.length);
  }
  function openLightbox() {
    if (!view.shots.length) return;
    if (view.startShots) view.startShots();
    const dlg = lightbox();
    paintLightbox();
    SY.openDialog(dlg, doc.activeElement);
  }

  /* --------------------------------------------------------- sticky buy bar */

  /*
   * From y=1006 to y=3102 the old PITAKA page had no reachable CTA: the
   * floating WhatsApp disc sat at z-index 50 under a z-index 95 overlay. A
   * 64px bar takes over the moment the inline primary leaves the viewport.
   * The phone bottom bar is hidden on this route, so nothing is stacked.
   */
  function buyBar(p) {
    let bar = qs(".pdp__buybar");
    const primary = qs("[data-primary]", root());
    if (!primary) { if (bar) bar.remove(); return; }
    if (!bar) {
      bar = doc.createElement("div");
      bar.className = "pdp__buybar";
      bar.setAttribute("aria-label", t("pdpStickyBar"));
      doc.getElementById("productView").appendChild(bar);
    }
    const shot = view.shots[view.shot];
    bar.innerHTML =
      (shot ? '<img src="' + esc(thumbUrl(shot.url)) + '" alt="" width="40" height="40" data-no-fallback>' : "") +
      '<span class="pdp__buybar-price">' + money(p.price) + "</span>" +
      (p.inStock
        ? '<button type="button" class="btn btn--primary" data-buy>' + esc(t("pdpBuyNow")) + "</button>"
        : '<a class="btn btn--wa" href="' + esc(waLink(waMessage(p, t("orderSingleIntro"), 1))) +
          '" target="_blank" rel="noopener noreferrer"><span>' + esc(t("askAboutProduct")) + "</span></a>");
    view.media.push(SY.bind(bar, "click", e => {
      if (e.target.closest("[data-buy]")) checkout(1);
    }));
    if (view.io) view.io.disconnect();
    if (!("IntersectionObserver" in window)) return;
    view.io = new IntersectionObserver(entries => {
      const e = entries[0];
      bar.classList.toggle("is-shown", !e.isIntersecting && e.boundingClientRect.top < 0);
    }, { threshold: 0 });
    view.io.observe(primary);
  }

  /* ---------------------------------------------------------------- gapfill */

  /*
   * style.css §10 owns this page. These are the few boxes it does not name yet
   * — the breadcrumb, the thumb strip, the in-use badge, the counter pill, the
   * out-of-stock band, the no-photo tile, the trust rail, the two section
   * headings and the buy bar. The block is inserted BEFORE the stylesheet link,
   * so every rule style.css carries wins on equal specificity, and it can be
   * deleted the day those names land there.
   */
  function gapfill() {
  /* The product page's rules live in style.css now, section 10b. This used to
     inject them from here because the stylesheet was being rewritten at the
     same time; keeping the call site means nothing else had to change. */
}

  /* ------------------------------------------------------------------ boot */

  function open(id) {
    if (!render(id)) return false;
    SY.route.go("/p/" + id);
    return true;
  }

  function close() {
    const box = doc.getElementById("productView");
    if (box) { box.innerHTML = ""; box.hidden = true; }
    releaseMedia();
    view.offs.forEach(off => off());
    view.offs = [];
    view.id = null;
    view.product = null;
    if (doc.body.dataset.route === "product") delete doc.body.dataset.route;
    delete doc.body.dataset.productId;
  }

  window.PRODUCT = { render, open, close, view };

  /* This page's words travel in i18n-pdp.js. On the product route api/p.js
     links product.js server-side, so this file can run before that chunk has
     even been asked for — and drawing then replaces a correct server-rendered
     page with ⟦pdpBuyNow⟧. The server sends its own <script> for the chunk
     now, so this is usually already satisfied; asking for it here is what
     makes it true rather than likely. */
  const words = () => SY.require("i18n-pdp.js").catch(() => {});

  /* And if the chunk lands after a draw anyway — a slow link, a cold cache —
     the page draws itself again rather than leaving the keys on the screen. */
  SY.on("words", file => {
    if (file !== "i18n-pdp.js" || !view.id) return;
    if (root() && root().innerHTML.indexOf("⟦") === -1) return;
    render(view.id);
  });

  SY.ready(() => {
    const fromPath = /^\/p\/(\d+)/.exec(location.pathname);
    const id = doc.body.dataset.productId || (fromPath && fromPath[1]);
    if (!id) return;
    words();
    view.seed = readSeed();
    /* Remember the server's hero <img> so render() can adopt it rather than
       retire an already-painted LCP element. */
    const box = doc.getElementById("productView");
    if (box) box.__serverHero = qs(".pdp__slide img", box);
    /* The taxonomy is only wanted for the breadcrumb, the placeholder glyph and
       the card glyph; all three have honest fallbacks, so nothing waits on it. */
    if (!render(id)) { SY.taxonomy().then(() => render(id)); return; }
    SY.taxonomy().then(() => {
      if (!view.id) return;
      const crumbs = qs(".pdp__crumbs", root());
      if (crumbs) crumbs.outerHTML = crumbsHtml(view.product);
      qsa(".pcard__photo.is-missing", root()).forEach(holder => {
        const p = SY.productById(holder.closest(".pcard").dataset.product);
        const dept = p && SY.deptOf(p);
        if (dept && !qs(".pcard__glyph", holder)) {
          holder.insertAdjacentHTML("afterbegin",
            SY.icon(dept.icon || "dept-" + dept.id, { className: "pcard__glyph" }));
        }
      });
      const blank = qs(".pdp__slide.is-missing", root());
      if (blank && view.product && !qs(".pdp__glyph", blank)) blank.innerHTML = blankTile(view.product);
    });
  });
})();
