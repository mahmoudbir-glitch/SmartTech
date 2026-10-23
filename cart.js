/*
 * SmartTech — the order sheet.
 * ============================
 * The surface between "I want this" and `/checkout`. It is called **طلبك**,
 * not "سلة المشتريات": the same word the record carries in the admin, because
 * the cart, the checkout, the confirmation page and the owner's list are four
 * renderings of one object and they should not use four names for it.
 *
 * What was measured on the old drawer, and what this replaces:
 *
 *  - `.cart-foot` was 235px of an 844px phone — 28% — most of it an amber
 *    "delivery cost unknown" panel. Amber means something is wrong, and
 *    nothing is wrong: this is simply how buying works here. The panel is a
 *    plain row now and the foot targets ~124px.
 *  - The drawer was 367px of a 390px viewport: a full-screen page pretending
 *    to slide in from the side. Under 768 it is a bottom sheet, which is
 *    honest about that and puts the action under the thumb.
 *  - `addToCart()` called `openCart()`, so every add threw a full-height
 *    drawer over the grid and moved focus to its close button. Adding never
 *    opens this sheet. The feedback is the button, the badge, and — only at
 *    two or more lines — a persistent bar with no timer, which is hidden
 *    whenever the sheet or checkout is open, so the old toast-over-the-
 *    checkout-button collision is structurally impossible rather than merely
 *    avoided.
 *  - The ± buttons were 34×34 and adjacent with no gap while every other cart
 *    button was 40×40. One stepper, 44×44, 8px apart.
 *  - A sold-out line stayed in the cart at full price, in the total and in the
 *    message, unmarked. It is now excluded from the subtotal and it blocks
 *    the continue button, because checkout creates a record and an order the
 *    shop cannot fill must not become one.
 *
 * Load order: i18n.js → catalog.js → core.js → cart.js.
 * `SY.cart` already owns the data; nothing here reimplements it.
 */
