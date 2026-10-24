/*
 * GET /api/orders — the owner's list.
 * PATCH /api/orders?ref=SY-YYMMDD-NNN — status, payment, delivery fee, notes.
 * ===========================================================================
 * Both behind the admin cookie that api/admin.js already issues.
 *
 * Fulfilment and payment are two independent axes and are never blended into
 * one status. An order can be paid and unshipped; it can be delivered and
 * unpaid — that second one is precisely the order the owner has to chase, and
 * a single merged status makes it invisible. So: two enums, two filters, two
 * controls, and `open.json` keeps a delivered-but-unpaid order in the working
 * set until the money arrives.
 *
 * Every change appends to `history` with `at`, `by`, `field`, `from`, `to`.
 * `history` is never rewritten, by anyone, including the owner: it is the only
 * accountability there is once a second person has a login.
 */
import crypto from "crypto";
import { get, put, BlobPreconditionFailedError } from "@vercel/blob";

const COOKIE = "smarttech_admin";
const STATE_PATH = "data/store-state.json";
const OPEN_PATH = "data/orders/open.json";
const REF = /^[A-Z]{2,8}-\d{6}-\d{3}$/;
const RETRIES = 3;
const PER_MAX = 100;

/* Fulfilment. Forward along the chain; cancelled from anywhere before
   delivered; returned only from delivered. */
const FLOW = ["new", "confirmed", "packed", "shipped", "delivered"];
const STATUSES = new Set(FLOW.concat(["cancelled", "returned"]));
const TERMINAL = new Set(["delivered", "cancelled", "returned"]);

/* Money. `unpaid` on a cod order is normal; `unpaid` on a card order is the
   chase list. That distinction is why method and state are separate fields. */
const PAY_STATES = new Set(["unpaid", "partial", "paid", "partial_refund", "refunded", "failed"]);
const PAY_METHODS = new Set(["cod", "transfer", "card", "cash"]);
const SETTLED = new Set(["paid", "refunded", "partial_refund"]);

const fail = (res, status, code, extra) =>
  res.status(status).json(Object.assign({ ok: false, error: code }, extra || {}));

const digest = (key, value) => crypto.createHmac("sha256", key).update(String(value)).digest();
const safeEqual = (a, b) => crypto.timingSafeEqual(digest("compare", a), digest("compare", b));
const env = () => ({ password: process.env.ADMIN_PASSWORD || "", secret: process.env.ADMIN_SECRET || "" });

/* The same signature api/admin.js mints, so one cookie opens both. The signing
   key includes the password: changing it in Vercel logs every session out. */
function signSession(payload) {
  const { password, secret } = env();
  return digest(secret + "|" + digest("pw", password).toString("hex"), payload).toString("base64url");
}

async function isAuthed(req) {
  const { password, secret } = env();
  if (!password || !secret) return false;
  let revokedBefore = 0;
  try {
    const state = await readJson(STATE_PATH, null);
    revokedBefore = Number((state.value && state.value.settings && state.value.settings.revokedBefore) || 0);
  } catch (e) { /* a missing state document revokes nothing */ }

  const candidates = String(req.headers.cookie || "").split(";").map(x => x.trim())
    .filter(x => x.startsWith(COOKIE + "="))
    .map(x => x.slice(COOKIE.length + 1));
  for (const value of candidates) {
    const [payload, signature] = value.split(".");
    if (!payload || !signature) continue;
    let ok = false;
    try { ok = safeEqual(signature, signSession(payload)); } catch (e) { ok = false; }
    if (!ok) continue;
    try {
      const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
      if (!(claims.exp > Date.now())) continue;
      if (revokedBefore && Number(claims.iat || 0) <= revokedBefore) continue;
      return true;
    } catch (e) { continue; }
  }
  return false;
}

/* ------------------------------------------------------------------ blobs */

async function readJson(pathname, fallback) {
  const blob = await get(pathname, { access: "private", useCache: false });
  if (!blob) return { value: fallback, etag: null, exists: false };
  const body = await new Response(blob.stream).text();
  let parsed;
  try { parsed = JSON.parse(body); } catch (e) { throw new Error("corrupt_blob"); }
  return { value: parsed, etag: (blob.blob && blob.blob.etag) || null, exists: true };
}

function writeJson(pathname, value, options) {
  return put(pathname, JSON.stringify(value), Object.assign({
    access: "private", contentType: "application/json", addRandomSuffix: false
  }, options || {}));
}

