/*
 * Imports the supplier catalogue (beirutco.com.lb WooCommerce Store API) into
 * the store's own catalog.js format, and downloads one photo per product.
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const HERE = __dirname;
const REPO = path.resolve(__dirname, "..");
const IMG_DIR = path.join(REPO, "assets/products");
const SOURCE = process.env.SUPPLIER_API || "https://beirutco.com.lb/wp-json/wc/store/v1/products";
let all = [];

const decode = t => String(t || "")
  .replace(/&#(\d+);/g, (m, code) => String.fromCharCode(Number(code)))
  .replace(/&#x([0-9a-f]+);/gi, (m, code) => String.fromCharCode(parseInt(code, 16)))
  .replace(/&(amp|lt|gt|quot|apos|nbsp|rsquo|lsquo|ldquo|rdquo|hellip|mdash|ndash|deg|times|trade|reg|copy);/gi,
    (m, name) => ({ amp: "&", lt: "<", gt: ">", quot: String.fromCharCode(34), apos: "'", nbsp: " ", rsquo: "'", lsquo: "'",
      ldquo: String.fromCharCode(34), rdquo: String.fromCharCode(34), hellip: "…", mdash: "—", ndash: "–", deg: "°",
      times: "×", trade: "™", reg: "®", copy: "©" }[name.toLowerCase()] || m));

const strip = h => decode(String(h || "")
  .replace(/<li[^>]*>/gi, " • ")
  .replace(/<[^>]*>/g, " "))
  .replace(/\s+/g, " ")
  .trim();

const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).replace(/[\s•,.;-]+$/, "") + "…" : s);

// Supplier category → our category id
const CATEGORY_RULES = [
  [/Phone Cases|AirPods Cases|Aramid|MagSafe Grip|MagSafe Card Wallets|Watch Band|Travel Case|PITAKA/i, "phone-cases"],
  [/Power Banks|MagSafe Power Banks/i, "power-bank"],
  [/Portable Power Stations|Solar/i, "solar"],
  [/Home Theater Projectors|Nebula|Projector/i, "projector"],
  [/Earbuds|Headphones|Portable Speakers|Soundcore|Conferencing/i, "audio"],
  [/Battery Camera|Wired Cam|Video Doorbell|PoE NVR|Alarm System|Smart Lock|HomeBase|Security/i, "security"],
  [/Robot Vacuum|Mops|Smart Health|Baby Monitor|eufyMake|Smart Home|Appliances|Mom/i, "smart-home"],
  [/Car Charger|Car Mounts/i, "car"],
  [/Hubs/i, "hubs-docks"],
  [/Cables/i, "cables"],
  [/Wireless|MagGo/i, "wireless"],
  [/Chargers|Travel Adapter|Prime/i, "charger"],
  [/Dust Bags|Filters|Roller Brush|Side Brushes|Brush Guards|Replacement Battery|Tripod|Kits|Batteries|Coolers|Cleaning Solution|Accessories|Kingston/i, "accessories"]
];

function categoryFor(product) {
  const names = product.categories.map(c => c.name);
  for (const [re, id] of CATEGORY_RULES) {
    if (names.some(n => re.test(n))) return id;
  }
  return "accessories";
}

const BRAND_MAP = { "Anker eufy": "eufy", "Anker Soundcore": "soundcore", "Anker Nebula": "Nebula", "Anker": "Anker", "PITAKA": "PITAKA" };
function brandFor(product) {
  const raw = (product.brands && product.brands[0] && product.brands[0].name) || "";
  let brand = BRAND_MAP[raw] || raw;
  if (/^SOLIX|Anker SOLIX/i.test(product.name)) brand = "Anker SOLIX";
  if (!brand) {
    const guess = product.categories.map(c => c.name).find(n => /Kingston/i.test(n));
    brand = guess || "Anker";
  }
  return brand;
}

const money = cents => Math.round(Number(cents || 0)) / 100;

async function fetchAll() {
  const pages = [];
  for (let page = 1; page <= 20; page++) {
    const res = await fetch(SOURCE + "?per_page=100&page=" + page, { headers: { "user-agent": "smarttech-catalog-import" } });
    if (!res.ok) break;
    const batch = await res.json();
    if (!Array.isArray(batch) || !batch.length) break;
    pages.push(...batch);
    if (batch.length < 100) break;
  }
  return pages;
}

async function run() {
  all = await fetchAll();
  console.log("supplier products:", all.length);
  if (!all.length) throw new Error("no products returned by " + SOURCE);
  fs.mkdirSync(IMG_DIR, { recursive: true });
  const products = [];
  const skipped = [];
  let downloaded = 0, reused = 0, failed = 0;

  for (const raw of all) {
    const price = money(raw.prices.price);
    const regular = money(raw.prices.regular_price);
    if (!price || !raw.name) { skipped.push(raw.name || raw.id); continue; }

    const id = Number(raw.id);
    const file = `assets/products/${id}.webp`;
    const target = path.join(REPO, file);

    if (!fs.existsSync(target)) {
      const src = (raw.images[0] || {}).src;
      if (!src) { failed++; continue; }
      try {
        const url = src.replace(/fit=\d+%2C\d+/, "fit=800%2C800");
        const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (catalog import)" } });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const buffer = Buffer.from(await res.arrayBuffer());
        await sharp(buffer)
          .resize(700, 700, { fit: "inside", withoutEnlargement: true })
          .webp({ quality: 74 })
          .toFile(target);
        downloaded++;
      } catch (e) {
        console.log("image failed", id, raw.name, String(e).slice(0, 60));
        failed++;
        continue;
      }
    } else reused++;

    const short = strip(raw.short_description);
    const long = strip(raw.description);
    const description = clip(short || long, 150) || raw.name;
    const details = clip(long || short, 600);

    products.push({
      id,
      category: categoryFor(raw),
      brand: brandFor(raw),
      name: decode(raw.name).replace(/\s+/g, " ").trim(),
      sku: raw.sku || "",
      description,
      oldPrice: regular > price ? regular : price,
      price,
      detailsText: details === description ? "" : details,
      image: file,
      inStock: raw.is_in_stock !== false
    });
    if (products.length % 40 === 0) console.log("processed", products.length);
  }

  const order = ["power-bank", "charger", "wireless", "cables", "hubs-docks", "power", "car", "audio", "security", "smart-home", "projector", "solar", "phone-cases", "accessories"];
  products.sort((a, b) => (order.indexOf(a.category) - order.indexOf(b.category)) || a.brand.localeCompare(b.brand) || b.price - a.price);

  const details = {};
  products.forEach(p => { if (p.detailsText) { details[p.id] = p.detailsText; delete p.detailsText; } });
  fs.writeFileSync(path.join(REPO, "assets/details.json"), JSON.stringify(details));
  console.log("details file:", Math.round(fs.statSync(path.join(REPO, "assets/details.json")).size / 1024) + "KB");

  const lines = [];
  let current = "";
  for (const p of products) {
    if (p.category !== current) { current = p.category; lines.push("    // " + current); }
    lines.push("    " + JSON.stringify(p).replace(/"(\w+)":/g, "$1:") + ",");
  }
  lines[lines.length - 1] = lines[lines.length - 1].replace(/,$/, "");
  fs.writeFileSync(path.join(HERE, "products-block.txt"), lines.join("\n"));

  const byCat = {}, byBrand = {};
  products.forEach(p => { byCat[p.category] = (byCat[p.category] || 0) + 1; byBrand[p.brand] = (byBrand[p.brand] || 0) + 1; });
  console.log("\nimported:", products.length, "| images downloaded:", downloaded, "reused:", reused, "failed:", failed, "| skipped:", skipped.length);
  console.log("by category:", JSON.stringify(byCat));
  console.log("by brand:", JSON.stringify(byBrand));
  console.log("out of stock:", products.filter(p => !p.inStock).length, "| discounted:", products.filter(p => p.oldPrice > p.price).length);
}

run();
