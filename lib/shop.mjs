/*
 * Pure rules shared by the public endpoints. No I/O, no Blob, no globals, so
 * every line here is covered by tests/unit/*.test.mjs without a server.
 */

/* Characters a customer never means to type and an attacker always does:
   C0/C1 controls (minus tab and newline), and the bidi embedding, override and
   isolate controls that make «Ahmad» render as «damhA» in the owner's order
   list or flip a phone number. LRM/RLM (U+200E/U+200F) stay — Arabic text
   mixed with digits uses them legitimately. */
const UNSAFE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

export function text(value, max) {
  return String(value == null ? "" : value).replace(UNSAFE, "").replace(/\r\n?/g, "\n").trim().slice(0, max);
}

/* Accepts 09XXXXXXXX, 9XXXXXXXX, +9639XXXXXXXX, 009639XXXXXXXX, and any 8–15
   digits behind a leading + so a Turkish customer is not locked out. */
export function e164(raw) {
  let value = String(raw || "").replace(/[\s()\-.\u00a0]/g, "");
  if (/^00\d+$/.test(value)) value = "+" + value.slice(2);
  if (/^\+\d+$/.test(value)) {
    const digits = value.slice(1);
    return digits.length >= 8 && digits.length <= 15 ? "+" + digits : "";
  }
  if (!/^\d+$/.test(value)) return "";
  if (/^09\d{8}$/.test(value)) return "+963" + value.slice(1);
  if (/^9\d{8}$/.test(value)) return "+963" + value;
  if (/^963\d{9}$/.test(value)) return "+" + value;
  return "";
}

/* `0949 951 985`, `+963949951985` and `963949951985` must be one customer. */
export const phoneKeyOf = phone => String(phone || "").replace(/\D/g, "");
