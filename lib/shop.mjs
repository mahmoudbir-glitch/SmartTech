/*
 * Pure rules shared by the public endpoints. No I/O, no Blob, no globals, so
 * every line here is covered by tests/unit/*.test.mjs without a server.
 */

/* Characters a customer never means to type and an attacker always does:
   C0/C1 controls (minus tab and newline), and the bidi embedding, override and
   isolate controls that make «Ahmad» render as «damhA» in the owner's order
   list or flip a phone number. LRM/RLM (U+200E/U+200F) stay — Arabic text
   mixed with digits uses them legitimately. */
const UNSAFE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F‪-‮⁦-⁩﻿]/g;

export function text(value, max) {
  return String(value == null ? "" : value).replace(UNSAFE, "").replace(/\r\n?/g, "\n").trim().slice(0, max);
}
