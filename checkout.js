/*
 * SmartTech — /checkout.
 * ======================
 * Four required fields, one payment method presented as a choice, and a grand
 * total written as an expression instead of a number.
 *
 * Field order is phone, name, city, address — phone first because it is the
 * field that turns the record into an asset: without it the owner cannot chase
 * an order that stalls, and a row he cannot action is a receipt, not an order.
 *
 * Three decisions worth stating, because each one is load-bearing:
 *
 *  - **City is a key, never a label.** `sy-aleppo`, not «حلب». That is what
 *    lets `deliveryPrices["sy-aleppo"]` be added later without touching one
 *    stored order, and the `sy-` prefix is what makes the first order shipped
 *    abroad a select change rather than a data migration.
 *  - **The grand total is `$559.94 + التوصيل`.** Arithmetically truthful,
 *    impossible to misread as a final price, and not a warning, so it
 *    frightens nobody. There is no amount on the submit button: printing the
 *    figure there would undo that honesty one line above it.
 *  - **If the write fails the customer still finishes.** An `X-` reference, a
 *    client-rendered confirmation, an itemised WhatsApp message carrying the
 *    address, and one background retry on the next load with the same
 *    `clientOrderId`. Nothing in the paying path depends on the server.
 */
(function () {
  "use strict";

  var SY = window.SY;
  if (!SY) return;

  var doc = document;
  var MAX_WAIT = 2500;

  /* The fourteen governorates. The value stored on the order is the key. */
  var CITIES = [
    "sy-damascus", "sy-rural-damascus", "sy-aleppo", "sy-homs", "sy-hama",
    "sy-latakia", "sy-tartus", "sy-idlib", "sy-deir-ez-zor", "sy-raqqa",
    "sy-hasakah", "sy-daraa", "sy-as-suwayda", "sy-quneitra"
  ];

  var FIELDS = ["phone", "name", "city", "address", "email"];
  var touched = {};
  var busy = false;
  var whatsapp = "";
  /* The owner's delivery table and free-delivery threshold, from /api/products. */
  var shopSettings = {};
  var summaryOpen = false;
  var conflictIds = [];

  /* ------------------------------------------------------------------ text */

  function pluralText(base, n) {
    var count = Number(n) || 0;
    var suffix = "Many";
    if (SY.lang() !== "ar") suffix = count === 1 ? "One" : "Many";
    else if (count === 1) suffix = "One";
    else if (count === 2) suffix = "Two";
    else if (count <= 10) suffix = "Few";
    return SY.t(base + suffix, { n: String(count) });
  }
  function cityLabel(key) { return key ? SY.t("city." + key) : ""; }

  /* -------------------------------------------------------------- the form */

  function el(id) { return SY.qs("#" + id); }

  function fillCities() {
    var select = el("co-city");
    if (!select) return;
    var html = '<option value="">' + SY.esc(SY.t("coCityChoose")) + "</option>";
    CITIES.forEach(function (key) {
      html += '<option value="' + SY.esc(key) + '">' + SY.esc(cityLabel(key)) + "</option>";
    });
    select.innerHTML = html;
  }

  /* A returning shopper's checkout requires zero typing. That is a bigger
     friction cut than removing any field, and it costs ~200 bytes. */
  function prefill() {
    var saved = SY.store.get("customer", null);
    if (!saved || typeof saved !== "object") return false;
    var any = false;
    FIELDS.forEach(function (name) {
      var field = el("co-" + name);
      if (field && saved[name]) { field.value = saved[name]; any = true; }
    });
    var note = SY.qs("[data-remembered]");
    if (note) note.hidden = !any;
    return any;
  }

  function clearSaved() {
    SY.store.del("customer");
    FIELDS.forEach(function (name) {
      var field = el("co-" + name);
      if (field) field.value = "";
    });
    touched = {};
    FIELDS.forEach(showError);
    var note = SY.qs("[data-remembered]");
    if (note) note.hidden = true;
    SY.say("status", SY.t("coCleared"));
    var phone = el("co-phone");
    if (phone) phone.focus();
  }

  /* ---------------------------------------------------------- validation */

  /* Accepts 09XXXXXXXX, 9XXXXXXXX, +9639XXXXXXXX, 009639XXXXXXXX, and any
     8–15 digits behind a leading + so a Turkish customer is not locked out.
     Returns the E.164 form, or "" when it is not a number we can call. */
  function normalisePhone(raw) {
    var value = String(raw || "").replace(/[\s()\-.\u00a0]/g, "");
    if (/^00\d+$/.test(value)) value = "+" + value.slice(2);
    if (/^\+\d+$/.test(value)) {
      var digits = value.slice(1);
      return digits.length >= 8 && digits.length <= 15 ? "+" + digits : "";
    }
    if (!/^\d+$/.test(value)) return "";
    if (/^09\d{8}$/.test(value)) return "+963" + value.slice(1);
    if (/^9\d{8}$/.test(value)) return "+963" + value;
    if (/^963\d{9}$/.test(value)) return "+" + value;
    return "";
  }

  function validate(name) {
    var field = el("co-" + name);
    if (!field) return "";
    var value = String(field.value || "").trim();
    if (name === "phone") return normalisePhone(value) ? "" : "coPhoneError";
    if (name === "name") return value.length >= 2 ? "" : "coNameError";
    if (name === "city") return CITIES.indexOf(value) !== -1 ? "" : "coCityChoose";
    if (name === "address") return value.length >= 6 ? "" : "coAddressError";
    if (name === "email") return !value || /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(value) ? "" : "coEmailError";
    return "";
  }

  function showError(name) {
    var field = el("co-" + name);
    var box = el("err-" + name);
    if (!field || !box) return "";
    var key = touched[name] ? validate(name) : "";
    box.textContent = key ? SY.t(key) : "";
    box.hidden = !key;
    if (key) field.setAttribute("aria-invalid", "true");
    else field.removeAttribute("aria-invalid");
    return key;
  }

  /* On blur for a touched field and on submit. Never on input — correcting
     someone mid-word is the most irritating thing a form does. */
  function wireValidation() {
    FIELDS.forEach(function (name) {
      var field = el("co-" + name);
      if (!field) return;
      SY.bind(field, "blur", function () { touched[name] = true; showError(name); });
      if (field.tagName === "SELECT") SY.bind(field, "change", function () { touched[name] = true; showError(name); });
    });
  }

  /* ----------------------------------------------------------- the summary */

  function lines() { return SY.cart.detailed(); }

  /* Mirror the checked radio onto a class. The stylesheet highlights the
     selected card with :has(input:checked), which needs Chrome 105 or Safari
     15.4 — and a shopper on an older phone who cannot see which payment
     method is selected has no way to tell whether the form is ready. */
  function markPaymentChoice() {
    for (const label of SY.qsa(".paymethod")) {
      const input = label.querySelector('input[type="radio"]');
      label.classList.toggle("is-on", !!(input && input.checked));
    }
  }
  SY.bind(document, "change", e => {
    if (e.target && e.target.matches && e.target.matches('.paymethod input[type="radio"]')) markPaymentChoice();
  });
  SY.ready(markPaymentChoice);

  function renderSummary() {
    var list = SY.qs("[data-summary-lines]");
    var head = SY.qs("[data-summary-text]");
    var rows = lines();
    if (head) {
      head.innerHTML = SY.t("coSummary", {
        items: SY.esc(pluralText("cartItems", rows.length)),
        sum: SY.money(goods(rows))
      });
    }
    if (!list) return;
    list.innerHTML = rows.map(function (l) {
      var bad = conflictIds.indexOf(String(l.id)) !== -1 || !l.inStock;
      return '<li class="co-line' + (bad ? " is-out" : "") + '">' +
        '<span class="co-line__name">' + SY.bdi(l.name) + "</span>" +
        '<span class="co-line__num"><bdi dir="ltr">' + SY.esc(l.code) + "</bdi> · " +
          SY.num(l.qty) + " × " + SY.money(l.unit) + "</span>" +
        "<b>" + (bad ? SY.esc(SY.t("cartOutLine")) : SY.money(l.unit * l.qty)) + "</b></li>";
    }).join("");
  }

  function goods(rows) {
    return (rows || lines()).filter(function (l) { return l.inStock; })
      .reduce(function (sum, l) { return sum + l.unit * l.qty; }, 0);
  }

  function renderTotals() {
    var sum = goods();
    var city = (el("co-city") || {}).value || "";
    var label = SY.qs("[data-deliv-label]");
    var value = SY.qs("[data-goods]");
    var grand = SY.qs("[data-grand]");
    if (value) value.innerHTML = SY.money(sum);
    if (label) label.textContent = city ? SY.t("coDeliveryTo", { city: cityLabel(city) }) : SY.t("coDelivery");
    /* The owner's table, by the rule api/order.js records (catalog.js). With
       no price for the governorate it stays an expression, not a number. */
    var fee = city ? window.STORE.deliveryFee(shopSettings, city, sum) : null;
    var cell = SY.qs("[data-deliv]");
    if (cell) {
      if (fee === null) { cell.setAttribute("data-i18n", "coDeliveryTbd"); cell.textContent = SY.t("coDeliveryTbd"); }
      else { cell.removeAttribute("data-i18n"); cell.innerHTML = fee === 0 ? SY.esc(SY.t("coDeliveryFree")) : SY.money(fee); }
    }
    if (grand) grand.innerHTML = fee === null ? SY.t("coGrandExpr", { sum: SY.money(sum) }) : SY.money(sum + fee);
  }

  /* -------------------------------------------------------- the two messages */

  function waHref(text) {
    return "https://wa.me/" + encodeURIComponent(whatsapp) + "?text=" + encodeURIComponent(text);
  }

  /* Primary — five lines, sent from the confirmation page after the order
     exists. Every Arabic line is either pure Arabic or Arabic followed by
     exactly one trailing LTR run, so the bidi order is stable. */
  function primaryMessage(order, url) {
    return [
      SY.t("waHead", { ref: order.no }),
      SY.t("waWho", {
        name: order.customer.name,
        city: cityLabel(order.customer.city),
        items: pluralText("cartItems", order.lines.length)
      }),
      SY.t("waGoods", { sum: SY.moneyText(order.totals.items) }),
      SY.t("waDelivTbd"),
      SY.t("waUrl", { url: url })
    ].join("\n");
  }

  /* Fallback — fully itemised, because there is no page to fall back to. */
  function fallbackMessage(order) {
    var rows = order.lines.slice(0, 8).map(function (l) {
      return l.inStockAtOrder === false
        ? SY.t("waLineOut", { code: l.sku, qty: String(l.qty), name: l.name })
        : SY.t("waLine", {
            code: l.sku, qty: String(l.qty),
            unit: SY.moneyText(l.unit), total: SY.moneyText(l.total), name: l.name
          });
    });
    var extra = order.lines.length - 8;
    if (extra > 0) rows.push(pluralText("waMore", extra));
    return [
      SY.t("waHeadX", { ref: order.no }),
      SY.t("waWhoX", { name: order.customer.name, city: cityLabel(order.customer.city) }),
      "",
      rows.join("\n"),
      "",
      SY.t("waSum", { sum: SY.moneyText(order.totals.items) }),
      SY.t("waDelivTbd"),
      SY.t("waAddress", { address: order.customer.address })
    ].join("\n");
  }

  /* ------------------------------------------------------------- the payload */

  function clientOrderId() {
    var id = SY.store.get("checkout_cid", "");
    if (id) return id;
    try { id = crypto.randomUUID(); }
    catch (e) { id = "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }
    SY.store.set("checkout_cid", id);
    return id;
  }

  function customerFromForm() {
    return {
      name: String((el("co-name") || {}).value || "").trim(),
      phone: normalisePhone((el("co-phone") || {}).value),
      city: String((el("co-city") || {}).value || ""),
      address: String((el("co-address") || {}).value || "").trim(),
      email: String((el("co-email") || {}).value || "").trim(),
      note: String((el("co-note") || {}).value || "").trim()
    };
  }

  function payload() {
    return {
      clientOrderId: clientOrderId(),
      lang: SY.lang(),
      channel: "web",
      source: "cart",
      customer: customerFromForm(),
      payment: { method: "cod" },
      delivery: { method: "courier" },
      lines: lines().map(function (l) {
        return { pid: l.id, qty: l.qty, unit: l.unit, sku: l.code, name: l.name };
      })
    };
  }

  /* The client-side twin of the record, used only when the write failed. Same
     shape, same field names, so the fallback message and the confirmation
     read from one object whichever path produced it. */
  function localOrder(data) {
    var day = new Date();
    var stamp = String(day.getFullYear()).slice(2) +
      String(day.getMonth() + 1).padStart(2, "0") + String(day.getDate()).padStart(2, "0");
    var tail = String(Math.floor(Math.random() * 100)).padStart(2, "0");
    var rows = lines();
    return {
      no: "SY-" + stamp + "-X" + tail,
      v: 1,
      createdAt: Date.now(),
      channel: "web",
      lang: data.lang,
      status: "new",
      customer: data.customer,
      lines: rows.map(function (l) {
        return { pid: l.id, sku: l.code, name: l.name, qty: l.qty, unit: l.unit, total: l.unit * l.qty, inStockAtOrder: l.inStock };
      }),
      totals: { items: goods(rows), delivery: null, discount: 0, grand: null, currency: "USD" },
      delivery: { method: "courier", city: data.customer.city, fee: null },
      payment: { method: "cod", state: "unpaid", paid: 0 }
    };
  }

  /* ------------------------------------------------------------- submitting */

  function setBusy(on) {
    busy = on;
    var button = SY.qs("[data-submit]");
    if (!button) return;
    button.disabled = on;
    button.setAttribute("aria-busy", on ? "true" : "false");
    button.textContent = SY.t(on ? "coSubmitting" : "coSubmit");
    if (on) SY.say("busy", SY.t("coBusy"));
  }

  function post(body, ms) {
    var ctrl = typeof AbortController === "function" ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, ms || MAX_WAIT);
    return fetch("/api/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      clearTimeout(timer);
      return res.json().catch(function () { return {}; }).then(function (json) {
        return { status: res.status, json: json };
      });
    }, function (e) { clearTimeout(timer); throw e; });
  }

  function onSubmit(e) {
    e.preventDefault();
    if (busy) return;

    touched = { phone: true, name: true, city: true, address: true, email: true };
    var bad = FIELDS.map(showError).filter(Boolean);
    if (bad.length) {
      SY.say("error", pluralText("coErrors", bad.length));
      var first = FIELDS.filter(function (n) { return showError(n); })[0];
      var field = el("co-" + first);
      if (field) { field.focus(); SY.scrollToEl(field, 24); }
      return;
    }
    if (!lines().length) { SY.say("error", SY.t("coEmptyRedirect")); return; }

    var body = payload();
    SY.store.set("pending", body);
    setBusy(true);

    post(body).then(function (out) {
      if (out.status === 200 && out.json && out.json.ok) return succeed(out.json);
      if (out.status === 409) return conflict(out.json);
      return degrade(body);
    }).catch(function () {
      return degrade(body);
    });
  }

  function succeed(json) {
    var form = customerFromForm();
    delete form.note;
    SY.store.set("customer", form);
    var mine = SY.store.get("orders", []) || [];
    mine.unshift({ ref: json.ref, url: json.url, at: Date.now(), goods: json.goods, status: "new" });
    SY.store.set("orders", mine.slice(0, 20));
    SY.store.del("pending");
    SY.store.del("checkout_cid");
    SY.cart.clear();
    location.assign(json.url);
  }

  /* The one case the fallback rule does not cover: the failure is the
     customer's information changing, not our storage, so the order is not
     created and the page says which line went. */
  function conflict(json) {
    setBusy(false);
    conflictIds = ((json && json.ids) || []).map(String);
    summaryOpen = true;
    toggleSummary(true);
    renderSummary();
    var box = SY.qs("[data-form-error]");
    if (box) { box.textContent = SY.t("coStockChanged"); box.hidden = false; }
    SY.say("error", SY.t("coStockChanged"));
    SY.scrollToEl(SY.qs("[data-summary]"), 24);
  }

  function degrade(body) {
    var order = localOrder(body);
    SY.store.set("pending", body);
    var form = customerFromForm();
    delete form.note;
    SY.store.set("customer", form);
    var mine = SY.store.get("orders", []) || [];
    mine.unshift({ ref: order.no, url: "", at: Date.now(), goods: order.totals.items, status: "unsaved" });
    SY.store.set("orders", mine.slice(0, 20));
    SY.store.set("fallback", order);
    SY.cart.clear();
    SY.route.replace("/checkout?done=1");
    renderDone(order, null);
  }

  /* ------------------------------------------------- the client confirmation */

  function renderDone(order, url) {
    var main = SY.qs("#main");
    if (!main) return;
    var steps = [
      SY.t("ocNext1", { phone: '<bdi dir="ltr">' + SY.esc(order.customer.phone) + "</bdi>" }),
      SY.t("ocNext2"),
      SY.t("ocNext3")
    ];
    var rows = order.lines.map(function (l) {
      return '<li class="co-line"><span class="co-line__name">' + SY.bdi(l.name) + "</span>" +
        '<span class="co-line__num"><bdi dir="ltr">' + SY.esc(l.sku) + "</bdi> · " +
        SY.num(l.qty) + " × " + SY.money(l.unit) + "</span><b>" + SY.money(l.total) + "</b></li>";
    }).join("");

    main.innerHTML =
      "<h1>" + SY.esc(SY.t("ocTitle")) + "</h1>" +
      '<p class="co-ref"><span class="co-ref__k">' + SY.esc(SY.t("ocRefLabel")) + "</span>" +
        '<b dir="ltr">' + SY.esc(order.no) + "</b></p>" +
      (url ? "" : '<p class="co-warn">' + SY.esc(SY.t("coSaveFailed")) + "</p>") +
      '<h2 class="co-h2">' + SY.esc(SY.t("ocNext")) + "</h2>" +
      '<ol class="co-next">' + steps.map(function (s) { return "<li>" + s + "</li>"; }).join("") + "</ol>" +
      '<h2 class="co-h2">' + SY.esc(SY.t("ocOrder")) + "</h2>" +
      '<ul class="co-lines">' + rows + "</ul>" +
      '<div class="co-totals">' +
        '<div class="co-total"><span>' + SY.esc(SY.t("ocGoods")) + "</span><b>" + SY.money(order.totals.items) + "</b></div>" +
        '<div class="co-total co-total--deliv"><span>' +
          SY.esc(SY.t("ocDelivery", { city: cityLabel(order.customer.city) })) + "</span><span>" +
          SY.esc(SY.t("ocDeliveryTbd")) + "</span></div>" +
        '<div class="co-total co-total--grand"><span>' + SY.esc(SY.t("ocTotal")) + "</span><b>" +
          SY.t("ocTotalExpr", { sum: SY.money(order.totals.items) }) + "</b></div>" +
      "</div>" +
      '<h2 class="co-h2">' + SY.esc(SY.t("ocDeliverTo")) + "</h2>" +
      /* Exactly as entered — the cheapest defence against a wrong delivery, at
         the only moment the customer is still paying attention. */
      '<p class="co-addr">' + SY.bdi(order.customer.name) + " · <bdi dir=\"ltr\">" + SY.esc(order.customer.phone) + "</bdi><br>" +
        SY.esc(order.customer.address) + "</p>" +
      '<div class="co-actions">' +
        '<a class="btn btn--wa" data-wa-send href="' + SY.esc(waHref(fallbackMessage(order))) +
          '" target="_blank" rel="noopener noreferrer">' + SY.esc(SY.t("ocTellUs")) + "</a>" +
      "</div>";
    doc.title = SY.t("ocTitle");
    SY.say("status", SY.t("ocTitle"));
    var h1 = SY.qs("h1", main);
    if (h1) { h1.setAttribute("tabindex", "-1"); h1.focus(); }
  }

  /* ------------------------------------------------------------------- wire */

  function toggleSummary(open) {
    summaryOpen = open === undefined ? !summaryOpen : open;
    var button = SY.qs("[data-summary-toggle]");
    var body = SY.qs("[data-summary-lines]");
    if (button) {
      button.setAttribute("aria-expanded", summaryOpen ? "true" : "false");
      var verb = SY.qs(".vh", button);
      if (verb) verb.textContent = SY.t(summaryOpen ? "coSummaryHide" : "coSummaryShow");
    }
    if (body) body.hidden = !summaryOpen;
  }

  function wire() {
    var form = SY.qs("#co-form");
    if (form) SY.bind(form, "submit", onSubmit);

    var toggle = SY.qs("[data-summary-toggle]");
    if (toggle) SY.bind(toggle, "click", function () { toggleSummary(); });

    var city = el("co-city");
    if (city) SY.bind(city, "change", renderTotals);

    var clear = SY.qs("[data-clear-saved]");
    if (clear) SY.bind(clear, "click", clearSaved);

    var noteBtn = SY.qs("[data-note-toggle]");
    if (noteBtn) SY.bind(noteBtn, "click", function () {
      var box = SY.qs("[data-note-box]");
      if (!box) return;
      box.hidden = !box.hidden;
      noteBtn.setAttribute("aria-expanded", box.hidden ? "false" : "true");
      if (!box.hidden) { var f = el("co-note"); if (f) f.focus(); }
    });
  }

  function showEmpty() {
    var main = SY.qs("#main");
    if (!main) return;
    main.innerHTML = "<h1>" + SY.esc(SY.t("coTitle")) + "</h1>" +
      '<div class="empty"><h2 class="empty__title">' + SY.esc(SY.t("cartEmpty")) + "</h2>" +
      '<a class="btn btn--primary" href="/">' + SY.esc(SY.t("cartEmptyCta")) + "</a></div>";
  }

  SY.ready(function () {
    if (window.I18N) I18N.apply(doc);
    fillCities();
    wire();
    wireValidation();

    var done = new URLSearchParams(location.search).get("done") === "1";
    var saved = SY.store.get("fallback", null);
    if (done && saved) { renderDone(saved, null); return; }

    if (!lines().length) { showEmpty(); return; }

    renderSummary();
    renderTotals();
    prefill();

    /* Live prices and live stock, so the 409 is rare rather than routine. */
    fetch("/api/products").then(function (r) { return r.json(); }).then(function (state) {
      whatsapp = (window.STORE.mergeSettings(state) || {}).whatsapp || window.STORE.settings.whatsapp;
      shopSettings = (state && state.settings) || {};
      SY.setState(state);
      if (!lines().length) return showEmpty();
      renderSummary();
      renderTotals();
    }).catch(function () {
      whatsapp = window.STORE.settings.whatsapp;
    });

    if (SY.primeCopy) SY.primeCopy().then(function () { renderSummary(); });
  });
})();
