/*
 * Runs every check against a local copy of the store.
 * Starts the dev server (static files + /api functions + a local stand-in for
 * Vercel Blob), runs the four suites, then stops the server.
 */
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const PORT = process.env.DEV_PORT || "3100";
const BLOB_DIR = path.join(HERE, ".blobstore");

fs.rmSync(BLOB_DIR, { recursive: true, force: true });

const env = {
  ...process.env,
  DEV_REPO: REPO,
  DEV_PORT: PORT,
  // api/p.js refuses to build a page without a configured origin, because a
  // request Host header must never decide what a cached page says.
  SITE_ORIGIN: "http://127.0.0.1:" + PORT,
  DEV_BLOB_DIR: BLOB_DIR,
  DEV_BLOB_MOCK: path.join(HERE, "blob-mock.mjs"),
  SHOT_DIR: process.env.SHOT_DIR || path.join(HERE, ".shots"),
  ADMIN_PASSWORD: "test-pass-123",
  ADMIN_SECRET: "test-secret-xyz"
};
fs.mkdirSync(env.SHOT_DIR, { recursive: true });

const server = spawn(process.execPath, ["--import", pathToFileURL(path.join(HERE, "hooks.mjs")).href, path.join(HERE, "server.mjs")], { env, stdio: "inherit" });
const stop = () => { try { server.kill(); } catch (e) {} };
process.on("exit", stop);
process.on("SIGINT", () => { stop(); process.exit(1); });

const wait = ms => new Promise(r => setTimeout(r, ms));
async function ready() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch("http://127.0.0.1:" + PORT + "/");
      if (res.ok) return true;
    } catch (e) {}
    await wait(250);
  }
  return false;
}

function run(file) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [path.join(HERE, file)], { env, stdio: "inherit" });
    child.on("exit", code => resolve(code === 0));
  });
}

if (!await ready()) {
  console.error("dev server did not start");
  stop();
  process.exit(1);
}

const suites = [
  "config-test.mjs",   // vercel.json — a mistake here stops the whole deployment
  "design-test.mjs",   // the design system, statically: tokens, floors, taxonomy, assets
  "content-test.mjs",
  "lang-test.mjs",
  "api-test.mjs",
  "shop-test.mjs",     // the redesign's measured claims, in a real browser
  "ui-test.mjs",
  "compat-test.mjs",
  "smoke-test.mjs"     // every published page, every language, plus the storefront features
];
/* `npm run test:only -- ui lang` runs a subset against the same server. */
const at = process.argv.indexOf("--only");
const picked = at === -1 ? [] : process.argv.slice(at + 1);
const chosen = picked.length ? suites.filter(s => picked.some(p => s.startsWith(p))) : suites;
const results = [];
for (const suite of chosen) {
  fs.rmSync(BLOB_DIR, { recursive: true, force: true });
  console.log("\n===== " + suite + " =====");
  results.push([suite, await run(suite)]);
}

stop();
console.log("\n===== summary =====");
results.forEach(([name, ok]) => console.log((ok ? "PASS " : "FAIL ") + name));
process.exit(results.every(([, ok]) => ok) ? 0 : 1);
