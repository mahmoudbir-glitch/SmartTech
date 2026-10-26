/*
 * Guards vercel.json, because a mistake here does not break a page — it stops
 * the whole deployment, and the shop keeps serving the previous build while
 * everything looks fine locally.
 *
 * The rule that bit us: Vercel walks the `functions` patterns in order and
 * removes every file a pattern claims from the pool. A later pattern that is
 * already covered by an earlier one ("api/*.js" then "api/p.js") matches
 * nothing, and the build fails with
 *   The pattern "api/p.js" defined in `functions` doesn't match any
 *   Serverless Functions inside the `api` directory.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");

let failures = 0;
function check(name, ok, detail) {
  console.log((ok ? "PASS " : "FAIL ") + name + (ok || detail === undefined ? "" : " -> " + JSON.stringify(detail)));
  if (!ok) failures++;
}

const raw = fs.readFileSync(path.join(REPO, "vercel.json"), "utf8");
let config = null;
try {
  config = JSON.parse(raw);
  check("vercel.json is valid JSON", true);
} catch (e) {
  check("vercel.json is valid JSON", false, e.message);
  process.exit(1);
}

/* A Vercel `functions` key is a glob, not a regular expression. */
function globToRegExp(pattern) {
  let out = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "*") {
      if (pattern[i + 1] === "*") { out += ".*"; i++; } else { out += "[^/]*"; }
    } else if (c === "?") out += "[^/]";
    else if (c === "{") out += "(";
    else if (c === "}") out += ")";
    else if (c === ",") out += "|";
    else out += c.replace(/[.+^$()|[\]\\]/g, "\\$&");
  }
  return new RegExp("^" + out + "$");
}

const apiFiles = fs.readdirSync(path.join(REPO, "api"))
  .filter(f => /\.(js|mjs|ts)$/.test(f) && !f.startsWith("_"))
  .map(f => "api/" + f);

check("the api directory holds functions", apiFiles.length > 0, apiFiles);

/* Every pattern must still claim a file once the earlier ones have taken theirs. */
const patterns = Object.keys(config.functions || {});
const unclaimed = new Set(apiFiles);
for (const pattern of patterns) {
  const re = globToRegExp(pattern);
  const mine = [...unclaimed].filter(f => re.test(f));
  mine.forEach(f => unclaimed.delete(f));
  check('functions pattern "' + pattern + '" matches a function no earlier pattern took', mine.length > 0, {
    pattern,
    alreadyClaimedBy: apiFiles.filter(f => re.test(f))
  });
}

/* A function nobody configures silently falls back to the platform defaults. */
check("every function is covered by a pattern", unclaimed.size === 0, [...unclaimed]);

