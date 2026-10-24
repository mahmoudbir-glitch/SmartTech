/*
 * GET /o/<ref>-<token> — the order confirmation page.
 * ===================================================
 * A standalone, print-friendly document, not the index shell: the customer
 * arrives here from a submit and may come back to it in six months, and
 * neither visit should download a storefront.
 *
 * The URL carries a capability. References are sequential by design — that is
 * what makes them countable and what makes a gap in them visible — so the
 * number is guessable and cannot be the secret. The token is the first six hex
 * of HMAC-SHA256(ref, ORDER_URL_SECRET): stateless, nothing stored, and
 * unguessable without the key.
 *
 * Content order is deliberate. «ماذا يحدث الآن؟» sits ABOVE the line items,
 * because it is the trust payload — the customer already knows what they
 * bought and does not yet know what happens next. The address is shown back
 * exactly as entered: the cheapest possible defence against a wrong delivery,
 * placed at the only moment the customer is still paying attention.
 */
import crypto from "crypto";
import { get } from "@vercel/blob";

const STATE_PATH = "data/store-state.json";
const REF = /^[A-Z]{2,8}-\d{6}-\d{3}$/;
const LANGS = ["ar", "en", "tr"];
const DIR = { ar: "rtl", en: "ltr", tr: "ltr" };

const DEV_SECRET = "smarttech-order-url-dev-secret";
function orderSecret() {
  const secret = process.env.ORDER_URL_SECRET || process.env.ADMIN_SECRET || "";
  if (secret) return secret;
  console.error("ORDER_URL_SECRET is not set; confirmation links are using a development key");
  return DEV_SECRET;
}
const tokenFor = ref => crypto.createHmac("sha256", orderSecret()).update(String(ref)).digest("hex").slice(0, 6);
const sha = value => crypto.createHash("sha256").update(String(value)).digest();
const sameToken = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));

const SITE_FALLBACK = "https://smarttech-mahmoudbir.vercel.app";
function trustedOrigin() {
  const host = process.env.SITE_ORIGIN || process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL || SITE_FALLBACK;
  return /^https?:\/\//.test(host) ? host : "https://" + host;
}

/*
 * Vercel compiles these functions from ESM to CommonJS, where import.meta does
 * not exist. __dirname is what the compiled output provides.
 */
async function readSource(name) {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const bases = [];
  if (typeof __dirname !== "undefined") bases.push(path.join(__dirname, ".."), __dirname);
  bases.push(process.cwd());
  for (const base of bases) {
    try { return await fs.readFile(path.join(base, name), "utf8"); } catch (e) { /* next */ }
  }
  // Last resort: our own deployment over HTTP, never a Host-derived address.
  return fetch(trustedOrigin() + "/" + name).then(r => {
    if (!r.ok) throw new Error("cannot read " + name + ": HTTP " + r.status);
    return r.text();
  });
}

let win = null;
async function loadText() {
  if (win) return win;
  /* The dictionary is split by surface; this function renders the confirmation page and the message it composes,
     so it loads that chunk as well as the base file. */
  const CHUNKS = ["i18n-order.js"];
  const src = await readSource("i18n.js");
  const chunkSrc = await Promise.all(CHUNKS.map(f => readSource(f).catch(() => "")));
  const sandbox = {};
  const doc = {
    addEventListener() {}, removeEventListener() {},
    querySelector: () => null, querySelectorAll: () => [],
    documentElement: { dataset: {}, style: { setProperty() {} }, classList: { add() {}, remove() {} } },
    body: null, title: ""
  };
  new Function("window", "navigator", "localStorage", "location", "document", src)(
    sandbox, { languages: ["ar"] }, { getItem: () => null, setItem: () => {} }, { search: "" }, doc);
  /* The chunks merge into the same window.I18N.dict. */
  for (const chunk of chunkSrc.filter(Boolean)) {
      new Function("window", "navigator", "localStorage", "location", "document", chunk)(
      sandbox, { languages: ["ar"] }, { getItem: () => null, setItem: () => {} }, { search: "" }, doc);
  }
  win = sandbox;
  return win;
}

