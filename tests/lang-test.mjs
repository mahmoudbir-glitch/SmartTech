/*
 * Strict language test.
 * Static half: dictionaries must match, and no source file except i18n.js may
 * contain user-visible copy. Runtime half: every language renders completely
 * with no leftovers from another language.
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const REPO = process.env.DEV_REPO || "D:/bir/smarttech-store";
const BASE = "http://127.0.0.1:" + (process.env.DEV_PORT || 3100);
let failures = 0;
const check = (name, ok, detail) => {
  const shown = detail === undefined ? "(nothing found)" : JSON.stringify(detail).slice(0, 400);
  console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : " -> " + shown));
  if (!ok) failures++;
};

/* ---------------- Static checks ---------------- */
const read = f => fs.readFileSync(path.join(REPO, f), "utf8");
const i18nSource = read("i18n.js");

/* Load the dictionaries the way a browser would — and both of them.
   The admin console's copy lives in i18n-admin.js, which merges into the same
   window.I18N. It was split out because it is 41% of the file and every
   shopper was downloading 6 KB gzipped of admin panel strings, a tenth of the
   whole JavaScript budget, to read a product page. The console still has to
   resolve every key it references, so the check loads both. */
const sandbox = { window: {}, navigator: { languages: ["ar"] }, localStorage: { getItem: () => null, setItem: () => {} } };
const run = src => new Function("window", "navigator", "localStorage", src)(
  sandbox.window, sandbox.navigator, sandbox.localStorage);
run(i18nSource);
/* Every chunk of the split dictionary. The shop's words are divided by the
   surface that renders them — the checkout's labels, the category
   descriptions, the product page's own strings and the whole admin console
   each travel with the file that shows them, so the home page stops
   downloading 14 KB gzipped of words it never displays. They all merge into
   the same window.I18N.dict, and the language rules apply to all of them
   together: one key set, three languages, nothing untranslated. */
for (const chunk of ["i18n-cat.js", "i18n-order.js", "i18n-pdp.js", "i18n-admin.js"]) {
  if (fs.existsSync(path.join(REPO, chunk))) run(read(chunk));
}
const I18N = sandbox.window.I18N;
const LANGS = I18N.languages.map(l => l.code);

const flatten = (obj, prefix = "") => Object.entries(obj).flatMap(([k, v]) =>
  v && typeof v === "object" ? flatten(v, prefix + k + ".") : [[prefix + k, v]]);
const maps = Object.fromEntries(LANGS.map(code => [code, Object.fromEntries(flatten(I18N.dict[code]))]));
const keys = Object.fromEntries(LANGS.map(code => [code, Object.keys(maps[code]).sort()]));

check("three languages are configured", LANGS.join(",") === "ar,en,tr", LANGS);
LANGS.slice(1).forEach(code => {
  const missing = keys.ar.filter(k => !keys[code].includes(k));
  const extra = keys[code].filter(k => !keys.ar.includes(k));
  check(`[${code}] has exactly the same keys as ar`, !missing.length && !extra.length, { missing, extra });
});
LANGS.forEach(code => {
  const empty = Object.entries(maps[code]).filter(([, v]) => typeof v !== "string" || !v.trim()).map(([k]) => k);
  check(`[${code}] no empty translations`, !empty.length, empty);
});
// Placeholders such as {n} or {brand} must survive translation.
LANGS.slice(1).forEach(code => {
  const mismatched = keys.ar.filter(k => {
    const a = (maps.ar[k].match(/\{\w+\}/g) || []).sort().join(",");
    const b = (maps[code][k].match(/\{\w+\}/g) || []).sort().join(",");
    return a !== b;
  });
  check(`[${code}] placeholders match ar`, !mismatched.length, mismatched);
});
/* The same string in ar and another language is almost always a translation
   somebody forgot. It is legitimate for a proper noun, and for a value with no
   letters in it at all — "{who} · {area} · {action}" is a layout, and
   an em dash meaning "nothing recorded" is an em dash in every language. */