async function mutateJson(pathname, fallback, change) {
  for (let attempt = 0; ; attempt++) {
    const { value, etag, exists } = await readJson(pathname, fallback);
    const result = change(value);
    try {
      await writeJson(pathname, value, etag ? { ifMatch: etag } : exists ? { allowOverwrite: true } : { allowOverwrite: false });
      return result;
    } catch (e) {
      const conflict = e instanceof BlobPreconditionFailedError || /exist/i.test((e && e.message) || "");
      if (conflict && attempt < RETRIES) continue;
      throw e;
    }
  }
}

const monthOf = ref => String(ref).split("-")[1].slice(0, 4);
const indexPath = month => "data/orders/" + month + "/index.json";
const orderPath = ref => "data/orders/" + monthOf(ref) + "/" + ref + ".json";

const text = (value, max) => String(value == null ? "" : value).trim().slice(0, max);
function money(value) {
  const n = typeof value === "number" ? value : parseFloat(String(value == null ? "" : value).trim());
  if (!Number.isFinite(n) || n < 0 || n > 1e6) return NaN;
  return Math.round(n * 100) / 100;
}

const rowOf = order => ({
  no: order.no, at: order.createdAt, st: order.status, pay: order.payment.state,
  method: order.payment.method, name: order.customer.name, phone: order.customer.phone,
  city: order.customer.city, goods: order.totals.items, grand: order.totals.grand,
  n: order.lines.length, cid: order.meta && order.meta.clientOrderId,
  contacted: !!order.contacted, channel: order.channel, assignedTo: order.assignedTo || ""
});

/* An order leaves the working set when fulfilment is terminal AND the money is
   settled — or when it was cancelled before any money was expected. A
   delivered-but-unpaid order stays, because it is the one he must chase. */
function isOpen(order) {
  if (!TERMINAL.has(order.status)) return true;
  if (order.status === "cancelled" && order.payment.state === "unpaid") return false;
  return !SETTLED.has(order.payment.state);
}

/* ------------------------------------------------------------------- list */

function matches(row, q) {
  const filters = q;
  if (filters.status && filters.status !== "all") {
    if (filters.status === "open" ? TERMINAL.has(row.st) : row.st !== filters.status) return false;
  }
  if (filters.pay && filters.pay !== "all" && row.pay !== filters.pay) return false;
  if (filters.city && row.city !== filters.city) return false;
  if (filters.channel && row.channel !== filters.channel) return false;
  if (filters.from && Number(row.at) < filters.from) return false;
  if (filters.to && Number(row.at) > filters.to) return false;
  if (filters.q) {
    const needle = filters.q.toLowerCase();
    const digits = needle.replace(/\D/g, "");
    const phone = String(row.phone || "").replace(/\D/g, "");
    const hit = String(row.no || "").toLowerCase().includes(needle) ||
      String(row.name || "").toLowerCase().includes(needle) ||
      (digits.length >= 4 && phone.includes(digits));
    if (!hit) return false;
  }
  return true;
}

/* -------------------------------------------------------------- the patch */