const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const money = n => "$" + (Math.round((Number(n) || 0) * 100) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const ltr = s => '<bdi dir="ltr">' + esc(s) + "</bdi>";

async function readJson(pathname) {
  const blob = await get(pathname, { access: "private", useCache: false });
  if (!blob) return null;
  try { return JSON.parse(await new Response(blob.stream).text()); } catch (e) { return null; }
}

/* Arabic plural has four shapes and the dictionary carries all of them. */
function pluralText(t, base, n) {
  const count = Number(n) || 0;
  const code = t.lang;
  let suffix = "Many";
  if (code !== "ar") suffix = count === 1 ? "One" : "Many";
  else if (count === 1) suffix = "One";
  else if (count === 2) suffix = "Two";
  else if (count <= 10) suffix = "Few";
  return t(base + suffix, { n: String(count) });
}

/* ------------------------------------------------------------------- page */

const CSS = `
/* This page loads no stylesheet — it is standalone by design — so it carries
   the three Cairo subsets itself. Same files, same unicode ranges as the shop;
   nothing is fetched from a font CDN. */
@font-face{font-family:"Cairo";font-style:normal;font-weight:400 800;font-display:swap;
  src:url("/assets/fonts/cairo-arabic.woff2") format("woff2");
  unicode-range:U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0897-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC}
@font-face{font-family:"Cairo";font-style:normal;font-weight:400 800;font-display:swap;
  src:url("/assets/fonts/cairo-latin.woff2") format("woff2");
  unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}
@font-face{font-family:"Cairo";font-style:normal;font-weight:400 800;font-display:swap;
  src:url("/assets/fonts/cairo-latin-ext.woff2") format("woff2");
  unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF}
:root{color-scheme:light;--ink:#121E31;--muted:#4F6078;--line:#DCE4EE;--brand:#1560C8;--wa:#0a6b34;--paper:#F3F7FB}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"Cairo","Cairo Fallback",system-ui,sans-serif;color:var(--ink);background:var(--paper);
  line-height:1.6;-webkit-text-size-adjust:100%}
.wrap{width:min(680px,calc(100% - 32px));margin-inline:auto;padding-block:24px 48px}
.card{background:#fff;border:1px solid var(--line);border-radius:18px;padding:20px 16px;margin-block-end:16px}
.tick{inline-size:48px;block-size:48px;border-radius:50%;background:#e7f7eb;color:#1b6738;display:grid;
  place-items:center;font-size:26px;font-weight:700;margin-block-end:12px}
h1{font-size:1.375rem;line-height:32px;font-weight:700}
h2{font-size:1rem;line-height:28px;font-weight:700;margin-block:20px 8px}
.refrow{display:flex;align-items:center;gap:8px;margin-block-start:8px;flex-wrap:wrap}
.refk{font-size:.8125rem;color:var(--muted)}
.refv{font-size:1.1875rem;font-weight:700;letter-spacing:.02em}
.copy{inline-size:44px;block-size:44px;display:grid;place-items:center;border:1px solid var(--line);
  border-radius:10px;background:#fff;color:var(--ink);font-size:.8125rem;cursor:pointer}
ol.next{padding-inline-start:22px;font-size:.875rem;line-height:1.55}
ol.next li{margin-block-end:8px}
.lines{list-style:none}
.line{display:grid;grid-template-columns:1fr auto;gap:2px 12px;padding-block:10px;border-block-start:1px solid var(--line);
  font-size:.875rem}
.line:first-child{border-block-start:0}
.line .nums{grid-column:1;font-size:.8125rem;color:var(--muted)}
.line b{grid-column:2;grid-row:1/3;align-self:center;white-space:nowrap}
.tot{display:flex;align-items:baseline;justify-content:space-between;gap:8px;font-size:.875rem;min-height:24px}
.tot--deliv{font-size:.8125rem;color:var(--muted)}
.tot--grand{margin-block-start:8px;padding-block-start:8px;border-block-start:1px solid var(--line);
  font-size:1rem;font-weight:700}
.addr{font-size:.875rem;line-height:1.6}
.acts{display:flex;flex-wrap:wrap;gap:12px;margin-block-start:20px}
.btn{flex:1 1 200px;min-block-size:52px;display:inline-flex;align-items:center;justify-content:center;gap:8px;
  padding:0 20px;border:1px solid transparent;border-radius:14px;font:inherit;font-weight:700;
  text-decoration:none;cursor:pointer}
.btn--wa{background:var(--wa);color:#fff}
.btn--ghost{background:#fff;border-color:var(--line);color:var(--ink)}
.keep{margin-block-start:12px;font-size:.8125rem;color:var(--muted)}
.vh{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
a:focus-visible,button:focus-visible{outline:3px solid #0B1626;outline-offset:2px;box-shadow:0 0 0 5px #fff}
@media print{body{background:#fff}.acts,.copy{display:none}.card{border:0;padding:0;margin-block-end:12px}}
`;

/* CSP is `script-src 'self'`, so the page cannot carry an inline script. This
   function serves its own, from its own origin. */
const SCRIPT = `(function(){
  function flash(el){var d=el.getAttribute("data-done");if(!d)return;var o=el.textContent;el.textContent=d;
    var s=document.getElementById("say");if(s)s.textContent=d;setTimeout(function(){el.textContent=o},2000)}
  function copy(text,el){
    if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(function(){flash(el)},function(){})
      ;return}
    var a=document.createElement("textarea");a.value=text;a.setAttribute("readonly","");a.style.position="absolute";
    a.style.left="-9999px";document.body.appendChild(a);a.select();try{document.execCommand("copy");flash(el)}catch(e){}
    document.body.removeChild(a)}
  document.addEventListener("click",function(e){
    var b=e.target.closest&&e.target.closest("[data-copy]");if(!b)return;e.preventDefault();copy(b.getAttribute("data-copy"),b)})
})();`;

export default async function handler(req, res) {
  const query = req.query || {};

  if (String(query.asset || "") === "js") {
    res.setHeader("Content-Type", "text/javascript; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=0, must-revalidate, s-maxage=604800");
    return res.status(200).send(SCRIPT);
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  /* Personal data. Never cached by a proxy, never indexed. */
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");

  const raw = String(query.ref || "");
  let ref = String(query.o || "");
  let token = String(query.token || "");
  if (!ref) {
    const cut = raw.lastIndexOf("-");
    ref = cut > 0 ? raw.slice(0, cut) : raw;
    if (!token) token = cut > 0 ? raw.slice(cut + 1) : "";
  }

  const t = await loadText().then(w => w.I18N).catch(() => null);
  const asked = String(query.lang || "").toLowerCase();

  if (!t) { res.statusCode = 500; return res.end(""); }

  /* A wrong token and an unknown reference answer identically, so the page is
     not an oracle for which numbers exist. */
  let order = null;
  if (REF.test(ref) && /^[0-9a-f]{6}$/.test(token)) {
    let ok = false;
    try { ok = sameToken(token, tokenFor(ref)); } catch (e) { ok = false; }
    if (ok) {
      const month = ref.split("-")[1].slice(0, 4);
      order = await readJson("data/orders/" + month + "/" + ref + ".json").catch(() => null);
    }
  }

  const code = LANGS.includes(asked) ? asked
    : (order && LANGS.includes(order.lang) ? order.lang : "ar");
  const say = (key, vars) => t.t(key, vars, code);
  say.lang = code;

  if (!order) {
    res.statusCode = 404;
    return res.end(shell(code, esc(say("ocBadLink")),
      '<div class="card"><h1>' + esc(say("ocBadLink")) + "</h1>" +
      "<p>" + esc(say("ocBadLinkBody")) + "</p>" +
      '<p class="acts"><a class="btn btn--ghost" href="/">' + esc(say("ocHome")) + "</a></p></div>"));
  }

  const origin = trustedOrigin();
  const url = origin + "/o/" + ref + "-" + token;
  const cityLabel = say("city." + order.customer.city);

  let whatsapp = "";
  try {
    const state = await readJson(STATE_PATH);
    whatsapp = String((state && state.settings && state.settings.whatsapp) || "").replace(/\D/g, "");
  } catch (e) { /* the catalogue default is filled in below */ }
  if (!whatsapp) whatsapp = "963982760670";

  /* Five lines. Every Arabic line is either pure Arabic or Arabic followed by
     exactly one trailing LTR run, so the bidi order is stable. */
  const message = [
    say("waHead", { ref: order.no }),
    say("waWho", { name: order.customer.name, city: cityLabel, items: pluralText(say, "cartItems", order.lines.length) }),
    say("waGoods", { sum: money(order.totals.items) }),
    order.delivery && order.delivery.fee != null
      ? say("waDelivKnown", { city: cityLabel, cost: money(order.delivery.fee) })
      : say("waDelivTbd"),
    say("waUrl", { url: url.replace(/^https?:\/\//, "") })
  ].join("\n");

  const steps = [
    say("ocNext1", { phone: ltr(order.customer.phone) }),
    esc(say("ocNext2")),
    esc(say("ocNext3"))
  ];

  const lines = order.lines.map(l =>
    '<li class="line"><span>' + esc(l.name) + "</span>" +
    '<span class="nums">' + ltr(l.sku) + " · " + ltr(l.qty) + " × " + ltr(money(l.unit)) + "</span>" +
    "<b>" + ltr(money(l.total)) + "</b></li>").join("");

  const feeKnown = order.delivery && order.delivery.fee != null;

  const body =
    '<div class="card">' +
      '<div class="tick" aria-hidden="true">✓</div>' +
      '<h1 role="status">' + esc(say("ocTitle")) + "</h1>" +
      '<p class="refrow"><span class="refk">' + esc(say("ocRefLabel")) + "</span>" +
        '<span class="refv" dir="ltr">' + esc(order.no) + "</span>" +
        '<button type="button" class="copy" data-copy="' + esc(order.no) + '" data-done="' + esc(say("ocCopied")) +
          '" aria-label="' + esc(say("ocCopyRef")) + '">⧉</button></p>' +
    "</div>" +

    '<div class="card">' +
      "<h2>" + esc(say("ocNext")) + "</h2>" +
      '<ol class="next">' + steps.map(s => "<li>" + s + "</li>").join("") + "</ol>" +
    "</div>" +

    '<div class="card">' +
      "<h2>" + esc(say("ocOrder")) + "</h2>" +
      '<ul class="lines">' + lines + "</ul>" +
      '<div class="tot" style="margin-block-start:12px"><span>' + esc(say("ocGoods")) + "</span><b>" +
        ltr(money(order.totals.items)) + "</b></div>" +
      '<div class="tot tot--deliv"><span>' + esc(say("ocDelivery", { city: cityLabel })) + "</span><span>" +
        (feeKnown ? ltr(money(order.delivery.fee)) : esc(say("ocDeliveryTbd"))) + "</span></div>" +
      '<div class="tot tot--grand"><span>' + esc(say("ocTotal")) + "</span><b>" +
        (feeKnown ? ltr(money(order.totals.items + order.delivery.fee))
                  : say("ocTotalExpr", { sum: ltr(money(order.totals.items)) })) + "</b></div>" +
      '<div class="tot tot--deliv" style="margin-block-start:8px"><span>' + esc(say("ocPayment")) + "</span><span>" +
        esc(say("payCod")) + "</span></div>" +
    "</div>" +

    '<div class="card">' +
      "<h2>" + esc(say("ocDeliverTo")) + "</h2>" +
      /* Exactly as entered, with nothing prepended: the city already appears in
         the totals row, and echoing it twice invites the reader to skim the
         line they are here to check. */
      '<p class="addr">' + esc(order.customer.name) + " · " + ltr(order.customer.phone) + "<br>" +
        esc(order.customer.address) + "</p>" +
    "</div>" +

    '<div class="acts">' +
      '<a class="btn btn--wa" href="https://wa.me/' + esc(whatsapp) + "?text=" + encodeURIComponent(message) +
        '" target="_blank" rel="noopener noreferrer">' + esc(say("ocTellUs")) + "</a>" +
      '<button type="button" class="btn btn--ghost" data-copy="' + esc(url) + '" data-done="' +
        esc(say("ocCopied")) + '">' + esc(say("ocCopy")) + "</button>" +
    "</div>" +
    '<p class="keep">' + esc(say("ocKeep")) + "</p>";

  return res.status(200).end(shell(code, esc(say("ocTitle")) + " " + esc(order.no), body));
}

function shell(code, title, body) {
  return '<!DOCTYPE html><html lang="' + code + '" dir="' + (DIR[code] || "rtl") + '"><head>' +
    '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta name="robots" content="noindex, nofollow">' +
    '<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">' +
    "<title>" + title + "</title>" +
    '<link rel="preload" as="font" type="font/woff2" href="/assets/fonts/cairo-arabic.woff2" crossorigin>' +
    "<style>" + CSS + "</style></head><body>" +
    '<div class="wrap">' + body + "</div>" +
    '<div class="vh" id="say" role="status" aria-live="polite"></div>' +
    '<script src="/api/o?asset=js" defer></script>' +
    "</body></html>";
}
