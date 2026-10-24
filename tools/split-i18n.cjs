/*
 * Splits the dictionary by surface, the way the code is already split.
 *
 * Every visible string in the shop lives in one dictionary, which is the rule
 * that keeps three languages honest. But the home page was downloading all of
 * it: the checkout's field labels, the WhatsApp message templates, the
 * fourteen governorates, and 7.5 KB gzipped of category descriptions that only
 * ever appear on a category page. Measured, that put the home page 8.8 KB over
 * a 60 KB JavaScript budget — most of two seconds on a 400 kbit/s Syrian line,
 * spent on words the shopper may never see.
 *
 * So a chunk ships with the file that renders it, exactly as product.js and
 * cart.js do. Each chunk merges into the same window.I18N.dict, so nothing
 * downstream can tell the difference — `SY.t` does not know or care which file
 * a key arrived in, and the language test still loads all of them and checks
 * one key set.
 *
 *   node tools/split-i18n.cjs
 *
 * It is idempotent: it reads the base file AND every chunk it wrote before,
 * so running it twice redistributes the same dictionary rather than eroding it.
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const REPO = path.resolve(__dirname, "..");
const SOURCE = path.join(REPO, "i18n.js");

/*
 * A key belongs in a chunk only if the surface that renders it is the ONLY
 * place it appears. Anything a card, the header or the footer touches stays in
 * the base file — a missing key renders ⟦key⟧ to a shopper, so the split errs
 * towards keeping things.
 */
/* The quantity stepper appears in the cart sheet and on the product page,
   which load different chunks, so its two labels stay in the base file. */
const STEPPER = new Set(["cartIncrease", "cartDecrease"]);

const CHUNKS = [
  {
    file: "i18n-cat.js",
    note: "category descriptions — a category page and the server that renders it",
    match: k => k.startsWith("catDesc.")
  },
  {
    file: "i18n-order.js",
    note: "the cart sheet, checkout, the confirmation page and the message",
    /* `cart*` belongs here: <dialog id="cart"> ships EMPTY in index.html and
       cart.js writes every word of it, so the chunk arrives with the code
       that needs it. The two exceptions are the quantity stepper's labels,
       which the product page also renders — and product.js brings i18n-pdp.js,
       not this chunk. Two short strings stay in the base file rather than
       being shipped twice. */
    match: k => (/^(cart|co|oc|wa|pay)[A-Z]/.test(k) && !STEPPER.has(k)) || k.startsWith("city.")
  },
  {
    file: "i18n-pdp.js",
    note: "the product page",
    match: k => /^(pdp|spec|gallery|variant|related)[A-Z]/.test(k)
  }
];

/* ------------------------------------------------------------------ read */
const source = fs.readFileSync(SOURCE, "utf8");
const win = {};
const load = src => new Function("window", "navigator", "localStorage", "location", "document", src)(
  win, { languages: ["ar"] }, { getItem: () => null, setItem() {} }, { search: "" }, undefined);
load(source);
/* Load the chunks this tool wrote on an earlier run, so the dictionary it
   partitions is the WHOLE dictionary and not merely what is left in the base
   file. Without this the tool is destructive rather than idempotent: it
   rewrites each chunk from the keys it finds in i18n.js, so a second run —
   after the first had already emptied the base of those keys — writes the
   chunk back with almost nothing in it. That silently deleted 28 checkout
   strings, and the only symptom was a checkout page of empty labels. */
for (const chunk of CHUNKS) {
  const file = path.join(REPO, chunk.file);
  if (fs.existsSync(file)) load(fs.readFileSync(file, "utf8"));
}
const dict = win.I18N.dict;
const LANGS = win.I18N.languages.map(l => l.code);

const flat = (obj, prefix = "") => Object.entries(obj).flatMap(([k, v]) =>
  v && typeof v === "object" ? flat(v, prefix + k + ".") : [[prefix + k, v]]);

const keys = flat(dict[LANGS[0]]).map(([k]) => k);
const gz = s => zlib.gzipSync(Buffer.from(s), { level: 9 }).length;

/* --------------------------------------------------------------- partition */
const taken = new Set();
const parts = CHUNKS.map(chunk => {
  const mine = keys.filter(k => !taken.has(k) && chunk.match(k));
  mine.forEach(k => taken.add(k));
  return Object.assign({ keys: mine }, chunk);
});

if (!taken.size) {
  console.log("nothing to split — the dictionary is already the base file only");
  process.exit(0);
}

/* ------------------------------------------------------------------ write */
function literal(value) {
  return JSON.stringify(String(value));
}

