/*
 * SmartTech — the shared runtime.
 * ===============================
 * Everything more than one page needs: text, numbers that survive Arabic,
 * icons, the catalogue, the overlay stack, announcements, storage, the basket
 * and the router. `script.js`, `product.js`, `cart.js` and `checkout.js` all
 * build on `window.SY` and never reimplement any of it.
 *
 * Load order on every page:
 *     i18n.js  →  catalog.js  →  core.js  →  the page's own script
 *
 * Two rules this file exists to enforce:
 *
 *  1. No number reaches the page as bare text. Under the bidi algorithm an
 *     Arabic paragraph reorders digit runs, so "عرض 1-12 منتج" renders 12-1
 *     and "إجمالي الطلب $129.98" renders 129.98$. Every price, count, range
 *     and code goes through money() / num() / code(), which isolate it.
 *  2. No overlay manages its own inertness. The old code kept a hand-written
 *     list of six selectors and an early return, and twice left the whole page
 *     untabbable with nothing on screen. Here the browser's top layer owns it
 *     and the state is derived from one stack, never toggled.
 */
(function () {
  "use strict";

  const I18N = window.I18N;
  const STORE = window.STORE;
  const doc = document;

  /* ------------------------------------------------------------- utilities */

  const qs = (sel, root) => (root || doc).querySelector(sel);
  const qsa = (sel, root) => Array.prototype.slice.call((root || doc).querySelectorAll(sel));

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function on(target, type, handler, options) {
    if (!target) return function () {};
    target.addEventListener(type, handler, options);
    return function () { target.removeEventListener(type, handler, options); };
  }

  function ready(fn) {
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", fn, { once: true });
    else fn();
  }

  /* ------------------------------------------------------------------ text */

  const t = (key, vars) => I18N.t(key, vars);
  const lang = () => I18N.current;
  const dir = () => I18N.meta().dir;
  const isRtl = () => I18N.meta().dir === "rtl";

  /* ----------------------------------------------------------- bidi-safe numbers */

  /* Prices are always formatted en-US so the grouping character is a comma and
     the decimal a full stop in all three languages — an Arabic locale would
     emit ١٬٢٩٩٫٠٠, and the catalogue is full of model numbers the shopper
     cross-references against the box in Western digits. */
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

  /* `dir="ltr"` and not bare <bdi>: <bdi> defaults to dir="auto", which sees no
     strong character in "$129.98" or "20%" and falls back to the paragraph's
     RTL — so the symbol lands on the wrong side. Measured, both ways. */
  const money = value => '<bdi dir="ltr">' + esc(formatMoney(value)) + "</bdi>";
  const moneyText = value => formatMoney(value);
  const num = value => '<bdi dir="ltr">' + esc(String(value)) + "</bdi>";
  const percent = value => '<bdi dir="ltr">' + esc(String(value) + "%") + "</bdi>";
  const code = value => '<bdi dir="ltr">' + esc(value) + "</bdi>";

  /* A product name, a brand, a search term — anything interpolated. Plain
     <bdi> is right here: the content has strong characters of its own. */
  function bdi(value) { return "<bdi>" + esc(value) + "</bdi>"; }

  /* Latin runs inside Arabic copy get lang="en" so a screen reader switches
     voice instead of reading "soundcore Liberty 4" with Arabic phonetics. */
  const LATIN_RUN = /[A-Za-z][A-Za-z0-9+.\-/]*(?:\s+[A-Za-z0-9][A-Za-z0-9+.\-/]*)*/g;
  function markLatin(value) {
    const safe = esc(value);
    if (!isRtl()) return safe;
    return safe.replace(LATIN_RUN, m => '<bdi lang="en">' + m + "</bdi>");
  }

  /* Arabic has four plural shapes and the dictionary carries all of them. */
  function plural(base, n) {
    const count = Number(n) || 0;
    if (lang() !== "ar") return t(base + (count === 1 ? "One" : "Many"), { n: num(count) });
    if (count === 1) return t(base + "One", { n: num(count) });
    if (count === 2) return t(base + "Two", { n: num(count) });
    if (count <= 10) return t(base + "Few", { n: num(count) });
    return t(base + "Many", { n: num(count) });
  }

  /* ----------------------------------------------------------------- icons */

  /* One sprite, one cached request, `currentColor` throughout. Above forty
     icons an inline set would cost more than the extra request. */
  function icon(name, options) {
    const opts = options || {};
    const cls = "icon" + (opts.flip ? " icon--flip" : "") + (opts.className ? " " + opts.className : "");
    const size = opts.size ? ' style="width:' + opts.size + 'px;height:' + opts.size + 'px"' : "";
    return '<svg class="' + cls + '" aria-hidden="true" focusable="false"' + size +
      '><use href="/assets/icons.svg#ic-' + esc(name) + '"></use></svg>';
  }

  /* ----------------------------------------------------------------- storage */

  /* Every read and write is guarded: private mode, cleared site data and a
     blocked third-party context all throw rather than return null. */
  const NS = "smarttech_";
  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(NS + key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(NS + key, JSON.stringify(value)); return true; }
      catch (e) { return false; }
    },
    del(key) { try { localStorage.removeItem(NS + key); } catch (e) {} }
  };

  /* ------------------------------------------------------------- environment */

  function connection() { return navigator.connection || navigator.mozConnection || navigator.webkitConnection || null; }
  function slowLink() {
    const c = connection();
    if (!c) return false;
    if (c.saveData) return true;
    return /(^|\b)(slow-2g|2g|3g)$/.test(c.effectiveType || "");
  }
  function reduceMotion() {
    try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; }
  }
  const isPhone = () => innerWidth < 768;

  /* ------------------------------------------------------------- the catalogue */

  let merged = null;
  let overrides = null;
  let catMap = null;
  let taxonomyData = null;
  let brandData = null;
  let copyCache = {};

  function setState(state) {
    overrides = state || {};
    merged = STORE.merge(overrides);
    emit("catalog");
  }

  function products() {
    if (!merged) merged = STORE.merge(overrides || {});
    return merged;
  }

  function productById(id) {
    const key = String(id);
    return products().find(p => String(p.id) === key) || null;
  }

  /* Names and summaries come from assets/copy.<lang>.json, which is fetched
     once per language. The promise is cached, not the result — caching the
     result meant a second caller during the flight started a second fetch. */
  function loadCopy(code) {
    const l = code || lang();
    if (copyCache[l]) return copyCache[l];
    copyCache[l] = fetch("/assets/copy." + l + ".json")
      .then(r => (r.ok ? r.json() : {}))
      .catch(() => ({}));
    return copyCache[l];
  }
  function copyNow(code) {
    const l = code || lang();
    return (copyCache[l] && copyCache[l].__value) || null;
  }
  function primeCopy(code) {
    const l = code || lang();
    return loadCopy(l).then(data => { copyCache[l].__value = data; return data; });
  }

  /* The Arabic name is the translated one, not `p.name`.
     `p.name` is the supplier's English title — "Prime Power Bank (26K, 300W)" —
     and it doubles as the admin's Arabic name field, so it only holds Arabic
     when the owner has actually typed one. Reading it first in Arabic served
     the English title to every Arabic shopper while a full translation sat
     unused in copy.ar.json. So: the owner's edit wins, then the translation,
     then the supplier's title as a last resort. `merge()` records which fields
     the owner changed in `p.edits`, which is what makes the distinction
     possible at all. */
  const NAME_FIELD = { ar: "name", en: "nameEn", tr: "nameTr" };
  function nameOf(p) {
    if (!p) return "";
    const field = NAME_FIELD[lang()];
    const own = p[field];
    const ownIsEdit = own && (field !== "name" || (p.edits && p.edits.indexOf("name") !== -1));
    if (ownIsEdit) return own;
    const data = copyNow();
    const entry = data && data[String(p.id)];
    if (entry && entry.n) return entry.n;
    return own || p.name || "";
  }
  function summaryOf(p) {
    if (!p) return "";
    const data = copyNow();
    const entry = data && data[String(p.id)];
    if (entry && entry.s) return entry.s;
    return STORE.descFor(p, lang()) || "";
  }

  /* ------------------------------------------------------------- the taxonomy */

  /* The PROMISE is cached, not the result. Caching the result means two
     callers during the flight — the grid and the product page both boot at
     once — each start their own fetch, and taxonomy.json and product-cat.json
     are downloaded twice on every product page. Measured. */
  let taxonomyFlight = null;
  function taxonomy() {
    if (taxonomyData) return Promise.resolve(taxonomyData);
    if (taxonomyFlight) return taxonomyFlight;
    taxonomyFlight = Promise.all([
      fetch("/assets/taxonomy.json").then(r => (r.ok ? r.json() : { nodes: [], aliases: {} })).catch(() => ({ nodes: [], aliases: {} })),
      fetch("/assets/product-cat.json").then(r => (r.ok ? r.json() : {})).catch(() => ({}))
    ]).then(([tree, map]) => {
      catMap = map;
      const byId = {};
      tree.nodes.forEach(n => { byId[n.id] = Object.assign({ children: [] }, n); });
      tree.nodes.forEach(n => { if (n.parent && byId[n.parent]) byId[n.parent].children.push(byId[n.id]); });
      const departments = tree.nodes.filter(n => !n.parent).map(n => byId[n.id])
        .sort((a, b) => a.order - b.order);
      departments.forEach(d => d.children.sort((a, b) => a.order - b.order));
      taxonomyData = { departments, byId, aliases: tree.aliases || {}, version: tree.version };
      emit("taxonomy");
      return taxonomyData;
    });
    return taxonomyFlight;
  }

  /* The gallery index, for the same reason: the grid and the product page both
     want it, and without a shared promise gallery.json is fetched twice. */
  let galleryFlight = null;
  let galleryData = null;
  function gallery() {
    if (galleryData) return Promise.resolve(galleryData);
    if (galleryFlight) return galleryFlight;
    galleryFlight = fetch("/assets/gallery.json")
      .then(r => (r.ok ? r.json() : {})).catch(() => ({}))
      .then(data => { galleryData = data; return data; });
    return galleryFlight;
  }
  function galleryNow() { return galleryData; }

  /* A product carries one field — the id of its deepest node. Ancestry comes
     from the tree, so moving a category reparents its products in one edit. */
  function catOf(p) {
    if (!p) return "";
    if (p.cat) return p.cat;
    return (catMap && catMap[String(p.id)]) || "";
  }
  function nodeOf(p) {
    const tx = taxonomyData;
    return tx ? tx.byId[catOf(p)] || null : null;
  }
  function deptOf(p) {
    const node = nodeOf(p);
    if (!node) return null;
    return node.parent ? taxonomyData.byId[node.parent] : node;
  }
  function labelOf(nodeId) {
    const value = t("cat." + nodeId);
    return /^⟦/.test(value) ? String(nodeId) : value;
  }
  function pathOf(p) {
    const node = nodeOf(p);
    if (!node) return "";
    return node.parent ? "/c/" + node.parent + "/" + node.id : "/c/" + node.id;
  }
  function resolveNode(id) {
    const tx = taxonomyData;
    if (!tx) return null;
    if (tx.byId[id]) return tx.byId[id];
    const aliased = tx.aliases[id];
    return aliased ? tx.byId[aliased] || null : null;
  }
  function inNode(p, nodeId) {
    const node = nodeOf(p);
    if (!node) return false;
    return node.id === nodeId || node.parent === nodeId;
  }

  /* ---------------------------------------------------------------- brands */

  function brands() {
    if (brandData) return Promise.resolve(brandData);
    return fetch("/assets/brands.json").then(r => (r.ok ? r.json() : {})).catch(() => ({}))
      .then(data => { brandData = data; return data; });
  }
  /* A logo the build has not confirmed is never emitted as an <img>. That is
     what makes a new brand render as a wordmark tile instead of a broken
     image glyph, deterministically, with no onerror and no layout shift. */
  function brandLogo(name) {
    const entry = brandData && brandData[slug(name)];
    return entry && entry.logo ? "/assets/brands/" + entry.logo : null;
  }
  function slug(value) {
    return String(value || "").toLowerCase().trim()
      .replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  }

  /* ------------------------------------------------------------- variants */

  /* Colourways arrive from the supplier as separate products. Group them so a
     shopper sees one card with four colours, not four cards.
     Keyed on `p.name`, the catalogue name — NOT the translated one. Keying on
     the translation made the shop a different size in every language: 230
     cards in Arabic against 225 in English and Turkish. */
  const BRACKET = /\(([^()]*)\)/g;
  /* A bracket is a SPEC — a wattage, a capacity, a pack size — and not a
     colourway. Getting this wrong in either direction ships the wrong item:
     too loose and "26K, 300W" is sold as a colour choice; too tight and four
     colours of one case stay four cards.
     The units must be anchored to a number. The first version of this rule was
     `/\d|…|w\b|k\b/`, and it read "600D Black/Grey-Twill" as a spec because of
     the 600, and "Black" as a spec because it ends in k — so the catalogue's
     commonest colourway, 28 products, never grouped. Measured: that rule
     collapsed 3 groups; this one collapses 29, over 110 products.
     The escaped words are واط · وات · عبوة · قطع · قطعة — watt, pack and
     piece. They are \u escapes because Arabic text belongs in the
     dictionary and the rule saying so is enforced by a test. */
  const SPEC_BRACKET = /\b\d+(?:\.\d+)?\s*(?:w|k|v|a|ah|wh|mah|gb|tb|mm|cm|m|ft|in|qt|l)\b|\b\d+\s*-?\s*in\s*-?\s*\d\b|\bpack\b|\bpieces?\b|\bpairs?\b|\bbottles?\b|\bports?\b|\u0648\u0627\u0637|\u0648\u0627\u062A|\u0639\u0628\u0648\u0629|\u0642\u0637\u0639|\u0642\u0637\u0639\u0629/i;

  /* Case-folded, because the supplier writes both "iPhone" and "Iphone" and a
     case-sensitive key split one product line into two groups of 12 and 3. */
  function variantKey(name) {
    return String(name || "").replace(BRACKET, "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function colourBrackets(name) {
    const found = String(name || "").match(BRACKET) || [];
    return found.map(b => b.slice(1, -1).trim()).filter(b => b && !SPEC_BRACKET.test(b));
  }

  /* The label is chosen relative to the group, not per product. A PITAKA case
     can carry two non-spec brackets — "(600D Black/Grey-Twill) (Aaron Button)"
     — and taking the last one made five different colours all read
     "Aaron Button". The colourway is whichever bracket actually differs. */
  function variantLabel(name) {
    const brackets = colourBrackets(name);
    return brackets.length ? brackets[brackets.length - 1] : "";
  }

  function groupVariants(list) {
    const buckets = new Map();
    for (const p of list) {
      const key = p.brand.toLowerCase() + "|" + variantKey(p.name);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(p);
    }
    const groups = [];
    for (const members of buckets.values()) {
      /* Only a real colourway groups. If any differing bracket is a spec —
         a wattage, a capacity, a pack size — these are different products and
         selling them as one colour choice would ship the wrong item. */
      if (members.length > 1 && members.every(m => colourBrackets(m.name).length)) {
        groups.push(describe(members));
      } else {
        for (const m of members) groups.push({ lead: m, members: [m], labels: new Map(), min: m.price, max: m.price });
      }
    }
    return groups;
  }

  function describe(members) {
    const lists = members.map(m => colourBrackets(m.name));
    const depth = Math.max(...lists.map(l => l.length));
    /* Find the bracket position whose value is not the same for everyone. */
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
    return {
      lead: pickLead(members),
      members,
      labels,
      min: Math.min(...prices),
      max: Math.max(...prices)
    };
  }

  /* In stock first, then cheapest — so the one price the card shows is one the
     shopper can actually pay, and a group whose colours are priced differently
     never advertises the dearer one. */
  function pickLead(members) {
    const pool = members.filter(m => m.inStock);
    return (pool.length ? pool : members).slice().sort((a, b) => a.price - b.price)[0];
  }

  /* -------------------------------------------------------- the overlay stack */

  /* <dialog>.showModal() puts the element in the browser's top layer, and the
     top layer *is* "a stack with a single owner of inertness". Nesting, focus
     restore, Tab containment, Escape and idempotent close all come free. The
     only thing we write is the bookkeeping, and every branch of it is derived
     from `stack`, never toggled — which is what makes a lockout impossible
     rather than merely fixed. */
  const SUPPORTS_MODAL = typeof HTMLDialogElement !== "undefined" &&
    typeof HTMLDialogElement.prototype.showModal === "function";
  const stack = [];

  function openDialog(el, opener) {
    if (!el || el.open) return;
    el.__opener = opener || doc.activeElement;
    stack.push(el);
    syncOverlays();
    if (SUPPORTS_MODAL) el.showModal();
    else { el.setAttribute("open", ""); trapFocus(el); }
    focusEntry(el);
    emit("overlay", stack.length);
  }

  function closeDialog(el) {
    const i = stack.indexOf(el);
    if (i === -1) return;
    stack.splice(i, 1);
    if (el.open) { if (SUPPORTS_MODAL) el.close(); else el.removeAttribute("open"); }
    syncOverlays();
    restoreFocus(el.__opener);
    el.__opener = null;
    emit("overlay", stack.length);
  }

  function closeAllDialogs() { while (stack.length) closeDialog(stack[stack.length - 1]); }
  const topDialog = () => stack[stack.length - 1] || null;

  function syncOverlays() {
    const open = stack.length > 0;
    doc.documentElement.classList.toggle("has-overlay", open);
    const root = qs("#app-root");
    if (root) {
      /* iOS 15.4 VoiceOver honours aria-hidden but not inert, so both are set —
         and both are safe only because focus has already moved into the
         dialog by the time this runs. */
      if (open) root.setAttribute("aria-hidden", "true");
      else root.removeAttribute("aria-hidden");
      if ("inert" in root) root.inert = open;
    }
    /* Freezing the page with position:fixed rather than overflow:hidden,
       because overflow:hidden on <body> does not hold on iOS. */
    if (open && doc.body.style.position !== "fixed") {
      doc.body.dataset.scrollY = String(scrollY);
      doc.body.style.top = -scrollY + "px";
      doc.body.style.position = "fixed";
      doc.body.style.insetInline = "0";
    } else if (!open && doc.body.style.position === "fixed") {
      const y = Number(doc.body.dataset.scrollY || 0);
      doc.body.style.position = "";
      doc.body.style.top = "";
      doc.body.style.insetInline = "";
      scrollTo(0, y);
    }
  }

  function focusEntry(el) {
    const target = el.querySelector("[data-focus-entry]") ||
      el.querySelector("h1, h2, h3") || el;
    if (target && !target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    try { target.focus({ preventScroll: true }); } catch (e) {}
  }

  /* The opener may have been removed by a filter change while the dialog was
     open. Fall back up a chain, and never to document.body — leaving focus on
     the body restarts Tab at the top of the page, which is how the shopper
     loses their place. */
  function restoreFocus(opener) {
    /* `document.body` is not a fallback. Focusing it is a no-op — it has no
       tabindex — so the shopper's next Tab restarts at the top of the page,
       which is how they lose their place after closing a sheet. The opener is
       often body when a dialog is opened from script, so it has to be
       rejected here rather than trusted. */
    const usable = el => el && el !== doc.body && el !== doc.documentElement &&
      doc.contains(el) && (el.offsetParent !== null || el.getClientRects().length > 0 ||
        el.classList.contains("skip-link"));
    const chain = [opener, qs("main h1:not(.vh)"), qs("main h1"), qs("#main"), qs(".skip-link")];
    for (const candidate of chain) {
      if (usable(candidate)) {
        if (!candidate.hasAttribute("tabindex") && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(candidate.tagName)) {
          candidate.setAttribute("tabindex", "-1");
        }
        try { candidate.focus({ preventScroll: true }); } catch (e) {}
        return;
      }
    }
  }

  const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';
  function trapFocus(el) {
    if (el.__trapped) return;
    el.__trapped = true;
    el.addEventListener("keydown", e => {
      if (e.key !== "Tab" || topDialog() !== el) return;
      const items = qsa(FOCUSABLE, el).filter(n => n.offsetParent !== null || n === doc.activeElement);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }

  /* Safety nets. Each one only calls the idempotent close path. */
  addEventListener("pagehide", closeAllDialogs);
  /* Capture phase, deliberately. `close` does not bubble, so a listener on the
     document in the bubble phase never sees it — and when the BROWSER closes a
     dialog (Escape, or the form method=dialog) the whole close-up was skipped:
     the stack kept its entry, #app-root stayed inert and aria-hidden, <body>
     stayed position:fixed, and 0 of 77 focusables were reachable by Tab.
     A non-bubbling event still travels down the capture path, so this catches
     every close however it was caused. */
  doc.addEventListener("close", e => {
    if (e.target && e.target.tagName === "DIALOG") closeDialog(e.target);
  }, true);
  /* Same reason: `cancel` fires on Escape before `close`, and a dialog that
     refuses to close would otherwise leave the stack ahead of reality. */
  doc.addEventListener("cancel", e => {
    if (e.target && e.target.tagName === "DIALOG" && !e.defaultPrevented) closeDialog(e.target);
  }, true);
  doc.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    const top = topDialog();
    if (!top) return;
    /* Escape inside a search field with content clears the field first — the
       one case the browser's own handling gets wrong. */
    const active = doc.activeElement;
    if (active && active.type === "search" && active.value) { active.value = ""; active.dispatchEvent(new Event("input", { bubbles: true })); e.preventDefault(); return; }
    if (!SUPPORTS_MODAL) { e.preventDefault(); closeDialog(top); }
  });
  /* A click on the backdrop closes the sheet. Detected by hit-testing the
     dialog's own box, because ::backdrop is not an element. */
  doc.addEventListener("click", e => {
    const top = topDialog();
    if (!top || e.target !== top || top.dataset.persistent !== undefined) return;
    const box = top.getBoundingClientRect();
    const inside = e.clientX >= box.left && e.clientX <= box.right &&
                   e.clientY >= box.top && e.clientY <= box.bottom;
    if (!inside) closeDialog(top);
  });

  /* ------------------------------------------------------- announcements */

  /* Eight regions, all present from first paint and all empty. A region
     created at the moment of the message has not been observed yet and is
     silent; one populated during load announces itself on arrival, which is
     noise. Only `error` is assertive — an assertive region interrupts the
     shopper mid-word, and on a shop that is justified only when the thing
     they just did did not happen. */
  const REGIONS = ["cart", "results", "filter", "fav", "error", "route", "busy", "status"];
  function region(name) { return qs("#sr-" + name); }

  function say(name, message) {
    const node = region(name);
    if (!node) return;
    /* Setting textContent to the identical value is not reliably re-announced
       by NVDA or VoiceOver, and adding the same item twice must still speak. */
    node.textContent = "";
    requestAnimationFrame(() => { node.textContent = message; });
  }

  /* --------------------------------------------------------------- toast */

  let toastTimer = null;
  function toast(message, options) {
    const opts = options || {};
    const el = qs("#toast");
    if (!el) return;
    const hold = opts.error ? 0 : (opts.action ? 3200 : 2000) + (reduceMotion() ? 2000 : 0);
    el.setAttribute("role", opts.error ? "alert" : "status");
    let html = '<span class="toast__text">' + message + "</span>";
    if (opts.action) html += '<button type="button" class="toast__action">' + esc(opts.action.label) + "</button>";
    if (opts.error) html += '<button type="button" class="toast__close" aria-label="' + esc(t("close")) + '">' + icon("close") + "</button>";
    el.innerHTML = html;
    el.classList.add("is-shown");
    clearTimeout(toastTimer);
    if (hold) toastTimer = setTimeout(hideToast, hold);
    const action = qs(".toast__action", el);
    if (action) on(action, "click", () => { hideToast(); opts.action.run(); });
    const close = qs(".toast__close", el);
    if (close) on(close, "click", hideToast);
  }
  function hideToast() {
    const el = qs("#toast");
    if (!el) return;
    el.classList.remove("is-shown");
    clearTimeout(toastTimer);
  }

  /* -------------------------------------------------------------- the basket */

  /* A line snapshots what the shopper was shown. It never joins back to the
     product, so a price edit or a rename next week cannot rewrite an order
     placed today — which is the bug the old four-field cart line would have
     created the moment carts became records. */
  const CART_KEY = "cart_v2";
  const CART_TTL = 30 * 24 * 60 * 60 * 1000;
  let cartLines = null;

  function readCart() {
    if (cartLines) return cartLines;
    const raw = store.get(CART_KEY, []);
    const now = Date.now();
    cartLines = (Array.isArray(raw) ? raw : []).filter(line =>
      line && line.id && (!line.addedAt || now - line.addedAt < CART_TTL));
    return cartLines;
  }
  function writeCart() {
    store.set(CART_KEY, cartLines);
    emit("cart", cart.count());
  }

  const cart = {
    lines() { return readCart().slice(); },
    /* Re-priced against the live catalogue on every read, but the stored
       snapshot is what an order will carry. */
    detailed() {
      return readCart().map(line => {
        const p = productById(line.id);
        return {
          id: line.id,
          qty: line.qty,
          product: p,
          code: line.code || (p && p.sku) || "ST" + line.id,
          name: p ? nameOf(p) : line.name,
          unit: p ? p.price : line.unit,
          inStock: p ? p.inStock !== false : true,
          missing: !p
        };
      }).filter(l => !l.missing);
    },
    add(id, qty) {
      const p = productById(id);
      if (!p) return false;
      const want = clamp(qty || 1, 1, 20);
      const lines = readCart();
      const existing = lines.find(l => String(l.id) === String(id));
      if (existing) existing.qty = clamp(existing.qty + want, 1, 20);
      else lines.push({
        id: p.id, qty: want, addedAt: Date.now(),
        code: p.sku || "ST" + p.id, name: p.name, unit: p.price
      });
      writeCart();
      return true;
    },
    setQty(id, qty) {
      const lines = readCart();
      const line = lines.find(l => String(l.id) === String(id));
      if (!line) return;
      const next = clamp(qty, 0, 20);
      if (next < 1) return cart.remove(id);
      line.qty = next;
      writeCart();
    },
    remove(id) {
      cartLines = readCart().filter(l => String(l.id) !== String(id));
      writeCart();
    },
    clear() { cartLines = []; writeCart(); },
    count() { return readCart().reduce((n, l) => n + l.qty, 0); },
    distinct() { return readCart().length; },
    /* Out-of-stock lines are excluded from the sum. They are still shown, and
       checkout is blocked until they are removed, because an order the shop
       cannot fill must not become a record. */
    subtotal() {
      return cart.detailed().filter(l => l.inStock)
        .reduce((sum, l) => sum + l.unit * l.qty, 0);
    },
    unavailable() { return cart.detailed().filter(l => !l.inStock); }
  };

  function clamp(value, min, max) {
    const n = Math.round(Number(value) || 0);
    return Math.min(max, Math.max(min, n));
  }

  /* ----------------------------------------------------------- favourites */

  const FAV_KEY = "favorites";
  let favIds = null;
  const favourites = {
    ids() { if (!favIds) favIds = (store.get(FAV_KEY, []) || []).map(String); return favIds.slice(); },
    has(id) { return favourites.ids().indexOf(String(id)) !== -1; },
    toggle(id) {
      const key = String(id);
      favIds = favourites.ids();
      const i = favIds.indexOf(key);
      const added = i === -1;
      if (added) favIds.push(key); else favIds.splice(i, 1);
      store.set(FAV_KEY, favIds);
      emit("favourites", favIds.length);
      return added;
    },
    count() { return favourites.ids().length; }
  };

  /* --------------------------------------------------------------- events */

  const listeners = {};
  function emit(name, payload) {
    (listeners[name] || []).forEach(fn => { try { fn(payload); } catch (e) {} });
  }
  function subscribe(name, fn) {
    (listeners[name] = listeners[name] || []).push(fn);
    return function () { listeners[name] = listeners[name].filter(f => f !== fn); };
  }

  /* A chunk of the dictionary landing is an event on the same bus as anything
     else. Whoever drew a surface before its words arrived draws it again.
     I18N replays the chunks that came in before this line ran, so core being
     later than a chunk is not a way to miss one. */
  if (I18N && typeof I18N.whenChunk === "function") {
    I18N.whenChunk(file => emit("words", file));
  }

  /* --------------------------------------------------------------- router */

  /* Every discovery state has a URL: a category, a brand, a search, a filter,
     a sort, a page. Not an SEO nicety — an order record has to be able to say
     where the shopper was, a shared link has to resume, and "continue
     shopping" needs somewhere to go. It is 40 lines now and a rewrite later. */
  const route = {
    go(url, state, replace) {
      const method = replace ? "replaceState" : "pushState";
      history[method](Object.assign({ y: scrollY }, state || {}), "", url);
      emit("route", route.current());
    },
    replace(url, state) { route.go(url, state, true); },
    current() {
      return {
        path: location.pathname,
        query: new URLSearchParams(location.search),
        state: history.state || {}
      };
    }
  };
  try { history.scrollRestoration = "manual"; } catch (e) {}
  addEventListener("popstate", () => emit("route", route.current()));

  /* ------------------------------------------------------------- scrolling */

  /* Document-level smooth scrolling measured 1,856 ms at 11 fps to reach the
     footer. It survives in exactly one place: a short hop after a filter
     changes the results. Anything further than two viewports jumps. */
  function scrollToY(y) {
    const distance = Math.abs(y - scrollY);
    const smooth = distance > 0 && distance < innerHeight * 2 && !reduceMotion();
    scrollTo({ top: y, behavior: smooth ? "smooth" : "auto" });
  }
  function scrollToEl(el, offset) {
    if (!el) return;
    const chrome = parseInt(getComputedStyle(doc.documentElement).getPropertyValue("--chrome"), 10) || 56;
    scrollToY(el.getBoundingClientRect().top + scrollY - chrome - (offset || 8));
  }

  /* ---------------------------------------------------------------- images */

  /* Grid cards draw at 176 CSS px and were being served the 700px master.
     A 360px tier is the single largest transfer saving in the shop.
     `full` is null when the product has no photograph at all — the caller
     renders the department glyph and the brand name instead, never a
     placeholder drawing and never a broken-image glyph. */
  function imageSet(p) {
    const full = STORE.imageFor(p);
    if (!full) return { full: null, small: null, srcset: null };
    const small = /\/assets\/products\/\d+\.webp$/.test(full)
      ? full.replace(/\.webp$/, "-360.webp") : null;
    return { full, small, srcset: small ? small + " 360w, " + full + " 700w" : null };
  }

  /* ------------------------------------------------------- loading on demand */

  /* The home page does not need the product page's code, and neither needs the
     checkout's. Shipping all of it cost 83.6 KB gzipped against a 60 KB
     budget — on a 400 kbit/s line that is nearly two extra seconds before
     anything is interactive, spent on screens the shopper may never open.
     So a surface is fetched the moment the shopper heads for it: on the tap
     that opens it, and speculatively on the touch or hover just before, which
     on a phone buys 80–140 ms of head start for nothing.
     Never speculatively on a slow link — there the guess costs more than it
     saves, and the shopper is paying for it. */
  /* A surface needs its words as well as its code. The dictionary is split the
     same way the scripts are, so fetching one fetches the other — otherwise
     the product page would arrive and render ⟦pdpAddToCart⟧. */
  const WORDS = {
    "product.js": "i18n-pdp.js",
    "cart.js": "i18n-order.js",
    "checkout.js": "i18n-order.js"
  };
  const loaded = {};
  /* A surface leaves its object on window; a dictionary chunk registers its
     own name with I18N as it merges. Either is proof the file has run. */
  const globalOf = name => window[name.replace(/\.js$/, "").toUpperCase()];
  function hasRun(name) {
    if (globalOf(name)) return true;
    return !!(I18N && I18N.chunks && I18N.chunks.indexOf(name) !== -1);
  }
  function require(name) {
    if (loaded[name]) return loaded[name];
    const words = WORDS[name];
    if (words && !loaded[words]) {
      /* Words first: the code runs as soon as it lands. */
      loaded[name] = fetchScript(words).then(() => fetchScript(name));
      return loaded[name];
    }
    loaded[name] = fetchScript(name);
    return loaded[name];
  }

  function fetchScript(name) {
    return new Promise((resolve, reject) => {
      /* The page may already be loading this file — api/p.js links product.js
         into the product route server-side, and this runs before a deferred
         script has executed, so checking for `window.PRODUCT` is not enough.
         Without this the product page carried two <script src="/product.js">
         tags and ran the module twice. */
      const already = doc.querySelector('script[src^="/' + name + '"]');
      if (already) {
        /* A tag the server wrote carries no marker of ours, and its load
           event fired long before anyone asked for the file — so waiting for
           that event waits forever. It is what left ⟦catDesc.charging⟧ on a
           category page: script.js asked for the words, the promise never
           settled, and the re-render it was waiting to do never happened.
           So ask the file whether it has run, rather than the tag. */
        if (already.dataset.done !== undefined || hasRun(name)) return resolve(globalOf(name));
        already.addEventListener("load", () => resolve(), { once: true });
        already.addEventListener("error", () => reject(new Error(name)), { once: true });
        return;
      }
      const el = doc.createElement("script");
      el.src = "/" + name + (SCRIPT_VERSION[name] ? "?v=" + SCRIPT_VERSION[name] : "");
      el.defer = true;
      el.onload = () => { el.dataset.done = ""; resolve(globalOf(name)); };
      el.onerror = () => { loaded[name] = null; reject(new Error(name)); };
      doc.head.appendChild(el);
    });
  }
  /* The content hashes, written into the page by tools/stamp-assets.cjs so a
     lazily-loaded file is cache-busted exactly like a linked one. */
  const SCRIPT_VERSION = (() => {
    try { return JSON.parse(doc.documentElement.dataset.js || "{}"); } catch (e) { return {}; }
  })();

  function warm(name) {
    if (slowLink()) return;
    require(name).catch(() => {});
  }

  /* Mark a file as already present, so a page that links it directly — the
     product route links product.js server-side — never fetches it twice. */
  function provide(name) { loaded[name] = Promise.resolve(globalOf(name)); }

  /* --------------------------------------------------------------- language */

  function setLang(next) {
    if (!next || next === lang()) return;
    I18N.set(next);
    const url = new URL(location.href);
    url.searchParams.set("lang", next);
    location.assign(url.toString());
  }

  /* ------------------------------------------------------------------ boot */

  /* Broken product photos become a deliberate placeholder, never the
     browser's broken-image glyph. One delegated listener in the capture
     phase — `error` does not bubble — instead of 1,616 inline handlers. */
  doc.addEventListener("error", e => {
    const img = e.target;
    if (!img || img.tagName !== "IMG" || img.dataset.noFallback !== undefined) return;
    const holder = img.closest("[data-photo]");
    if (holder) holder.classList.add("is-missing");
    img.dataset.noFallback = "";
    img.remove();
  }, true);

  window.SY = {
    /* text */
    t, lang, dir, isRtl, setLang, esc, plural,
    /* numbers, all bidi-safe */
    money, moneyText, num, percent, code, bdi, markLatin, formatMoney,
    /* dom */
    qs, qsa, on, ready, icon, scrollToY, scrollToEl,
    /* data */
    products, productById, setState, nameOf, summaryOf, loadCopy, primeCopy,
    taxonomy, gallery, galleryNow, catOf, nodeOf, deptOf, labelOf, pathOf, resolveNode, inNode,
    brands, brandLogo, slug, imageSet,
    groupVariants, variantKey, variantLabel,
    /* surfaces */
    openDialog, closeDialog, closeAllDialogs, topDialog,
    say, toast, hideToast,
    /* state */
    store, cart, favourites, route, on: subscribe, emit,
    /* code on demand */
    require, warm, provide,
    /* environment */
    slowLink, reduceMotion, isPhone, clamp,
    SUPPORTS_MODAL
  };
  /* `SY.on` is the event subscription; DOM binding is `SY.bind`. Two names for
     two jobs rather than one overloaded one. */
  window.SY.bind = on;
})();