const SAME_ALLOWED = new Set(["brandName", "heroTagBrand", "footerRights", "navAnker", "navSoundcore"]);
const hasLetters = v => /\p{L}/u.test(String(v).replace(/\{\w+\}/g, ""));
LANGS.slice(1).forEach(code => {
  const copied = keys.ar.filter(k => !SAME_ALLOWED.has(k) && !k.startsWith("brandTagline.")
    && hasLetters(maps.ar[k]) && maps.ar[k] === maps[code][k]);
  check(`[${code}] nothing left untranslated`, !copied.length, copied);
});

// No user-visible copy outside i18n.js.
const ARABIC = /[\u0600-\u06FF]/;
const TURKISH = /[ğĞşŞıİçÇöÖüÜ]/;
// index.html is generated from the dictionary by tools/sync-body.cjs and is
// checked against it below, which is a stronger guarantee than being empty.
/* Every file that could smuggle a visible string past the dictionary.
   checkout.html is listed with the pages because it is a page; the
   deleted product-images.js is not listed because it is deleted. */
const SOURCES = ["admin.html", "core.js", "script.js",
  "product.js", "cart.js", "checkout.js", "admin.js", "catalog.js",
  "api/admin.js", "api/products.js", "api/image.js", "api/c.js",
  "api/p.js", "api/order.js", "api/o.js", "api/orders.js", "api/sitemap.js"]
  .filter(f => fs.existsSync(path.join(REPO, f)));
SOURCES.forEach(file => {
  const src = file.endsWith(".html") ? read(file).replace(/<head>[\s\S]*?<\/head>/, "") : read(file);
  const code = file.endsWith(".html") ? src : src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  check(`${file} has no Arabic text`, !ARABIC.test(code), (code.match(/.{0,40}[\u0600-\u06FF].{0,40}/) || [])[0]);
  check(`${file} has no Turkish text`, !TURKISH.test(code), (code.match(/.{0,40}[ğĞşŞıİçÇöÖüÜ].{0,40}/) || [])[0]);
});

/*
 * Copy may appear in the markup, but only where it was generated from the
 * dictionary. index.html carries the Arabic text so the first paint is
 * readable; every one of those strings has to match its data-i18n key exactly,
 * which catches both hand-written copy and a stale generated file.
 */
