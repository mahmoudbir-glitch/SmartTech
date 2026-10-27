/*
 * /track — find an order by its number and the phone it was placed with.
 * ======================================================================
 *   GET  /track[?lang=&ref=]   the form (rewritten from /track)
 *   GET  /api/track?asset=js   its script (CSP is script-src 'self')
 *   POST /api/track            { ref, phone } → { ok, url } | 404 not_found
 *
 * For the customer who lost the receipt link. A match answers with that same
 * signed link (/o/<ref>-<token>), so this endpoint returns no personal data
 * of its own: the receipt page stays the one place an order is shown, and its
 * status card is what reflects the owner's changes.
 *
 * References are sequential and therefore guessable, so the phone is the
 * secret and this is a guessing target. Three defences:
 *  - a wrong number and a wrong phone answer identically (no oracle for which
 *    references exist), and the phone is compared in constant time;
 *  - per-caller limits, as on POST /api/order;
 *  - a per-reference limit, so a known reference cannot be walked through
 *    phone numbers from many addresses.
 * Without JavaScript the form posts urlencoded and gets a 303 to the receipt.
 */
import crypto from "crypto";
import { get } from "@vercel/blob";
import { z } from "zod";
import { mutateJson } from "./admin.js";
import { loadText, tokenFor, esc, CSS } from "./o.js";
import { e164, phoneKeyOf } from "../lib/shop.mjs";

const RATE_PATH = "data/track/rate.json";
const LANGS = ["ar", "en", "tr"];
const DIR = { ar: "rtl", en: "ltr", tr: "ltr" };
const REF = /^[A-Z]{2,8}-\d{6}-\d{3}$/;

const MINUTE = 60000;
const HOUR = 3600000;
/* A customer retyping a number gets several tries a minute; a script gets
   twenty an hour from one address and ten an hour against one order. */
const LIMITS = { caller: { minute: 5, hour: 20 }, ref: { minute: 5, hour: 10 } };

/* Arabic-Indic and Persian digits are what a Syrian phone keyboard types. */
const asciiDigits = s => String(s == null ? "" : s)
  .replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x0660))
  .replace(/[\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) - 0x06F0));

const Lookup = z.object({
  ref: z.string().max(40).transform(v => asciiDigits(v).replace(/\s+/g, "").toUpperCase()).pipe(z.string().regex(REF)),
  phone: z.string().max(40).transform(v => e164(asciiDigits(v))).pipe(z.string().min(9))
});

const sha = value => crypto.createHash("sha256").update(String(value)).digest();
const same = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));

function callerKey(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const ip = forwarded || (req.socket && req.socket.remoteAddress) || "unknown";
  return "c:" + sha("track-caller:" + ip).toString("hex").slice(0, 16);
}

/* Seconds to wait, or 0. Every attempt counts, matched or not. */
async function rateLimited(keys) {
  return mutateJson(RATE_PATH, {}, table => {
    const now = Date.now();
    for (const [k, hits] of Object.entries(table)) {
      if (k === "_wait") continue;
      const kept = (hits || []).filter(at => now - at < HOUR);
      if (kept.length) table[k] = kept; else delete table[k];
    }
    let wait = 0;
    for (const [kind, key] of keys) {
      const mine = table[key] || [];
      const lim = LIMITS[kind];
      if (mine.filter(at => now - at < MINUTE).length >= lim.minute) wait = Math.max(wait, 60);
      else if (mine.length >= lim.hour) wait = Math.max(wait, Math.ceil((HOUR - (now - mine[0])) / 1000));
    }
    if (!wait) for (const [, key] of keys) (table[key] = table[key] || []).push(now);
    table._wait = wait;
    return table;
  }).then(table => table._wait || 0);
}

async function readOrder(ref) {
  const month = ref.split("-")[1].slice(0, 4);
  const blob = await get("data/orders/" + month + "/" + ref + ".json", { access: "private", useCache: false });
  if (!blob) return null;
  try { return JSON.parse(await new Response(blob.stream).text()); } catch (e) { return null; }
}

/* ------------------------------------------------------------------ page */

const PAGE_CSS = `
form{display:grid;gap:14px;margin-block-start:16px}
label{display:grid;gap:6px;font-size:.875rem;font-weight:700}
input{font:inherit;font-weight:400;min-block-size:48px;padding:0 14px;border:1px solid #9FAEC0;border-radius:12px;background:#fff;color:var(--ink)}
input:focus-visible{outline:3px solid #0B1626;outline-offset:2px}
.hint{font-weight:400;font-size:.8125rem;color:var(--muted)}
.btn--primary{background:var(--brand);color:#fff}
.err{color:#A4283A;font-size:.875rem;font-weight:700;min-block-size:1.5em}
.intro{font-size:.875rem;color:var(--muted)}
`;

/* Language: ?lang=, else the shop's saved choice (read by the script, which
   reloads with ?lang= when it differs), else Arabic. */
const SCRIPT = `(function(){
  var q=new URLSearchParams(location.search),saved="";
  try{saved=localStorage.getItem("smarttech_lang")||""}catch(e){}
  if(!q.get("lang")&&saved&&saved!==document.documentElement.lang&&/^(ar|en|tr)$/.test(saved)){q.set("lang",saved);location.replace("/track?"+q);return}
  var f=document.getElementById("track"),err=document.getElementById("err"),btn=f&&f.querySelector("button");
  if(!f)return;
  f.addEventListener("submit",function(e){
    e.preventDefault();
    if(btn.disabled)return;
    var label=btn.textContent;btn.disabled=true;btn.textContent=btn.getAttribute("data-busy");err.textContent="";
    fetch("/api/track",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ref:f.ref.value,phone:f.phone.value,lang:document.documentElement.lang})})
    .then(function(r){return r.json().catch(function(){return{}}).then(function(j){return{s:r.status,j:j}})})
    .then(function(o){
      if(o.s===200&&o.j.ok&&o.j.url){location.assign(o.j.url);return}
      err.textContent=err.getAttribute(o.s===429?"data-many":o.s===404||o.s===400?"data-none":"data-fail");
      btn.disabled=false;btn.textContent=label;f.ref.focus();
    },function(){err.textContent=err.getAttribute("data-fail");btn.disabled=false;btn.textContent=label});
  });
})();`;

