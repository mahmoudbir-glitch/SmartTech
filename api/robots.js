/*
 * GET /robots.txt — written from the trusted origin, not a static file.
 *
 * The static robots.txt named the *.vercel.app sitemap by hand, so the day
 * SITE_ORIGIN moves to the shop's own domain every crawler would keep being
 * sent to the old host. Same origin rule as api/sitemap.js: environment, then
 * the Vercel URL, never the request's Host header (this response is cached).
 *
 * Kept out: the console, the API's write paths, checkout, and the two
 * per-customer pages (receipt and tracking), which also carry noindex.
 * /api/image stays crawlable: product photos are served through it.
 */
const SITE_FALLBACK = "https://smarttech-mahmoudbir.vercel.app";

function trustedOrigin() {
  const host = process.env.SITE_ORIGIN || process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL || SITE_FALLBACK;
  return (/^https?:\/\//.test(host) ? host : "https://" + host).replace(/\/+$/, "");
}

export default function handler(req, res) {
  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin.html",
    "Disallow: /api/admin",
    "Disallow: /api/order",
    "Disallow: /api/orders",
    "Disallow: /api/track",
    "Disallow: /checkout",
    "Disallow: /o/",
    "Disallow: /track",
    "",
    "Sitemap: " + trustedOrigin() + "/sitemap.xml",
    ""
  ].join("\n");
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=86400");
  return res.status(200).send(body);
}
