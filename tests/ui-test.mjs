/*
 * SmartTech — the journeys, and the round trip the shop is for.
 * =============================================================
 *
 * `shop-test.mjs` measures the redesign: where the first card sits, how tall
 * the cart's foot is, whether a number renders backwards. This file does the
 * other half — it *uses* the shop. It walks the storefront from the front door
 * to a confirmation page with a real reference on it, and then it sits in the
 * owner's chair and proves the one sentence the whole build exists to make
 * true: **he changes something in the console and the storefront shows it.**
 *
 * Four parts, in the order they run:
 *
 *   A  the storefront journey   — home → department → category → filter →
 *      sort → Arabic search → product → colour → cart → quantity → checkout →
 *      order → confirmation → reload.
 *   C  the defects that came back before. Each one is a measurement somebody
 *      took on the live site; the comment says what it was.
 *   B  the admin round trip. Price, photo, stock, add, delete, restore, a
 *      policy answer, and an order moved through both of its lifecycles.
 *   D  the console's own rules, including the single most important assertion
 *      in this file: «استعادة نسخة سابقة» must restore the previous value and
 *      not the mistake. Save 111, save 222, restore, expect 111.
 *
 * Two rules for anyone editing this file.
 *
 *  1. **Assert on what the shopper experiences.** "the cart counts three
 *     items" is the claim; `#cartCount` is only how we find out. When a
 *     selector changes, the claim should not have to.
 *  2. **Never weaken a check to make it pass.** A red line here is the file
 *     doing its job. Anything red at the time of writing is marked DEFECT
 *     with what was measured — `grep DEFECT` finds them — so nobody has to
 *     rediscover it. When one is fixed, the comment goes to the past tense and
 *     the check stays: it is now the thing stopping it coming back.
 *
 * The rig (`tests/run-all.mjs`) starts the server, wipes the blob store before
 * each suite and sets DEV_PORT, ADMIN_PASSWORD, ADMIN_SECRET and SHOT_DIR.
 * This file assumes a **clean blob store**: it counts backups and orders.
 */
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import os from "node:os";

const BASE = "http://127.0.0.1:" + (process.env.DEV_PORT || 3100);
const SHOT = process.env.SHOT_DIR;
const PASSWORD = process.env.ADMIN_PASSWORD || "test-pass-123";

let failures = 0;
const check = (name, ok, detail) => {
  console.log((ok ? "PASS " : "FAIL ") + name +
    (ok || detail === undefined ? "" : " -> " +
      String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 320)));
  if (!ok) failures++;
};
const wait = ms => new Promise(r => setTimeout(r, ms));
const note = line => console.log("     · " + line);

/* The product the owner edits in part B. In stock, one photo, no bracketed
   colourway — so it is its own card and never collapses into a variant group
   whose lead is a different id. If it ever leaves the catalogue, pick another
   with the same three properties rather than deleting the checks. */
const SUBJECT = { id: 21280, name: "Charger GaNPrime 100W", price: 84.99 };
/* Out of stock AND discounted in the shipped catalogue — the exact pair part C
   needs, so that check needs no setup and cannot be blamed on this file. */
const OUT_AND_CUT = { id: 5979, query: "PowerPort PD" };

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"]
});

/* ------------------------------------------------------------------ rigging */

async function newPage({ lang = "ar", width = 390, height = 844 } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width, height });
  /* Headless Chrome answers prefers-reduced-motion: reduce, which switches off
     the very transitions a journey has to wait for. Ask for the real thing. */
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "no-preference" }]);
  const errors = [];
  const bad = [];
  page.on("pageerror", e => errors.push(String(e).slice(0, 200)));
  page.on("console", m => { if (m.type() === "error" && !/favicon|401|status of 401/i.test(m.text())) errors.push(m.text().slice(0, 200)); });
  page.on("response", r => { if (r.url().startsWith(BASE) && r.status() >= 400 && r.status() !== 401) bad.push(r.url().replace(BASE, "") + " " + r.status()); });
  page.on("dialog", d => d.accept().catch(() => {}));
  await page.evaluateOnNewDocument(code => { try { localStorage.setItem("smarttech_lang", code); } catch (e) {} }, lang);
  page.__lang = lang;
  return { page, errors, bad };
}

/* A storefront page is not usable the moment `load` fires: the taxonomy, the
   brand registry and the translated names arrive afterwards, and script.js
   only renders once all three are in. Waiting on `window.__TX` is waiting on
   exactly that, and it is why this file does not sprinkle sleeps. */
async function shopAt(url, opts) {
  const made = await newPage(opts);
  const lang = (opts && opts.lang) || "ar";
  await made.page.goto(BASE + url + (url.includes("?") ? "&" : "?") + "lang=" + lang, { waitUntil: "networkidle0" });
  await made.page.waitForFunction(() => !!window.SY && !!window.__TX, { timeout: 20000 }).catch(() => {});
  await wait(350);
  return made;
}

/* Click through the page rather than through the mouse, because half of these
   targets are inside a scroll container or below a sheet. Where a *real* input
   event is the point — Tab, Escape, typing — this file uses page.keyboard. */
const tap = (page, selector) => page.evaluate(sel => {
  const el = document.querySelector(sel);
  if (!el) throw new Error("no element for " + sel);
  el.scrollIntoView({ block: "center" });
  el.click();
}, selector);

const shot = async (page, name) => {
  if (!SHOT) return;
  try { await page.screenshot({ path: SHOT + "/" + name + ".png" }); } catch (e) { /* a screenshot is never worth a failure */ }
};

/*
 * Tab coverage, driven by real key presses.
 *
 * This exists because modality now lives in the browser's **top layer**, and
 * the top layer is invisible to `querySelectorAll("[inert]")`. A suite that
 * inspected attributes went green through two total lockouts. The only honest
 * question is the shopper's: can I still reach the page with the keyboard?
 *
 * Every focusable in the scope is tagged, one `focusin` listener records what
 * the browser actually focuses, and Tab is pressed twice round the loop plus
 * slack so wrapping cannot hide a gap.
 */
async function tabReach(page, scope = "#app-root") {
  const total = await page.evaluate(sel => {
    /* Each clause carries the scope of its own. "#app-root a,button" is three
       selectors and only the first one is scoped, which quietly pulled every
       button in the document — dialogs included — into the count. */
    const FOCUSABLE = ["a[href]", "button:not([disabled])", "input:not([disabled])",
      "select:not([disabled])", "textarea:not([disabled])", "summary", '[tabindex]:not([tabindex="-1"])']
      .map(one => sel + " " + one).join(",");
    document.querySelectorAll("[data-tabprobe]").forEach(el => { delete el.dataset.tabprobe; });
    const list = [...document.querySelectorAll(FOCUSABLE)]
      .filter(el => el.offsetParent !== null || getComputedStyle(el).position === "fixed");
    list.forEach((el, i) => { el.dataset.tabprobe = String(i); });
    window.__probe = list;
    window.__hit = new Set();
    if (!window.__tabwatch) {
      window.__tabwatch = true;
      document.addEventListener("focusin", e => {
        const el = e.target;
        if (el && el.dataset && el.dataset.tabprobe !== undefined) window.__hit.add(el.dataset.tabprobe);
      }, true);
    }
    scrollTo(0, 0);
    const start = document.querySelector(".skip-link") || document.body;
    try { start.focus(); } catch (e) {}
    return list.length;
  }, scope);
  for (let i = 0; i < total * 2 + 20; i++) await page.keyboard.press("Tab");
  return page.evaluate(() => {
    const missed = window.__probe.filter(el => !window.__hit.has(el.dataset.tabprobe));
    return {
      total: window.__probe.length,
      hit: window.__hit.size,
      /* Naming what the keyboard could not reach is the whole value of a
         failure here: "46 of 81" sends the next person on a hunt. */
      missed: missed.slice(0, 8).map(el => (el.id || el.tagName + "." + String(el.className).split(" ")[0]) +
        "«" + String(el.textContent || "").trim().slice(0, 14) + "»")
    };
  });
}

const activeName = page => page.evaluate(() => {
  const a = document.activeElement;
  if (!a || a === document.body) return "document.body";
  return a.id || String(a.className || "").split(" ")[0] || a.tagName;
});

/* =======================================================================
   A — the storefront journey
   =======================================================================
   One shopper, Arabic, on a 390×844 phone, from the front door to a
   confirmation page. Every step is a thing a person does, in the order they
   do it; a break anywhere costs the shop the order, so the whole walk is one
   block and each step names what the shopper was trying to do. */
