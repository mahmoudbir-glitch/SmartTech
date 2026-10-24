/*
 * Writes the crawler-visible <head> of index.html from the Arabic dictionary.
 * WhatsApp, Facebook and non-JS crawlers never run i18n.js, so the default
 * language has to be present in the markup. i18n.js still overwrites it at
 * runtime for anyone whose language is not Arabic.
 * Run this after changing pageTitle / metaDescription in i18n.js.
 */
const fs = require("fs");
const path = require("path");

const REPO = process.argv[2] || path.resolve(__dirname, "..");
const SITE = "https://smarttech-mahmoudbir.vercel.app";

const win = {};
/* Every chunk of the split dictionary, so a key that moved is still found. */
const DICTS = ["i18n.js", "i18n-cat.js", "i18n-order.js", "i18n-pdp.js"]
  .filter(f => fs.existsSync(path.join(REPO, f)));
for (const dict of DICTS) {
  new Function("window", "navigator", "localStorage", "location",
    fs.readFileSync(path.join(REPO, dict), "utf8")
  )(win, { languages: ["ar"] }, { getItem: () => null, setItem: () => {} }, { search: "" });
}

const ar = win.I18N.dict.ar;
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const block = [
  '<title>' + esc(ar.pageTitle) + '</title>',
  '<meta name="description" content="' + esc(ar.metaDescription) + '">',
  '<link rel="canonical" href="' + SITE + '/">',
  '<meta property="og:type" content="website">',
  '<meta property="og:site_name" content="' + esc(ar.brandName) + '">',
  '<meta property="og:url" content="' + SITE + '/">',
  '<meta property="og:title" content="' + esc(ar.pageTitle) + '">',
  '<meta property="og:description" content="' + esc(ar.metaDescription) + '">',
  '<meta property="og:image" content="' + SITE + '/assets/og-cover.png">',
  '<meta property="og:image:width" content="1200">',
  '<meta property="og:image:height" content="630">',
  '<meta property="og:locale" content="ar_AR">',
  '<meta property="og:locale:alternate" content="en_US">',
  '<meta property="og:locale:alternate" content="tr_TR">',
  '<meta name="twitter:card" content="summary_large_image">',
  '<meta name="twitter:title" content="' + esc(ar.pageTitle) + '">',
  '<meta name="twitter:description" content="' + esc(ar.metaDescription) + '">',
  '<meta name="twitter:image" content="' + SITE + '/assets/og-cover.png">',
  '<link rel="alternate" hreflang="ar" href="' + SITE + '/?lang=ar">',
  '<link rel="alternate" hreflang="en" href="' + SITE + '/?lang=en">',
  '<link rel="alternate" hreflang="tr" href="' + SITE + '/?lang=tr">',
  '<link rel="alternate" hreflang="x-default" href="' + SITE + '/">'
];

const file = path.join(REPO, "index.html");
let html = fs.readFileSync(file, "utf8");
const eol = html.includes("\r\n") ? "\r\n" : "\n";
const START = "<!-- head:start (generated from i18n.js by tools/sync-head.cjs — do not edit by hand) -->";
const END = "<!-- head:end -->";

const generated = [START].concat(block).concat([END]).join(eol);

if (html.includes(START)) {
  html = html.replace(new RegExp(START.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[\\s\\S]*?" + END), generated);
} else {
  html = html
    .replace(/<meta name="description" content="[^"]*">\r?\n/, "")
    .replace(/<title>[^<]*<\/title>/, generated);
}
fs.writeFileSync(file, html);
console.log("index.html head synced from i18n.js (ar)");