/* Anything a function reads from disk at runtime has to be bundled with it. */
const readFromDisk = new Set();
for (const file of apiFiles) {
  const src = fs.readFileSync(path.join(REPO, file), "utf8");
  for (const m of src.matchAll(/readSource\("([^"]+)"\)/g)) readFromDisk.add(m[1]);
}
const included = Object.values(config.functions || {})
  .map(v => v.includeFiles)
  .filter(Boolean)
  .join(",");
for (const name of readFromDisk) {
  check('"' + name + '" is bundled via includeFiles', included.includes(name), { includeFiles: included });
}

/*
 * Vercel compiles these functions from ESM to CommonJS, where import.meta does
 * not exist. Using it works perfectly under the dev server and throws on every
 * request in production — /p/<id> and the sitemap answered 500 while every
 * local check passed. __dirname is what the compiled output provides.
 */
for (const file of apiFiles) {
  const source = fs.readFileSync(path.join(REPO, file), "utf8");
  const withoutComments = source
    .split("/*").map((part, i) => (i ? part.slice(part.indexOf("*/") + 2) : part)).join("")
    .split("\n").map(line => line.replace(/^\s*\/\/.*$/, "")).join("\n");
  check(file + " does not rely on import.meta (Vercel compiles it to CommonJS)",
    !withoutComments.includes("import.meta"),
    (withoutComments.match(/.{0,40}import\.meta.{0,30}/) || [])[0]);
}
/* maxDuration above the plan ceiling is rejected at build time. */
for (const [pattern, value] of Object.entries(config.functions || {})) {
  if (value.maxDuration === undefined) continue;
  check('"' + pattern + '" maxDuration is within the Vercel limit',
    Number.isInteger(value.maxDuration) && value.maxDuration >= 1 && value.maxDuration <= 60,
    value.maxDuration);
}

/* A rewrite that points at a function that no longer exists returns 404. */
for (const rule of config.rewrites || []) {
  const target = String(rule.destination || "").split("?")[0].replace(/^\//, "");
  if (!target.startsWith("api/")) continue;
  check('rewrite "' + rule.source + '" points at a real function',
    apiFiles.includes(target + ".js") || apiFiles.includes(target),
    { destination: rule.destination, apiFiles });
}

/*
 * Cache busting. Every script and stylesheet link carries a hash of the file it
 * points at, so a phone that cached the old shop is handed a new URL the moment
 * we change anything. These used to be hand-typed numbers: catalog.js stayed at
 * "?v=2" while it grew to the full supplier catalogue, and the site kept looking
 * unchanged on devices that had already cached it.
 */
const { createRequire } = await import("node:module");
const require = createRequire(import.meta.url);
const stamper = require("../tools/stamp-assets.cjs");

for (const page of stamper.PAGES) {
  const source = fs.readFileSync(path.join(REPO, page), "utf8");
  const links = stamper.stamps(source);
  check(page + " links its scripts and styles", links.length > 0, links.length);
  for (const link of links) {
    check(page + " -> " + link.file + " carries the current content hash",
      link.expected !== null && link.version === link.expected,
      { inPage: link.version, expected: link.expected, fix: "node tools/stamp-assets.cjs" });
  }
  /* A link with no ?v= at all can never be busted. */
  const bare = [...source.matchAll(/(?:href|src)="\/([A-Za-z0-9._-]+\.(?:css|js))"/g)].map(m => m[1]);
  check(page + " leaves no unversioned script or style", bare.length === 0, bare);
}

/*
 * Adding a `build` script to package.json silently changes what Vercel does.
 * With no build script it serves the repository as it stands, which is the
 * whole design here: the generators live in tools/, which .vercelignore keeps
 * out of the deployment entirely, and their output is committed. The moment
 * package.json declared one, Vercel ran it, then looked for a directory named
 * `public`, found none, and failed the deployment — while the shop went on
 * serving the previous build and every local check stayed green.
 *
 * So the two have to agree: if `npm run build` exists, vercel.json must say
 * that the build does not belong to Vercel and that the output is the
 * repository itself.
 */
{
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO, "package.json"), "utf8"));
  const hasBuild = !!(pkg.scripts && pkg.scripts.build);
  const ignored = fs.readFileSync(path.join(REPO, ".vercelignore"), "utf8")
    .split(/\r?\n/).map(l => l.trim());
  check("the generators are kept out of the deployment", ignored.includes("tools"), ignored);
  if (hasBuild) {
    check("vercel.json tells Vercel not to run the build script",
      config.buildCommand === "",
      { buildCommand: config.buildCommand, why: "npm run build regenerates from tools/, which is not deployed" });
    check("vercel.json names the repository as the output directory",
      config.outputDirectory === ".",
      { outputDirectory: config.outputDirectory, why: "Vercel looks for `public` otherwise and fails the deployment" });
  }
}

/* The security headers every page carries. Dropping one is silent: nothing
   breaks, the shop is just easier to frame, sniff or downgrade. */
{
  const catchAll = (config.headers || []).find(h => h.source === "/(.*)");
  const sent = new Map(((catchAll && catchAll.headers) || []).map(h => [h.key.toLowerCase(), h.value]));
  for (const key of ["content-security-policy", "strict-transport-security", "x-frame-options", "x-content-type-options", "referrer-policy", "permissions-policy"]) {
    check("every page sends " + key, !!sent.get(key), [...sent.keys()]);
  }
  const hsts = /max-age=(\d+)/.exec(sent.get("strict-transport-security") || "");
  check("HSTS lasts at least a year", !!hsts && Number(hsts[1]) >= 31536000, sent.get("strict-transport-security"));
  const csp = sent.get("content-security-policy") || "";
  check("the CSP refuses plugins and foreign framing", csp.includes("object-src 'none'") && csp.includes("frame-ancestors 'self'"), csp);
}

console.log(failures ? "\n" + failures + " configuration problem(s)" : "\nDeployment configuration is sound");
process.exit(failures ? 1 : 0);
