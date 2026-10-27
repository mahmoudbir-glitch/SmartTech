import fs from "node:fs";
import path from "node:path";
import { E2E } from "../../playwright.config.mjs";

export { E2E };

/* The record exactly as api/order.js wrote it — read from the store, not
   from any API, so "the order is in the database" is checked directly.
   tests/blob-mock.mjs keeps each blob as one file named by its pathname. */
export function storedOrder(ref) {
  const month = ref.split("-")[1].slice(0, 4);
  const file = path.join(E2E.blobDir, encodeURIComponent("data/orders/" + month + "/" + ref + ".json"));
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
}

/* A signed-in console session for `request`, the way admin.html gets one. */
export async function adminCookie(request, login, password) {
  const res = await request.post("/api/admin?action=login", {
    data: login ? { user: login, password } : { password: password || E2E.password }
  });
  if (!res.ok()) throw new Error("login failed: " + res.status() + " " + (await res.text()));
  const cookie = (res.headers()["set-cookie"] || "").split(";")[0];
  if (!cookie) throw new Error("login returned no session cookie");
  return cookie;
}

export async function admin(request, cookie, action, body) {
  const res = body === undefined
    ? await request.get("/api/admin?action=" + action, { headers: { Cookie: cookie } })
    : await request.post("/api/admin?action=" + action, { headers: { Cookie: cookie }, data: body });
  let json = {};
  try { json = await res.json(); } catch (e) { /* not JSON */ }
  return { status: res.status(), json };
}

/* The owner's delivery table, set through the console's own settings call. */
export async function setDelivery(request, cookie, delivery, freeOver) {
  const { json } = await admin(request, cookie, "settings");
  const current = json.settings || {};
  const out = await admin(request, cookie, "settings", {
    ...current, whatsapp: current.whatsapp || "963949951985", delivery, freeOver
  });
  if (out.status !== 200) throw new Error("settings save failed: " + JSON.stringify(out.json));
  return out.json.settings;
}