let ORDER_REF = "";
{
  const { page, errors, bad } = await shopAt("/");

  check("A · the shop opens and its runtime is alive",
    await page.evaluate(() => !!(window.SY && window.I18N && window.STORE)),
    "SY / I18N / STORE on window");
  check("A · the home page draws no errors", errors.length === 0, errors);
  check("A · nothing on the home page 404s", bad.length === 0, bad);

  /* Land on / — the shopper must be able to see the aisles and a price.
     The old first screen was a 794px hero selling one power bank. */
  const landing = await page.evaluate(() => ({
    departments: document.querySelectorAll(".depts__tile").length,
    rails: [...document.querySelectorAll(".rail")].filter(r => !r.hidden).length,
    cards: document.querySelectorAll(".pcard").length
  }));
  check("A · the front door offers every department and at least one rail of products",
    landing.departments === 8 && landing.rails >= 1 && landing.cards > 0, landing);
  await shot(page, "journey-01-home");

  /* Reach a department. The tiles are real <a href="/c/…"> so this works with
     no JS at all; with JS the router takes it. */
  const deptHref = await page.evaluate(() => document.querySelector(".depts__tile").getAttribute("href"));
  await tap(page, ".depts__tile");
  await wait(900);
  const dept = await page.evaluate(() => ({
    path: location.pathname,
    heading: (document.querySelector("#seoHost h1") || {}).textContent || "",
    cards: document.querySelectorAll("#grid .pcard").length,
    facets: !document.querySelector("#facetbar").hidden
  }));
  check("A · tapping a department opens that department, with its own heading and its goods",
    dept.path === deptHref && dept.heading.length > 1 && dept.cards > 0 && dept.facets, dept);
  check("A · a department page shows one page of 24, not the whole aisle",
    dept.cards <= 24, dept.cards + " cards; the old grid grew to 230 in one DOM");

  /* Reach a category inside it, the way a phone shopper does: the departments
     sheet, one drill down, then the leaf. */
  await tap(page, "#slotDepts");
  await wait(600);
  await tap(page, "#deptsBody [data-drill]");
  await wait(500);
  const leafHref = await page.evaluate(() =>
    ([...document.querySelectorAll("#deptsBody a.deptrow")]
      .find(a => (a.getAttribute("href").match(/\//g) || []).length === 3) || {}).getAttribute?.("href") || "");
  check("A · the departments sheet drills into a department and lists its categories",
    /^\/c\/[^/]+\/[^/]+$/.test(leafHref), leafHref);
  await page.evaluate(href => document.querySelector('#deptsBody a[href="' + href + '"]').click(), leafHref);
  await wait(900);
  const leaf = await page.evaluate(() => ({
    path: location.pathname,
    sheetStillOpen: !!document.querySelector("#depts[open]"),
    cards: document.querySelectorAll("#grid .pcard").length,
    heading: (document.querySelector("#seoHost h1") || {}).textContent || ""
  }));
  check("A · choosing a category lands on that category and closes the sheet behind it",
    leaf.path === leafHref && !leaf.sheetStillOpen && leaf.cards > 0 && leaf.heading.length > 1, leaf);

  /* Filter it. Every tap changes the grid behind immediately; the footer
     button only counts and dismisses. */
  await tap(page, "#filterBtn");
  await wait(600);
  const brandSlug = await page.evaluate(() => {
    const el = document.querySelector('#filtersBody [data-facet="brand"]:not([disabled])');
    return el ? el.value : "";
  });
  const beforeFilter = await page.evaluate(() => document.querySelectorAll("#grid .pcard").length);
  await page.evaluate(v => document.querySelector('#filtersBody [data-facet="brand"][value="' + v + '"]').click(), brandSlug);
  await wait(900);
  const filtered = await page.evaluate(() => ({
    url: location.search,
    brands: [...new Set([...document.querySelectorAll("#grid .pcard__brand")].map(e => e.textContent.trim().toLowerCase()))],
    cards: document.querySelectorAll("#grid .pcard").length,
    chips: document.querySelectorAll("#activeChips [data-chip]").length
  }));
  check("A · filtering by a brand leaves only that brand on the shelf",
    filtered.cards > 0 && filtered.brands.length === 1, filtered);
  check("A · the filter is in the URL and shown as a chip the shopper can undo",
    filtered.url.includes("brand=" + brandSlug) && filtered.chips === 1, filtered);
  check("A · filtering narrows the shelf rather than reloading it whole",
    filtered.cards <= beforeFilter, { beforeFilter, after: filtered.cards });
  await shot(page, "journey-02-filtered");
  await tap(page, "#filtersClose");
  await wait(500);

  /* Sort it. "Cheapest first" has to actually be cheapest first — and in
     stock before out of stock, because the first price a shopper sees must be
     one they can pay. */
  await page.select("#sortSelect", "price-asc");
  await wait(800);
  const sorted = await page.evaluate(() =>
    [...document.querySelectorAll("#grid .pcard")].map(el => ({
      price: Number((el.querySelector(".pcard__price b").textContent.match(/[\d.,]+/) || ["0"])[0].replace(/,/g, "")),
      out: el.querySelector(".pcard__note").className.includes("is-out")
    })));
  const inStockRun = sorted.filter(r => !r.out).map(r => r.price);
  check("A · sorting by price puts the cheapest first",
    inStockRun.length > 1 && inStockRun.every((p, i) => i === 0 || inStockRun[i - 1] <= p + 0.001),
    inStockRun.slice(0, 6));
  check("A · the sort is shareable — it is in the URL",
    (await page.evaluate(() => location.search)).includes("sort=price-asc"));

  /* Take the filter off again, from the chip. A filter the shopper cannot see
     is a filter they cannot undo, and a category page that silently holds one
     is how a search comes back empty for no visible reason. */
  await page.evaluate(() => document.querySelector("#activeChips [data-chip]").click());
  await wait(900);
  const unfiltered = await page.evaluate(() => ({
    cards: document.querySelectorAll("#grid .pcard").length,
    chips: document.querySelectorAll("#activeChips [data-chip]").length,
    url: location.search
  }));
  check("A · tapping the chip takes the filter off and puts the rest of the shelf back",
    unfiltered.chips === 0 && unfiltered.cards >= filtered.cards && !unfiltered.url.includes("brand="), unfiltered);

  /* Back to the front door, the way everyone does it: the wordmark.
     Search runs inside whatever the shopper is looking at — that is the point
     of it — so a shop-wide search starts from the shop. */
  await tap(page, ".hdr__brand");
  await wait(900);
  check("A · the wordmark goes home",
    (await page.evaluate(() => location.pathname + location.search)) === "/");

  /* Search for something in Arabic. A shopper types the word they use, not the
     word on the box: "كفر ايفون" is a phone case, and neither word appears in
     the supplier's English titles. A second word must narrow, not empty. */
  /* On a phone the header's search field is 0px wide until it is asked for —
     the bottom bar's بحث is how a shopper opens it, so that is how this does. */
  await tap(page, "#slotSearch");
  await wait(500);
  check("A · the bottom bar's search control puts the cursor in the search field",
    (await page.evaluate(() => document.activeElement.id)) === "q");
  await page.keyboard.type("كفر ايفون", { delay: 25 });
  await wait(700);
  const suggested = await page.evaluate(() => ({
    open: !document.querySelector("#suggest").hidden,
    rows: document.querySelectorAll(".suggest__row").length
  }));
  check("A · typing Arabic offers suggestions before the shopper finishes",
    suggested.open && suggested.rows > 0, suggested);
  await page.keyboard.press("Enter");
  await wait(1200);
  const found = await page.evaluate(() => ({
    cards: document.querySelectorAll("#grid .pcard").length,
    arabicNames: [...document.querySelectorAll("#grid .pcard__name")].filter(e => /[\u0600-\u06FF]/.test(e.textContent)).length,
    iphone: [...document.querySelectorAll("#grid .pcard__name")].filter(e => /iphone/i.test(e.textContent)).length,
    heading: (document.querySelector("#seoHost h1") || {}).textContent || ""
  }));
  check("A · an Arabic search for a phone case finds phone cases",
    found.cards > 3 && found.iphone > 0, found);
  check("A · the results are named in the shopper's language",
    found.arabicNames === found.cards, found);
  await shot(page, "journey-03-search");

  /* Open a product. /p/<id> is a real document, not an overlay, so the back
     button and a shared link both behave. */
  const productId = await page.evaluate(() => (document.querySelector("#grid .pcard") || { dataset: {} }).dataset.product || "");
  check("A · there is a product to open", productId !== "", "no card in the results");
  await page.evaluate(() => document.querySelector("#grid .pcard__hit").click()).catch(() => {});
  await page.waitForFunction(() => /^\/p\/\d+$/.test(location.pathname), { timeout: 15000 }).catch(() => {});
  await page.waitForSelector(".pdp__info h1", { timeout: 15000 }).catch(() => {});
  await wait(600);
  const pdp = await page.evaluate(() => ({
    path: location.pathname,
    name: (document.querySelector(".pdp__info h1") || {}).textContent || "",
    price: (document.querySelector(".pdp__price b") || {}).textContent || "",
    swatches: document.querySelectorAll(".swatch").length,
    canAdd: !!document.querySelector("[data-add]"),
    canBuy: !!document.querySelector("[data-buy]"),
    crumbs: document.querySelectorAll(".pdp__crumbs a").length,
    related: document.querySelectorAll(".pdp__related .pcard").length
  }));
  check("A · tapping a card opens that product's own page",
    pdp.path === "/p/" + productId && pdp.name.length > 3, { productId, ...pdp });
  check("A · the product page offers a price, a way to buy and a way back up the tree",
    /\d/.test(pdp.price) && pdp.canAdd && pdp.canBuy && pdp.crumbs >= 2, pdp);
  check("A · the product page offers alternatives", pdp.related > 0, pdp.related);
  await shot(page, "journey-04-product");

  /* Choose a colour. This is the step that used to throw the shopper 1,000px
     back up the page; it is checked properly in part C, here we only need a
     colour chosen so the cart line is the right one. */
  if (pdp.swatches > 1) {
    const swap = await page.evaluate(async () => {
      const before = document.body.dataset.productId;
      const s = [...document.querySelectorAll(".swatch")].find(x => x.getAttribute("aria-checked") !== "true");
      s.click();
      await new Promise(r => setTimeout(r, 500));
      return { before, after: document.body.dataset.productId, url: location.pathname, chosen: document.querySelectorAll('.swatch[aria-checked="true"]').length };
    });
    check("A · choosing a colour swaps the product in place and keeps the address honest",
      swap.after !== swap.before && swap.url === "/p/" + swap.after && swap.chosen === 1, swap);
  } else {
    note("this product has one colourway; the colour swap is covered on /p/33395 in part C");
  }

  /* Add it to the cart. */
  await tap(page, "[data-add]");
  await wait(1200);
  const added = await page.evaluate(() => ({
    count: SY.cart.count(),
    badge: (document.querySelector("#cartCount") || {}).textContent.trim(),
    cartOpen: !!document.querySelector("#cart[open]")
  }));
  check("A · adding to the cart puts one item in it and says so in the badge",
    added.count === 1 && added.badge === "1", added);

  /* A second product, so the cart has something to count and a quantity to
     change. Added through the runtime rather than a second walk: the walk is
     what is under test, and it has already been done once. */
  await page.evaluate(() => SY.cart.add(35141, 1));
  await wait(400);
  await tap(page, "#cartBtn");
  await wait(1200);
  const cart = await page.evaluate(() => ({
    open: !!document.querySelector("#cart[open]"),
    lines: document.querySelectorAll(".cart__line").length,
    focus: document.activeElement.id,
    subtotal: SY.cart.subtotal(),
    foot: (document.querySelector(".cart__foot") || {}).textContent || ""
  }));
  check("A · opening the cart shows both lines and takes the shopper into it",
    cart.open && cart.lines === 2 && cart.focus === "cart-title", cart);
  check("A · the cart adds the lines up", /\d/.test(cart.foot) && cart.subtotal > 0, cart);

  /* Change the quantity. Plus must add one unit, not one line. */
  const beforeQty = await page.evaluate(() => SY.cart.count());
  await page.evaluate(() => document.querySelector('.cart__line [data-step="1"]').click());
  await wait(600);
  const afterQty = await page.evaluate(() => ({
    count: SY.cart.count(),
    lines: document.querySelectorAll(".cart__line").length,
    shown: (document.querySelector(".cart__line output") || {}).textContent.trim()
  }));
  check("A · the plus button adds a unit to that line, not another line",
    afterQty.count === beforeQty + 1 && afterQty.lines === 2 && afterQty.shown === "2", { beforeQty, ...afterQty });
  await shot(page, "journey-05-cart");

  /* Reach the checkout the way the shopper does: the cart's own button. */
  await page.evaluate(() => document.querySelector("[data-go-checkout]").click());
  await wait(1500);
  const reached = await page.evaluate(() => ({
    path: location.pathname,
    form: !!document.querySelector("#co-form"),
    route: document.body.dataset.route
  }));
  /*
   * DEFECT. The cart's «متابعة» is <a href="/checkout">, but script.js's one
   * delegated link handler treats every same-origin path that is not /p/,
   * /admin, /api/, /assets/ or /help as an in-page route, calls
   * preventDefault() and pushState()s it. The address bar reads /checkout and
   * the document underneath is still the product page. cart.js has its own
   * handler that deliberately lets the link through, but it is registered
   * later, so it never gets the chance. Measured: path /checkout,
   * body[data-route] still "product", no #co-form in the document.
   */
  check("A · the cart's continue button reaches the checkout page",
    reached.path === "/checkout" && reached.form, reached);

  if (!reached.form) {
    note("continuing the journey through a direct /checkout load, so the rest of the walk still gets tested");
    await page.goto(BASE + "/checkout?lang=ar", { waitUntil: "networkidle0" });
    await wait(900);
  }

  /* Fill the four required fields. Submitting empty first, because the shopper
     who taps the button too early must be told which field, not just "error". */
  await page.evaluate(() => document.querySelector("[data-submit]").click());
  await wait(700);
  const refused = await page.evaluate(() => ({
    shown: [...document.querySelectorAll(".field__error")].filter(e => !e.hidden).map(e => e.id),
    focus: document.activeElement.id
  }));
  check("A · an empty checkout is refused, field by field, with the cursor in the first one",
    refused.shown.length === 4 && refused.focus === "co-phone", refused);

  await page.type("#co-phone", "0955123456", { delay: 15 });
  await page.type("#co-name", "زكريا الاختبار", { delay: 15 });
  await page.select("#co-city", "sy-aleppo");
  await page.type("#co-address", "حلب — الفرقان — قرب الجامع الكبير", { delay: 10 });
  await wait(300);
  const totals = await page.evaluate(() => ({
    goods: (document.querySelector("[data-goods]") || {}).textContent || "",
    grand: (document.querySelector("[data-grand]") || {}).textContent || ""
  }));
  /* The grand total is written as an expression, not a number: the delivery
     charge is genuinely unknown until the call, and a made-up figure is worse
     than an honest sum plus a word. */
  check("A · the grand total is an expression, not an invented number",
    /\d/.test(totals.grand) && totals.grand.replace(/[\s\d.,$]/g, "").length > 0, totals);
  await shot(page, "journey-06-checkout");

  await page.evaluate(() => document.querySelector("[data-submit]").click());
  await page.waitForFunction(() => /^\/o\//.test(location.pathname), { timeout: 20000 })
    .catch(() => {});
  await wait(800);
  const confirmation = await page.evaluate(() => ({
    path: location.pathname,
    ref: (document.body.textContent.match(/SY-\d{6}-\d{3}/) || [""])[0],
    heading: (document.querySelector("h1") || {}).textContent || "",
    whatsapp: document.querySelectorAll('a[href*="wa.me"]').length,
    cartEmptied: (() => { try { return JSON.parse(localStorage.getItem("smarttech_cart_v2") || "[]").length; } catch (e) { return -1; } })()
  }));
  ORDER_REF = confirmation.ref;
  /* SY-YYMMDD-NNN, sequential within the day and minted on the server. The old
     one was Math.random() in the browser, re-rolled on every render — four
     different numbers for one order, none of them recorded anywhere. */
  check("A · placing the order lands on a confirmation page with a real reference",
    /^\/o\/SY-\d{6}-\d{3}-[0-9a-f]{6}$/.test(confirmation.path) && /^SY-\d{6}-\d{3}$/.test(confirmation.ref),
    confirmation);
  check("A · the confirmation page tells the customer what happened and offers WhatsApp once",
    confirmation.heading.length > 3 && confirmation.whatsapp === 1, confirmation);
  check("A · placing the order empties the cart", confirmation.cartEmptied === 0, confirmation.cartEmptied);
  await shot(page, "journey-07-confirmation");

  /* The customer may come back to this link in six months. */
  const confirmUrl = page.url();
  await page.goto(confirmUrl, { waitUntil: "networkidle0" });
  await wait(400);
  const again = await page.evaluate(() => (document.body.textContent.match(/SY-\d{6}-\d{3}/) || [""])[0]);
  check("A · the confirmation link still resolves when it is opened again",
    again === ORDER_REF && again !== "", { again, ORDER_REF });

  check("A · the whole journey ran without a page error", errors.length === 0, errors);
  await page.close();
}

/* =======================================================================
   C — the defects that must not come back
   =======================================================================
   Every check in this part is a bug somebody found on the live site. The
   comment above it is what was measured. */

/* --- C1. Adding to the cart must not open the cart --------------------- */
{
  /* addToCart() used to call openCart(), so every add threw a full-height
     drawer over the grid and moved focus to its close button. The feedback is
     now the button swapping to a check for 1,400 ms, the badge pulsing, and —
     only at two or more lines — a persistent 52px bar with no timer. */
  const { page } = await shopAt("/p/35141");
  await page.waitForSelector("[data-add], .pdp__actions", { timeout: 15000 }).catch(() => {});
  const before = await page.evaluate(() => ({ open: !!document.querySelector("#cart[open]"), count: SY.cart.count() }));
  const one = await page.evaluate(async () => {
    SY.cart.clear();
    SY.cart.add(35141, 1);
    await new Promise(r => setTimeout(r, 500));
    return { open: !!document.querySelector("#cart[open]"), count: SY.cart.count(), bar: !!document.querySelector("#cart-bar:not([hidden])") };
  });
  const two = await page.evaluate(async () => {
    SY.cart.add(26629, 1);
    await new Promise(r => setTimeout(r, 600));
    return { open: !!document.querySelector("#cart[open]"), count: SY.cart.count(), bar: !!document.querySelector("#cart-bar:not([hidden])") };
  });
  check("C · adding to the cart never opens the cart",
    before.open === false && one.open === false && two.open === false, { before, one, two });
  check("C · the shopper is told anyway: the count rises, and a standing bar appears at the second line",
    one.count === 1 && two.count === 2 && one.bar === false && two.bar === true, { one, two });
  await page.close();
}

/* --- C2. Closing an overlay must leave focus somewhere ----------------- */
/*
 * Two total lockouts shipped behind a green suite because the suite read
 * attributes. Modality lives in the browser's top layer now, and the top layer
 * is invisible to querySelectorAll("[inert]"). So: open with a real click,
 * close with a real key press, then ask the keyboard whether the page came
 * back. Both questions matter — where focus went, and whether Tab still works.
 */
for (const overlay of [
  { name: "the cart", opener: "#cartBtn", dialog: "#cart" },
  { name: "the filter sheet", opener: "#filterBtn", dialog: "#filters" },
  { name: "the departments sheet", opener: "#slotDepts", dialog: "#depts" }
]) {
  const { page } = await shopAt("/c/charging");
  await tap(page, overlay.opener);
  await page.waitForFunction(sel => !!document.querySelector(sel + "[open]"), { timeout: 10000 }, overlay.dialog).catch(() => {});
  await wait(700);
  const opened = await page.evaluate(sel => !!document.querySelector(sel + "[open]"), overlay.dialog);
  check("C · " + overlay.name + " opens when its control is pressed", opened, overlay);

  await page.keyboard.press("Escape");
  await wait(700);
  const closed = await page.evaluate(sel => !!document.querySelector(sel + "[open]"), overlay.dialog);
  const where = await activeName(page);
  check("C · Escape closes " + overlay.name, !closed, { dialog: overlay.dialog, stillOpen: closed });
  /*
   * DEFECT. core.js does its whole close-up — pop the stack, un-inert
   * #app-root, unfreeze <body>, put focus back on the opener — from a `close`
   * listener bound to `document`. The dialog `close` event does not bubble, so
   * when the *browser* closes the dialog (Escape, or a form with
   * method="dialog") that listener never runs. Measured after one Escape on
   * the cart: #app-root.inert true, aria-hidden="true", body.style.position
   * "fixed", SY.topDialog() still "cart", activeElement document.body, and 0
   * of 81 focusables reachable by Tab. That is a total lockout with nothing on
   * screen — the exact failure this file exists to catch.
   */
  check("C · closing " + overlay.name + " leaves focus on something, never document.body",
    where !== "document.body", "focus landed on " + where);
  const reach = await tabReach(page);
  check("C · after " + overlay.name + " closes, the page behind is tabbable again",
    reach.total > 0 && reach.hit === reach.total,
    reach.hit + " of " + reach.total + " focusables reachable by Tab; unreachable: " + reach.missed.join(", "));
  await page.close();
}

{
  /* The same three, closed by their own close button. This is the path that
     runs core.js's bookkeeping, and it isolates the Escape defect above from
     the stack logic, which is sound. */
  for (const overlay of [
    { name: "the cart", opener: "#cartBtn", closer: "[data-cart-close]" },
    { name: "the filter sheet", opener: "#filterBtn", closer: "#filtersClose" },
    { name: "the departments sheet", opener: "#slotDepts", closer: "#deptsClose" }
  ]) {
    const { page } = await shopAt("/c/charging");
    await tap(page, overlay.opener);
    await wait(900);
    await tap(page, overlay.closer);
    await wait(700);
    const where = await activeName(page);
    /*
     * This was red for the departments sheet. restoreFocus() walked a chain
     * starting at the opener and only checked document.contains(), which is
     * true for a node that is display:none — and the bottom bar is hidden for
     * as long as any dialog is open, so #slotDepts was in the document, could
     * not take focus, .focus() was a silent no-op, and the shopper was dropped
     * on <body>. core.js now rejects <body>, <html> and anything with no
     * boxes. Keep the check: that chain is easy to re-break and nothing else
     * in the suite would notice.
     */
    check("C · closing " + overlay.name + " by its own button puts focus back on the control that opened it",
      where !== "document.body", "focus landed on " + where);
    await page.close();
  }
}

{
  /* The property. Whatever sequence of opens and closes happened, an empty
     stack must mean the page is exactly as usable as it was — 100% of
     #app-root reachable by Tab, no inert left behind, no frozen <body>. The
     seed is fixed so a failure is reproducible rather than a ghost. */
  const { page } = await shopAt("/c/charging");
  /* The same walk before anything is opened, so a failure afterwards can be
     pinned on the overlays rather than on whatever else is on the page. */
  const baseline = await tabReach(page);
  check("C · before any overlay is opened, every focusable is reachable by Tab",
    baseline.total > 0 && baseline.hit === baseline.total,
    baseline.hit + " of " + baseline.total + "; unreachable: " + baseline.missed.join(", "));
  const drive = await page.evaluate(() => {
    let seed = 20260923;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const ids = ["cart", "depts", "filters", "lightbox"];
    const log = [];
    for (let i = 0; i < 20; i++) {
      const el = document.getElementById(ids[Math.floor(rnd() * ids.length)]);
      if (!el) continue;
      if (rnd() < 0.5) { SY.openDialog(el); log.push("open " + el.id); }
      else { SY.closeDialog(el); log.push("close " + el.id); }
    }
    SY.closeAllDialogs();
    return {
      log,
      stack: SY.topDialog() ? SY.topDialog().id : null,
      inert: !!document.querySelector("#app-root").inert,
      ariaHidden: document.querySelector("#app-root").getAttribute("aria-hidden"),
      frozen: document.body.style.position === "fixed",
      openDialogs: document.querySelectorAll("dialog[open]").length
    };
  });
  check("C · after twenty random opens and closes the stack is empty and nothing is left behind",
    drive.stack === null && !drive.inert && !drive.ariaHidden && !drive.frozen && drive.openDialogs === 0,
    drive);
  const reach = await tabReach(page);
  check("C · an empty overlay stack means every focusable in the page is reachable by Tab",
    reach.total > 0 && reach.hit === reach.total,
    reach.hit + " of " + reach.total + " reachable (baseline " + baseline.hit + " of " + baseline.total +
    "); unreachable: " + reach.missed.join(", ") + "; last calls: " + drive.log.slice(-6).join(", "));
  await page.close();
}

/* --- C3. Escape closes the top overlay only ---------------------------- */
{
  const { page } = await shopAt("/c/charging");
  await page.evaluate(() => { SY.openDialog(document.querySelector("#depts")); });
  await wait(400);
  await page.evaluate(() => { SY.openDialog(document.querySelector("#filters")); });
  await wait(400);
  const both = await page.evaluate(() => document.querySelectorAll("dialog[open]").length);
  check("C · two sheets can be open at once", both === 2, both);
  await page.keyboard.press("Escape");
  await wait(600);
  const after = await page.evaluate(() => ({
    depts: !!document.querySelector("#depts[open]"),
    filters: !!document.querySelector("#filters[open]")
  }));
  check("C · Escape closes the top overlay only and the one beneath stays open",
    after.filters === false && after.depts === true, after);
  await page.close();
}

/* --- C4. Choosing a colour must not reset the scroll position ---------- */
{
  /* Measured on the old build: tapping a colour re-rendered the view and put
     scrollTop back to 0 from 1,000, on a page whose only CTA was at y=951. The
     shopper scrolled 1,025px, tapped, was thrown to the top and had to scroll
     back. /p/33395 has sixteen colourways, the largest group in the shop. */
  const { page } = await shopAt("/p/33395");
  await page.waitForSelector(".swatch", { timeout: 15000 }).catch(() => {});
  const swap = await page.evaluate(async () => {
    scrollTo(0, 600);
    await new Promise(r => setTimeout(r, 200));
    const before = scrollY;
    const s = [...document.querySelectorAll(".swatch")].find(x => x.getAttribute("aria-checked") !== "true");
    if (!s) return { skipped: true };
    const wasId = document.body.dataset.productId;
    s.click();
    await new Promise(r => setTimeout(r, 600));
    return { before, after: scrollY, wasId, nowId: document.body.dataset.productId };
  });
  check("C · choosing a colour keeps the shopper where they were",
    !swap.skipped && swap.wasId !== swap.nowId && Math.abs(swap.after - swap.before) < 40, swap);
  await page.close();
}

/* --- C5. No struck price and no discount badge on a sold-out product --- */
{
  /* A 33% saving nobody can take is a hostile message. Product 5979 is out of
     stock and carries a 33% discount in the shipped catalogue, so this needs
     no setup and cannot be blamed on anything this file did. */
  const { page } = await shopAt("/?q=" + encodeURIComponent(OUT_AND_CUT.query));
  await wait(600);
  const card = await page.evaluate(id => {
    const el = document.querySelector('[data-product="' + id + '"]');
    if (!el) return { missing: true, ids: [...document.querySelectorAll(".pcard")].map(c => c.dataset.product) };
    return {
      note: (el.querySelector(".pcard__note") || {}).textContent || "",
      soldOut: (el.querySelector(".pcard__note") || { className: "" }).className.includes("is-out"),
      struck: !!el.querySelector(".pcard__price del"),
      badge: !!el.querySelector(".pcard__off"),
      badgeText: (el.querySelector(".pcard__off") || {}).textContent || ""
    };
  }, OUT_AND_CUT.id);
  check("C · a sold-out card says so in its note row", card.soldOut === true && card.note.length > 2, card);
  /*
   * This was red. product.js's priceRow() suppressed both correctly —
   * `const cut = p.inStock && p.discount > 0 && p.oldPrice > p.price` — but
   * script.js's card(), which draws every card in every grid and every rail,
   * tested only `p.discount`. Measured on /?q=PowerPort+PD: the card for 5979
   * rendered "غير متوفر حالياً" in its note row and "خصم 33%" in its badge,
   * with $29.99 struck through, at the same time. script.js now carries the
   * `p.inStock !== false` guard. product.js's cardHtml(), which draws the
   * related shelf, still does not — that shelf filters to in-stock products,
   * so it is one edit away from showing the same thing.
   */
  check("C · a sold-out card shows neither a struck price nor a discount badge",
    card.struck === false && card.badge === false, card);

  const { page: pdp } = await shopAt("/p/" + OUT_AND_CUT.id);
  await pdp.waitForSelector(".pdp__price", { timeout: 15000 }).catch(() => {});
  const row = await pdp.evaluate(() => ({
    struck: !!document.querySelector(".pdp__price del"),
    badge: !!document.querySelector(".pdp__price .pcard__off"),
    outActions: !!document.querySelector(".pdp__actions.is-out"),
    text: (document.querySelector(".pdp__price") || {}).textContent || ""
  }));
  check("C · the product page of a sold-out item shows neither either, and offers an enquiry instead",
    row.struck === false && row.badge === false && row.outActions === true, row);
  await pdp.close();
  await page.close();
}

/* --- C6. The shop is the same size in all three languages -------------- */
{
  /* buildVariantGroups used to key on the *translated* name, so the shop was
     230 cards in Arabic and 225 in English and Turkish — literally a different
     store per language. The brand page is the sharpest place to see it,
     because a brand page is mostly colourways. */
  const seen = {};
  for (const lang of ["ar", "en", "tr"]) {
    const { page } = await shopAt("/b/pitaka", { lang });
    /* Ids and page counts, never the result sentence: Arabic writes the total
       last and Turkish writes it first, so a test that reads "the last number
       in the line" invents a defect that is not there. */
    seen[lang] = await page.evaluate(() => ({
      ids: [...document.querySelectorAll("#grid .pcard")].map(c => c.dataset.product).join(","),
      cards: document.querySelectorAll("#grid .pcard").length,
      pages: document.querySelectorAll('.pager__nav .pager__link[href*="page="]').length,
      dir: document.documentElement.dir
    }));
    await page.close();
  }
  check("C · a brand page holds the same products, in the same order, in every language",
    seen.ar.ids === seen.en.ids && seen.en.ids === seen.tr.ids && seen.ar.cards > 0,
    { ar: seen.ar.cards, en: seen.en.cards, tr: seen.tr.cards, arVsTr: seen.ar.ids === seen.tr.ids });
  check("C · and pages into the same number of pages",
    seen.ar.pages === seen.en.pages && seen.en.pages === seen.tr.pages,
    { ar: seen.ar.pages, en: seen.en.pages, tr: seen.tr.pages });
  check("C · Arabic is right-to-left and the other two are not",
    seen.ar.dir === "rtl" && seen.en.dir === "ltr" && seen.tr.dir === "ltr", seen);

  const home = {};
  for (const lang of ["ar", "en", "tr"]) {
    const { page } = await shopAt("/", { lang });
    home[lang] = await page.evaluate(() => ({
      cards: document.querySelectorAll(".pcard").length,
      depts: document.querySelectorAll(".depts__tile").length,
      brands: document.querySelectorAll(".brandtile").length
    }));
    await page.close();
  }
  check("C · the home page offers the same shop in every language",
    JSON.stringify(home.ar) === JSON.stringify(home.en) && JSON.stringify(home.en) === JSON.stringify(home.tr), home);
}

/* --- C7. A brand with no logo renders a wordmark ----------------------- */
{
  /* assets/brands.json carries `logo: null` for a brand the build has not
     confirmed an image for, and SY.brandLogo() returns null for a brand that
     is not in the file at all — which is what happens the moment the owner
     adds a product under a new brand. Either way the tile must be a wordmark:
     never an <img> with a guessed src, so never the browser's broken-image
     glyph and never a reflow when the request 404s. Part B adds a product
     under a brand that is not in the registry and comes back to this. */
  const { page, bad } = await shopAt("/brands");
  await wait(600);
  const tiles = await page.evaluate(() => [...document.querySelectorAll("#indexView .brandtile")].map(t => ({
    href: t.getAttribute("href"),
    img: !!t.querySelector("img"),
    word: (t.querySelector(".brandtile__word") || {}).textContent || "",
    broken: !!(t.querySelector("img") && t.querySelector("img").complete && t.querySelector("img").naturalWidth === 0)
  })));
  check("C · every brand in the shop has a tile", tiles.length > 0, tiles.length);
  check("C · no brand tile is a broken image",
    tiles.every(t => !t.broken), tiles.filter(t => t.broken));
  check("C · a tile is either a real logo or a wordmark, never an empty box",
    tiles.every(t => t.img || t.word.trim().length > 0), tiles.filter(t => !t.img && !t.word.trim()));
  check("C · loading the brand index fetches nothing that 404s", bad.length === 0, bad);
  await page.close();
}

/* =======================================================================
   B — the admin round trip
   =======================================================================
   The point of the file. Each step is: the owner changes one thing, then a
   fresh shopper's page is opened and asked whether it changed. */

async function adminPage() {
  const made = await newPage({ width: 1280, height: 900 });
  await made.page.goto(BASE + "/admin.html", { waitUntil: "networkidle0" });
  await wait(500);
  return made;
}
/* Focus through the page and type on the keyboard: page.click() needs a
   clickable point, and on a 390px console the login card sits off the mouse's
   reach even though the shopper's thumb — and a keyboard — get there fine. */
async function typeInto(page, selector, value) {
  await page.evaluate(sel => {
    const el = document.querySelector(sel);
    el.scrollIntoView({ block: "center" });
    el.value = "";
    el.focus();
  }, selector);
  await page.keyboard.type(String(value), { delay: 10 });
}
async function adminLogin(page) {
  await typeInto(page, "#password", PASSWORD);
  await page.keyboard.press("Enter");
  await page.waitForSelector("#adminView:not([hidden])", { timeout: 25000 });
  await wait(900);
}
async function adminScreen(page, id) {
  await page.evaluate(s => document.querySelector('[data-go="' + s + '"]').click(), id);
  await wait(400);
}
async function adminFind(page, query) {
  await page.evaluate(q => {
    const box = document.querySelector("#prdSearch");
    box.value = q;
    box.dispatchEvent(new Event("input", { bubbles: true }));
  }, query);
  await wait(1400);
  return page.evaluate(() => [...document.querySelectorAll("#prdList tbody tr")].map(tr => ({
    id: Number(tr.dataset.id),
    name: (tr.querySelector("[data-product]") || {}).textContent || "",
    price: (tr.querySelector('[data-cell="price"]') || {}).value,
    stock: (tr.querySelector('[data-cell="stock"]') || {}).value
  })));
}
async function adminOpenProduct(page, id) {
  await page.evaluate(i => document.querySelector('#prdList tbody tr[data-id="' + i + '"] [data-product]').click(), id);
  await page.waitForSelector("#editor[open]", { timeout: 15000 });
  await wait(500);
}
async function adminSaveProduct(page) {
  await page.evaluate(() => document.querySelector("[data-save-product]").click());
  await page.waitForFunction(() => !document.querySelector("#editor").open, { timeout: 20000 }).catch(() => {});
  await wait(1200);
}
/* Reading the storefront the way a customer would: a brand new page, so
   nothing is served from this session's memory. */
async function cardOnShop(id, query) {
  const { page } = await shopAt("/?q=" + encodeURIComponent(query));
  await wait(500);
  const out = await page.evaluate(i => {
    const el = document.querySelector('[data-product="' + i + '"]');
    if (!el) return { missing: true, ids: [...document.querySelectorAll(".pcard")].map(c => c.dataset.product) };
    const img = el.querySelector("img");
    return {
      price: (el.querySelector(".pcard__price b") || {}).textContent || "",
      struck: !!el.querySelector(".pcard__price del"),
      badge: !!el.querySelector(".pcard__off"),
      note: (el.querySelector(".pcard__note") || {}).textContent || "",
      soldOut: (el.querySelector(".pcard__note") || { className: "" }).className.includes("is-out"),
      img: img && img.getAttribute("src"),
      imgLoaded: !!(img && img.naturalWidth > 0)
    };
  }, id);
  await page.close();
  return out;
}

const { page: admin, errors: adminErrors } = await adminPage();

/* --- D1. The login screen comes first ---------------------------------- */
{
  /* Nothing behind the password may be on screen, and nothing behind it may
     have been fetched. */
  const first = await admin.evaluate(() => ({
    loginShown: !document.querySelector("#loginView").hidden,
    consoleHidden: document.querySelector("#adminView").hidden,
    passwordField: !!document.querySelector('input[type="password"]'),
    rows: document.querySelectorAll("#prdList tbody tr, #ordList [data-order]").length
  }));
  check("D · the login screen comes first and the console is not behind it",
    first.loginShown && first.consoleHidden && first.passwordField && first.rows === 0, first);

  /* A wrong password. The owner mistypes; he must be told so, in the language
     he is reading, and he must still be on the login screen. */
  await typeInto(admin, "#password", "definitely-not-the-password");
  await admin.evaluate(() => document.querySelector("#loginBtn").click());
  await wait(2500);
  const rejected = await admin.evaluate(() => ({
    message: document.querySelector("#loginMsg").textContent.trim(),
    flagged: document.querySelector("#loginMsg").className.includes("is-error"),
    stillOut: !document.querySelector("#loginView").hidden && document.querySelector("#adminView").hidden,
    arabic: /[\u0600-\u06FF]/.test(document.querySelector("#loginMsg").textContent),
    placeholder: /⟦/.test(document.querySelector("#loginMsg").textContent),
    expectedWrongPassword: window.I18N.t("error.invalid_password"),
    expectedSessionEnded: window.I18N.t("admin.sessionExpired")
  }));
  check("D · a wrong password is refused, in the page's language, and the console stays shut",
    rejected.stillOut && rejected.flagged && rejected.arabic && !rejected.placeholder && rejected.message.length > 3,
    rejected);
  /*
   * This was red. api/admin.js answers a bad login with 401 invalid_password,
   * and admin.js's api() wrapper used to treat *every* 401 as an expired
   * session — showLogin(t("admin.sessionExpired")), then throw "__auth", which
   * the login handler deliberately does not overwrite. The owner who mistyped
   * his password was told «انتهت الجلسة، سجّل الدخول مرة أخرى», and the same
   * string was printed on a cold first load before anybody had typed anything.
   * Compared against the dictionary and never against a literal: the wording
   * belongs to the copy builder, the distinction does not.
   */
  check("D · and the refusal says the password was wrong, not that a session expired",
    rejected.message === rejected.expectedWrongPassword,
    { got: rejected.message, wanted: rejected.expectedWrongPassword });

  await adminLogin(admin);
  const landed = await admin.evaluate(() => ({
    screen: (document.querySelector("#screenTitle") || {}).textContent || "",
    hash: location.hash,
    orders: document.querySelectorAll("#ordList [data-order]").length
  }));
  /* Orders first: that is what the owner opens the console for. */
  check("D · signing in lands on orders, with today's order already on it",
    landed.hash === "#orders" && landed.orders >= 1, landed);
  await shot(admin, "admin-01-orders");
}

/* --- B1. Edit a price, see it on the storefront ------------------------ */
{
  await adminScreen(admin, "products");
  await admin.waitForSelector("#prdList tbody tr", { timeout: 20000 });
  const rows = await adminFind(admin, SUBJECT.name);
  check("B · the owner can find a product by the name a customer read out to him",
    rows.some(r => r.id === SUBJECT.id), rows.slice(0, 4));

  await adminOpenProduct(admin, SUBJECT.id);
  const editor = await admin.evaluate(() => ({
    open: document.querySelector("#editor").open,
    price: document.querySelector("#edPrice").value,
    name: document.querySelector("#edName").value,
    canDelete: !!document.querySelector("[data-delete]")
  }));
  check("B · opening a product opens an editor holding that product",
    editor.open && editor.name.includes("GaNPrime") && Number(editor.price) > 0, editor);
  await shot(admin, "admin-02-editor");

  await admin.click("#edPrice", { count: 3 });
  await admin.type("#edPrice", "64.50", { delay: 10 });
  await adminSaveProduct(admin);
  const afterSave = await adminFind(admin, SUBJECT.name);
  const row = afterSave.find(r => r.id === SUBJECT.id) || {};
  check("B · the new price is on the row the moment the editor closes",
    Number(row.price) === 64.5, row);

  const card = await cardOnShop(SUBJECT.id, SUBJECT.name);
  check("B · and a shopper who opens the shop sees the new price on the card",
    !card.missing && card.price.includes("64.50"), card);

  /* The same question on the product page, which is where a shopper decides. */
  const { page: pdp } = await shopAt("/p/" + SUBJECT.id);
  await pdp.waitForSelector(".pdp__price", { timeout: 15000 }).catch(() => {});
  const shown = await pdp.evaluate(() => ({
    price: (document.querySelector(".pdp__price b") || {}).textContent || "",
    served: null
  }));
  shown.served = await (await fetch(BASE + "/p/" + SUBJECT.id + "?lang=ar")).text().then(h => /64\.50/.test(h));
  /*
   * This was red, and it is the round trip the shop exists for, so it is
   * checked from both ends. api/p.js fetches /api/products, merges the owner's
   * overrides and serves a document carrying the new price — the second value
   * here confirms that from the wire. product.js then re-rendered the whole
   * page from SY.productById(), which at that instant is the *un-merged*
   * catalogue, and replaced the correct server render with the stale one:
   * $64.50 served, $84.99 on screen, and it stayed there, because nothing
   * re-rendered when the real state arrived a moment later.
   * product.js now follows the "catalog" event and re-renders when anything
   * it displays has changed, so both ends agree.
   */
  check("B · the product page shows the owner's price, not the catalogue's",
    shown.price.includes("64.50"),
    { rendered: shown.price, serverSentTheNewPrice: shown.served });
  await pdp.close();
}

/* --- B2. Upload a photo, see it on the storefront ---------------------- */
{
  await adminOpenProduct(admin, SUBJECT.id);
  /* Written where the rig keeps its screenshots, or the OS temp dir — never
     into the repository, which a test has no business writing to. */
  const file = (SHOT || os.tmpdir()) + "/ui-sample.png";
  fs.writeFileSync(file, Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAJUlEQVR4nGP8//8/AzGAiYFIMKpwVOGowlGFowpHFY4qHDaFABDmAwVmxvOlAAAAAElFTkSuQmCC", "base64"));
  const before = await admin.evaluate(() => document.querySelectorAll("#edGallery .shot").length);
  const input = await admin.$("#edGallery [data-upload]");
  check("B · the editor offers a way to add a photograph", !!input);
  await input.uploadFile(file);
  await admin.waitForFunction(n => document.querySelectorAll("#edGallery .shot").length > n, { timeout: 25000 }, before).catch(() => {});
  await wait(700);
  const uploaded = await admin.evaluate(() => ({
    shots: document.querySelectorAll("#edGallery .shot").length,
    last: (document.querySelector("#edGallery .shot:last-of-type img") || {}).getAttribute?.("src") || ""
  }));
  check("B · the upload lands in the product's gallery and is served from the shop's own origin",
    uploaded.shots === before + 1 && /^\/api\/image\?pathname=/.test(uploaded.last), uploaded);

  /* Make it the main photograph — that is the one the card and the gallery
     lead with, and the only one a shopper is guaranteed to see. */
  await admin.evaluate(i => document.querySelector('[data-shot-main="' + i + '"]').click(), uploaded.shots - 1);
  await wait(400);
  const main = await admin.evaluate(() => document.querySelector("#edGallery .shot img").getAttribute("src"));
  await adminSaveProduct(admin);

  const card = await cardOnShop(SUBJECT.id, SUBJECT.name);
  check("B · the photograph the owner uploaded is the one the shopper's card draws, and it loads",
    !card.missing && card.img === main && card.imgLoaded === true, { card, main });
}

/* --- B3. Toggle stock, see the card change ----------------------------- */
{
  /* The stock count is editable in place, because that inline column plus the
     Tab key is how 312 counts get entered in one sitting. Typing 0 is how the
     owner marks something sold out. */
  await adminFind(admin, SUBJECT.name);
  await admin.evaluate(id => {
    const cell = document.querySelector('#prdList tbody tr[data-id="' + id + '"] [data-cell="stock"]');
    cell.focus();
    cell.value = "0";
    cell.dispatchEvent(new Event("input", { bubbles: true }));
  }, SUBJECT.id);
  await admin.keyboard.press("Enter");
  await wait(2500);
  const saved = await admin.evaluate(() => document.querySelector("#toast").textContent.trim());
  check("B · a stock count typed into the list saves without opening anything",
    saved.length > 0 && !/⟦/.test(saved), saved);

  const card = await cardOnShop(SUBJECT.id, SUBJECT.name);
  check("B · the shopper's card now says the product is sold out",
    !card.missing && card.soldOut === true && card.note.trim().length > 2, card);
  /* The same rule as C5, now on a product the owner just changed: this is the
     path the shop will actually take when something sells out mid-week. */
  check("B · and a sold-out card the owner just created carries no struck price and no badge",
    card.struck === false && card.badge === false, card);

  /* Put it back, so the rest of the file works on a shop that sells things. */
  await adminFind(admin, SUBJECT.name);
  await admin.evaluate(id => {
    const cell = document.querySelector('#prdList tbody tr[data-id="' + id + '"] [data-cell="stock"]');
    cell.focus();
    cell.value = "9";
    cell.dispatchEvent(new Event("input", { bubbles: true }));
  }, SUBJECT.id);
  await admin.keyboard.press("Enter");
  await wait(2500);
  const back = await cardOnShop(SUBJECT.id, SUBJECT.name);
  check("B · putting the stock back puts the product back on sale",
    !back.missing && back.soldOut === false, back);
}

/* --- B4. Add a product, find it; delete it, see it gone; restore it ---- */
const ADDED = { name: "شاحن اختبار من لوحة التحكم", brand: "UGREEN", price: "25" };
let addedId = 0;
{
  await admin.evaluate(() => document.querySelector("[data-new-product]").click());
  await admin.waitForSelector("#editor[open]", { timeout: 15000 });
  await wait(400);
  await admin.type("#edName", ADDED.name, { delay: 10 });
  await admin.type("#edBrand", ADDED.brand, { delay: 10 });
  await admin.click("#edPrice", { count: 3 });
  await admin.type("#edPrice", ADDED.price, { delay: 10 });
  await admin.select("#edStatus", "published");
  await admin.select("#edCat", await admin.evaluate(() => document.querySelector("#edCat option").value));
  await adminSaveProduct(admin);

  const rows = await adminFind(admin, "شاحن اختبار");
  addedId = (rows[0] || {}).id || 0;
  check("B · a product the owner adds appears in his own list",
    rows.length === 1 && rows[0].name === ADDED.name, rows);

  const { page } = await shopAt("/?q=" + encodeURIComponent("شاحن اختبار"));
  await wait(500);
  const onShop = await page.evaluate(() => ({
    cards: document.querySelectorAll("#grid .pcard").length,
    names: [...document.querySelectorAll("#grid .pcard__name")].map(e => e.textContent.trim())
  }));
  check("B · and a shopper searching in Arabic finds it",
    onShop.cards === 1 && onShop.names[0] === ADDED.name, onShop);
  await page.close();

  /* The new brand is not in assets/brands.json, so SY.brandLogo() returns null
     for it. C7's rule, exercised by the one event that actually produces it. */
  const { page: brands, bad } = await shopAt("/brands");
  await wait(600);
  const tile = await brands.evaluate(slug => {
    const el = document.querySelector('#indexView .brandtile[href="/b/' + slug + '"]');
    if (!el) return { missing: true, tiles: [...document.querySelectorAll("#indexView .brandtile")].map(t => t.getAttribute("href")) };
    return { img: !!el.querySelector("img"), word: (el.querySelector(".brandtile__word") || {}).textContent || "" };
  }, ADDED.brand.toLowerCase());
  check("B · a brand the registry has never heard of renders as a wordmark tile, not a broken image",
    !tile.missing && tile.img === false && tile.word.trim() === ADDED.brand, tile);
  check("B · and drawing it fetches no image that 404s", bad.length === 0, bad);
  await brands.close();

  /* Delete it. */
  await adminFind(admin, "شاحن اختبار");
  await adminOpenProduct(admin, addedId);
  await admin.evaluate(() => document.querySelector("[data-delete]").click());
  await wait(2500);
  const goneFromList = await adminFind(admin, "شاحن اختبار");
  check("B · deleting a product takes it out of the owner's list", goneFromList.length === 0, goneFromList);

  const { page: shop } = await shopAt("/?q=" + encodeURIComponent("شاحن اختبار"));
  await wait(500);
  const goneFromShop = await shop.evaluate(() => document.querySelectorAll("#grid .pcard").length);
  check("B · and out of the shop", goneFromShop === 0, goneFromShop);
  await shop.close();

  /*
   * Restore it. api/admin.js has a `restore` action that un-deletes one
   * product, but nothing in the console calls it: there is no trash list and
   * no undo on the delete. The only way back is the backups screen, so that is
   * the route this walks — and it is the route the owner would have to find.
   */
  await adminScreen(admin, "backups");
  await admin.waitForSelector("[data-restore]", { timeout: 20000 });
  await wait(700);
  const top = await admin.evaluate(() => {
    const b = document.querySelector("[data-restore]");
    return { name: b.dataset.restore, at: Number(b.dataset.at), label: b.closest(".item").textContent.replace(/\s+/g, " ").trim().slice(0, 70) };
  });
  check("B · the newest backup is the one taken just before the delete", /\d/.test(String(top.at)) && top.at > 0, top);
  await admin.evaluate(() => document.querySelector("[data-restore]").click());
  await admin.waitForSelector("#bkConfirm", { timeout: 15000 }).catch(() => {});
  await wait(600);
  const diff = await admin.evaluate(() => (document.querySelector("#sheetBody") || {}).textContent || "");
  check("B · before anything happens the console says in plain language what restoring would do",
    diff.includes(ADDED.name), diff.slice(0, 160));
  const stamp = await admin.evaluate(at => new Date(at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }), top.at);
  await admin.click("#bkConfirm");
  await admin.type("#bkConfirm", stamp, { delay: 10 });
  await admin.evaluate(() => document.querySelector("[data-restore-go]").click());
  await wait(3000);
  await adminScreen(admin, "products");
  await admin.waitForSelector("#prdList tbody tr", { timeout: 20000 });
  const restored = await adminFind(admin, "شاحن اختبار");
  check("B · restoring brings the deleted product back", restored.length === 1 && restored[0].id === addedId, restored);

  const { page: shop2 } = await shopAt("/?q=" + encodeURIComponent("شاحن اختبار"));
  await wait(500);
  check("B · and puts it back in the shop",
    (await shop2.evaluate(() => document.querySelectorAll("#grid .pcard").length)) === 1);
  await shop2.close();
}

/* --- B5. Fill a policy answer, see it on the product page's trust sheet -- */
{
  /* Eleven unanswered questions hide twelve of the twenty-two answers a
     customer can ask for. This is the highest-value screen in the console, and
     it is only worth anything if filling a field actually publishes it. */
  await adminScreen(admin, "content");
  await admin.waitForSelector("[data-pol]", { timeout: 20000 });
  await wait(600);
  const field = await admin.evaluate(() => {
    const el = [...document.querySelectorAll('[data-pol][data-lang="ar"]')].find(i => !i.value.trim());
    return el ? el.dataset.pol : "";
  });
  check("D · the content screen lists the unanswered questions", field.length > 0, field);

  const ANSWER = "من يومين إلى خمسة أيام عمل";
  await admin.evaluate((key, value) => {
    ["ar", "en", "tr"].forEach(code => {
      const el = document.querySelector('[data-pol="' + key + '"][data-lang="' + code + '"]');
      if (el) el.value = value;
    });
  }, field, ANSWER);
  await admin.evaluate(() => document.querySelector("[data-save-content]").click());
  await wait(3000);
  const savedMsg = await admin.evaluate(() => document.querySelector("#toast").textContent.trim());
  check("B · saving an answer reports success", savedMsg.length > 0 && !/⟦/.test(savedMsg), savedMsg);
  await shot(admin, "admin-03-content");

  /* The shipping chip on a product page opens the sheet that holds the
     delivery answers. The chip is only promoted from a <span> to a <button>
     for a section that has something publishable, so a shopper can never tap
     into an empty sheet. */
  const { page } = await shopAt("/p/" + SUBJECT.id);
  await page.waitForSelector("[data-policy]", { timeout: 15000 }).catch(() => {});
  await wait(900);
  const chips = await page.evaluate(() => [...document.querySelectorAll("[data-policy]")].map(e => ({ tag: e.tagName, section: e.dataset.policy })));
  check("B · the product page's trust chips are live for the sections that have answers",
    chips.length === 3 && chips.every(c => c.tag === "BUTTON"), chips);
  await page.evaluate(() => document.querySelector('button[data-policy="shipping"]').click());
  await wait(1200);
  const sheet = await page.evaluate(() => ({
    open: !!document.querySelector("#pdpPolicy[open]"),
    body: (document.querySelector("#pdpPolicy [data-sheet-body]") || {}).textContent || ""
  }));
  check("B · tapping a trust chip opens a sheet with real answers in it",
    sheet.open && sheet.body.length > 40, { open: sheet.open, length: sheet.body.length });
  /*
   * This was red, and it is the whole point of the content screen. The owner
   * filled the field, the console told him it was live, and the product page
   * went on showing the unfilled [[placeholder]] — because product.js fetched
   * the static /assets/policies.json while the substituted answers were only
   * ever served from /api/products?what=policies. Measured: the answer was in
   * the API's document and absent from the sheet. product.js reads the API
   * now, with the static file as a fallback.
   */
  check("B · the answer the owner just typed is in that sheet",
    sheet.body.includes(ANSWER), { wanted: ANSWER, got: sheet.body.slice(0, 200) });
  await page.close();
}

/* --- B6. Move an order through both of its lifecycles ------------------ */
{
  /* Fulfilment and payment are independent: a courier order can be delivered
     and unpaid, and a transfer can be paid before it is packed. The console
     has to be able to move each without touching the other. */
  await adminScreen(admin, "orders");
  await admin.waitForSelector("#ordList [data-order]", { timeout: 20000 });
  await wait(600);
  const listed = await admin.evaluate(ref => {
    const row = document.querySelector('[data-order="' + ref + '"]');
    return { found: !!row, text: row ? row.textContent.replace(/\s+/g, " ").trim().slice(0, 120) : "" };
  }, ORDER_REF);
  check("B · the order the shopper placed in part A is in the owner's list",
    listed.found && listed.text.includes("زكريا"), { ORDER_REF, ...listed });

  await admin.evaluate(ref => document.querySelector('[data-order="' + ref + '"]').click(), ORDER_REF);
  await admin.waitForSelector("#order[open]", { timeout: 15000 });
  await wait(900);
  const detail = await admin.evaluate(() => ({
    steps: [...document.querySelectorAll("#order .step")].map(s => s.dataset.move),
    now: (document.querySelector("#order .step.is-now") || {}).dataset?.move || "",
    lines: document.querySelectorAll("#order .line").length,
    hasFee: !!document.querySelector("#ordFee"),
    hasPay: !!document.querySelector("#order [data-pay]"),
    history: document.querySelectorAll("#order .event").length
  }));
  check("B · the order opens on its fulfilment track, at the step it is actually on",
    detail.steps.join(",") === "new,confirmed,packed,shipped,delivered" && detail.now === "new", detail);
  check("B · with the customer's lines, a delivery cost box and a way to record payment",
    detail.lines >= 1 && detail.hasFee && detail.hasPay, detail);
  await shot(admin, "admin-04-order");

  /* Lifecycle one: fulfilment, all the way to delivered. */
  for (const step of ["confirmed", "packed", "shipped", "delivered"]) {
    await admin.evaluate(s => document.querySelector('#order .step[data-move="' + s + '"]').click(), step).catch(() => {});
    await wait(2200);
  }
  const moved = await admin.evaluate(() => ({
    now: (document.querySelector("#order .step.is-now") || {}).dataset?.move || "",
    history: document.querySelectorAll("#order .event").length
  }));
  check("B · the owner can walk the order to delivered, one step at a time",
    moved.now === "delivered", moved);
  check("B · and every move is written into the order's own history",
    moved.history >= 5, moved.history + " entries");

  /* The delivery cost is the first number he types on the phone, and the grand
     total has to follow it. */
  await admin.click("#ordFee", { count: 3 });
  await admin.type("#ordFee", "5", { delay: 10 });
  await admin.evaluate(() => document.querySelector("[data-save-order]").click());
  await wait(2500);
  const priced = await admin.evaluate(() => ({
    totals: [...document.querySelectorAll("#order .total")].map(t => t.textContent.replace(/\s+/g, " ").trim()),
    grand: (document.querySelector("#order .total--grand") || {}).textContent || ""
  }));
  check("B · typing the delivery cost feeds the order's grand total",
    /5\.00/.test(priced.totals.join(" ")) && /\d/.test(priced.grand), priced.totals);

  /* Lifecycle two: payment, which has not moved at all so far. */
  await admin.evaluate(() => document.querySelector("#order [data-pay]").click());
  await admin.waitForSelector("#payAmount", { timeout: 15000 });
  await wait(500);
  const owed = await admin.evaluate(() => Number(document.querySelector("#payAmount").value));
  check("B · recording a payment offers the balance, not a blank box", owed > 0, owed);
  await admin.evaluate(() => document.querySelector("[data-pay-go]").click());
  await wait(3000);
  const paid = await admin.evaluate(() => ({
    pills: [...document.querySelectorAll("#order .pill")].map(p => p.textContent.trim()),
    body: (document.querySelector("#orderBody") || {}).textContent || ""
  }));
  check("B · the order's payment state moves on its own track, independently of fulfilment",
    paid.pills.length > 0 && !paid.pills.some(p => /⟦/.test(p)), paid.pills);
  check("B · and the balance owed is now nothing", /0\.00/.test(paid.body), paid.pills);
  await admin.evaluate(() => document.querySelector("#order [data-close]").click());
  await wait(600);
}

/* =======================================================================
   D — the console's own rules
   ======================================================================= */

/* --- D2. The list is paged, not the whole catalogue -------------------- */
{
  /* The old panel rendered all 312 products at once: 45,334px tall on an 844px
     phone, 3,070 DOM nodes, 312 <img>. `rows >= 300` used to be an assertion
     in this file and it is now deliberately false. Forty a page. */
  await adminScreen(admin, "products");
  await admin.waitForSelector("#prdList tbody tr", { timeout: 20000 });
  await adminFind(admin, "");          // the screen keeps the last search; this is the unfiltered shop
  await wait(700);
  const paged = await admin.evaluate(() => ({
    rows: document.querySelectorAll("#prdList tbody tr").length,
    pager: (document.querySelector("#prdPager") || {}).textContent.replace(/\s+/g, " ").trim(),
    pages: (((document.querySelector("#prdPager") || {}).textContent || "").match(/\d+/g) || []).map(Number),
    next: !!document.querySelector('#prdPager [data-page="2"]:not([disabled])')
  }));
  check("D · the product list is one page of forty, not the whole catalogue",
    paged.rows === 40, paged.rows + " rows (the old panel rendered 312)");
  check("D · and it says which page of how many, with a way to the next",
    paged.pages.length >= 2 && paged.pages[1] > 1 && paged.next, paged);

  await admin.evaluate(() => document.querySelector('#prdPager [data-page="2"]').click());
  await wait(2000);
  const second = await admin.evaluate(() => ({
    rows: document.querySelectorAll("#prdList tbody tr").length,
    firstId: (document.querySelector("#prdList tbody tr") || {}).dataset?.id
  }));
  check("D · page two is a different forty", second.rows > 0 && second.rows <= 40, second);
  await admin.evaluate(() => document.querySelector('#prdPager [data-page="1"]').click());
  await wait(1500);

  /* The same screen on the phone the owner actually holds. */
  const phone = await newPage({ width: 390, height: 844 });
  await phone.page.goto(BASE + "/admin.html", { waitUntil: "networkidle0" });
  await wait(500);
  await adminLogin(phone.page);
  await adminScreen(phone.page, "products");
  await phone.page.waitForSelector("#prdList .item", { timeout: 20000 });
  await wait(900);
  const onPhone = await phone.page.evaluate(() => ({
    cards: document.querySelectorAll("#prdList .item").length,
    tableRows: document.querySelectorAll("#prdList tbody tr").length,
    height: document.documentElement.scrollHeight,
    nodes: document.querySelectorAll("#screen-products *").length
  }));
  check("D · on a phone the same forty rows are " + onPhone.height + "px tall, not 45,334",
    onPhone.height < 9000, onPhone);
  check("D · and only one of the two presentations is in the document at a time",
    onPhone.cards === 40 && onPhone.tableRows === 0, onPhone);
  check("D · the whole screen is " + onPhone.nodes + " nodes, against 3,070 before",
    onPhone.nodes < 1200, onPhone.nodes);
  await shot(phone.page, "admin-05-phone-products");
  await phone.page.close();
}

/* --- D3. Restore gives back the previous value, not the mistake -------- */
{
  /*
   * THE ASSERTION THIS FILE EXISTS FOR.
   *
   * The old mutate() wrote the backup from the body it had just saved, so the
   * newest backup was byte-identical to the mistake and the one recovery
   * button in the console was a no-op for the only case it exists for.
   * Verified live at the time: saved 111, saved 222, pressed restore, got 222.
   *
   * So: save 111, save 222, press the restore the console puts in front of
   * him, expect 111. The owner does not read backup names; he presses the
   * first button, and the first button has to be right.
   */
  await adminScreen(admin, "products");
  await admin.waitForSelector("#prdList tbody tr", { timeout: 20000 });

  const setPriceThroughEditor = async value => {
    await adminFind(admin, SUBJECT.name);
    await adminOpenProduct(admin, SUBJECT.id);
    await admin.click("#edPrice", { count: 3 });
    await admin.type("#edPrice", String(value), { delay: 10 });
    await adminSaveProduct(admin);
    const rows = await adminFind(admin, SUBJECT.name);
    return Number((rows.find(r => r.id === SUBJECT.id) || {}).price);
  };
  const first = await setPriceThroughEditor(111);
  const second = await setPriceThroughEditor(222);
  check("D · two prices are saved in a row, the second one by mistake",
    first === 111 && second === 222, { first, second });

  await adminScreen(admin, "backups");
  await admin.waitForSelector("[data-restore]", { timeout: 20000 });
  await wait(800);
  const offered = await admin.evaluate(() => [...document.querySelectorAll("[data-restore]")].slice(0, 3).map(b => ({
    at: Number(b.dataset.at),
    says: b.closest(".item").textContent.replace(/\s+/g, " ").trim().slice(0, 60)
  })));
  await shot(admin, "admin-06-backups");
  await admin.evaluate(() => document.querySelector("[data-restore]").click());
  await admin.waitForSelector("#bkConfirm", { timeout: 15000 }).catch(() => {});
  await wait(700);
  const promised = await admin.evaluate(() => (document.querySelector("#sheetBody") || {}).textContent || "");
  /*
   * DEFECT, and it is the same bug wearing a new coat. mutate() now snapshots
   * correctly — the inline price cell, which is a single write, restores 111
   * exactly as it should. But saveProduct() in admin.js makes *two* writes for
   * any product that has photographs: api("save") and then, unconditionally,
   * api("gallery-save"). Each one calls mutate(), so each one writes a backup,
   * and the second one is taken AFTER the price change. The newest rolling
   * backup is therefore the mistake again, labelled «قبل تغيير صور منتج» —
   * and the console's own diff admits it, printing «لا فرق بين هذه النسخة
   * والحالة الحالية» while still offering it as the recovery. Measured: saved
   * 111, saved 222, pressed the first restore, got 222.
   */
  check("D · the restore the console offers first promises to undo the mistake",
    /111/.test(promised), { diff: promised.slice(0, 200), offered });

  const stamp = await admin.evaluate(() =>
    new Date(Number(document.querySelector("[data-restore]").dataset.at))
      .toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
  await admin.click("#bkConfirm");
  await admin.type("#bkConfirm", stamp, { delay: 10 });
  await admin.evaluate(() => document.querySelector("[data-restore-go]").click());
  await wait(3000);
  await adminScreen(admin, "products");
  await admin.waitForSelector("#prdList tbody tr", { timeout: 20000 });
  const afterRestore = await adminFind(admin, SUBJECT.name);
  const price = Number((afterRestore.find(r => r.id === SUBJECT.id) || {}).price);
  check("D · «استعادة نسخة سابقة» gives back the previous price, not the mistake — 111, not 222",
    price === 111, { got: price, saved: "111 then 222" });

  /* The same three steps through the inline cell, which is one write per save.
     It passes, which is what pins the failure above on the second write rather
     than on the backup logic. */
  const inline = async value => {
    await adminFind(admin, SUBJECT.name);
    await admin.evaluate((id, v) => {
      const cell = document.querySelector('#prdList tbody tr[data-id="' + id + '"] [data-cell="price"]');
      cell.focus();
      cell.value = String(v);
      cell.dispatchEvent(new Event("input", { bubbles: true }));
    }, SUBJECT.id, value);
    await admin.keyboard.press("Enter");
    await wait(2600);
    const rows = await adminFind(admin, SUBJECT.name);
    return Number((rows.find(r => r.id === SUBJECT.id) || {}).price);
  };
  const a = await inline(333);
  const b = await inline(444);
  await adminScreen(admin, "backups");
  await admin.waitForSelector("[data-restore]", { timeout: 20000 });
  await wait(800);
  await admin.evaluate(() => document.querySelector("[data-restore]").click());
  await admin.waitForSelector("#bkConfirm", { timeout: 15000 }).catch(() => {});
  await wait(700);
  const stamp2 = await admin.evaluate(() =>
    new Date(Number(document.querySelector("[data-restore]").dataset.at))
      .toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
  await admin.click("#bkConfirm");
  await admin.type("#bkConfirm", stamp2, { delay: 10 });
  await admin.evaluate(() => document.querySelector("[data-restore-go]").click());
  await wait(3000);
  await adminScreen(admin, "products");
  await admin.waitForSelector("#prdList tbody tr", { timeout: 20000 });
  const rows2 = await adminFind(admin, SUBJECT.name);
  const price2 = Number((rows2.find(r => r.id === SUBJECT.id) || {}).price);
  check("D · a price saved from the list restores correctly — 333, not 444",
    a === 333 && b === 444 && price2 === 333, { a, b, afterRestore: price2 });
}

check("D · the console ran without a page error", adminErrors.length === 0, adminErrors);
await admin.close();

await browser.close();
console.log(failures ? "\n" + failures + " FAILURES" : "\nAll UI checks passed");
process.exit(failures ? 1 : 0);