function page(say, code, values, error) {
  const v = values || {};
  return '<!DOCTYPE html><html lang="' + code + '" dir="' + DIR[code] + '"><head>' +
    '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta name="robots" content="noindex, nofollow">' +
    '<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">' +
    "<title>" + esc(say("trackTitle")) + "</title>" +
    "<style>" + CSS + PAGE_CSS + "</style></head><body><div class=\"wrap\"><div class=\"card\">" +
    "<h1>" + esc(say("trackTitle")) + "</h1>" +
    '<p class="intro">' + esc(say("trackIntro")) + "</p>" +
    '<form id="track" method="post" action="/api/track" novalidate>' +
      '<input type="hidden" name="lang" value="' + code + '">' +
      "<label>" + esc(say("trackRef")) +
        '<input name="ref" dir="ltr" autocomplete="off" autocapitalize="characters" required maxlength="40" value="' + esc(v.ref || "") + '">' +
        '<span class="hint">' + esc(say("trackRefHint")) + "</span></label>" +
      "<label>" + esc(say("trackPhone")) +
        '<input name="phone" type="tel" dir="ltr" inputmode="tel" autocomplete="tel" required maxlength="40" value="' + esc(v.phone || "") + '"></label>' +
      '<p class="err" id="err" role="alert" data-none="' + esc(say("trackNotFound")) + '" data-many="' + esc(say("trackTooMany")) +
        '" data-fail="' + esc(say("trackError")) + '">' + (error ? esc(say(error)) : "") + "</p>" +
      '<button type="submit" class="btn btn--primary" data-busy="' + esc(say("trackBusy")) + '">' + esc(say("trackSubmit")) + "</button>" +
    "</form></div>" +
    '<p class="keep"><a href="/?lang=' + code + '">' + esc(say("ocHome")) + "</a></p>" +
    '</div><script src="/api/track?asset=js" defer></script></body></html>';
}

/* --------------------------------------------------------------- handler */

export default async function handler(req, res) {
  const query = req.query || {};

  if (req.method === "GET" && String(query.asset || "") === "js") {
    res.setHeader("Content-Type", "text/javascript; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=0, must-revalidate, s-maxage=604800");
    return res.status(200).send(SCRIPT);
  }

  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");

  let body = req.body;
  const form = /application\/x-www-form-urlencoded/.test(String(req.headers["content-type"] || ""));
  if (typeof body === "string") {
    try { body = form ? Object.fromEntries(new URLSearchParams(body)) : JSON.parse(body || "{}"); } catch (e) { body = {}; }
  }
  if (!body || typeof body !== "object") body = {};

  const asked = String((req.method === "POST" ? body.lang : query.lang) || "").toLowerCase();
  const code = LANGS.includes(asked) ? asked : "ar";

  const i18n = await loadText().then(w => w.I18N).catch(() => null);
  if (!i18n) { res.statusCode = 500; return res.end(""); }
  const say = key => i18n.t(key, null, code);

  /* As a page: the form, or the form again with the reason. */
  const answerPage = (status, error) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(status).send(page(say, code, form ? { ref: body.ref, phone: body.phone } : { ref: query.ref }, error));
  };
  const answer = (status, payload, error) => form ? answerPage(status, error) : res.status(status).json(payload);

  if (req.method === "GET") return answerPage(200, "");
  if (req.method !== "POST") { res.setHeader("Allow", "GET, POST"); return res.status(405).json({ ok: false, error: "method_not_allowed" }); }

  const parsed = Lookup.safeParse({ ref: String(body.ref ?? ""), phone: String(body.phone ?? "") });
  /* Malformed input still costs an attempt, but answers like a miss. */
  const ref = parsed.success ? parsed.data.ref : "";

  try {
    const keys = [["caller", callerKey(req)]];
    if (ref) keys.push(["ref", "r:" + ref]);
    const wait = await rateLimited(keys);
    if (wait) {
      res.setHeader("Retry-After", String(wait));
      return answer(429, { ok: false, error: "too_many_attempts" }, "trackTooMany");
    }
  } catch (e) {
    /* Unlike checkout, a lookup that cannot be counted is refused: the limit
       is the whole defence here, and the receipt link is the other way in. */
    console.error("track rate limit unavailable", e);
    return answer(503, { ok: false, error: "unavailable" }, "trackError");
  }

  if (!parsed.success) return answer(404, { ok: false, error: "not_found" }, "trackNotFound");

  let order = null;
  try { order = await readOrder(ref); } catch (e) {
    console.error("track read failed", e);
    return answer(503, { ok: false, error: "unavailable" }, "trackError");
  }
  const want = phoneKeyOf(parsed.data.phone);
  const have = order && order.customer ? String(order.customer.phoneKey || phoneKeyOf(order.customer.phone)) : "";
  /* Compared even when there is no order, against a value that cannot match,
     so a miss on the number and a miss on the phone take the same path. */
  const match = same(want, have || "-") && !!have;
  if (!match) return answer(404, { ok: false, error: "not_found" }, "trackNotFound");

  const url = "/o/" + ref + "-" + tokenFor(ref) + "?lang=" + code;
  if (form) { res.setHeader("Location", url); return res.status(303).end(); }
  return res.status(200).json({ ok: true, url });
}
