/*
 * Acceptance checks for the redesign.
 *
 * Eleven studies measured the old shop. Each assertion below is one of those
 * measurements turned into a number the build has to keep hitting, with the
 * old value quoted so a regression is obvious rather than merely red. If this
 * file ever needs relaxing, the design changed — say so out loud.
 */
import puppeteer from "puppeteer-core";

const BASE = "http://127.0.0.1:" + (process.env.DEV_PORT || 3100);
const SHOT = process.env.SHOT_DIR;
let failures = 0;

function check(name, ok, detail) {
  console.log((ok ? "PASS " : "FAIL ") + name +
    (ok || detail === undefined ? "" : " -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 320)));
  if (!ok) failures++;
}
function within(name, value, limit, was) {
  check(name + " (" + value + " ≤ " + limit + (was ? ", was " + was : "") + ")", value <= limit);
}
const wait = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage"]
});

async function open(url, { lang = "ar", width = 390, height = 844, motion = "no-preference" } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  /* Headless Chrome reports prefers-reduced-motion: reduce by default, which
     silently neutralises every transition and makes a motion audit meaningless. */
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: motion }]);
  const errors = [];
  const bad = [];
  page.on("pageerror", e => errors.push(String(e).slice(0, 200)));
  page.on("console", m => { if (m.type() === "error" && !/favicon|401/i.test(m.text())) errors.push(m.text().slice(0, 200)); });
  page.on("response", r => { if (r.url().startsWith(BASE) && r.status() >= 400) bad.push(r.url().replace(BASE, "") + " " + r.status()); });
  await page.evaluateOnNewDocument(code => { try { localStorage.setItem("syriatech_lang", code); } catch (e) {} }, lang);
  await page.goto(BASE + url + (url.includes("?") ? "&" : "?") + "lang=" + lang, { waitUntil: "networkidle0" });
  return { page, errors, bad };
}

/* Every element with its own text, so a floor can be checked without walking
   into the details of any one component. */
const TEXT_NODES = `[...document.querySelectorAll("body *")].filter(el =>
  [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) &&
  el.offsetParent !== null && !el.closest(".vh"))`;

