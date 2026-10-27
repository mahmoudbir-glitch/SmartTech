/*
 * Smoke test: every page the shop publishes opens, in every language, with
 * no runtime error — and the storefront features a shopper relies on are on
 * the page, not just in the code.
 *
 * HTTP half: every <loc> in the sitemap answers 200 and carries the
 * structured data its kind of page promises (Product + BreadcrumbList on a
 * product, BreadcrumbList on a listing). robots.txt names the same origin.
 *
 * Browser half: listing pages, a sample of products (a colour group's lead, an
 * out-of-stock one, plain ones), checkout and the console, in ar/en/tr —
 * no pageerror, no console error, the right lang/dir.
 */
import puppeteer from "puppeteer-core";

const BASE = "http://127.0.0.1:" + (process.env.DEV_PORT || 3100);
const ORIGIN = (process.env.SITE_ORIGIN || BASE).replace(/\/+$/, "");
const LANGS = ["ar", "en", "tr"];
let failures = 0;
const check = (name, ok, detail) => {
  console.log((ok ? "PASS " : "FAIL ") + name + (ok || detail === undefined ? "" : " -> " + JSON.stringify(detail).slice(0, 400)));
  if (!ok) failures++;
};
const local = url => url.startsWith(ORIGIN) ? BASE + url.slice(ORIGIN.length) : url;

/* ------------------------------------------------------------- HTTP half */

const robots = await fetch(BASE + "/robots.txt");
const robotsText = await robots.text();
check("robots.txt answers as text", robots.ok && /text\/plain/.test(robots.headers.get("content-type") || ""), robots.status);
check("robots.txt points at this origin's sitemap", robotsText.includes("Sitemap: " + ORIGIN + "/sitemap.xml"), robotsText);
check("robots.txt keeps the console and customer pages out", ["/admin.html", "/checkout", "/o/", "/track"].every(p => robotsText.includes("Disallow: " + p)), robotsText);

const sitemap = await fetch(BASE + "/sitemap.xml");
const xml = await sitemap.text();
const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].replace(/&amp;/g, "&"));
check("sitemap.xml lists the shop", sitemap.ok && locs.length > 100, { status: sitemap.status, count: locs.length });

const bad = [];
const missingLd = [];
const groups = [];
const soldOut = [];
const plain = [];
const queue = locs.slice();
async function worker() {
  while (queue.length) {
    const loc = queue.shift();
    const res = await fetch(local(loc));
    const html = await res.text();
    if (!res.ok) { bad.push([loc, res.status]); continue; }
    const path = new URL(loc).pathname;
    const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => m[1]).join("\n");
    if (path.startsWith("/p/")) {
      if (!ld.includes('"Product"') || !ld.includes('"BreadcrumbList"')) missingLd.push(loc);
      if (ld.includes('"ProductGroup"')) groups.push(path);
      else if (ld.includes("OutOfStock")) soldOut.push(path);
      else plain.push(path);
    } else if (path.startsWith("/c/") || path.startsWith("/b/")) {
      if (!ld.includes('"BreadcrumbList"')) missingLd.push(loc);
    }
  }
}
await Promise.all(Array.from({ length: 8 }, worker));
check("every sitemap URL answers 200", !bad.length, bad.slice(0, 10));
check("every product and listing page carries its structured data", !missingLd.length, missingLd.slice(0, 10));
check("the catalogue has colour groups to show", groups.length > 0, groups.length);

const home = await (await fetch(BASE + "/")).text();
check("the home page describes the shop and its search box", home.includes('"WebSite"') && home.includes('"SearchAction"') && home.includes('"Organization"'));

/* ---------------------------------------------------------- browser half */

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"]
});

const listings = locs.map(l => new URL(l)).filter(u => /^\/(c|b)\//.test(u.pathname) && !u.search).map(u => u.pathname);
const departments = listings.filter(p => /^\/c\/[^/]+$/.test(p));
const brands = listings.filter(p => p.startsWith("/b/"));
const products = [groups[0], soldOut[0], plain[0], plain[Math.floor(plain.length / 2)]].filter(Boolean);
const PAGES = ["/", "/browse", "/brands", "/checkout", "/privacy", "/admin.html"]
  .concat(departments, brands, products);

async function open(page, lang) {
  const tab = await browser.newPage();
  const errors = [];
  tab.on("pageerror", e => errors.push(String(e)));
  /* The console asks "am I signed in?" before the login form, and the answer
     is a 401 the browser logs as a failed resource. That is the design. */
  const expected = page === "/admin.html" ? /status of 401/ : /^$/;
  tab.on("console", m => { if (m.type() === "error" && !/favicon|net::ERR_ABORTED/.test(m.text()) && !expected.test(m.text())) errors.push(m.text()); });
  await tab.evaluateOnNewDocument(code => { try { localStorage.setItem("smarttech_lang", code); } catch (e) {} }, lang);
  await tab.goto(BASE + page, { waitUntil: "networkidle0" });
  return { tab, errors };
}

for (const page of PAGES) {
  for (const lang of LANGS) {
    const { tab, errors } = await open(page, lang);
    const doc = await tab.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir }));
    check(`[${lang}] ${page} opens without runtime errors`, !errors.length, errors);
    /* /privacy is one bilingual legal page (Arabic, then English) written for
       the Play listing; it does not follow the shop's language switch. */
    if (page !== "/privacy") check(`[${lang}] ${page} is ${lang === "ar" ? "rtl" : "ltr"}`, doc.lang === lang && doc.dir === (lang === "ar" ? "rtl" : "ltr"), doc);
    await tab.close();
  }
}