["index.html", "checkout.html", "admin.html"]
  .filter(f => fs.existsSync(path.join(REPO, f))).forEach(file => {
  const raw = read(file).replace(/<head>[\s\S]*?<\/head>/, "").replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<!--[\s\S]*?-->/g, "");
  const dictionary = maps.ar;
  const lookup = key => key.split(".").reduce((n, part) => (n && n[part] !== undefined ? n[part] : undefined), I18N.dict.ar);

  // Anything inside an element that names a dictionary key is allowed when it
  // is that key's Arabic value; strip those, then nothing should remain.
  const stale = [];
  const stripped = raw.replace(/<(\w+)([^>]*\sdata-i18n(?:-html)?="([^"]+)"[^>]*)>([\s\S]*?)<\/\1>/g,
    (whole, tag, attrs, key, inner) => {
      const expected = lookup(key);
      const text = inner.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
      if (!text) return "";
      const wanted = String(expected === undefined ? "" : expected).replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
      if (text !== wanted) stale.push(key + ": " + text.slice(0, 40) + " != " + wanted.slice(0, 40));
      return "";
    });
  check(`${file} generated copy matches the dictionary`, !stale.length, stale);

    /* Two things in the markup are deliberately not from the dictionary.
     An <option> in the language switch carries its language's OWN endonym —
     "English" stays English in an Arabic page, and each option declares its
     own lang so a screen reader pronounces it correctly rather than reading
     Türkçe with Arabic phonetics. And an element marked aria-hidden is
     decoration: a separator dot is not copy. Punctuation that only ever
     separates — · — – / | — is allowed for the same reason. */
  const exempt = new Set(["العربية", "English", "Türkçe", "SYRIA", "TECH", "S", "Smart", "Tech"]);
  const decorative = raw.replace(/<([\w-]+)[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/>/g, "");
  const leftovers = stripped.split(/<[^>]*>/).map(s => s.trim())
    .filter(s => s && !/^[\s&;#0-9.,:$+/|·—–×−-]*$/.test(s) && !exempt.has(s))
    .filter(s => decorative.includes(s));
  check(`${file} contains no hard-coded text`, !leftovers.length, leftovers);
});

// The crawler-visible head must match the Arabic dictionary exactly (generated by tools/sync-head.cjs).
{
  const head = read("index.html");
  const title = (head.match(new RegExp("<title>([^<]*)<\\/title>")) || [])[1];
  const desc = (head.match(/<meta name="description" content="([^"]*)">/) || [])[1];
  const unescape = s => String(s || "").replace(/&quot;/g, String.fromCharCode(34)).replace(/&amp;/g, "&");
  check("head title matches the ar dictionary", unescape(title) === maps.ar.pageTitle, { title, expected: maps.ar.pageTitle });
  check("head description matches the ar dictionary", unescape(desc) === maps.ar.metaDescription, { desc });
  check("og tags are present for link previews", /og:title/.test(head) && /og:image/.test(head) && /twitter:card/.test(head));
}

// Every key referenced by the markup or the scripts must exist, and every key must be used.
// index.html is left out of the Arabic-text scan because it is generated from
// the dictionary, but it still references keys and counts towards what is used.
/* Every file that references a key, including the pages whose Arabic is
   generated and therefore left out of the no-Arabic scan. */
const usage = ["index.html", "checkout.html"]
  .concat(SOURCES)
  .filter(f => fs.existsSync(path.join(REPO, f)))
  .map(read).join(String.fromCharCode(10));
/* Keys the code builds rather than writes: `t("cat." + node.id)`,
   `t("admin.area" + screen)`, `t("routeCount" + pluralShape)`. A scan of the
   source cannot see them, so a prefix vouches for the family. Everything
   outside a listed prefix must appear literally somewhere, which is what
   catches a key nobody uses and a key nobody defined. */
const DYNAMIC_PREFIXES = [
  "cat.", "catDesc.", "city.", "brandTagline.", "error.",
  "admin.area", "admin.act", "admin.st", "admin.pay",
  "routeCount", "cartCount", "variantCount", "pdpMoreBrands"
];
const referenced = new Set();
[...usage.matchAll(/data-i18n(?:-html)?="([\w.]+)"/g)].forEach(m => referenced.add(m[1]));
[...usage.matchAll(/data-i18n-attr="([^"]+)"/g)].forEach(m => m[1].split(";").forEach(pair => referenced.add(pair.split(":")[1].trim())));
[...usage.matchAll(/\bt\("([\w.]+)"/g)].forEach(m => referenced.add(m[1]));
[...usage.matchAll(/I\.t\("([\w.]+)"/g)].forEach(m => referenced.add(m[1]));
/* `SY.plural("cartItems", n)` asks for cartItemsOne / Two / Few / Many —
   Arabic has four shapes and the dictionary carries all of them. Expanding
   the call is exact, where a blanket prefix would hide a family that is
   genuinely dead. */
[...usage.matchAll(/[Pp]lural(?:Text)?\("([\w.]+)"/g)].forEach(m => {
  for (const shape of ["One", "Two", "Few", "Many"]) referenced.add(m[1] + shape);
});
const quoted = new Set([...usage.matchAll(/"([\w.]+)"/g)].map(m => m[1]));
const unknown = [...referenced].filter(k => !k.endsWith(".") && !keys.ar.includes(k) &&
  !DYNAMIC_PREFIXES.includes(k));
check("every referenced key exists", !unknown.length, unknown);


/* The storefront is held strictly: every key it defines must be referenced
   somewhere, or the dictionary rots and three languages of dead copy ship to
   every shopper. The console is not, and cannot be — `admin.js` composes its
   keys (`t("admin." + name)`, `t("admin.act" + verb)`), so no scan of the
   source can tell a live key from a dead one. Its copy is also loaded only by
   the console, so a stale entry there costs the shopper nothing. */
const unused = keys.ar.filter(k =>
  !referenced.has(k) && !quoted.has(k) &&
  !k.startsWith("admin.") &&
  !DYNAMIC_PREFIXES.some(p => k.startsWith(p)) &&
  !["pageTitle", "adminPageTitle", "metaDescription"].includes(k));
check("no unused keys in the storefront dictionary", !unused.length, unused);

/* ---------------- Runtime checks ---------------- */
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage"]
});

/* A string the home page definitely renders, in the page's own language.
   It used to be cartTitle, which moved into the chunk that travels with
   cart.js — a key the home page does not load is a poor signature. */
const SIGNATURE = { ar: "homeAuthorised", en: "homeAuthorised", tr: "homeAuthorised" };

/* Every page the server renders in full, not only the two that are files on
   disk. Each of these arrives complete and correct from api/p.js or api/c.js,
   and then the browser runs i18n.apply() over it — which is where a correct
   page used to be replaced by raw keys, because the words for that surface
   travel in a chunk that had not arrived yet. The failure is invisible to a
   check that only loads "/": the home page's words are in the base file. */
const firstProduct = await (async () => {
  const tab = await browser.newPage();
  await tab.goto(BASE + "/", { waitUntil: "networkidle0" });
  const id = await tab.evaluate(() => (document.querySelector(".pcard") || { dataset: {} }).dataset.product || "");
  await tab.close();
  return id;
})();
check("the shop has a product to open", !!firstProduct, firstProduct);

const PAGES = ["/", "/admin.html", "/browse", "/brands", "/c/charging", "/checkout"]
  .concat(firstProduct ? ["/p/" + firstProduct] : []);
for (const page of PAGES) {
  for (const code of LANGS) {
    const tab = await browser.newPage();
    const errors = [];
    tab.on("pageerror", e => errors.push(String(e)));
    await tab.evaluateOnNewDocument(lang => localStorage.setItem("smarttech_lang", lang), code);
    await tab.goto(BASE + page, { waitUntil: "networkidle0" });
    await new Promise(r => setTimeout(r, 400));

    const info = await tab.evaluate(() => {
      const visible = el => {
        const style = getComputedStyle(el);
        return style.display !== "none" && style.visibility !== "hidden" && el.offsetParent !== null;
      };
      const texts = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const value = node.textContent.trim();
        if (!value) continue;
        const parent = node.parentElement;
        if (!parent || parent.closest("script,style") || !visible(parent)) continue;
        texts.push(value);
      }
      const untranslated = [...document.querySelectorAll("[data-i18n]")].filter(el => visible(el) && !el.textContent.trim()).map(el => el.dataset.i18n);
      return {
        lang: document.documentElement.lang,
        dir: document.documentElement.dir,
        title: document.title,
        texts,
        untranslated,
        markers: document.body.innerHTML.includes("\u27E6")
      };
    });

    const label = `[${code}] ${page}`;
    check(`${label} html lang/dir`, info.lang === code && info.dir === (code === "ar" ? "rtl" : "ltr"), info);
    /* The two pages whose title is one dictionary key. A product or category
       page titles itself after what it is showing, which content-test reads. */
    if (page === "/" || page === "/admin.html") {
      check(`${label} title is translated`, info.title === maps[code][page === "/" ? "pageTitle" : "adminPageTitle"], info.title);
    }
    check(`${label} every visible i18n element is filled`, !info.untranslated.length, info.untranslated);
    check(`${label} no missing-key markers`, !info.markers);
    check(`${label} no page errors`, !errors.length, errors);

    // No other language may leak onto the page.
    const joined = info.texts.join(" ");
    if (code !== "ar") check(`${label} contains no Arabic`, !ARABIC.test(joined), (joined.match(/.{0,30}[\u0600-\u06FF].{0,30}/) || [])[0]);
    if (code !== "tr") check(`${label} contains no Turkish letters`, !TURKISH.test(joined), (joined.match(/.{0,30}[ğĞşŞıİçÇöÖüÜ].{0,30}/) || [])[0]);

    // Signature strings of the active language must be present.
    check(`${label} shows its own dictionary`, joined.includes(maps[code][SIGNATURE[code]]) || page !== "/", maps[code][SIGNATURE[code]]);

    // Every visible text must come from the dictionary or from product data.
    if (page === "/") {
      const values = new Set(Object.values(maps[code]));
      const templates = Object.values(maps[code]).filter(v => v.includes("{")).map(v =>
        new RegExp("^" + v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\{\w+\\\}/g, ".+") + "$"));
      const data = await tab.evaluate(async code => {
        const names = window.STORE.products.flatMap(p => [p.name, p.brand, p.description]);
        let copy = {};
        try {
          const res = await fetch("/assets/copy." + code + ".json");
          if (res.ok) copy = await res.json();
        } catch (e) {}
        // Product copy is content, not interface text, but it must still be
        // present in the language being shown — which is what makes it valid here.
        const localised = Object.values(copy).flatMap(c => [c.n, c.s]).filter(Boolean);
        // The delivery, warranty and returns text is content in the same sense.
        let policies = {};
        try {
          const res = await fetch("/assets/policies.json");
          if (res.ok) policies = await res.json();
        } catch (e) {}
        const policyText = Object.values(policies).flatMap(section => [
          section.title && section.title[code],
          section.intro && section.intro[code]
        ].concat((section.points || []).flatMap(pt => [pt.q && pt.q[code], pt.a && pt.a[code]]))).filter(Boolean);
        return names.concat(window.STORE.brands).concat(localised).concat(policyText);
      }, code);
      const dataSet = new Set(data);
      const stray = info.texts.filter(text => {
        if (values.has(text) || dataSet.has(text)) return false;
        if (text === "S") return false;
        if (Object.values(maps[code]).some(v => v.includes(text) && text.length > 2)) return false;
        if (templates.some(re => re.test(text))) return false;
        if (/^[\s\d.,:$%+×−•—·()|/-]*$/.test(text)) return false;
        if (/^\+?[\d ]+$/.test(text)) return false;
        if (/^[\w.+-]+@[\w.-]+$/.test(text)) return false;
        if (data.some(name => text.includes(name))) return false;
        if (Object.values(maps[code]).some(v => text.includes(v) && v.length > 3)) return false;
        return true;
      });
      check(`${label} every visible string comes from the dictionary`, !stray.length, stray.slice(0, 6));
    }
    await tab.close();
  }
}