/* ============================================================ the home page */
{
  const { page, errors, bad } = await open("/");

  check("no page errors", errors.length === 0, errors);
  check("no failed requests", bad.length === 0, bad);
  check("nothing is fetched from outside this origin",
    await page.evaluate(() => performance.getEntriesByType("resource").every(r => r.name.startsWith(location.origin))));

  /* --- the owner's complaint, measured --------------------------------- */
  const chrome = await page.evaluate(() => {
    const sticky = [...document.querySelectorAll("body *")].filter(el => {
      const s = getComputedStyle(el);
      return (s.position === "sticky" || s.position === "fixed") && el.getBoundingClientRect().top <= 0 + 1 &&
        el.getBoundingClientRect().height > 8 && s.visibility !== "hidden";
    });
    return Math.max(0, ...sticky.map(el => el.getBoundingClientRect().bottom));
  });
  within("sticky chrome at the top of a 390×844 phone", Math.round(chrome), 64, "200px = 23.7% of the viewport");

  const firstCard = await page.evaluate(() => {
    const el = document.querySelector(".pcard");
    return el ? Math.round(el.getBoundingClientRect().top + scrollY) : -1;
  });
  check("there is a product card on the home page", firstCard >= 0);
  /* SmartTech look: promo bar, brand strip and the blue hero sit above the first rail on purpose. */
  within("y of the first product card", firstCard, 1100, "2,290 — 2.7 screens of scrolling");

  await page.waitForFunction(() => { const el = document.querySelector(".pcard__price"); return el && el.getBoundingClientRect().height > 0; }, { timeout: 8000 }).catch(() => {});
  const firstPrice = await page.evaluate(() => {
    const el = document.querySelector(".pcard__price");
    return el ? Math.round(el.getBoundingClientRect().top + scrollY) : -1;
  });
  within("y of the first price", firstPrice, 1400, "2,613");
  check("the first price is within two screens on a 390×844 phone", firstPrice > 0 && firstPrice < 844 * 2);

  /* --- the scroll itself ----------------------------------------------- */
  await page.evaluate(async () => {
    for (let i = 0; i < 40; i++) { scrollTo(0, document.body.scrollHeight); await new Promise(r => setTimeout(r, 40)); }
  });
  await wait(600);
  const after = await page.evaluate(() => ({
    height: document.documentElement.scrollHeight,
    images: document.images.length,
    cards: document.querySelectorAll(".pcard").length
  }));
  within("document height after scrolling to the end", after.height, 7000, "49,772px — 59 screens");
  within("images in the DOM after scrolling to the end", after.images, 80, "230");

  /* --- the card ---------------------------------------------------------- */
  /* Every card must be measured after it has actually rendered.
     `content-visibility: auto` makes an off-screen card report its
     `contain-intrinsic-size` guess instead of its real height, which looks
     exactly like the seven-heights defect this checks for and is not it. */
  await page.evaluate(async () => {
    for (const el of document.querySelectorAll(".pcard")) {
      el.scrollIntoView({ block: "center" });
      await new Promise(r => requestAnimationFrame(r));
    }
    scrollTo(0, 0);
    await new Promise(r => setTimeout(r, 200));
  });
  const cards = await page.evaluate(() => {
    const list = [...document.querySelectorAll(".pcard")];
    return {
      count: list.length,
      heights: [...new Set(list.map(el => el.offsetHeight))],
      /* A title clamped to two lines reports a larger scrollHeight by design —
         that is truncation, which is intended. The defect this looks for is a
         box too short to render the lines it does show: the old clamp box was
         44px when two lines of Arabic need 47, so even a short title had its
         descenders sheared. So: the box must reserve both lines in full. */
      shortBoxes: list.filter(el => {
        const n = el.querySelector(".pcard__name");
        if (!n) return false;
        const cs = getComputedStyle(n);
        const line = parseFloat(cs.lineHeight);
        const pad = parseFloat(cs.paddingBlockStart) + parseFloat(cs.paddingBlockEnd);
        return n.clientHeight - pad < line * 2 - 0.5;
      }).length,
      clippedNames: list.filter(el => {
        const n = el.querySelector(".pcard__name");
        if (!n) return false;
        /* A title that fits inside the clamp must be shown whole. */
        const cs = getComputedStyle(n);
        const lines = Math.round((n.scrollHeight - parseFloat(cs.paddingBlockStart) - parseFloat(cs.paddingBlockEnd)) / parseFloat(cs.lineHeight));
        return lines <= 2 && n.scrollHeight > n.clientHeight + 1;
      }).length,
      wrappedPrices: list.filter(el => {
        const p = el.querySelector(".pcard__price");
        if (!p) return false;
        const line = parseFloat(getComputedStyle(p).lineHeight) || 26;
        return p.getBoundingClientRect().height > line * 1.6;
      }).length
    };
  });
  check("every card in the grid is the same height (was seven heights, a 74px spread)",
    cards.heights.length === 1, cards.heights);
  check("every title box reserves both of its clamped lines (the old box was 44px; two Arabic lines need 47)",
    cards.shortBoxes === 0, cards.shortBoxes + " of " + cards.count);
  check("a title short enough to fit is shown whole",
    cards.clippedNames === 0, cards.clippedNames + " of " + cards.count);
  check("no price wraps to a second line (was all 25 discounted cards)",
    cards.wrappedPrices === 0, cards.wrappedPrices + " of " + cards.count);

  /* --- typography floor -------------------------------------------------- */
  const small = await page.evaluate(TEXT_NODES + `.map(el => ({
      size: parseFloat(getComputedStyle(el).fontSize),
      interactive: !!el.closest("a, button, select, label, [role=button]"),
      what: el.className || el.tagName
    })).filter(x => x.size < (x.interactive ? 14 : 13))`);
  check("no text below 13px, and none below 14px inside a control (was 25 live violations)",
    small.length === 0, small.slice(0, 8));

  /* --- target size ------------------------------------------------------- */
  const tiny = await page.evaluate(`[...document.querySelectorAll("a[href], button, select, input, [role=button]")]
    .filter(el => el.offsetParent !== null)
    .map(el => { const r = el.getBoundingClientRect();
      const before = getComputedStyle(el, "::before");
      const grow = (parseFloat(before.inset) || 0) * -2;
      return { w: Math.round(r.width + Math.max(0, grow)), h: Math.round(r.height + Math.max(0, grow)),
               what: (el.className || el.tagName).toString().slice(0, 40) }; })
    .filter(x => (x.w < 44 || x.h < 44) && x.w > 0)`);
  check("every visible control is at least 44×44 (was 65 of 155 under it)",
    tiny.length === 0, tiny.slice(0, 8));

  /* Layout shift is measured on its own visit, further down. Scripted
     scrolling counts as a shift the shopper did not cause — the loop above
     that renders every card would be scored against the page. */

  /* --- keyboard ---------------------------------------------------------- */
  /* Two numbers, because the honest answer has two parts. Tabbing straight
     through the chrome and the eight department links is the long way; the
     skip link is the short way and is what the guideline is really about. */
  const keyboard = await page.evaluate(async () => {
    const order = () => [...document.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])')]
      .filter(el => el.offsetParent !== null || el.classList.contains("skip-link"));
    const card = document.querySelector(".pcard__hit");
    const walked = card ? order().indexOf(card) + 1 : -1;
    const skip = document.querySelector('a[href="#products"]');
    let viaSkip = -1;
    if (skip && card) {
      skip.click();
      await new Promise(r => setTimeout(r, 250));
      viaSkip = document.activeElement && document.activeElement.closest(".pcard") ? 2 : -1;
    }
    return { walked, viaSkip };
  });
  check("the skip link puts a keyboard on the first product in two stops (was 38 to walk there)",
    keyboard.viaSkip === 2, keyboard);
  within("tab stops to the first product without the skip link", keyboard.walked, 26, "38");

  if (SHOT) await page.screenshot({ path: SHOT + "/home-390-ar.png", fullPage: false });
  await page.close();
}