(function () {
  "use strict";

  var SY = window.SY;
  if (!SY) return;

  var doc = document;
  var MAX = 20;
  var UNDO_MS = 6000;
  var ADDED_MS = 1400;
  var PULSE_MS = 600;
  /* The sub-header only earns its 28px once the list is long enough to scroll
     the first row out of sight. At one line the row is right there. */
  var COUNT_FROM = 4;

  /* Every control that opens the sheet, and every badge that counts it. The
     header button, the bottom-bar slot and anything a page marks itself. */
  var OPENERS = "[data-open-cart],[data-cart-open],#cartBtn,#slotCart,#cartButton";
  var BADGES = "#cartCount,#cartCount2,[data-cart-count]";

  var dlg = null;
  var bar = null;
  var undoTimer = null;
  var lastRemoved = null;
  var built = false;

  /* ------------------------------------------------------------------ text */

  /* SY.plural interpolates `SY.num()`, which is markup. Correct in the DOM,
     wrong in an aria-label or a message, so both shapes exist. */
  function pluralText(base, n) {
    var count = Number(n) || 0;
    var suffix = "Many";
    if (SY.lang() !== "ar") suffix = count === 1 ? "One" : "Many";
    else if (count === 1) suffix = "One";
    else if (count === 2) suffix = "Two";
    else if (count <= 10) suffix = "Few";
    return SY.t(base + suffix, { n: String(count) });
  }

  /* ------------------------------------------------------------------- css */

  /* style.css owns the shared vocabulary — `dialog.sheet`, `.sheet__*`,
     `.cart__line`, `.stepper`, `.btn`, `.empty` — and none of it is restated
     here. Two owners for one value is how the old stylesheet ended up carrying
     both halves of the toast argument in two comments 91 lines apart. What is
     left is what the cart has and the stylesheet does not. */
  /* Every rule is scoped to #cart or .cartbar, so nothing here can reach
     #depts, #filters or #lightbox. */
  var CSS = `
/* 22 + 4 + 18 + 4 + 56 inside 10/8 of padding = 122px, against the 235px the
   old foot took: 28% of an 844px phone, most of it an amber panel. Every line
   box is stated, because a 19px value in a row with no stated line-height
   silently adds 8px to the sheet. The shared foot's last row is styled as a
   grand total; the cart has none, because the total is not finished until
   delivery is agreed, so that rule is switched off here and not elsewhere. */
#cart .sheet__foot{padding:10px var(--s-4,16px) max(8px,env(safe-area-inset-bottom,0px));gap:4px}
#cart .cart__foot>div{min-block-size:22px;line-height:22px;font-size:var(--t-200,.875rem)}
#cart .cart__foot>div *{line-height:inherit}
#cart .cart__foot>div:last-of-type{padding-block-start:0;border-block-start:0}
#cart .cart__foot b{font-size:var(--t-400,1rem)}
/* A totals row is read as information. The same words in a bordered amber box
   are read as a warning to get past — so: no box, no amber. */
#cart .cart__foot .cart__deliv{min-block-size:18px;line-height:18px;font-size:var(--t-100,.8125rem);font-weight:var(--w-normal,400)}
#cart .cart__go{inline-size:100%;min-block-size:56px}

/* Full-bleed list: the dividers reach both edges and the rows carry the gutter. */
#cart .sheet__body{padding:0}
#cart .cart__line{padding-inline:var(--s-4,16px);align-items:start}
#cart .cart__line:last-child{border-block-end:0}
#cart .cart__line[aria-disabled="true"] strong,
#cart .cart__line[aria-disabled="true"] .pcard__photo{opacity:.6}
#cart .cart__ctrl{grid-column:2;display:flex;align-items:center;gap:var(--s-2,8px)}
#cart .cart__ctrl b,#cart .cart__ctrl .cart__out{margin-inline-start:auto;white-space:nowrap}
#cart .cart__ctrl .cart__out{color:var(--danger,#a4283a);font-weight:var(--w-medium,600);font-size:var(--t-200,.875rem)}

/* 2,744px of content used to scroll inside a 485px window with no count in
   sight. This is 20px of sub-header that survives the scroll. */
#cart .cart__count{position:sticky;inset-block-start:0;z-index:1;background:var(--n-25,#FAFCFE);
border-block-end:1px solid var(--n-200,#DCE4EE);padding:var(--s-1,4px) var(--s-4,16px);
font-size:var(--t-100,.8125rem);line-height:20px;color:var(--n-600,#4F6078);font-weight:var(--w-medium,600)}

/* The one remaining transient. Inside the sheet it cannot cover the page;
   docked above the totals it cannot cover the button. */
#cart .cart__undo{flex:none;display:flex;align-items:center;justify-content:space-between;gap:var(--s-2,8px);
min-block-size:44px;padding-inline:var(--s-4,16px);background:var(--n-950,#0B1626);color:var(--n-0,#fff);font-size:var(--t-100,.8125rem)}
#cart .cart__undo[hidden]{display:none}
#cart .cart__undo button{min-block-size:44px;padding-inline:var(--s-2,8px);border:0;background:transparent;
color:var(--n-0,#fff);font-weight:var(--w-bold,700);text-decoration:underline}

#cart .cart__banner{display:flex;align-items:center;justify-content:space-between;gap:var(--s-2,8px);
min-block-size:40px;color:var(--danger,#a4283a);font-size:var(--t-100,.8125rem);font-weight:var(--w-medium,600)}
#cart .cart__banner button{min-block-size:40px;padding-inline:var(--s-3,12px)}

@media (max-width:767px){#cart[data-state="empty"]{min-block-size:52vh}}

/* The persistent bar. No timer; it sits above the bottom bar rather than over
   it, so it invents no z-index and covers nothing. */
.cartbar{position:fixed;inset-inline:0;inset-block-end:var(--bottombar,0px);z-index:var(--z-bottombar,30);
block-size:52px;background:var(--n-950,#0B1626);color:var(--n-0,#fff);
animation:cartbar-in var(--d-2,200ms) var(--e-out,cubic-bezier(.2,0,0,1))}
.cartbar[hidden]{display:none}
.cartbar__hit{inline-size:100%;block-size:52px;display:flex;align-items:center;justify-content:space-between;
gap:var(--s-2,8px);padding-inline:var(--s-4,16px);border:0;background:transparent;color:inherit;
font-size:var(--t-100,.8125rem);font-weight:var(--w-bold,700)}
html.has-cartbar body{padding-block-end:calc(52px + var(--bottombar,0px))}
@keyframes cartbar-in{from{transform:translateY(100%)}to{transform:none}}

.is-cart-pulse{animation:cart-pulse 220ms cubic-bezier(.34,1.56,.64,1)}
@keyframes cart-pulse{0%{transform:scale(1)}50%{transform:scale(1.28)}100%{transform:scale(1)}}
@media (prefers-reduced-motion:reduce){.cartbar{animation-duration:1ms}.is-cart-pulse{animation:none}}
`;

  function injectCss() {
    if (doc.getElementById("cart-css")) return;
    var style = doc.createElement("style");
    style.id = "cart-css";
    style.textContent = CSS;
    doc.head.appendChild(style);
  }

  /* ---------------------------------------------------------------- markup */

  /* index.html carries the dialog. It is written by another file and may not
     be there yet on a page this script also runs on, so its absence is a
     branch rather than a crash. */
  function ensureDialog() {
    dlg = SY.qs("#cart");
    if (!dlg) {
      dlg = doc.createElement("dialog");
      dlg.id = "cart";
      dlg.className = "sheet sheet--end";
      var root = SY.qs("#app-root");
      if (root && root.parentNode) root.parentNode.insertBefore(dlg, root.nextSibling);
      else doc.body.appendChild(dlg);
    }
    if (dlg.tagName !== "DIALOG") return dlg;
    if (!built) {
      dlg.setAttribute("aria-labelledby", "cart-title");
      dlg.innerHTML =
        '<div class="sheet__handle" aria-hidden="true"></div>' +
        '<div class="sheet__head">' +
          '<h2 id="cart-title" data-focus-entry tabindex="-1">' + SY.esc(SY.t("cartTitle")) + "</h2>" +
          '<button type="button" class="btn btn--ghost sheet__close" data-cart-close aria-label="' +
            SY.esc(SY.t("cartClose")) + '">' + SY.icon("close") + "</button>" +
        "</div>" +
        '<div class="sheet__body" id="cart-list"></div>' +
        '<div class="cart__undo" hidden><span data-undo-text></span>' +
          '<button type="button" data-cart-undo>' + SY.esc(SY.t("cartUndo")) + "</button></div>" +
        '<div class="sheet__foot cart__foot" hidden></div>';
      built = true;
    }
    return dlg;
  }

  function ensureBar() {
    bar = SY.qs("#cart-bar");
    if (bar) return bar;
    bar = doc.createElement("div");
    bar.id = "cart-bar";
    bar.className = "cartbar";
    bar.hidden = true;
    bar.innerHTML = '<button type="button" class="cartbar__hit" data-open-cart>' +
      '<span data-bar-sum></span><span>' + SY.esc(SY.t("cartBarView")) + " " + (SY.isRtl() ? "‹" : "›") + "</span></button>";
    doc.body.appendChild(bar);
    return bar;
  }

  /* ---------------------------------------------------------------- render */

  function lineHtml(line) {
    var p = line.product;
    var img = p ? SY.imageSet(p) : null;
    var src = img ? (img.small || img.full) : "";
    var out = !line.inStock;
    var total = line.unit * line.qty;

    var thumb = '<span class="pcard__photo" data-photo>' +
      (src ? '<img src="' + SY.esc(src) + '" width="64" height="64" alt="" loading="lazy" decoding="async">' : SY.icon("box")) +
      "</span>";

    /* Out of stock: the stepper goes. Nothing about a sold-out line should
       invite the shopper to buy more of it. */
    var stepper = out ? "" :
      '<div class="stepper">' +
        '<button type="button" data-step="-1" aria-label="' + SY.esc(SY.t("cartMinus")) + '">' + SY.icon("minus") + "</button>" +
        '<output aria-label="' + SY.esc(SY.t("cartQty", { n: String(line.qty) })) + '">' + SY.num(line.qty) + "</output>" +
        '<button type="button" data-step="1" aria-label="' + SY.esc(SY.t("cartPlus")) + '">' + SY.icon("plus") + "</button>" +
      "</div>";

    var value = out
      ? '<span class="cart__out">' + SY.esc(SY.t("cartOutLine")) + "</span>"
      : '<b><span class="vh">' + SY.esc(SY.t("cartLineTotal")) + "</span>" + SY.money(total) + "</b>";

    return '<div class="cart__line" data-id="' + SY.esc(line.id) + '"' + (out ? ' aria-disabled="true"' : "") + ">" +
      thumb +
      "<div>" +
        /* Two lines of name, never one: a colour variant is distinguished by a
           trailing bracket, and a one-line clamp hides the only thing that
           separates black from white — so the shop ships the wrong colour. */
        "<strong>" + SY.bdi(line.name) + "</strong>" +
        '<span class="meta"><bdi dir="ltr">' + SY.esc(line.code) + " · " + SY.esc(SY.moneyText(line.unit)) + "</bdi> " +
          SY.esc(SY.t("cartEach")) + "</span>" +
      "</div>" +
      '<div class="cart__ctrl">' + stepper + value +
        '<button type="button" class="btn btn--ghost" data-remove aria-label="' +
          SY.esc(SY.t("cartRemove") + " — " + line.name) + '">' + SY.icon("trash") + "</button>" +
      "</div>" +
    "</div>";
  }

  function render() {
    if (!dlg || dlg.tagName !== "DIALOG") return;
    var list = SY.qs("#cart-list", dlg);
    var foot = SY.qs(".cart__foot", dlg);
    if (!list || !foot) return;

    var lines = SY.cart.detailed();
    var out = lines.filter(function (l) { return !l.inStock; });
    var units = lines.reduce(function (n, l) { return n + l.qty; }, 0);

    dlg.dataset.state = lines.length ? (out.length ? "blocked" : "ready") : "empty";

    if (!lines.length) {
      /* Three pieces of furniture in an empty room: a live-looking green
         button, a $0.00 total and an amber warning. All three are removed
         from the DOM, not disabled. */
      list.innerHTML = '<div class="empty">' +
        '<h3 class="empty__title">' + SY.esc(SY.t("cartEmpty")) + "</h3>" +
        '<a class="btn btn--primary" href="/" data-cart-browse>' + SY.esc(SY.t("cartEmptyCta")) + "</a></div>";
      foot.hidden = true;
      foot.innerHTML = "";
      syncBar();
      return;
    }

    var head = lines.length >= COUNT_FROM
      ? '<div class="cart__count">' + SY.esc(SY.t("cartCountLine", {
          items: pluralText("cartItems", lines.length),
          units: pluralText("cartUnits", units)
        })) + "</div>"
      : "";
    list.innerHTML = head + lines.map(lineHtml).join("");

    var banner = out.length
      ? '<div class="cart__banner"><span>' + SY.esc(pluralText("cartOut", out.length)) + "</span>" +
          '<button type="button" class="btn btn--danger" data-drop-out>' + SY.esc(SY.t("cartOutRemove")) + "</button></div>"
      : "";

    foot.hidden = false;
    /* Subtotal, a delivery row in plain text, and a --brand button. Green now
       means WhatsApp only, and the cart no longer goes there. */
    foot.innerHTML = banner +
      "<div><span>" + SY.esc(SY.t("cartSubtotal")) + "</span><b>" + SY.money(SY.cart.subtotal()) + "</b></div>" +
      '<div class="cart__deliv"><span>' + SY.esc(SY.t("cartDelivery")) + "</span>" +
        "<span>" + SY.esc(SY.t("cartDeliveryTbd")) + "</span></div>" +
      (out.length
        ? '<button type="button" class="btn btn--primary cart__go" aria-disabled="true" data-blocked>' +
            SY.esc(SY.t("cartContinue")) + "</button>"
        : '<a class="btn btn--primary cart__go" href="/checkout" data-go-checkout>' +
            SY.esc(SY.t("cartContinue")) + "</a>");

    syncBar();
  }

  /* ------------------------------------------------------------------- bar */

  function onCheckout() {
    return (doc.body && doc.body.dataset.route === "checkout") || /^\/checkout/.test(location.pathname);
  }

  function syncBar() {
    if (onCheckout()) return;
    ensureBar();
    var lines = SY.cart.detailed();
    /* Only at two or more lines, and never while the sheet is open: a
       transient that cannot be on screen at the same time as the surface it
       reports on cannot overlap it. */
    var show = lines.length >= 2 && !(dlg && dlg.open);
    bar.hidden = !show;
    doc.documentElement.classList.toggle("has-cartbar", show);
    if (!show) return;
    var sum = SY.qs("[data-bar-sum]", bar);
    if (sum) sum.innerHTML = SY.esc(pluralText("cartItems", lines.length)) + " · " + SY.money(SY.cart.subtotal());
  }

  /* The header badge and the bottom-bar badge, whichever the page carries.
     innerHTML and not textContent: the badge holds `<bdi dir="ltr">`, and a
     bare digit in an RTL paragraph is exactly the class of bug core.js exists
     to prevent. */
  function paintBadge(pulse) {
    var count = SY.cart.count();
    SY.qsa(BADGES).forEach(function (el) {
      el.innerHTML = SY.num(count);
      if (el.hasAttribute("hidden") || count === 0) el.hidden = count === 0;
      if (!pulse) return;
      el.classList.remove("is-cart-pulse");
      void el.offsetWidth;
      el.classList.add("is-cart-pulse");
      setTimeout(function () { el.classList.remove("is-cart-pulse"); }, PULSE_MS);
    });
  }

  /* ------------------------------------------------------------------ undo */

  function showUndo(line) {
    if (!dlg || !dlg.open) return;
    var box = SY.qs(".cart__undo", dlg);
    if (!box) return;
    SY.qs("[data-undo-text]", box).textContent = SY.t("cartRemoved", { name: line.name });
    box.hidden = false;
    clearTimeout(undoTimer);
    undoTimer = setTimeout(hideUndo, UNDO_MS);
  }
  function hideUndo() {
    clearTimeout(undoTimer);
    var box = dlg && SY.qs(".cart__undo", dlg);
    if (box) box.hidden = true;
    lastRemoved = null;
  }

  function removeLine(id) {
    var line = SY.cart.detailed().filter(function (l) { return String(l.id) === String(id); })[0];
    if (!line) return;
    lastRemoved = { id: line.id, qty: line.qty, name: line.name };
    SY.cart.remove(id);
    render();
    showUndo(line);
    SY.say("cart", SY.t("cartRemoved", { name: line.name }));
  }

  /* --------------------------------------------------- the unsaved order */

  /*
   * When `POST /api/order` could not write, checkout leaves the payload in
   * `localStorage` and finishes the customer with an `X-` reference. The retry
   * lives here, not in checkout.js, because "the next load" is almost never
   * the checkout page — it is the home page or a product page, and this file
   * is the one that runs on all of them. One owner, one attempt, and the same
   * `clientOrderId`, so a retry can never create a second order.
   */
  function retryUnsaved() {
    var body = SY.store.get("pending", null);
    if (!body || !body.clientOrderId || !body.lines || !body.lines.length) return;
    /* Removed before the request, not after: a retry that itself fails must
       not queue a third. */
    SY.store.del("pending");
    fetch("/api/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then(function (res) {
      return res.ok ? res.json() : null;
    }).then(function (json) {
      if (!json || !json.ok) return;
      var mine = (SY.store.get("orders", []) || []).map(function (row) {
        return row.status === "unsaved"
          ? { ref: json.ref, url: json.url, at: row.at, goods: row.goods, status: "new" }
          : row;
      });
      SY.store.set("orders", mine.slice(0, 20));
      SY.store.del("checkout_cid");
    }).catch(function () {});
  }

  /* --------------------------------------------------------------- surface */

  function open(opener) {
    injectCss();
    ensureDialog();
    if (dlg.tagName !== "DIALOG") return;
    render();
    SY.openDialog(dlg, opener);
    syncBar();
    SY.say("cart", SY.t("cartOpened", { items: pluralText("cartItems", SY.cart.distinct()) }));
  }

  /* No exit animation is scheduled here: `dialog.sheet` transitions `overlay`
     and `display` with allow-discrete, so the browser plays the exit itself
     when close() runs. A JS timer on top of that is a second owner for one
     duration and drifts the moment the token changes. */
  function close() {
    if (!dlg || !dlg.open) return;
    hideUndo();
    SY.closeDialog(dlg);
    syncBar();
  }

  /* The add button swaps to a check for 1,400ms. It is the primary feedback
     because it is where the eye already is; min-width is locked at press time
     so the swap shifts nothing. */
  function added(button) {
    paintBadge(true);
    syncBar();
    SY.say("cart", SY.t("cartAdded", { items: pluralText("cartItems", SY.cart.distinct()) }));
    if (!button || button.dataset.adding !== undefined) return;
    button.dataset.adding = "";
    var html = button.innerHTML;
    button.style.minInlineSize = button.getBoundingClientRect().width + "px";
    button.innerHTML = SY.icon("check");
    setTimeout(function () {
      button.innerHTML = html;
      button.style.minInlineSize = "";
      delete button.dataset.adding;
    }, ADDED_MS);
  }

  /* ---------------------------------------------------------------- events */

  function stepLine(id, delta) {
    var line = SY.cart.lines().filter(function (l) { return String(l.id) === String(id); })[0];
    if (!line) return;
    var next = line.qty + delta;
    /* Minus at 1 removes the line and offers undo rather than sitting there
       disabled: a dead control is a dead end on touch. */
    if (next < 1) return removeLine(id);
    if (next > MAX) { SY.say("cart", SY.t("cartMaxQty")); return; }
    SY.cart.setQty(id, next);
    render();
  }

  doc.addEventListener("click", function (e) {
    var t = e.target;
    if (!t || !t.closest) return;

    var opener = t.closest(OPENERS);
    if (opener) {
      e.preventDefault();
      return open(opener);
    }
    if (t.closest("[data-cart-close]")) { e.preventDefault(); return close(); }
    if (t.closest("[data-cart-browse]")) { close(); return; }
    if (t.closest("[data-go-checkout]")) { return; }

    if (t.closest("[data-cart-undo]")) {
      e.preventDefault();
      if (lastRemoved) SY.cart.add(lastRemoved.id, lastRemoved.qty);
      hideUndo();
      render();
      return;
    }
    if (t.closest("[data-drop-out]")) {
      e.preventDefault();
      SY.cart.unavailable().forEach(function (l) { SY.cart.remove(l.id); });
      render();
      return;
    }
    if (t.closest("[data-blocked]")) {
      e.preventDefault();
      SY.say("error", SY.t("cartOutBlocked"));
      var drop = dlg && SY.qs("[data-drop-out]", dlg);
      if (drop) drop.focus();
      return;
    }

    var step = t.closest("[data-step]");
    if (step && dlg && dlg.contains(step)) {
      e.preventDefault();
      var row = step.closest(".cart__line");
      if (row) stepLine(row.dataset.id, Number(step.dataset.step));
      return;
    }
    var rm = t.closest("[data-remove]");
    if (rm && dlg && dlg.contains(rm)) {
      e.preventDefault();
      var line = rm.closest(".cart__line");
      if (line) removeLine(line.dataset.id);
      return;
    }

    /* A page that wires its own add button calls CART.added(button); one that
       only marks the button up gets the whole behaviour from here. */
    var add = t.closest("[data-add-to-cart]");
    if (add) {
      var holder = add.closest("[data-product]");
      var id = add.dataset.addToCart || (holder && holder.dataset.product);
      if (!id || id === "true") return;
      e.preventDefault();
      var field = SY.qs("[data-qty-input]");
      var qty = Number(add.dataset.qty || (field && field.value) || 1);
      if (SY.cart.add(id, SY.clamp(qty, 1, MAX))) added(add);
    }
  });

  /* Drag to dismiss: more than 96px down, or a flick faster than 0.5px/ms. */
  (function drag() {
    var startY = 0, startT = 0, dragging = false;
    doc.addEventListener("pointerdown", function (e) {
      if (!dlg || !dlg.open || !SY.isPhone()) return;
      var grip = e.target.closest && e.target.closest(".sheet__handle,.sheet__head");
      if (!grip || !dlg.contains(grip)) return;
      dragging = true; startY = e.clientY; startT = e.timeStamp;
      dlg.style.transition = "none";
    });
    doc.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      var dy = Math.max(0, e.clientY - startY);
      dlg.style.transform = dy ? "translateY(" + dy + "px)" : "";
    });
    doc.addEventListener("pointerup", function (e) {
      if (!dragging) return;
      dragging = false;
      var dy = Math.max(0, e.clientY - startY);
      var v = dy / Math.max(1, e.timeStamp - startT);
      dlg.style.transition = "";
      dlg.style.transform = "";
      if (dy > 96 || v > 0.5) close();
    });
  })();

  SY.on("cart", function () {
    paintBadge(false);
    if (dlg && dlg.open) render();
    syncBar();
  });
  SY.on("catalog", function () { if (dlg && dlg.open) render(); });
  SY.on("overlay", function () { syncBar(); });

  SY.ready(function () {
    retryUnsaved();
    injectCss();
    ensureDialog();
    paintBadge(false);
    if (!onCheckout()) { ensureBar(); syncBar(); }
    /* The stored line snapshots a name from the moment it was added; the
       translated one only exists once the copy file has landed. */
    if (SY.primeCopy) SY.primeCopy().then(function () { if (dlg && dlg.open) render(); syncBar(); });
  });

  window.CART = { open: open, close: close, render: render, added: added };
})();
