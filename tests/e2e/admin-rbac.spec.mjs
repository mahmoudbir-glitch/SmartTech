/*
 * The owner's console, and who may use which part of it.
 *
 *  1. UI: sign in → the orders list → filter by status → move an order on →
 *     add a note; the store and the audit log both record it.
 *  2. CRUD through the console's own endpoints: a product (create as draft,
 *     publish, edit, delete, restore), a category, a brand.
 *  3. RBAC, server side. Every action in api/admin.js is listed from its
 *     source, so an action added tomorrow is covered without editing this
 *     file: signed out it is 401; signed in as a role whose GRANTS lack the
 *     action's permission it is 403. /api/orders follows the same grants.
 */
import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { E2E, storedOrder, adminCookie, admin } from "./helpers.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "..", "..");
const SOURCE = fs.readFileSync(path.join(ROOT, "api", "admin.js"), "utf8");

/* [method, action, permission | null] for every handler block. */
const ACTIONS = (() => {
  const out = [];
  let cur = null;
  for (const line of SOURCE.split("\n")) {
    const m = /req\.method === "(GET|POST)" && \(?action === "/.exec(line);
    if (m) {
      /* `(action === "delete" || action === "restore" || ...)` is one block. */
      const names = [...line.matchAll(/action === "([\w-]+)"/g)].map(x => x[1]);
      const block = names.map(action => ({ method: m[1], action, perm: null }));
      out.push(...block);
      cur = block;
      continue;
    }
    const r = /requireRole\(user, "([\w.*]+)"\)/.exec(line);
    if (r && cur && !cur[0].perm) cur.forEach(a => { a.perm = r[1]; });
  }
  return out;
})();
const GRANTS = (() => {
  const block = /const GRANTS = \{([\s\S]*?)\};/.exec(SOURCE)[1];
  return Object.fromEntries([...block.matchAll(/(\w+): \[([^\]]*)\]/g)]
    .map(([, role, list]) => [role, [...list.matchAll(/"([^"]+)"/g)].map(x => x[1])]));
})();
const may = (role, perm) => !perm || (GRANTS[role] || []).includes("*") || (GRANTS[role] || []).includes(perm);

test.describe.configure({ mode: "serial" });

let owner = "";
let ref = "";

async function placeOrder(request, name) {
  const res = await request.post("/api/order", {
    data: {
      clientOrderId: "e2e-admin-" + Date.now() + "-" + Math.random().toString(36).slice(2),
      lang: "en",
      customer: { name, phone: "0944 123 456", city: "sy-damascus", address: "Mezzeh, street 7, building 3" },
      lines: [{ pid: 35141, qty: 2 }]
    }
  });
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()).ref;
}

test.beforeAll(async ({ request }) => {
  owner = await adminCookie(request);
  ref = await placeOrder(request, "Admin Flow Customer");
});

test("console: sign in, find the order, filter, move it on, add a note", async ({ page, request }) => {
  await page.goto("/admin.html?lang=en");
  await page.fill("#password", E2E.password);
  await page.click("#loginBtn");
  await page.locator('[data-go="orders"]:visible').first().click();

  const row = page.locator('#ordList [data-order="' + ref + '"]');
  await expect(row).toBeVisible({ timeout: 20000 });
  await expect(row).toContainText("Admin Flow Customer");

  /* Filtering: the new order is under «new» and not under «delivered». */
  await page.locator('#ordStatusChips [data-ord-status="delivered"]').click();
  await expect(row).toHaveCount(0);
  await page.locator('#ordStatusChips [data-ord-status="new"]').click();
  await expect(row).toBeVisible();

  /* Open it and move it to confirmed with the console's own step control. */
  await row.click();
  await expect(page.locator("#order[open]")).toBeVisible();
  await page.locator('#order .step[data-move="confirmed"]').click();
  await expect(page.locator("#order .step.is-now")).toHaveAttribute("data-move", "confirmed", { timeout: 15000 });
  expect(storedOrder(ref).status).toBe("confirmed");

  /* A note, through the same endpoint the console's note box calls. */
  const note = await admin(request, owner, "order-note", { no: ref, text: "Customer asked for an evening call" });
  expect(note.status, JSON.stringify(note.json)).toBe(200);
  expect(storedOrder(ref).notes.map(n => n.text || n.body || "").join(" ")).toContain("evening call");

  /* Both are in the audit log, attributed to the owner. */
  const log = await admin(request, owner, "audit");
  expect(log.status).toBe(200);
  const mine = JSON.stringify(log.json).split(ref).length - 1;
  expect(mine, "audit entries for " + ref).toBeGreaterThanOrEqual(2);
});

/* What a shopper's browser makes of /api/products: the real catalog.js
   merge, which is where drafts and deleted products are dropped. */
async function shopperSees(request, id) {
  const state = await (await request.get("/api/products")).json();
  const win = {};
  new Function("window", "navigator", "localStorage", "location",
    fs.readFileSync(path.join(ROOT, "catalog.js"), "utf8"))(win, { languages: ["en"] }, { getItem: () => null, setItem: () => {} }, { search: "" });
  return win.STORE.merge(state).some(p => String(p.id) === String(id));
}

test("CRUD: product, category and brand through the console's endpoints", async ({ request }) => {
  const fields = { name: "E2E Test Power Bank", brand: "Anker", category: "power-bank", price: 9.5, inStock: true };

  /* Product: a new one starts as a draft the shop does not show. */
  const created = await admin(request, owner, "save", { isNew: true, product: fields });
  expect(created.status, JSON.stringify(created.json)).toBe(200);
  const id = created.json.id;
  expect(id).toBeGreaterThan(0);
  expect((await admin(request, owner, "product&id=" + id)).json.product.status).toBe("draft");
  expect(await shopperSees(request, id)).toBe(false);

  /* Published and edited. */
  const published = await admin(request, owner, "save", { product: { ...fields, id, price: 11, status: "published" } });
  expect(published.status, JSON.stringify(published.json)).toBe(200);
  const read = (await admin(request, owner, "product&id=" + id)).json.product;
  expect([read.status, read.price]).toEqual(["published", 11]);
  expect(await shopperSees(request, id)).toBe(true);

  const priced = await admin(request, owner, "inline", { edits: [{ id, field: "price", value: 12.5 }] });
  expect(priced.json.applied).toEqual([{ id, field: "price", value: 12.5 }]);
  const stock = await admin(request, owner, "stock", { id, inStock: false });
  expect(stock.status, JSON.stringify(stock.json)).toBe(200);
  expect((await admin(request, owner, "product&id=" + id)).json.product.inStock).toBe(false);

  /* Deleted (recoverable) and restored. */
  expect((await admin(request, owner, "delete", { id })).status).toBe(200);
  expect(await shopperSees(request, id)).toBe(false);
  expect((await admin(request, owner, "restore", { id })).status).toBe(200);
  expect((await admin(request, owner, "stock", { id, inStock: true })).status).toBe(200);
  expect(await shopperSees(request, id)).toBe(true);

  /* Category: added under a department, renamed, deleted. */
  const add = await admin(request, owner, "taxonomy-save", {
    op: "add", id: "e2e-test-aisle", parent: "charging", nameAr: "رف تجريبي", nameEn: "Test aisle", nameTr: "Test reyonu"
  });
  expect(add.status, JSON.stringify(add.json)).toBe(200);
  const edit = await admin(request, owner, "taxonomy-save", {
    op: "edit", id: "e2e-test-aisle", parent: "charging", nameAr: "رف تجريبي ٢", nameEn: "Test aisle 2", nameTr: "Test reyonu 2"
  });
  expect(edit.status, JSON.stringify(edit.json)).toBe(200);
  const nodes = (await admin(request, owner, "taxonomy")).json;
  expect(JSON.stringify(nodes)).toContain("Test aisle 2");
  const gone = await admin(request, owner, "taxonomy-save", { op: "delete", id: "e2e-test-aisle" });
  expect(gone.status, JSON.stringify(gone.json)).toBe(200);
  expect(JSON.stringify((await admin(request, owner, "taxonomy")).json)).not.toContain("e2e-test-aisle");

  /* Brand: created, then deleted. */
  const brand = await admin(request, owner, "brand-save", { slug: "e2e-brand", name: "E2E Brand", taglineAr: "علامة تجريبية", taglineEn: "Test brand", taglineTr: "Test markası" });
  expect(brand.status, JSON.stringify(brand.json)).toBe(200);
  expect(JSON.stringify((await admin(request, owner, "taxonomy")).json)).toContain("E2E Brand");
  expect((await admin(request, owner, "brand-save", { slug: "e2e-brand", op: "delete" })).status).toBe(200);
  expect(JSON.stringify((await admin(request, owner, "taxonomy")).json)).not.toContain("E2E Brand");
});

test("RBAC: signed out, every console action is 401", async ({ request }) => {
  expect(ACTIONS.length).toBeGreaterThan(30);
  const open = [];
  for (const { method, action } of ACTIONS) {
    if (action === "login" || action === "logout") continue;
    const res = method === "GET"
      ? await request.get("/api/admin?action=" + action)
      : await request.post("/api/admin?action=" + action, { data: {} });
    if (res.status() !== 401) open.push(method + " " + action + " → " + res.status());
  }
  expect(open).toEqual([]);
  expect((await request.get("/api/orders")).status()).toBe(401);
});

for (const role of ["staff", "editor"]) {
  test(`RBAC: a ${role} account gets 403 on everything its role lacks`, async ({ request }) => {
    const login = "e2e-" + role;
    const password = "e2e-" + role + "-password-1";
    const made = await admin(request, owner, "user-save", { login, name: "E2E " + role, role, password });
    expect(made.status, JSON.stringify(made.json)).toBe(200);
    const cookie = await adminCookie(request, login, password);

    const wrong = [];
    for (const { method, action, perm } of ACTIONS) {
      if (action === "login" || action === "logout") continue;
      const allowed = may(role, perm);
      /* Allowed writes are left to the functional tests: this sweep must
         never change the store. Denied writes are refused before parsing. */
      if (method === "POST" && allowed) continue;
      /* `inline` checks per field (price → products.edit, stock → stock.edit);
         an empty batch is a no-op for anyone. Swept below with real fields. */
      if (action === "inline") continue;
      const res = method === "GET"
        ? await request.get("/api/admin?action=" + action, { headers: { Cookie: cookie } })
        : await request.post("/api/admin?action=" + action, { headers: { Cookie: cookie }, data: {} });
      const status = res.status();
      if (!allowed && status !== 403) wrong.push(`${method} ${action} (${perm}) should be 403, got ${status}`);
      if (allowed && status === 403) wrong.push(`${method} ${action} (${perm}) should be allowed, got 403`);
    }
    /* Bulk: only a stock change is a stock edit. Status and category used to
       fall through to stock.edit, so staff could unpublish the catalogue. */
    for (const [kind, perm, extra] of [["status", "products.edit", { amount: "archived" }], ["cat", "products.edit", { amount: "cables" }],
      ["price", "products.edit", { mode: "fixed", amount: 1 }], ["stock", "stock.edit", { mode: "in" }]]) {
      const allowed = may(role, perm);
      /* An allowed bulk write would change the catalogue; stock "in" is the
         one that leaves product 35141 as it was. */
      if (allowed && kind !== "stock") continue;
      const res = await request.post("/api/admin?action=bulk", { headers: { Cookie: cookie }, data: { kind, ids: [35141], ...extra } });
      if (!allowed && res.status() !== 403) wrong.push(`POST bulk ${kind} (${perm}) should be 403, got ${res.status()}`);
      if (allowed && res.status() !== 200) wrong.push(`POST bulk ${kind} (${perm}) should be allowed, got ${res.status()}`);
    }
    for (const [field, perm] of [["price", "products.edit"], ["stock", "stock.edit"]]) {
      if (may(role, perm)) continue;
      const res = await request.post("/api/admin?action=inline", { headers: { Cookie: cookie }, data: { edits: [{ id: 35141, field, value: 1 }] } });
      if (res.status() !== 403) wrong.push(`POST inline ${field} (${perm}) should be 403, got ${res.status()}`);
    }
    expect(wrong).toEqual([]);

    /* The second orders endpoint follows the same grants. */
    const list = await request.get("/api/orders", { headers: { Cookie: cookie } });
    expect(list.status()).toBe(may(role, "orders.view") ? 200 : 403);
    const patch = await request.post("/api/orders?action=patch&ref=" + ref, { headers: { Cookie: cookie }, data: { status: "packed" } });
    if (!may(role, "orders.status")) expect(patch.status()).toBe(403);
  });
}