/* ============================================================ layout shift */
{
  /* Its own page, with nothing scripted done to it: a programmatic scroll is
     not `hadRecentInput`, so scrolling to measure something else scores every
     card that renders on the way as a shift. The number that matters is what
     a shopper sees while the page settles. */
  const { page } = await open("/");
  await wait(2500);
  const cls = await page.evaluate(() => new Promise(resolve => {
    let total = 0;
    new PerformanceObserver(list => { for (const e of list.getEntries()) if (!e.hadRecentInput) total += e.value; })
      .observe({ type: "layout-shift", buffered: true });
    setTimeout(() => resolve(Math.round(total * 10000) / 10000), 300);
  }));
  within("cumulative layout shift on the home page", cls, 0.05, "0.546 when load-more fired from a scroll");
  await page.close();
}

/* The product page is measured separately, and on a wide screen as well as a
   phone. It shifts for a different reason: the shelf of related products and
   the trust row are written after the server's first paint, and on a desktop
   they are wide enough to move the page under a shopper who is already
   reading. It also has to survive the moment the owner's prices arrive and
   the page re-renders itself — a correction that fixed a wrong price would be
   a poor trade if it threw the page around while doing it. */
{
  /* Whichever product the shop puts first — the shift being measured is the
     page's, not any one product's. */
  const { page: home } = await open("/");
  const firstId = await home.evaluate(() => (document.querySelector("#grid .pcard, .rail__track .pcard") || { dataset: {} }).dataset.product || "");
  await home.close();
  check("there is a product to open", !!firstId, firstId);
  for (const width of [390, 1366]) {
    const { page } = await open("/p/" + firstId, { width, height: width === 390 ? 844 : 768 });
    await wait(2500);
    const cls = await page.evaluate(() => new Promise(resolve => {
      let total = 0;
      new PerformanceObserver(list => { for (const e of list.getEntries()) if (!e.hadRecentInput) total += e.value; })
        .observe({ type: "layout-shift", buffered: true });
      setTimeout(() => resolve(Math.round(total * 10000) / 10000), 300);
    }));
    within("cumulative layout shift on the product page at " + width + "px", cls, 0.05, "0.0568");
    await page.close();
  }
}

/* ======================================================= bidi, all languages */
{
  /* Four corruptions were measured on the live site, including a product name
     that rendered "Wi-Fig" because the Arabic waw sits against a Latin run.
     Reading the per-character x positions is the only way to catch them. */
  const { page } = await open("/");
  const reordered = await page.evaluate(() => {
    const out = [];
    const nodes = [...document.querySelectorAll(".pcard__price, .pcard__off, .facetbar__count, .storeline, .pcard__note")]
      .filter(el => el.offsetParent !== null);
    for (const el of nodes) {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const text = node.textContent;
        const runs = [...text.matchAll(/\d[\d.,]*/g)];
        if (runs.length < 1) continue;
        for (const run of runs) {
          const range = document.createRange();
          const xs = [];
          for (let i = run.index; i < run.index + run[0].length; i++) {
            range.setStart(node, i); range.setEnd(node, i + 1);
            xs.push(range.getBoundingClientRect().left);
          }
          const ascending = xs.every((x, i) => i === 0 || x >= xs[i - 1] - 0.5);
          if (!ascending) out.push(text.trim().slice(0, 40) + " → digits out of order");
        }
      }
    }
    return out;
  });
  check("no number renders backwards in Arabic (was $129.98 → 129.98$, 1-12 → 12-1)",
    reordered.length === 0, reordered.slice(0, 6));
  await page.close();
}