function applyPatch(order, patch, now) {
  const changes = [];
  const log = (field, from, to) => {
    if (String(from) === String(to)) return;
    order.history.push({ at: now, by: "owner", field, from: from == null ? "" : from, to: to == null ? "" : to });
    changes.push(field);
  };

  if (patch.status !== undefined) {
    const next = String(patch.status);
    if (!STATUSES.has(next)) throw new Error("invalid_status");
    const from = order.status;
    if (next !== from) {
      const a = FLOW.indexOf(from);
      const b = FLOW.indexOf(next);
      const forward = a !== -1 && b === a + 1;
      const back = a !== -1 && b === a - 1 && patch.back === true;
      const cancel = next === "cancelled" && from !== "delivered" && from !== "returned";
      const returned = next === "returned" && from === "delivered";
      const reopen = next === "confirmed" && from === "cancelled" && patch.back === true;
      if (!(forward || back || cancel || returned || reopen)) {
        throw new Error("bad_transition");
      }
      if (next === "cancelled") {
        const reason = text(patch.cancelReason, 200);
        if (!reason) throw new Error("cancel_reason_required");
        log("cancelReason", order.cancelReason, reason);
        order.cancelReason = reason;
      }
      log("status", from, next);
      order.status = next;
      order.statusAt = now;
      order.contacted = true;
    }
  }

  if (patch.contacted !== undefined) {
    const next = patch.contacted !== false;
    log("contacted", order.contacted ? "1" : "0", next ? "1" : "0");
    order.contacted = next;
  }

  if (patch.assignedTo !== undefined) {
    const next = text(patch.assignedTo, 60);
    log("assignedTo", order.assignedTo, next);
    order.assignedTo = next;
  }

  const pay = patch.payment && typeof patch.payment === "object" ? patch.payment : null;
  if (pay) {
    if (pay.method !== undefined) {
      const next = String(pay.method);
      if (!PAY_METHODS.has(next)) throw new Error("invalid_payment_method");
      log("payment.method", order.payment.method, next);
      order.payment.method = next;
    }
    if (pay.paid !== undefined) {
      const amount = money(pay.paid);
      if (Number.isNaN(amount)) throw new Error("invalid_amount");
      const ceiling = order.totals.grand == null ? order.totals.items : order.totals.grand;
      if (amount > ceiling + 0.005) throw new Error("amount_above_total");
      log("payment.paid", order.payment.paid, amount);
      order.payment.paid = amount;
      order.payment.at = amount > 0 ? now : null;
      /* The state follows the amount unless the owner names one explicitly:
         a deposit is `partial`, the balance is `paid`. */
      if (pay.state === undefined) {
        const next = amount <= 0 ? "unpaid" : (amount + 0.005 >= ceiling ? "paid" : "partial");
        log("payment.state", order.payment.state, next);
        order.payment.state = next;
      }
    }
    if (pay.state !== undefined) {
      const next = String(pay.state);
      if (!PAY_STATES.has(next)) throw new Error("invalid_payment_state");
      log("payment.state", order.payment.state, next);
      order.payment.state = next;
    }
    if (pay.ref !== undefined) {
      const next = text(pay.ref, 80);
      log("payment.ref", order.payment.ref, next);
      order.payment.ref = next;
    }
  }

  const deliv = patch.delivery && typeof patch.delivery === "object" ? patch.delivery : null;
  if (deliv) {
    if (deliv.method !== undefined) {
      const next = deliv.method === "pickup" ? "pickup" : "courier";
      log("delivery.method", order.delivery.method, next);
      order.delivery.method = next;
    }
    if (deliv.fee !== undefined) {
      /* null is not zero. null renders «يُتفق عليه»; $0.00 would promise free
         delivery the shop has not agreed to. */
      let next = null;
      if (deliv.fee !== null && deliv.fee !== "") {
        next = money(deliv.fee);
        if (Number.isNaN(next)) throw new Error("invalid_fee");
      }
      log("delivery.fee", order.delivery.fee, next);
      order.delivery.fee = next;
      order.totals.delivery = next;
      order.totals.grand = next == null ? null
        : Math.round((order.totals.items - (order.totals.discount || 0) + next) * 100) / 100;
    }
    if (deliv.note !== undefined) {
      const next = text(deliv.note, 200);
      log("delivery.note", order.delivery.note, next);
      order.delivery.note = next;
    }
    if (deliv.promisedAt !== undefined) {
      const next = deliv.promisedAt ? String(deliv.promisedAt).slice(0, 32) : null;
      log("delivery.promisedAt", order.delivery.promisedAt, next);
      order.delivery.promisedAt = next;
    }
  }

  if (patch.discount !== undefined) {
    const next = money(patch.discount);
    if (Number.isNaN(next)) throw new Error("invalid_amount");
    if (next > order.totals.items + 0.005) throw new Error("discount_above_total");
    log("totals.discount", order.totals.discount, next);
    order.totals.discount = next;
    if (order.totals.delivery != null) {
      order.totals.grand = Math.round((order.totals.items - next + order.totals.delivery) * 100) / 100;
    }
  }

  /* A note is authored and answers "what must I remember". It is a different
     shape from history and is stored separately, even though the console shows
     the two as one timeline. */
  const note = text(patch.note, 500);
  if (note) {
    if (!Array.isArray(order.notes)) order.notes = [];
    order.notes.push({ at: now, by: "owner", text: note });
    order.contacted = true;
    changes.push("note");
  }

  return changes;
}

