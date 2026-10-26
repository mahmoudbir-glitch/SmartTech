/*
 * npm run lint — the checks that catch a broken deploy before Vercel does.
 *
 *  - every .js / .mjs / .cjs file parses (`node --check`);
 *  - every tracked .json file parses — vercel.json, the dictionaries' copy
 *    files and the taxonomy are read at request time, and a stray comma there
 *    is a 500 on every page;
 *  - no merge-conflict markers;
 *  - no CRLF line endings: the build hashes these files into the HTML and the
 *    CSP, and production serves them with LF, so a CRLF file means a wrong
 *    hash and a blocked script (see .gitattributes).
 *
 * No dependency: the shop ships without a node_modules of its own beyond
 * @vercel/blob, and a linter that needs installing is one nobody runs.
 */
const { execFileSync, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const files = execFileSync("git", ["ls-files", "-co", "--exclude-standard"], { cwd: ROOT, encoding: "utf8" })
  .split("\n").filter(Boolean).filter(f => fs.existsSync(path.join(ROOT, f)));

const problems = [];
const TEXT = /\.(js|mjs|cjs|json|html|css|md|txt|svg|webmanifest|tsv)$/i;
const CONFLICT = /^(<{7}|={7}|>{7})( |$)/m;

for (const file of files) {
  const full = path.join(ROOT, file);
  if (!TEXT.test(file)) continue;
  const src = fs.readFileSync(full, "utf8");
  if (src.includes("\r\n")) problems.push(file + ": CRLF line endings");
  if (CONFLICT.test(src)) problems.push(file + ": merge-conflict marker");
  if (/\.json$/i.test(file)) {
    try { JSON.parse(src); } catch (e) { problems.push(file + ": invalid JSON — " + e.message); }
  }
  if (/\.(js|mjs|cjs)$/i.test(file)) {
    const r = spawnSync(process.execPath, ["--check", full], { encoding: "utf8" });
    if (r.status !== 0) problems.push(file + ": syntax error\n" + (r.stderr || "").trim().split("\n").slice(0, 5).join("\n"));
  }
}

if (problems.length) {
  console.error(problems.join("\n"));
  console.error("\nlint: " + problems.length + " problem(s)");
  process.exit(1);
}
console.log("lint: " + files.filter(f => TEXT.test(f)).length + " files clean");