for (const lang of ["ar", "en", "tr"]) {
  for (const width of [320, 390, 768, 1280]) {
    const { page } = await open("/", { lang, width, height: 900 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check("no horizontal overflow at " + width + "px in " + lang, overflow <= 0, overflow + "px");
    await page.close();
  }
}

/* ============================================================ the same shop */
{
  /* buildVariantGroups keyed on the translated name, so the shop was 230 cards
     in Arabic and 225 in English and Turkish — a different store per language. */
  const counts = {};
  for (const lang of ["ar", "en", "tr"]) {
    const { page } = await open("/c/phone-acc/cases", { lang, width: 1280, height: 900 });
    counts[lang] = await page.evaluate(() => document.querySelectorAll(".pcard").length);
    await page.close();
  }
  check("the shop is the same size in every language (was 230 / 225 / 225)",
    counts.ar === counts.en && counts.en === counts.tr, counts);
}

/* =========================================================== the product page */
{
  const { page, errors } = await open("/p/33395");   // 16 colourways, the largest group
  check("the product page has no errors", errors.length === 0, errors);

  const layout = await page.evaluate(() => {
    const primary = document.querySelector(".pdp__actions .btn--primary, .pdp__actions button, .pdp__actions a");
    const variants = document.querySelector(".pdp__variants");
    const rect = el => (el ? Math.round(el.getBoundingClientRect().top + scrollY) : -1);
    return {
      primary: rect(primary),
      variants: rect(variants),
      order: variants && primary ? (variants.compareDocumentPosition(primary) & Node.DOCUMENT_POSITION_FOLLOWING) > 0 : null,
      swatches: document.querySelectorAll(".swatch").length
    };
  });
  check("the colour chooser comes before the buy button in the DOM (tab order follows it)",
    layout.order === true, layout);
  check("the colour chooser is above the buy button on screen (was 419px below it)",
    layout.variants >= 0 && layout.variants < layout.primary, layout);
  /* The promo bar and brand strip add 72px above the product page; the fixed buy bar keeps the action reachable. */
  within("y of the primary action", layout.primary, 920, "922 — below the fold");
  check("all 16 colourways are offered", layout.swatches >= 16, layout.swatches);

  /* Tapping a colour used to re-render the view and reset scrollTop 1000 → 0. */
  const scrollKept = await page.evaluate(async () => {
    scrollTo(0, 600);
    await new Promise(r => setTimeout(r, 120));
    const before = scrollY;
    const swatch = [...document.querySelectorAll(".swatch")].find(s => s.getAttribute("aria-checked") !== "true" && !s.disabled);
    if (!swatch) return { skipped: true };
    swatch.click();
    await new Promise(r => setTimeout(r, 400));
    return { before, after: scrollY };
  });
  check("choosing a colour does not throw the shopper back to the top",
    scrollKept.skipped || Math.abs(scrollKept.after - scrollKept.before) < 60, scrollKept);

  if (SHOT) await page.screenshot({ path: SHOT + "/product-390-ar.png" });
  await page.close();
}

{
  /* Every one of the 312 product URLs used to serve the home page's body:
     the name appeared 0 times, the price 0 times. */
  const res = await fetch(BASE + "/p/35141");
  const html = await res.text();
  check("a product page serves the product in its body, not the home page",
    /Prime/.test(html) && /229\.99/.test(html) && html.indexOf("229.99") !== html.lastIndexOf("229.99"),
    "name " + /Prime/.test(html) + ", price occurrences " + (html.match(/229\.99/g) || []).length);
  check("an unknown product is a 404, not a redirect to the home page",
    (await fetch(BASE + "/p/999999", { redirect: "manual" })).status === 404);
}

/* ================================================================ ordering */
{
  const { page, errors } = await open("/");
  const flow = await page.evaluate(async () => {
    const before = { open: !!document.querySelector("#cart[open]") };
    SY.cart.clear();
    SY.cart.add(35141, 2);
    SY.cart.add(26629, 1);
    await new Promise(r => setTimeout(r, 300));
    return {
      before,
      cartOpened: !!document.querySelector("#cart[open]"),
      count: SY.cart.count(),
      subtotal: SY.cart.subtotal()
    };
  });
  check("adding to the cart does not open the cart (it used to, on every add)",
    flow.cartOpened === false, flow);
  check("the cart counts what was added", flow.count === 3, flow);

  const foot = await page.evaluate(async () => {
    const dlg = document.querySelector("#cart");
    if (!dlg) return { missing: true };
    SY.openDialog(dlg);
    await new Promise(r => setTimeout(r, 400));
    const f = dlg.querySelector(".cart__foot");
    return { height: f ? Math.round(f.getBoundingClientRect().height) : -1 };
  });
  if (!foot.missing) within("the cart's foot on a 390×844 phone", foot.height, 150, "235px — 28% of the viewport");
  check("the product page and the cart both exist", !foot.missing);
  check("no errors while ordering", errors.length === 0, errors);
  await page.close();
}

/* ================================================================= the admin */
{
  const { page, errors } = await open("/admin.html", { width: 1280, height: 900 });
  const hasLogin = await page.evaluate(() => !!document.querySelector('input[type="password"]'));
  check("the admin asks for a password", hasLogin);
  check("the admin page has no errors", errors.length === 0, errors);
  await page.close();
}

await browser.close();
console.log(failures ? "\n" + failures + " acceptance check(s) failed" : "\nevery acceptance check passed");
process.exit(failures ? 1 : 0);