/* The product page's features, on the products that exercise them. */
if (groups[0]) {
  const { tab } = await open(groups[0], "ar");
  await tab.waitForSelector(".pdp__variants", { timeout: 5000 }).catch(() => {});
  const pdp = await tab.evaluate(() => ({
    swatches: document.querySelectorAll(".pdp__variants [role=radio], .pdp__variants a, .pdp__variants button").length,
    thumbs: document.querySelectorAll(".pdp__thumb").length,
    related: !!document.querySelector(".pdp__related"),
    price: (document.querySelector(".pdp__price") || {}).textContent || ""
  }));
  check("a colour group shows its colours as choices", pdp.swatches > 1, pdp);
  check("the product page has a gallery of more than one picture", pdp.thumbs > 1, pdp);
  check("the product page offers related products", pdp.related, pdp);
  check("the product page shows a price", /\d/.test(pdp.price), pdp);
  await tab.close();
}
if (soldOut[0]) {
  const { tab } = await open(soldOut[0], "en");
  const out = await tab.evaluate(() => ({
    add: !!document.querySelector(".pdp__actions button:not([disabled])[data-add], .pdp__actions [data-add]:not([disabled])"),
    text: (document.querySelector(".pdp__info") || document.body).textContent
  }));
  check("an out-of-stock product cannot be added to the basket", !out.add, out.add);
  await tab.close();
}
/* The control for the check above: without it, a renamed button would make
   "cannot be added" pass on every product. */
if (plain[0]) {
  const { tab } = await open(plain[0], "en");
  const add = await tab.evaluate(() => !!document.querySelector(".pdp__actions [data-add]:not([disabled])"));
  check("an in-stock product can be added to the basket", add, add);
  await tab.close();
}

/* Filters and search, through the URL the shop itself writes. */
async function cards(path) {
  const { tab } = await open(path, "en");
  await tab.waitForSelector(".pcard", { timeout: 5000 }).catch(() => {});
  const rows = await tab.evaluate(() => [...document.querySelectorAll(".pcard")].map(c => ({
    id: c.dataset.product,
    text: c.textContent,
    out: !!c.querySelector(".is-out")
  })));
  await tab.close();
  return rows;
}
const all = await cards("/?view=all");
const anker = await cards("/?view=all&brand=anker");
/* Both lists are paged at 24, so compare membership, not length. */
const brandOf = await (async () => {
  const { tab } = await open("/", "en");
  const map = await tab.evaluate(() => Object.fromEntries(window.STORE.merge({}).map(p => [String(p.id), p.brand])));
  await tab.close();
  return map;
})();
check("the brand filter keeps only that brand",
  anker.length > 0 && anker.every(c => /^anker$/i.test(brandOf[c.id] || "")) && all.some(c => !/^anker$/i.test(brandOf[c.id] || "")),
  { anker: anker.map(c => brandOf[c.id]).filter(b => !/^anker$/i.test(b || "")), all: [...new Set(all.map(c => brandOf[c.id]))] });
const inStock = await cards("/?view=all&stock=1");
check("the availability filter hides sold-out cards", inStock.length > 0 && inStock.every(c => !c.out), inStock.filter(c => c.out).length);
const cheap = await cards("/?view=all&max=20");
const prices = cheap.map(c => Math.min(...(c.text.match(/\d+(?:\.\d+)?/g) || ["0"]).map(Number).filter(n => n > 0)));
check("the price filter keeps cards at or under the ceiling", cheap.length > 0 && prices.every(p => p <= 20), { count: cheap.length, over: prices.filter(p => p > 20) });
const found = await cards("/?q=power%20bank");
check("search finds power banks", found.length > 0 && found.length < all.length, found.length);

await browser.close();
console.log(failures ? "\n" + failures + " smoke failure(s)" : "\nAll smoke checks passed");
process.exit(failures ? 1 : 0);