for (const part of parts) {
  if (!part.keys.length) { console.log(part.file + ": no keys matched"); continue; }
  const body = LANGS.map(code => {
    const rows = part.keys.map(k => "      " + literal(k) + ": " +
      literal(flat(dict[code]).find(([key]) => key === k)[1]) + ",");
    return "    " + code + ": {\n" + rows.join("\n") + "\n    }";
  }).join(",\n");

  const out = `/*
 * SmartTech — ${part.note}.
 * Generated by tools/split-i18n.cjs from i18n.js. Do not edit here; edit the
 * dictionary and re-run the tool.
 *
 * This is part of the same dictionary, in a separate file so that a page pays
 * only for the words it shows. It merges into window.I18N.dict, so nothing
 * that reads a string needs to know which file it came from.
 */
(function () {
  if (!window.I18N || !window.I18N.dict) return;
  const add = {
${body}
  };
  for (const code of Object.keys(add)) {
    const target = window.I18N.dict[code] || (window.I18N.dict[code] = {});
    for (const key of Object.keys(add[code])) {
      /* A dotted key is stored flat; I18N.t walks both shapes. */
      if (target[key] === undefined) target[key] = add[code][key];
    }
  }
  if (typeof window.I18N.onChunk === "function") window.I18N.onChunk(${JSON.stringify(part.file)});
})();
`;
  fs.writeFileSync(path.join(REPO, part.file), out);
}

/* Remove the moved keys from the base file, line by line, so everything that
   is staying keeps its position and its comments.

   A dotted key such as `catDesc.audio` is written NESTED in the base file —
   `catDesc: { audio: "..." }` — so matching the leaf line alone never removed
   it: the leaf there is called `audio`, and `audio` is not the key that moved.
   Every category description therefore stayed in the base file and the home
   page went on downloading 8 KB gzipped of them, which is the whole reason
   this tool exists. So a block whose every leaf has moved is dropped whole.

   The scan is confined to the `const dict = {` literal and to the blocks one
   level inside a language. Letting it loose over the file is how a first
   attempt ate two thirds of i18n.js: further down are functions whose closing
   braces look exactly like a dictionary's. */
const lines = source.split(/\r?\n/);
const eol = source.includes("\r\n") ? "\r\n" : "\n";
const keyLine = /^\s*(?:"([^"]+)"|([A-Za-z_$][\w$]*))\s*:\s*"/;
const blockLine = /^(\s*)(?:"([^"]+)"|([A-Za-z_$][\w$]*))\s*:\s*\{\s*$/;

/* The bounds of the dictionary literal, by brace depth. */
const dictStart = lines.findIndex(l => /^\s*const dict = \{\s*$/.test(l));
let dictEnd = lines.length;
if (dictStart >= 0) {
  let depth = 0;
  for (let i = dictStart; i < lines.length; i++) {
    depth += (lines[i].match(/\{/g) || []).length - (lines[i].match(/\}/g) || []).length;
    if (depth === 0) { dictEnd = i; break; }
  }
}

/* Every leaf below this path moved out, and there was at least one. */
const allTaken = prefix => {
  const under = keys.filter(k => k.startsWith(prefix + "."));
  return under.length > 0 && under.every(k => taken.has(k));
};

const kept = [];
let lang = null;               // the language block we are inside, or null
let dropAt = -1;               // indent of a nested block being skipped
lines.forEach((line, i) => {
  if (i < dictStart || i > dictEnd) { kept.push(line); return; }
  if (dropAt >= 0) {
    /* The block ends at the closing brace on its own indent. Built by hand
       rather than by RegExp(): a backslash that has to survive being written
       into a file is one backslash too many, and the first attempt silently
       matched nothing, so the skip ran to the end of the dictionary. */
    const indent = line.length - line.replace(/^\s+/, "").length;
    if (indent === dropAt && /^\s*\},?\s*$/.test(line)) dropAt = -1;
    return;
  }
  const block = line.match(blockLine);
  if (block) {
    const name = block[2] || block[3];
    if (block[1].length === 4) { lang = name; kept.push(line); return; }   // ar: {
    if (lang && allTaken(name)) { dropAt = block[1].length; return; }
    kept.push(line);
    return;
  }
  if (/^\s{4}\},?\s*$/.test(line)) { lang = null; kept.push(line); return; }
  const m = line.match(keyLine);
  if (m && taken.has(m[1] || m[2])) return;
  kept.push(line);
});
fs.writeFileSync(SOURCE, kept.join(eol));

/* ------------------------------------------------------------------ report */
const after = fs.readFileSync(SOURCE, "utf8");
console.log("i18n.js  " + gz(source) + " -> " + gz(after) + " B gz  (" +
  (keys.length - taken.size) + " of " + keys.length + " keys)");
for (const part of parts) {
  if (!part.keys.length) continue;
  console.log(part.file.padEnd(16) + String(gz(fs.readFileSync(path.join(REPO, part.file), "utf8"))).padStart(6) +
    " B gz  " + String(part.keys.length).padStart(3) + " keys  — " + part.note);
}

/* The base file must still load, or every page renders raw markup. */
const check = {};
try {
  new Function("window", "navigator", "localStorage", "location", "document", after)(
    check, { languages: ["ar"] }, { getItem: () => null, setItem() {} }, { search: "" }, undefined);
  if (!check.I18N || typeof check.I18N.t !== "function") throw new Error("window.I18N is not exported");
  console.log("\nthe base dictionary still loads and exports I18N.t");
} catch (e) {
  console.error("\nthe base dictionary no longer loads: " + e.message);
  process.exit(1);
}