// Switching language at runtime must re-render everything.
{
  const tab = await browser.newPage();
  await tab.goto(BASE, { waitUntil: "networkidle0" });
  await tab.select("#langSelect", "tr");
  await new Promise(r => setTimeout(r, 400));
  const afterSwitch = await tab.evaluate(() => ({
    dir: document.documentElement.dir,
    title: document.title,
    heading: (document.querySelector("#homeTitle") || {}).textContent,
    card: (document.querySelector(".pcard__name") || {}).textContent,
    stored: localStorage.getItem("smarttech_lang")
  }));
  check("switching to tr updates the page", afterSwitch.dir === "ltr" &&
    afterSwitch.heading === maps.tr.homeTitle && afterSwitch.title === maps.tr.pageTitle, afterSwitch);
  check("switching to tr updates the products", !ARABIC.test(afterSwitch.card || ""), afterSwitch.card);
  /* The cart sheet is empty markup until cart.js writes it, and its words
     travel in a chunk that is fetched at the same moment. Opening it is the
     only way to find out whether that chunk actually arrived and arrived in
     the language the shopper chose — nothing else on the page reads those
     keys, so a chunk that failed to load would otherwise go unnoticed. */
  await tab.click("#cartBtn");
  await new Promise(r => setTimeout(r, 600));
  const sheet = await tab.evaluate(() => {
    const el = document.querySelector("#cart-title");
    return { title: el ? el.textContent : null, markers: document.querySelector("#cart").innerHTML.includes("⟦") };
  });
  check("the cart sheet arrives in tr", sheet.title === maps.tr.cartTitle && !sheet.markers, sheet);
  check("language choice is remembered", afterSwitch.stored === "tr", afterSwitch.stored);
  await tab.reload({ waitUntil: "networkidle0" });
  const afterReload = await tab.evaluate(() => document.documentElement.lang);
  check("language survives a reload", afterReload === "tr", afterReload);
  await tab.close();
}

await browser.close();
console.log(failures ? `\n${failures} LANGUAGE FAILURES` : "\nAll language checks passed");
process.exit(failures ? 1 : 0);