/* ---------------------------------------------------------------- handler */

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!(await isAuthed(req))) return fail(res, 401, "unauthorized");

  const query = req.query || {};
  /* The ref arrives as ?ref= under the dev server and as the trailing path
     segment behind a /api/orders/:ref rewrite. Both are accepted. */
  let ref = String(query.ref || "");
  if (!ref) {
    const tail = String(req.url || "").split("?")[0].replace(/\/+$/, "").split("/").pop();
    if (REF.test(tail)) ref = tail;
  }

  try {
    if (req.method === "GET") {
      if (ref) {
        if (!REF.test(ref)) return fail(res, 400, "invalid_ref");
        const { value } = await readJson(orderPath(ref), null);
        if (!value) return fail(res, 404, "not_found");
        return res.status(200).json({ ok: true, order: value });
      }
      return res.status(200).json(await list(query));
    }

    if (req.method === "PATCH" || (req.method === "POST" && String(query.action || "") === "patch")) {
      if (!REF.test(ref)) return fail(res, 400, "invalid_ref");
      let patch = req.body;
      if (typeof patch === "string") { try { patch = JSON.parse(patch || "{}"); } catch (e) { patch = {}; } }
      if (!patch || typeof patch !== "object") patch = {};

      const now = Date.now();
      let changed = [];
      let order = null;

      await mutateJson(orderPath(ref), null, current => {
        if (!current) throw new Error("not_found");
        if (!Array.isArray(current.history)) current.history = [];
        if (!Array.isArray(current.notes)) current.notes = [];
        changed = applyPatch(current, patch, now);
        order = current;
        return true;
      });

      if (changed.length) {
        await syncRow(order).catch(e => console.error("row sync failed for " + ref, e));
      }
      return res.status(200).json({ ok: true, order, changed });
    }

    return fail(res, 405, "method_not_allowed");
  } catch (e) {
    const message = (e && e.message) || "";
    if (message === "not_found") return fail(res, 404, "not_found");
    const known = /^(invalid_|bad_transition|cancel_reason_required|amount_above_total|discount_above_total)/.test(message);
    if (!known) console.error("orders api error", e);
    return fail(res, known ? 400 : 500, known ? message : "server_error");
  }
}

async function list(query) {
  const filters = {
    status: String(query.status || "open"),
    pay: String(query.pay || ""),
    city: String(query.city || ""),
    channel: String(query.channel || ""),
    q: String(query.q || "").trim(),
    from: Number(query.from || 0) || 0,
    to: Number(query.to || 0) || 0
  };
  const page = Math.max(1, Number(query.page || 1) || 1);
  const per = Math.min(PER_MAX, Math.max(1, Number(query.per || 25) || 25));
  const month = String(query.month || "");

  /* The morning screen is one blob read. The month index is only touched when
     the owner asks for history or searches beyond the working set. */
  let rows = [];
  let source = "open";
  if (month && /^\d{4}$/.test(month)) {
    source = month;
    const { value } = await readJson(indexPath(month), { seq: {}, rows: [] });
    rows = Array.isArray(value && value.rows) ? value.rows : [];
  } else {
    const { value } = await readJson(OPEN_PATH, { rows: [] });
    rows = Array.isArray(value && value.rows) ? value.rows : [];
  }

  const hits = rows.filter(row => row && matches(row, filters))
    .sort((a, b) => Number(b.at || 0) - Number(a.at || 0));
  return {
    ok: true, source, total: hits.length, page, per,
    rows: hits.slice((page - 1) * per, page * per)
  };
}

/* The index row and the working set are derived from the order, never edited
   independently — two places holding the same fact diverge the first time a
   write fails halfway. */
async function syncRow(order) {
  const row = rowOf(order);
  await mutateJson(indexPath(monthOf(order.no)), { seq: {}, rows: [] }, current => {
    if (!Array.isArray(current.rows)) current.rows = [];
    const i = current.rows.findIndex(r => r && r.no === order.no);
    if (i === -1) current.rows.push(row); else current.rows[i] = row;
    return true;
  });
  await mutateJson(OPEN_PATH, { rows: [] }, current => {
    if (!Array.isArray(current.rows)) current.rows = [];
    const i = current.rows.findIndex(r => r && r.no === order.no);
    if (isOpen(order)) {
      if (i === -1) current.rows.unshift(row); else current.rows[i] = row;
    } else if (i !== -1) {
      current.rows.splice(i, 1);
    }
    return true;
  });
}
