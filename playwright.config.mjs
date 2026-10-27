/*
 * End-to-end suite: `npx playwright test` (or `npm run test:e2e`).
 *
 * Runs against tests/server.mjs — the same local stand-in for Vercel that the
 * other suites use, with Vercel Blob replaced by files in tests/.blobstore-e2e
 * — so it never touches the real store. The store is emptied each run.
 * Uses the installed Chrome (channel "chrome"); nothing is downloaded.
 */
import { defineConfig } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const TESTS = path.join(ROOT, "tests");
const PORT = process.env.E2E_PORT || "3200";
export const E2E = {
  base: "http://127.0.0.1:" + PORT,
  blobDir: path.join(TESTS, ".blobstore-e2e"),
  password: "e2e-pass-123"
};
process.env.E2E_BLOB_DIR = E2E.blobDir;

/* The config is evaluated in the runner and again in each worker; only the
   runner (no TEST_WORKER_INDEX yet) may wipe the store. */
if (!process.env.TEST_WORKER_INDEX) fs.rmSync(E2E.blobDir, { recursive: true, force: true });

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "*.spec.mjs",
  /* One worker: the specs share one store and one order sequence. */
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 60000,
  reporter: [["list"]],
  use: {
    baseURL: E2E.base,
    channel: "chrome",
    headless: true,
    trace: "retain-on-failure"
  },
  outputDir: "tests/.e2e-results",
  webServer: {
    command: "node --import ./hooks.mjs server.mjs",
    cwd: TESTS,
    url: E2E.base + "/",
    reuseExistingServer: false,
    timeout: 30000,
    env: {
      DEV_REPO: ROOT,
      DEV_PORT: PORT,
      SITE_ORIGIN: E2E.base,
      DEV_BLOB_DIR: E2E.blobDir,
      DEV_BLOB_MOCK: path.join(TESTS, "blob-mock.mjs"),
      ADMIN_PASSWORD: E2E.password,
      ADMIN_SECRET: "e2e-secret-xyz"
    }
  }
});
