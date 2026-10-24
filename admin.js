/*
 * SmartTech — the administration console.
 *
 * Twelve screens in five groups. Orders first, and orders is the landing page
 * after login: that is what the owner opens the console for.
 *
 * Three things shape every line of this file.
 *
 *  1. The catalogue is never downloaded. Rows are paged from the server, forty
 *     at a time. The old panel rendered all 312 at once — 45,334px on an 844px
 *     phone, 3,070 nodes, 312 <img> — and at 3,000 products that is ~29,500
 *     nodes. Nothing here grows with the size of the shop.
 *  2. No visible string is written here. Everything is t("admin.…"), from
 *     i18n-admin.js, which this page loads and the shop does not.
 *  3. Every number that reaches the page goes through money() / num() / when(),
 *     which emit <bdi dir="ltr">. Under the bidi algorithm an Arabic paragraph
 *     reorders digit runs: "$129.98" renders 129.98$ and "1-12" renders 12-1.
 *
 * There are no letter-key shortcuts. The owner is typing Arabic and a
 * layout-dependent "g" is useless; everything is a modifier or an arrow.
 */
(function () {
  "use strict";

  const I = window.I18N;
  const t = (key, vars) => I.t(key, vars);
  const doc = document;
  const qs = (sel, root) => (root || doc).querySelector(sel);
  const qsa = (sel, root) => Array.prototype.slice.call((root || doc).querySelectorAll(sel));

  const esc = value => String(value == null ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  /* ------------------------------------------------- bidi-safe numbers --- */
  let cash = null;
  function moneyText(value) {
    const n = Number(value) || 0;
    if (!cash) {
      try { cash = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
      catch (e) { cash = { format: v => v.toFixed(2) }; }
    }
    return "$" + cash.format(n);
  }
  const money = value => '<bdi dir="ltr">' + moneyText(value) + "</bdi>";
  const num = value => '<bdi dir="ltr">' + String(Number(value) || 0) + "</bdi>";
  const bdi = value => "<bdi>" + esc(value) + "</bdi>";
  const codeOf = value => '<bdi dir="ltr">' + esc(value) + "</bdi>";
  function when(ms, withDate) {
    if (!ms) return "";
    try {
      const d = new Date(Number(ms));
      const time = d.toLocaleTimeString(I.current, { hour: "2-digit", minute: "2-digit" });
      if (!withDate) return '<bdi dir="ltr">' + esc(time) + "</bdi>";
      const date = d.toLocaleDateString(I.current, { day: "numeric", month: "short" });
      return '<bdi dir="ltr">' + esc(date + " " + time) + "</bdi>";
    } catch (e) { return ""; }
  }

  /* ------------------------------------------------------------ surfaces */
  const toastBox = qs("#toast");
  let toastTimer = 0;
  function toast(message, options) {
    const opts = options || {};
    toastBox.innerHTML = "<span>" + message + "</span>" +
      (opts.action ? '<button type="button" class="btn" data-toast-action>' + esc(opts.action.label) + "</button>" : "");
    toastBox.classList.toggle("is-error", !!opts.error);
    toastBox.classList.add("is-shown");
    if (opts.action) {
      qs("[data-toast-action]", toastBox).onclick = () => { hideToast(); opts.action.run(); };
    }
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, opts.action ? 12000 : 4000);
  }
  const hideToast = () => toastBox.classList.remove("is-shown");
  function say(region, message) {
    const box = qs("#sr-" + region);
    if (box) box.textContent = message;
  }

  function openSheet(id, title, bodyHtml, footHtml) {
    const dialog = qs("#" + id);
    qs("#" + id + "Title") && (qs("#" + id + "Title").textContent = title);
    qs("#" + id + "Body").innerHTML = bodyHtml;
    qs("#" + id + "Foot").innerHTML = footHtml || "";
    if (!dialog.open) dialog.showModal();
    return dialog;
  }
  const closeSheet = id => { const d = qs("#" + id); if (d && d.open) d.close(); };
  qsa("dialog.sheet").forEach(dialog => {
    dialog.addEventListener("click", event => {
      if (event.target.closest("[data-close]")) dialog.close();
    });
  });

  /* ----------------------------------------------------------------- api */
  let inFlight = null;
  async function api(action, options) {
    const opts = options || {};
    const params = new URLSearchParams({ action });
    Object.entries(opts.query || {}).forEach(([k, v]) => { if (v !== "" && v != null) params.set(k, v); });
    const init = { credentials: "same-origin", method: opts.body ? "POST" : "GET" };
    if (opts.body) { init.headers = { "Content-Type": "application/json" }; init.body = JSON.stringify(opts.body); }
    if (opts.signal) init.signal = opts.signal;
    let res;
    try { res = await fetch("/api/admin?" + params.toString(), init); }
    catch (e) { if (e.name === "AbortError") throw e; throw new Error("__net"); }
    let data = {};
    try { data = await res.json(); } catch (e) { /* an empty body */ }
    if (res.status === 401) {
      /* A wrong password and an expired session are both 401, and telling an
         owner who mistyped that his session expired sends him looking for a
         problem that is not there. The server says which it is. */
      const wrong = data.error === "invalid_password" || params.get("action") === "login";
      showLogin(t(wrong ? "admin.wrongPassword" : "admin.sessionExpired"));
      const err = new Error("__auth");
      err.code = data.error || "unauthorised";
      throw err;
    }
    if (!res.ok || data.ok === false) {
      const err = new Error(data.error || "server_error");
      err.code = data.error || "server_error";
      err.detail = data;
      throw err;
    }
    return data;
  }
  function explain(error) {
    if (!error || error.message === "__auth") return "";
    if (error.message === "__net") return t("admin.connectionError");
    return t("error." + (error.code || "server_error"));
  }
  function fail(error) {
    const message = explain(error);
    if (!message) return;
    toast(esc(message), { error: true });
    say("error", message);
  }

  /* --------------------------------------------------------------- state */
  const state = {
    user: null, settings: {}, counts: {}, screen: "orders",
    taxonomy: null, brands: [], cursor: -1, rows: [], selection: new Set()
  };

  /* Five destinations on a phone, الطلبات first. Everything else is behind
     «المزيد», which is the same rail rendered into a sheet. */
  const SCREENS = [
    { id: "orders", group: "grpOrders", key: "navOrders", phone: 1, icon: "truck" },
    { id: "customers", group: "grpOrders", key: "navCustomers", icon: "user" },
    { id: "products", group: "grpCatalog", key: "navProducts", phone: 2, icon: "box" },
    { id: "taxonomy", group: "grpCatalog", key: "navTaxonomy", icon: "grid" },
    { id: "stock", group: "grpCatalog", key: "navStock", phone: 3, icon: "tag" },
    { id: "pricing", group: "grpCatalog", key: "navPricing", icon: "tag" },
    { id: "media", group: "grpCatalog", key: "navMedia", icon: "camera" },
    { id: "content", group: "grpStore", key: "navContent", icon: "info" },
    { id: "reports", group: "grpAdmin", key: "navReports", phone: 4, icon: "chart" },
    { id: "users", group: "grpAdmin", key: "navUsers", icon: "user" },
    { id: "backups", group: "grpAdmin", key: "navBackups", icon: "refresh" },
    { id: "settings", group: "grpSettings", key: "navSettings", icon: "filter" }
  ];
  /* The sprite the shop already ships. "chart" has no glyph in it, so reports
     borrows the one that reads closest rather than inventing a drawing. */
  const GLYPH = { chart: "grid" };
  const icon = name => '<svg class="glyph" aria-hidden="true" focusable="false"><use href="/assets/icons.svg#ic-' +
    (GLYPH[name] || name) + '"></use></svg>';
  const GROUP_ORDER = ["grpOrders", "grpCatalog", "grpStore", "grpAdmin", "grpSettings"];

  const FULFILMENT = ["new", "confirmed", "packed", "shipped", "delivered"];
  const STATUS_KEY = {
    new: "stNew", confirmed: "stConfirmed", packed: "stPacked", shipped: "stShipped",
    delivered: "stDelivered", cancelled: "stCancelled", returned: "stReturned"
  };
  const STATUS_TONE = {
    new: "go", confirmed: "go", packed: "go", shipped: "wait",
    delivered: "done", cancelled: "off", returned: "problem"
  };
  const PAY_TONE = {
    cod: "wait", awaiting: "problem", partial: "wait", paid: "done",
    failed: "problem", partial_refund: "off", refunded: "off", unpaid: "wait"
  };
  const CANCEL_REASONS = ["changed-mind", "out-of-stock", "unreachable", "price", "no-delivery", "other"];
  const REASON_KEY = {
    "changed-mind": "crChangedMind", "out-of-stock": "crOutOfStock", unreachable: "crUnreachable",
    price: "crPrice", "no-delivery": "crNoDelivery", other: "crOther"
  };
  const CHANNELS = ["web", "phone", "store", "whatsapp"];
  const CHANNEL_KEY = { web: "chWeb", phone: "chPhone", store: "chStore", whatsapp: "chWhatsapp" };
  const PAY_METHODS = ["cod", "transfer", "card", "cash"];
  const METHOD_KEY = { cod: "pmCod", transfer: "pmTransfer", card: "pmCard", cash: "pmCash" };
  const GOVERNORATES = ["damascus", "rural-damascus", "aleppo", "homs", "hama", "latakia", "tartus",
    "idlib", "deir-ez-zor", "raqqa", "hasakah", "daraa", "suwayda", "quneitra"];

  const statusLabel = (row) =>
    row.st === "shipped" && row.pu ? t("admin.stShippedPickup") : t("admin." + (STATUS_KEY[row.st] || "stNew"));
  /* The column shows one word, derived from {method, state}: the owner's
     morning question is "who owes me money" and it must answer at a glance. */
  function payWord(payState, method) {
    if (payState === "unpaid") return method === "cod"
      ? { label: t("admin.payCod"), tone: "wait" }
      : { label: t("admin.payAwaiting"), tone: "problem" };
    const map = {
      partial: ["payPartial", "wait"], paid: ["payPaid", "done"], failed: ["payFailed", "problem"],
      partial_refund: ["payPartialRefund", "off"], refunded: ["payRefunded", "off"]
    }[payState] || ["payUnpaid", "wait"];
    return { label: t("admin." + map[0]), tone: map[1] };
  }
  const pill = (label, tone) => '<span class="pill pill--' + tone + '">' + esc(label) + "</span>";

  /* ------------------------------------------------------------ the shell */
  function renderRail() {
    const groups = GROUP_ORDER.map(group => {
      const rows = SCREENS.filter(s => s.group === group && allowed(s.id));
      if (!rows.length) return "";
      return '<div class="rail__group"><span class="rail__label">' + esc(t("admin." + group)) + "</span>" +
        rows.map(s => railLink(s)).join("") + "</div>";
    }).join("");
    qs("#railGroups").innerHTML = groups;
    const phone = SCREENS.filter(s => s.phone).sort((a, b) => a.phone - b.phone).filter(s => allowed(s.id));
    qs("#bottombar").innerHTML = phone.map(s =>
      '<button type="button" class="bottombar__slot' + (state.screen === s.id ? " is-current" : "") +
      '" data-go="' + s.id + '"' + (state.screen === s.id ? ' aria-current="page"' : "") + ">" + icon(s.icon) +
      esc(t("admin." + s.key)) + "</button>").join("") +
      '<button type="button" class="bottombar__slot" data-more>' + icon("chevron") +
      esc(t("admin.navMore")) + "</button>";
  }
  function railLink(screen) {
    const badge = screen.id === "orders" && state.counts.newOrders
      ? '<span class="rail__count">' + num(state.counts.newOrders) + "</span>"
      : screen.id === "content" && state.counts.policyHidden
        ? '<span class="rail__count">' + num(state.counts.policyHidden) + "</span>" : "";
    return '<button type="button" class="rail__link" data-go="' + screen.id + '"' +
      (state.screen === screen.id ? ' aria-current="page"' : "") + ">" + icon(screen.icon) +
      '<span class="rail__text">' + esc(t("admin." + screen.key)) + "</span>" + badge + "</button>";
  }
  /* Hiding a button is a courtesy; the server enforces the same table. */
  function allowed(id) {
    const role = (state.user && state.user.role) || "owner";
    if (role === "owner") return true;
    if (role === "staff") return ["orders", "stock", "products"].includes(id);
    if (role === "editor") return ["products", "taxonomy", "media", "content"].includes(id);
    return false;
  }

  doc.addEventListener("click", event => {
    const go = event.target.closest("[data-go]");
    if (go) { show(go.dataset.go); closeSheet("sheet"); return; }
    if (event.target.closest("[data-more]")) { showMore(); return; }
  });

  function showMore() {
    const rows = GROUP_ORDER.map(group => {
      const items = SCREENS.filter(s => s.group === group && allowed(s.id));
      if (!items.length) return "";
      return '<div class="rail__group"><span class="rail__label">' + esc(t("admin." + group)) + "</span>" +
        items.map(s => railLink(s)).join("") + "</div>";
    }).join("");
    openSheet("sheet", t("admin.navMore"), rows);
  }

  function show(id) {
    if (!SCREENS.some(s => s.id === id) || !allowed(id)) id = allowed("orders") ? "orders" : "products";
    state.screen = id;
    state.cursor = -1;
    state.selection.clear();
    qsa(".screen").forEach(section => { section.hidden = section.id !== "screen-" + id; });
    const screen = SCREENS.find(s => s.id === id);
    qs("#screenTitle").textContent = t("admin." + screen.key);
    doc.title = t("admin.pageTitle");
    if (location.hash !== "#" + id) history.replaceState(null, "", "#" + id);
    renderRail();
    say("route", t("admin." + screen.key));
    (RENDER[id] || (() => {}))();
  }

  /* ---------------------------------------------------------------- login */
  function showLogin(message) {
    qs("#adminView").hidden = true;
    qs("#loginView").hidden = false;
    qs("#loginMsg").textContent = message || "";
    qs("#loginMsg").className = "msg" + (message ? " is-error" : "");
    const box = qs("#password");
    if (box) { box.value = ""; box.focus(); }
  }
  qs("#loginForm").addEventListener("submit", async event => {
    event.preventDefault();
    const button = qs("#loginBtn");
    button.disabled = true;
    button.textContent = t("admin.loggingIn");
    try {
      const out = await api("login", { body: { password: qs("#password").value, user: qs("#loginUser").value } });
      qs("#password").value = "";
      if (out.user && out.user.breakGlass) toast(esc(t("admin.breakGlass")));
      await boot();
    } catch (error) {
      if (error.message !== "__auth") qs("#loginMsg").textContent = explain(error);
      qs("#loginMsg").className = "msg is-error";
    } finally {
      button.disabled = false;
      button.textContent = t("admin.login");
    }
  });
  qs("#logoutBtn").addEventListener("click", async () => {
    try { await api("logout", { body: {} }); } catch (e) { /* the cookie is cleared either way */ }
    location.reload();
  });

  /* ------------------------------------------------------------ languages */
  function fillLanguages() {
    const options = I.languages.map(l =>
      '<option value="' + l.code + '"' + (l.code === I.current ? " selected" : "") + ">" + esc(l.native) + "</option>").join("");
    qsa("#languageSelect, #loginLanguage").forEach(select => {
      select.innerHTML = options;
      select.onchange = () => {
        I.set(select.value);
        I.apply();
        fillLanguages();
        renderRail();
        show(state.screen);
      };
    });
  }

  /* ============================================================== ORDERS */
  const orderFilters = { status: "open", pay: "all", channel: "all", q: "", page: 1, stuck: "" };

  async function renderOrders() {
    const screen = qs("#screen-orders");
    if (!screen.dataset.built) {
      screen.innerHTML =
        '<div class="screen__head">' +
          '<h2 class="grow">' + esc(t("admin.ordToday")) + "</h2>" +
          '<button type="button" class="btn btn--primary" data-new-order>' + esc(t("admin.ordNew")) + "</button>" +
        "</div>" +
        '<div class="strip" id="ordStrip"></div>' +
        '<div class="filters">' +
          '<input type="search" class="search" id="ordSearch">' +
        "</div>" +
        '<div class="chips chips--scroll" id="ordStatusChips" role="group"></div>' +
        '<div class="chips chips--scroll" id="ordPayChips" role="group"></div>' +
        '<div id="ordList"></div><div class="pager" id="ordPager"></div>';
      screen.dataset.built = "1";
      qs("#ordSearch", screen).setAttribute("placeholder", t("admin.ordSearch"));
      qs("#ordSearch", screen).addEventListener("input", debounce(() => {
        orderFilters.q = qs("#ordSearch").value.trim();
        orderFilters.page = 1;
        loadOrders();
      }, 200));
      qs("[data-new-order]", screen).addEventListener("click", newOrderSheet);
    }
    renderOrderChips();
    loadToday();
    loadOrders();
  }

  function renderOrderChips() {
    const statuses = [["open", "ordFilterOpen"], ["all", "all"], ["new", "stNew"], ["confirmed", "stConfirmed"],
      ["packed", "stPacked"], ["shipped", "stShipped"], ["delivered", "stDelivered"],
      ["cancelled", "stCancelled"], ["returned", "stReturned"]];
    const payments = [["all", "all"], ["unpaid", "payUnpaid"], ["cod", "payCod"], ["awaiting", "payAwaiting"],
      ["partial", "payPartial"], ["paid", "payPaid"], ["failed", "payFailed"], ["refunded", "payRefunded"]];
    // Two rows, because there are two axes and mixing them is the mistake.
    qs("#ordStatusChips").innerHTML = statuses.map(([value, key]) =>
      '<button type="button" class="chip' + (orderFilters.status === value ? " is-on" : "") +
      '" data-ord-status="' + value + '" aria-pressed="' + (orderFilters.status === value) + '">' +
      esc(t("admin." + key)) + "</button>").join("");
    qs("#ordPayChips").innerHTML = payments.map(([value, key]) =>
      '<button type="button" class="chip' + (orderFilters.pay === value ? " is-on" : "") +
      '" data-ord-pay="' + value + '" aria-pressed="' + (orderFilters.pay === value) + '">' +
      esc(t("admin." + key)) + "</button>").join("");
  }
  doc.addEventListener("click", event => {
    const status = event.target.closest("[data-ord-status]");
    if (status) { orderFilters.status = status.dataset.ordStatus; orderFilters.stuck = ""; orderFilters.page = 1; renderOrderChips(); loadOrders(); }
    const pay = event.target.closest("[data-ord-pay]");
    if (pay) { orderFilters.pay = pay.dataset.ordPay; orderFilters.page = 1; renderOrderChips(); loadOrders(); }
  });

  async function loadToday() {
    const box = qs("#ordStrip");
    if (!box) return;
    let data;
    try { data = await api("today"); } catch (e) { fail(e); return; }
    const rows = [
      { n: data.newOrders, key: "ordTodayNew", tone: "", filter: { status: "new", pay: "all" } },
      { n: data.awaitingPayment, key: "ordTodayAwaiting", tone: "is-problem", filter: { status: "all", pay: "awaiting" } },
      { n: data.stuckShipped, key: "ordTodayStuck", tone: "is-wait", filter: { status: "shipped", pay: "all", stuck: "1" } },
      { n: data.withOutOfStock, key: "ordTodayOut", tone: "is-wait", filter: { status: "open", pay: "all" } }
    ].filter(row => row.n > 0);               // a zero row is hidden
    if (!rows.length) {
      box.innerHTML = '<div class="strip__clear">' + esc(t("admin.ordTodayNothing")) +
        (data.inFlight ? '<div class="small" style="font-weight:var(--w-normal)">' +
          t("admin.ordTodayInFlight", { n: data.inFlight }) + "</div>" : "") + "</div>";
      return;
    }
    box.innerHTML = rows.map(row =>
      '<button type="button" class="strip__row ' + row.tone + '" data-today=\'' + esc(JSON.stringify(row.filter)) + '\'>' +
      '<span class="strip__n">' + num(row.n) + "</span>" +
      '<span class="strip__label">' + esc(t("admin." + row.key)) + "</span>" +
      '<span class="pill pill--go">' + esc(t("admin.open")) + "</span></button>").join("");
    qsa("[data-today]", box).forEach(button => {
      button.onclick = () => {
        Object.assign(orderFilters, { stuck: "", page: 1 }, JSON.parse(button.dataset.today));
        renderOrderChips();
        loadOrders();
      };
    });
  }

  async function loadOrders() {
    const box = qs("#ordList");
    if (!box) return;
    box.innerHTML = skeleton(3);
    let data;
    try {
      data = await api("orders", { query: { status: orderFilters.status, pay: orderFilters.pay, q: orderFilters.q, page: orderFilters.page, stuck: orderFilters.stuck } });
    } catch (e) { fail(e); box.innerHTML = ""; return; }
    state.rows = data.rows;
    if (!data.total) {
      box.innerHTML = empty(orderFilters.q || orderFilters.status !== "open" ? "ordNoMatch" : "ordEmpty",
        orderFilters.q || orderFilters.status !== "open");
      qs("#ordPager").innerHTML = "";
      return;
    }
    box.innerHTML = isWide()
      ? '<div class="table-wrap"><table class="grid"><thead><tr>' +
      ["ordColNo", "ordColCustomer", "ordColCity", "ordColChannel", "ordColItems", "ordColTotal", "ordColStatus", "ordColPay", "ordColTime"]
        .map(key => "<th>" + esc(t("admin." + key)) + "</th>").join("") +
      "<th></th></tr></thead><tbody>" + data.rows.map(orderRow).join("") + "</tbody></table></div>"
      : '<div class="list">' + data.rows.map(orderCard).join("") + "</div>";
    pager("#ordPager", data, page => { orderFilters.page = page; loadOrders(); });
    say("results", t("admin.resultCount", { n: data.total }));
  }

  /* The two actions that are used forty times a day sit on the row itself, as
     siblings of the row button so a tap on one never opens the order. The
     useful note arrives during the phone call, and the owner is holding the
     phone — he must not have to open the order to write it down. */
  const nextOf = st => { const i = FULFILMENT.indexOf(st); return i >= 0 && i < FULFILMENT.length - 1 ? FULFILMENT[i + 1] : ""; };

  function orderCard(row) {
    const pay = payWord(row.pay, row.pm);
    const next = nextOf(row.st);
    return '<div class="rowset">' +
      '<button type="button" class="item item--plain" data-order="' + esc(row.no) + '">' +
      '<span class="item__main"><span class="item__name">' + codeOf(row.no) + "</span>" +
      '<span class="item__meta">' + bdi(row.name || t("admin.nothing")) + " · " + bdi(row.city || t("admin.nothing")) +
      " · " + when(row.at) + " · " + t("admin.ordPieces", { n: row.n }) + "</span></span>" +
      '<span class="item__end"><span class="price">' + money(row.grand) + "</span>" +
      pill(statusLabel(row), STATUS_TONE[row.st] || "go") + pill(pay.label, pay.tone) +
      (row.contacted ? "" : '<span class="dot" title="' + esc(t("admin.ordNotContacted")) + '"></span>') +
      "</span></button>" +
      '<span class="rowset__acts">' +
        (next ? '<button type="button" class="btn btn--secondary btn--sm" data-advance="' + esc(row.no) +
          '" data-to="' + next + '">' + esc(t("admin." + STATUS_KEY[next])) + " ▸</button>" : "") +
        '<button type="button" class="btn btn--ghost btn--sm" data-quicknote="' + esc(row.no) + '">' +
          esc(t("admin.ordAddNote")) + "</button>" +
      "</span></div>";
  }
  function orderRow(row) {
    const pay = payWord(row.pay, row.pm);
    return '<tr data-order="' + esc(row.no) + '" tabindex="0"><td>' + codeOf(row.no) + "</td><td>" +
      bdi(row.name) + "</td><td>" + bdi(row.city) + "</td><td>" +
      esc(t("admin." + (CHANNEL_KEY[row.ch] || "chWeb"))) + '</td><td class="num">' + num(row.n) +
      '</td><td class="num">' + money(row.grand) + "</td><td>" + pill(statusLabel(row), STATUS_TONE[row.st] || "go") +
      "</td><td>" + pill(pay.label, pay.tone) + "</td><td>" + when(row.at, true) + "</td>" +
      '<td class="row-gap">' + (nextOf(row.st) ? '<button type="button" class="btn btn--secondary btn--sm" data-advance="' + esc(row.no) +
        '" data-to="' + nextOf(row.st) + '">' + esc(t("admin." + STATUS_KEY[nextOf(row.st)])) + " ▸</button>" : "") +
      '<button type="button" class="btn btn--ghost btn--sm" data-quicknote="' + esc(row.no) + '">' + esc(t("admin.ordAddNote")) + "</button></td></tr>";
  }
  doc.addEventListener("click", event => {
    const advance = event.target.closest("[data-advance]");
    if (advance) {
      event.stopPropagation();
      moveOrder(advance.dataset.advance, advance.dataset.to, {});
      return;
    }
    const quick = event.target.closest("[data-quicknote]");
    if (quick) {
      event.stopPropagation();
      quickNote(quick.dataset.quicknote);
      return;
    }
    const row = event.target.closest("[data-order]");
    if (row) openOrder(row.dataset.order);
  });

  /* One field, one tap, without leaving the list. */
  function quickNote(no) {
    openSheet("sheet", no,
      '<label class="field"><span>' + esc(t("admin.ordTimelineHead")) + '</span>' +
      '<input id="quickNote" placeholder="' + esc(t("admin.ordNotePlaceholder")) + '"></label>',
      '<button type="button" class="btn btn--primary" data-quicknote-go>' + esc(t("admin.ordAddNote")) + "</button>");
    qs("#quickNote").focus();
    qs("[data-quicknote-go]", qs("#sheet")).onclick = async () => {
      const value = qs("#quickNote").value.trim();
      if (!value) return;
      try {
        await api("order-note", { body: { no, text: value } });
        closeSheet("sheet");
        toast(esc(t("admin.ordNoteAdded")));
        loadOrders();
      } catch (e) { fail(e); }
    };
  }

  /* ------------------------------------------------------- order detail */
  let currentOrder = null;
  async function openOrder(no) {
    let data;
    try { data = await api("order", { query: { no } }); } catch (e) { fail(e); return; }
    currentOrder = data.order;
    drawOrder(data);
  }
  function drawOrder(data) {
    const order = data.order;
    const pay = payWord(order.payment.state, order.payment.method);
    const balance = Math.round((order.totals.grand - Number(order.payment.paid || 0)) * 100) / 100;
    const pickup = order.delivery.method === "pickup";
    const done = FULFILMENT.indexOf(order.status);

    const steps = FULFILMENT.map((step, index) => {
      const label = step === "shipped" && pickup ? t("admin.stShippedPickup") : t("admin." + STATUS_KEY[step]);
      const cls = index < done ? "is-done" : index === done ? "is-now" : index === done + 1 ? "is-next" : "";
      const can = index === done + 1 || (index === done - 1 && index >= 0);
      return '<button type="button" class="step ' + cls + '" data-move="' + step + '"' +
        (can ? "" : " disabled") + ">" + esc(label) + "</button>";
    }).join("");

    const timeline = order.history.map(h => ({
      at: h.at, note: false,
      text: h.field === "status"
        ? (h.from ? t("admin.ordMoved", { from: t("admin." + (STATUS_KEY[h.from] || "stNew")), to: t("admin." + (STATUS_KEY[h.to] || "stNew")) })
          : t("admin.ordCreatedFrom", { channel: t("admin." + (CHANNEL_KEY[order.channel] || "chWeb")) }))
        : h.field === "payment"
          ? t("admin.ordPayMoved", { from: payWord(h.from, order.payment.method).label, to: payWord(h.to, order.payment.method).label })
          : t("admin.ordFieldChanged", { field: h.field, from: h.from || t("admin.nothing"), to: h.to || t("admin.nothing") }),
      by: h.by
    })).concat(order.notes.map(n => ({ at: n.at, note: true, text: n.text, by: n.by })))
      .sort((a, b) => a.at - b.at)
      .map(event => '<div class="event' + (event.note ? " event--note" : "") + '"><time>' + when(event.at, true) +
        "</time><span>" + esc(event.by === "owner" ? t("admin.audOwner") : event.by) + " · " + esc(event.text) + "</span></div>").join("");

    const lines = order.lines.map((line, index) => {
      const stock = data.stock[String(line.pid)];
      return '<div class="line"><span class="thumb is-missing" aria-hidden="true"></span>' +
        "<span>" + bdi(line.name) + '<span class="item__meta">' + (line.sku ? codeOf(line.sku) + " · " : "") +
        (stock === null || stock === undefined ? "" : t("admin.ordAvailable", { n: stock })) + "</span></span>" +
        '<span class="num">' + num(line.qty) + " × " + money(line.unit) + " = " + money(line.total) +
        ' <button type="button" class="btn btn--ghost btn--sm no-print" data-line="' + index + '">' + esc(t("admin.edit")) + "</button></span></div>";
    }).join("");

    const feeCell = order.totals.delivery === null || order.totals.delivery === undefined
      ? '<span class="agreed">' + esc(t("admin.agreedLater")) + "</span>"
      : money(order.totals.delivery);

    const body =
      '<div class="print-head"><strong>' + esc(state.settings.storeName || "SmartTech") + "</strong> · " +
        codeOf(state.settings.whatsapp || "") + "<br>" + esc(t("admin.ordPrintTitle")) + " " + codeOf(order.no) +
        " · " + when(order.createdAt, true) + "</div>" +
      '<div class="block no-print"><div class="block__title">' + esc(t("admin.ordStatusHead")) + "</div>" +
        '<div class="stepper">' + steps + "</div>" +
        '<div class="row-gap" style="margin-block-start:var(--s-2)">' +
          (done >= 0 && order.status !== "delivered" ? '<button type="button" class="btn btn--danger btn--sm" data-cancel>' + esc(t("admin.ordCancelBtn")) + "</button>" : "") +
          (order.status === "delivered" ? '<button type="button" class="btn btn--ghost btn--sm" data-return>' + esc(t("admin.ordReturnBtn")) + "</button>" : "") +
        "</div></div>" +
      '<div class="block"><div class="block__title">' + esc(t("admin.ordPayHead")) + "</div>" +
        "<div class=\"row-gap\">" + pill(pay.label, pay.tone) +
        "<span>" + t("admin.ordPaidSoFar") + " " + money(order.payment.paid) + " / " + money(order.totals.grand) + "</span>" +
        (state.user.role === "owner" ? '<button type="button" class="btn btn--secondary btn--sm no-print" data-pay>' + esc(t("admin.ordRecordPayment")) + "</button>" : "") +
        "</div></div>" +
      '<div class="block"><div class="block__title">' + esc(t("admin.ordCustomerHead")) + "</div>" +
        '<dl class="kv"><dt>' + esc(t("admin.ordName")) + "</dt><dd>" + bdi(order.customer.name || t("admin.nothing")) + "</dd>" +
        "<dt>" + esc(t("admin.ordPhone")) + '</dt><dd><a href="tel:' + esc(order.customer.phone.replace(/[^\d+]/g, "")) + '">' +
          codeOf(order.customer.phone) + "</a></dd>" +
        "<dt>" + esc(t("admin.ordCity")) + "</dt><dd>" + bdi(order.customer.city || t("admin.nothing")) + "</dd>" +
        "<dt>" + esc(t("admin.ordAddress")) + "</dt><dd>" + bdi(order.customer.address || t("admin.nothing")) + "</dd>" +
        "<dt>" + esc(t("admin.ordEmail")) + "</dt><dd>" + (order.customer.email ? codeOf(order.customer.email) : esc(t("admin.nothing"))) + "</dd>" +
        "<dt>" + esc(t("admin.ordPrevOrders", { n: data.customer.orders, total: moneyText(data.customer.spent) })) + "</dt><dd></dd></dl>" +
        '<div class="row-gap no-print" style="margin-block-start:var(--s-2)">' +
          '<a class="btn btn--ghost btn--sm" href="tel:' + esc(order.customer.phone.replace(/[^\d+]/g, "")) + '">' + esc(t("admin.ordCall")) + "</a>" +
          '<a class="btn btn--ghost btn--sm" href="https://wa.me/' + esc(waDigits(order.customer.phone)) + '" target="_blank" rel="noopener">' + esc(t("admin.ordWhatsapp")) + "</a>" +
        "</div></div>" +
      '<div class="block"><div class="block__title">' + esc(t("admin.ordLinesHead")) + '</div><div class="lines">' + lines + "</div></div>" +
      '<div class="block"><div class="block__title">' + esc(t("admin.ordAccountHead")) + "</div>" +
        '<div class="total"><span>' + esc(t("admin.ordItemsTotal")) + "</span>" + money(order.totals.items) + "</div>" +
        '<div class="total"><span>' + esc(t("admin.ordDeliveryFee")) + "</span><span>" +
          '<input id="ordFee" class="no-print" inputmode="decimal" style="inline-size:120px;display:inline-block" value="' +
          esc(order.totals.delivery === null || order.totals.delivery === undefined ? "" : order.totals.delivery) +
          '" placeholder="' + esc(t("admin.agreedLater")) + '"><span class="print-only">' + feeCell + "</span></span></div>" +
        '<div class="total"><span>' + esc(t("admin.ordDiscount")) + "</span><span>" +
          '<input id="ordDiscount" class="no-print" inputmode="decimal" style="inline-size:120px;display:inline-block" value="' + esc(order.totals.discount || 0) + '">' +
          "</span></div>" +
        '<div class="total total--grand"><span>' + esc(t("admin.ordGrand")) + "</span>" + money(order.totals.grand) + "</div>" +
        '<div class="total"><span>' + esc(t("admin.ordRemainingAmount")) + "</span>" + money(balance) + "</div></div>" +
      '<div class="block"><div class="block__title">' + esc(t("admin.ordDeliveryHead")) + "</div>" +
        '<div class="row-gap"><label class="switch"><input type="radio" name="ordMethod" value="courier"' +
          (pickup ? "" : " checked") + ">" + esc(t("admin.ordCourier")) + "</label>" +
        '<label class="switch"><input type="radio" name="ordMethod" value="pickup"' + (pickup ? " checked" : "") + ">" +
          esc(t("admin.ordPickup")) + "</label></div></div>" +
      '<div class="block"><div class="block__title">' + esc(t("admin.ordTimelineHead")) + "</div>" +
        '<div class="timeline">' + timeline + "</div>" +
        '<div class="row-gap no-print" style="margin-block-start:var(--s-3)">' +
          '<input id="ordNote" class="grow" style="flex:1" placeholder="' + esc(t("admin.ordNotePlaceholder")) + '">' +
          '<button type="button" class="btn btn--secondary" data-note>' + esc(t("admin.ordAddNote")) + "</button></div></div>" +
      '<div class="sign">' + esc(t("admin.ordSignature")) + "</div>";

    const foot =
      '<button type="button" class="btn btn--ghost" data-print>' + esc(t("admin.print")) + "</button>" +
      '<button type="button" class="btn btn--ghost" data-copy-link>' + esc(t("admin.ordCopyLink")) + "</button>" +
      '<button type="button" class="btn btn--ghost" data-copy-summary>' + esc(t("admin.ordCopySummary")) + "</button>" +
      '<span class="spacer"></span>' +
      '<button type="button" class="btn btn--primary" data-save-order>' + esc(t("admin.save")) + "</button>";

    openSheet("order", t("admin.ordDetail", { no: order.no }), body, foot);
    wireOrder(order);
    // The delivery cost is the first number he types, so it is already focused.
    const fee = qs("#ordFee");
    if (fee) { fee.focus(); fee.select(); }
  }

  function wireOrder(order) {
    const dialog = qs("#order");
    const on = (selector, handler) => qsa(selector, dialog).forEach(el => { el.onclick = handler; });

    on("[data-move]", async event => {
      const to = event.currentTarget.dataset.move;
      const back = FULFILMENT.indexOf(to) === FULFILMENT.indexOf(order.status) - 1;
      if (back && !confirm(t("admin.ordBackConfirm"))) return;
      await moveOrder(order.no, to, {});
    });
    on("[data-cancel]", () => {
      openSheet("sheet", t("admin.ordCancelBtn"),
        '<div class="chips">' + CANCEL_REASONS.map(reason =>
          '<button type="button" class="chip" data-reason="' + reason + '">' + esc(t("admin." + REASON_KEY[reason])) + "</button>").join("") + "</div>");
      qsa("[data-reason]", qs("#sheet")).forEach(button => {
        button.onclick = async () => { closeSheet("sheet"); await moveOrder(order.no, "cancelled", { reason: button.dataset.reason }); };
      });
    });
    on("[data-return]", () => {
      openSheet("sheet", t("admin.ordReturnBtn"), "<p>" + esc(t("admin.ordRestockAsk")) + "</p>",
        '<button type="button" class="btn btn--primary" data-restock="1">' + esc(t("admin.ordRestockYes")) + "</button>" +
        '<button type="button" class="btn btn--ghost" data-restock="0">' + esc(t("admin.ordRestockNo")) + "</button>");
      qsa("[data-restock]", qs("#sheet")).forEach(button => {
        button.onclick = async () => { closeSheet("sheet"); await moveOrder(order.no, "returned", { restock: button.dataset.restock === "1" }); };
      });
    });
    on("[data-pay]", () => {
      const balance = Math.round((order.totals.grand - Number(order.payment.paid || 0)) * 100) / 100;
      openSheet("sheet", t("admin.ordRecordPayment"),
        '<label class="field"><span>' + esc(t("admin.payAmount")) + '</span><input id="payAmount" inputmode="decimal" value="' + esc(balance) + '"></label>' +
        '<label class="field"><span>' + esc(t("admin.payMethodLabel")) + "</span><select id=\"payMethod\">" +
          PAY_METHODS.map(m => '<option value="' + m + '"' + (m === order.payment.method ? " selected" : "") + ">" + esc(t("admin." + METHOD_KEY[m])) + "</option>").join("") +
        "</select></label>" +
        '<label class="field"><span>' + esc(t("admin.payRef")) + '</span><input id="payRef"></label>',
        '<button type="button" class="btn btn--primary" data-pay-go>' + esc(t("admin.save")) + "</button>");
      qs("[data-pay-go]", qs("#sheet")).onclick = async () => {
        try {
          const out = await api("order-payment", { body: { no: order.no, amount: qs("#payAmount").value, method: qs("#payMethod").value, ref: qs("#payRef").value } });
          closeSheet("sheet");
          toast(esc(t("admin.payRecorded")));
          currentOrder = out.order;
          openOrder(order.no);
          loadToday();
        } catch (e) { fail(e); }
      };
    });
    on("[data-note]", async () => {
      const box = qs("#ordNote");
      if (!box.value.trim()) return;
      try {
        await api("order-note", { body: { no: order.no, text: box.value } });
        toast(esc(t("admin.ordNoteAdded")));
        openOrder(order.no);
      } catch (e) { fail(e); }
    });
    on("[data-save-order]", async () => {
      try {
        await api("order-update", {
          body: {
            no: order.no, delivery: qs("#ordFee").value.trim(), discount: qs("#ordDiscount").value.trim(),
            method: (qsa('input[name="ordMethod"]', dialog).find(r => r.checked) || {}).value
          }
        });
        toast(esc(t("admin.saved")));
        openOrder(order.no);
      } catch (e) { fail(e); }
    });
    on("[data-print]", () => window.print());
    on("[data-copy-link]", () => copy(location.origin + "/order/" + order.no));
    on("[data-copy-summary]", () => copy(summaryOf(order)));
    qsa("[data-line]", dialog).forEach(button => {
      button.onclick = () => editLine(order, Number(button.dataset.line));
    });
  }

  async function moveOrder(no, to, extra) {
    try {
      await api("order-status", { body: Object.assign({ no, status: to }, extra) });
      openOrder(no);
      loadOrders();
      loadToday();
      toast(esc(t("admin.saved")));
    } catch (error) {
      if (error.code === "bad_transition" && error.detail && error.detail.from) {
        toast(esc(t("admin.ordBadMove", {
          from: t("admin." + (STATUS_KEY[error.detail.from] || "stNew")),
          to: t("admin." + (STATUS_KEY[error.detail.to] || "stNew"))
        })), { error: true });
        return;
      }
      fail(error);
    }
  }

  function editLine(order, index) {
    const line = order.lines[index];
    openSheet("sheet", line.name,
      '<label class="field"><span>' + esc(t("admin.mnQty")) + '</span><input id="lineQty" inputmode="numeric" value="' + esc(line.qty) + '"></label>' +
      '<label class="field"><span>' + esc(t("admin.mnUnit")) + '</span><input id="lineUnit" inputmode="decimal" value="' + esc(line.unit) + '"></label>',
      '<button type="button" class="btn btn--primary" data-line-save>' + esc(t("admin.save")) + "</button>" +
      '<button type="button" class="btn btn--danger" data-line-del>' + esc(t("admin.mnRemoveLine")) + "</button>");
    qs("[data-line-save]", qs("#sheet")).onclick = async () => {
      const lines = order.lines.slice();
      lines[index] = Object.assign({}, line, { qty: Number(qs("#lineQty").value), unit: Number(qs("#lineUnit").value) });
      await saveLines(order.no, lines);
    };
    qs("[data-line-del]", qs("#sheet")).onclick = async () => {
      const lines = order.lines.filter((_, i) => i !== index);
      await saveLines(order.no, lines);
    };
  }
  async function saveLines(no, lines) {
    try {
      await api("order-update", { body: { no, lines } });
      closeSheet("sheet");
      openOrder(no);
    } catch (e) { fail(e); }
  }

  function summaryOf(order) {
    return order.no + "\n" + order.customer.name + " · " + order.customer.phone + " · " + order.customer.city + "\n" +
      order.lines.map(l => "[" + (l.sku || l.pid) + "] " + l.qty + " × " + moneyText(l.unit) + " = " + moneyText(l.total) + " — " + l.name).join("\n") +
      "\n" + moneyText(order.totals.grand);
  }
  /* phoneKey is the nine-digit customer key, not a dialable number: wa.me needs
     the number as the customer wrote it, without the punctuation. */
  const waDigits = phone => String(phone || "").replace(/\D/g, "").replace(/^00+/, "");

  function copy(text) {
    try {
      navigator.clipboard.writeText(text);
      toast(esc(t("admin.copied")));
    } catch (e) {
      const box = doc.createElement("textarea");
      box.value = text;
      doc.body.appendChild(box);
      box.select();
      try { doc.execCommand("copy"); toast(esc(t("admin.copied"))); } catch (e2) { /* nothing else to try */ }
      box.remove();
    }
  }

  /* --------------------------------------------------- manual order entry */
  /* A phone call or a counter sale. No paste-a-chat-message box: manual entry
     covers every case one would have, and a box for chat messages would
     hard-wire a transitional channel into the screen. */
  const draft = { lines: [] };
  function newOrderSheet() {
    draft.lines = [];
    openSheet("sheet", t("admin.mnTitle"), manualBody(),
      '<button type="button" class="btn btn--primary" data-manual-go>' + esc(t("admin.mnCreate")) + "</button>");
    wireManual();
  }
  function manualBody() {
    return '<label class="field"><span>' + esc(t("admin.mnPickProduct")) + '</span><input id="mnSearch" type="search"></label>' +
      '<div id="mnResults" class="list"></div>' +
      '<div id="mnLines" class="lines" style="margin-block:var(--s-3)"></div>' +
      '<div class="block__title">' + esc(t("admin.mnCustomerHead")) + "</div>" +
      '<label class="field"><span>' + esc(t("admin.ordPhone")) + '</span><input id="mnPhone" dir="ltr" inputmode="tel"></label>' +
      '<label class="field"><span>' + esc(t("admin.ordName")) + '</span><input id="mnName"></label>' +
      '<label class="field"><span>' + esc(t("admin.ordCity")) + "</span><select id=\"mnCity\"><option value=\"\"></option>" +
        GOVERNORATES.map(g => '<option value="' + g + '">' + esc(t("admin.gov." + g)) + "</option>").join("") + "</select></label>" +
      '<label class="field"><span>' + esc(t("admin.ordAddress")) + '</span><input id="mnAddress"></label>' +
      '<div class="two"><label class="field"><span>' + esc(t("admin.mnChannel")) + "</span><select id=\"mnChannel\">" +
        CHANNELS.filter(c => c !== "web").map(c => '<option value="' + c + '">' + esc(t("admin." + CHANNEL_KEY[c])) + "</option>").join("") + "</select></label>" +
      '<label class="field"><span>' + esc(t("admin.mnPayMethod")) + "</span><select id=\"mnPayMethod\">" +
        PAY_METHODS.map(m => '<option value="' + m + '">' + esc(t("admin." + METHOD_KEY[m])) + "</option>").join("") + "</select></label></div>" +
      '<div class="two"><label class="field"><span>' + esc(t("admin.mnPayState")) + "</span><select id=\"mnPayState\">" +
        '<option value="unpaid">' + esc(t("admin.payUnpaid")) + '</option><option value="paid">' + esc(t("admin.payPaid")) + "</option></select></label>" +
      '<label class="field"><span>' + esc(t("admin.ordDeliveryFee")) + '</span><input id="mnFee" inputmode="decimal" placeholder="' + esc(t("admin.agreedLater")) + '"></label></div>';
  }
  function wireManual() {
    const sheet = qs("#sheet");
    qs("#mnSearch", sheet).addEventListener("input", debounce(async () => {
      const q = qs("#mnSearch").value.trim();
      if (q.length < 2) { qs("#mnResults").innerHTML = ""; return; }
      try {
        const data = await api("list", { query: { q, page: 1 } });
        qs("#mnResults").innerHTML = data.rows.slice(0, 6).map(row =>
          '<button type="button" class="item" data-pick=\'' + esc(JSON.stringify({ pid: row.id, name: row.n, sku: row.sku, unit: row.p })) + "'>" +
          thumb(row.img) + '<span class="item__main"><span class="item__name">' + bdi(row.n) + "</span></span>" +
          '<span class="price">' + money(row.p) + "</span></button>").join("");
        qsa("[data-pick]", qs("#mnResults")).forEach(button => {
          button.onclick = () => {
            draft.lines.push(Object.assign(JSON.parse(button.dataset.pick), { qty: 1 }));
            qs("#mnSearch").value = "";
            qs("#mnResults").innerHTML = "";
            drawDraftLines();
          };
        });
      } catch (e) { fail(e); }
    }, 200));
    qs("[data-manual-go]", sheet).onclick = createManualOrder;
    drawDraftLines();
  }
  function drawDraftLines() {
    qs("#mnLines").innerHTML = draft.lines.map((line, index) =>
      '<div class="line"><span class="thumb is-missing" aria-hidden="true"></span><span>' + bdi(line.name) + "</span>" +
      '<span class="row-gap"><input inputmode="numeric" value="' + esc(line.qty) + '" style="inline-size:64px" data-qty="' + index + '">' +
      '<input inputmode="decimal" value="' + esc(line.unit) + '" style="inline-size:88px" data-unit="' + index + '">' +
      '<button type="button" class="btn btn--ghost btn--sm" data-drop="' + index + '">×</button></span></div>').join("");
    qsa("[data-qty]").forEach(box => { box.onchange = () => { draft.lines[Number(box.dataset.qty)].qty = Number(box.value) || 1; }; });
    qsa("[data-unit]").forEach(box => { box.onchange = () => { draft.lines[Number(box.dataset.unit)].unit = Number(box.value) || 0; }; });
    qsa("[data-drop]").forEach(button => { button.onclick = () => { draft.lines.splice(Number(button.dataset.drop), 1); drawDraftLines(); }; });
  }
  async function createManualOrder() {
    if (!draft.lines.length) { toast(esc(t("admin.mnNoLines")), { error: true }); return; }
    try {
      const out = await api("order-create", {
        body: {
          lines: draft.lines, phone: qs("#mnPhone").value, name: qs("#mnName").value,
          city: qs("#mnCity").value ? t("admin.gov." + qs("#mnCity").value) : "",
          address: qs("#mnAddress").value, channel: qs("#mnChannel").value,
          payMethod: qs("#mnPayMethod").value, payState: qs("#mnPayState").value,
          delivery: qs("#mnFee").value.trim()
        }
      });
      closeSheet("sheet");
      toast(esc(t("admin.mnCreated", { no: out.no })));
      loadOrders();
      loadToday();
      openOrder(out.no);
    } catch (e) { fail(e); }
  }

  /* ============================================================ PRODUCTS */
  const productFilters = { q: "", cat: "", brand: "", status: "", stock: "", img: "", offer: "", sort: "name", page: 1 };
  let listAbort = null;

  async function renderProducts() {
    const screen = qs("#screen-products");
    if (!screen.dataset.built) {
      screen.innerHTML =
        '<div class="screen__head"><div class="grow"></div>' +
          '<button type="button" class="btn btn--primary" data-new-product></button></div>' +
        '<div class="filters">' +
          '<input type="search" class="search" id="prdSearch">' +
          '<select id="prdCat"></select><select id="prdBrand"></select>' +
          '<select id="prdStatus"></select><select id="prdStock"></select>' +
          '<select id="prdImg"></select><select id="prdSort"></select>' +
        "</div>" +
        '<p class="hint" id="prdHint"></p>' +
        '<div id="prdSelectBar"></div><div id="prdList"></div><div class="pager" id="prdPager"></div>';
      screen.dataset.built = "1";
      qs("[data-new-product]", screen).textContent = t("admin.prdAdd");
      qs("[data-new-product]", screen).onclick = () => openEditor(null);
      qs("#prdSearch").setAttribute("placeholder", t("admin.prdSearch"));
      qs("#prdHint").textContent = t("admin.prdInlineHint");
      qs("#prdSearch").addEventListener("input", debounce(() => {
        productFilters.q = qs("#prdSearch").value.trim();
        productFilters.page = 1;
        loadProducts();
      }, 200));
      bindSelect("#prdStatus", "prdStatus", [["", "all"], ["published", "stPublished"], ["draft", "stDraft"], ["archived", "stArchived"]], "status");
      bindSelect("#prdStock", "prdStock", [["", "all"], ["in", "prdStockIn"], ["low", "prdStockLow"], ["out", "prdStockOut"]], "stock");
      bindSelect("#prdImg", "prdImage", [["", "all"], ["real", "prdImgReal"], ["auto", "prdImgAuto"]], "img");
      bindSort();
    }
    await ensureTaxonomy();
    fillCatBrand();
    loadProducts();
  }
  function bindSelect(selector, labelKey, options, field) {
    const select = qs(selector);
    const label = t("admin." + labelKey);
    select.setAttribute("aria-label", label);
    select.innerHTML = options.map(([value, key]) =>
      '<option value="' + value + '"' + (productFilters[field] === value ? " selected" : "") + ">" +
      // The unfiltered option carries the name of the axis, so a row of five
      // selects is readable without a row of five labels above it.
      esc(value === "" || key === "all" ? label : t("admin." + key)) + "</option>").join("");
    select.onchange = () => { productFilters[field] = select.value; productFilters.page = 1; loadProducts(); };
  }
  /* Sorting is not a filter: its current value is always shown, prefixed with
     what it is, so «الاسم» on its own can never be mistaken for a department. */
  function bindSort() {
    const select = qs("#prdSort");
    const label = t("admin.prdSort");
    select.setAttribute("aria-label", label);
    select.innerHTML = [["name", "prdSortName"], ["priceUp", "prdSortPriceUp"], ["priceDown", "prdSortPriceDown"],
      ["stockUp", "prdSortStockUp"], ["newest", "prdSortNewest"]].map(([value, key]) =>
      '<option value="' + value + '"' + (productFilters.sort === value ? " selected" : "") + ">" +
      esc(label + ": " + t("admin." + key)) + "</option>").join("");
    select.onchange = () => { productFilters.sort = select.value; productFilters.page = 1; loadProducts(); };
  }

  function fillCatBrand() {
    const cat = qs("#prdCat"), brand = qs("#prdBrand");
    if (!cat) return;
    cat.setAttribute("aria-label", t("admin.prdCategory"));
    brand.setAttribute("aria-label", t("admin.prdBrand"));
    cat.innerHTML = '<option value="">' + esc(t("admin.prdCategory")) + "</option>" + categoryOptions(productFilters.cat);
    brand.innerHTML = '<option value="">' + esc(t("admin.prdBrand")) + "</option>" +
      state.brands.map(b => '<option value="' + esc(b.name) + '"' + (productFilters.brand === b.name ? " selected" : "") + ">" + esc(b.name) + "</option>").join("");
    cat.onchange = () => { productFilters.cat = cat.value; productFilters.page = 1; loadProducts(); };
    brand.onchange = () => { productFilters.brand = brand.value; productFilters.page = 1; loadProducts(); };
  }
  function categoryOptions(selected) {
    const nodes = (state.taxonomy && state.taxonomy.nodes) || [];
    const label = node => (node.name && (node.name[I.current] || node.name.ar)) || node.id;
    const tops = nodes.filter(n => !n.parent);
    return tops.map(top =>
      '<option value="' + esc(top.id) + '"' + (selected === top.id ? " selected" : "") + ">" + esc(label(top)) + "</option>" +
      nodes.filter(n => n.parent === top.id).map(child =>
        '<option value="' + esc(child.id) + '"' + (selected === child.id ? " selected" : "") + ">— " + esc(label(child)) + "</option>").join("")
    ).join("");
  }

  async function loadProducts() {
    const box = qs("#prdList");
    if (!box) return;
    if (listAbort) listAbort.abort();
    listAbort = new AbortController();
    box.innerHTML = skeleton(4);
    let data;
    try { data = await api("list", { query: productFilters, signal: listAbort.signal }); }
    catch (e) { if (e.name !== "AbortError") { fail(e); box.innerHTML = ""; } return; }
    state.rows = data.rows;
    if (!data.total) {
      box.innerHTML = empty(hasFilter() ? "prdNoMatch" : "prdEmpty", hasFilter());
      qs("#prdPager").innerHTML = "";
      return;
    }
    box.innerHTML = isWide()
      ? '<div class="table-wrap"><table class="grid"><thead><tr><th></th><th></th>' +
      ["prdColName", "prdColBrand", "prdColCat", "prdColPrice", "prdColStock", "prdColStatus"]
        .map(key => "<th>" + esc(t("admin." + key)) + "</th>").join("") + "<th></th></tr></thead><tbody>" +
      data.rows.map((row, index) => productRow(row, index)).join("") + "</tbody></table></div>"
      : '<div class="list">' + data.rows.map(productCard).join("") + "</div>";
    wireInline();
    drawSelectBar();
    pager("#prdPager", data, page => { productFilters.page = page; loadProducts(); });
    say("results", t("admin.resultCount", { n: data.total }));
  }
  const hasFilter = () => !!(productFilters.q || productFilters.cat || productFilters.brand ||
    productFilters.status || productFilters.stock || productFilters.img);

  function thumb(url) {
    // No photograph is a neutral plate. Never a drawing that might carry
    // another brand's name, and never the browser's broken-image glyph.
    if (!url) return '<span class="thumb is-missing" aria-hidden="true"></span>';
    return '<span class="thumb"><img src="' + esc(url.startsWith("/") ? url : "/" + url) +
      '" alt="" loading="lazy" decoding="async" width="48" height="48"></span>';
  }
  function productCard(row) {
    return '<button type="button" class="item" data-product="' + row.id + '">' + thumb(row.img) +
      '<span class="item__main"><span class="item__name">' + bdi(row.n) + "</span>" +
      '<span class="item__meta">' + bdi(row.b) + " · " + esc(labelOfNode(row.c)) +
      (row.st !== "published" ? " · " + esc(t("admin." + (row.st === "draft" ? "stDraft" : "stArchived"))) : "") +
      (row.img ? "" : " · " + esc(t("admin.prdNoPhoto"))) + "</span></span>" +
      '<span class="item__end"><span class="price">' + money(row.p) + "</span>" +
      pill(t("admin.stkQty") + " " + String(row.s), row.s === 0 ? "problem" : row.s <= row.la ? "wait" : "done") + "</span></button>";
  }
  function productRow(row, index) {
    return '<tr data-row="' + index + '" data-id="' + row.id + '">' +
      '<td><input type="checkbox" data-pick-row="' + row.id + '"' + (state.selection.has(row.id) ? " checked" : "") + ' aria-label="' + esc(row.n) + '"></td>' +
      "<td>" + thumb(row.img) + "</td>" +
      '<td><button type="button" class="cell" style="text-align:start" data-product="' + row.id + '">' + bdi(row.n) + "</button></td>" +
      "<td>" + bdi(row.b) + "</td><td>" + esc(labelOfNode(row.c)) + "</td>" +
      '<td class="num"><input class="cell" inputmode="decimal" data-cell="price" data-id="' + row.id + '" data-row="' + index + '" value="' + esc(row.p) + '" aria-label="' + esc(t("admin.prdColPrice")) + '"></td>' +
      '<td class="num"><input class="cell" inputmode="numeric" data-cell="stock" data-id="' + row.id + '" data-row="' + index + '" value="' + esc(row.s) + '" aria-label="' + esc(t("admin.prdColStock")) + '"></td>' +
      "<td>" + esc(t("admin." + (row.st === "draft" ? "stDraft" : row.st === "archived" ? "stArchived" : "stPublished"))) + "</td>" +
      '<td><button type="button" class="btn btn--ghost btn--sm" data-product="' + row.id + '">' + esc(t("admin.edit")) + "</button></td></tr>";
  }
  function labelOfNode(id) {
    const tax = state.taxonomy || {};
    const node = (tax.nodes || []).find(n => n.id === id);
    if (node && node.name && (node.name[I.current] || node.name.ar)) return node.name[I.current] || node.name.ar;
    // An imported product still sits in one of the old category ids. Those are
    // permanent, and their names live in the shop dictionary.
    const legacy = (tax.labels || {})[id];
    if (legacy) return legacy[I.current] || legacy.ar || id;
    return id;
  }

  /* Inline editing. Commits batch and flush every 800ms or on blur, as one
     request — a price round on forty products must not open forty modals. */
  const pending = new Map();
  let flushTimer = 0;
  function wireInline() {
    qsa("[data-cell]").forEach(input => {
      const original = input.value;
      input.dataset.was = original;
      input.addEventListener("focus", () => input.classList.add("is-editing"));
      input.addEventListener("blur", () => { input.classList.remove("is-editing"); queue(input); flush(); });
      input.addEventListener("keydown", event => {
        if (event.key === "Tab" && !event.shiftKey) {
          event.preventDefault();
          queue(input);
          const next = qs('[data-cell="' + input.dataset.cell + '"][data-row="' + (Number(input.dataset.row) + 1) + '"]');
          if (next) { next.focus(); next.select(); } else { input.blur(); }
          flush();
        } else if (event.key === "Enter") {
          event.preventDefault();
          queue(input);
          flush();
        } else if (event.key === "Escape") {
          input.value = input.dataset.was;
          input.classList.remove("is-dirty");
        }
      });
    });
    qsa("[data-pick-row]").forEach(box => {
      box.onchange = () => {
        const id = Number(box.dataset.pickRow);
        if (box.checked) state.selection.add(id); else state.selection.delete(id);
        drawSelectBar();
      };
    });
  }
  function queue(input) {
    if (input.value === input.dataset.was) return;
    pending.set(input.dataset.id + ":" + input.dataset.cell, {
      id: Number(input.dataset.id), field: input.dataset.cell, value: input.value, el: input
    });
    input.classList.add("is-dirty");
  }
  function flush() {
    clearTimeout(flushTimer);
    flushTimer = setTimeout(async () => {
      if (!pending.size) return;
      const edits = [...pending.values()];
      pending.clear();
      try {
        await api("inline", { body: { edits: edits.map(e => ({ id: e.id, field: e.field, value: e.value })) } });
        edits.forEach(e => { e.el.classList.remove("is-dirty"); e.el.dataset.was = e.el.value; });
        toast(esc(t("admin.saved")));
        refreshCounts();
      } catch (error) {
        // A failure reverts the cell and names the row.
        edits.forEach(e => { e.el.value = e.el.dataset.was; e.el.classList.remove("is-dirty"); });
        fail(error);
      }
    }, 800);
  }

  function drawSelectBar() {
    const bar = qs("#prdSelectBar");
    if (!bar) return;
    if (!state.selection.size) { bar.innerHTML = ""; return; }
    bar.innerHTML = '<div class="selectbar"><span>' + esc(t("admin.selectedCount", { n: state.selection.size })) + "</span>" +
      '<button type="button" class="btn btn--sm" data-bulk="price">' + esc(t("admin.blkPrice")) + "</button>" +
      '<button type="button" class="btn btn--sm" data-bulk="stock">' + esc(t("admin.blkStock")) + "</button>" +
      '<button type="button" class="btn btn--sm" data-bulk="status">' + esc(t("admin.blkStatus")) + "</button>" +
      '<button type="button" class="btn btn--sm" data-bulk="cat">' + esc(t("admin.blkMove")) + "</button>" +
      '<button type="button" class="btn btn--ghost btn--sm" data-unselect>' + esc(t("admin.clearSelection")) + "</button></div>";
    qsa("[data-bulk]", bar).forEach(button => { button.onclick = () => bulkSheet(button.dataset.bulk); });
    qs("[data-unselect]", bar).onclick = () => { state.selection.clear(); loadProducts(); };
  }

  function bulkSheet(kind) {
    const ids = [...state.selection];
    let body = "";
    if (kind === "price") {
      body = '<label class="field"><span>' + esc(t("admin.blkModePercent")) + "</span><select id=\"blkMode\">" +
        '<option value="percent">' + esc(t("admin.blkModePercent")) + "</option>" +
        '<option value="amount">' + esc(t("admin.blkModeAmount")) + "</option>" +
        '<option value="fixed">' + esc(t("admin.blkModeFixed")) + "</option></select></label>" +
        '<label class="field"><span>' + esc(t("admin.payAmount")) + '</span><input id="blkAmount" inputmode="decimal" value="-10"></label>' +
        '<label class="field"><span>' + esc(t("admin.blkRounding")) + "</span><select id=\"blkRound\">" +
        '<option value="">' + esc(t("admin.blkRoundNone")) + '</option><option value="99">.99</option>' +
        '<option value="95">.95</option><option value="int">' + esc(t("admin.blkRoundInt")) + "</option></select></label>";
    } else if (kind === "stock") {
      body = '<label class="field"><span>' + esc(t("admin.blkStock")) + "</span><select id=\"blkMode\">" +
        '<option value="set">' + esc(t("admin.blkModeSet")) + "</option>" +
        '<option value="add">' + esc(t("admin.blkModeAdd")) + "</option>" +
        '<option value="sub">' + esc(t("admin.blkModeSub")) + "</option>" +
        '<option value="out">' + esc(t("admin.blkModeOut")) + "</option>" +
        '<option value="in">' + esc(t("admin.blkModeIn")) + "</option></select></label>" +
        '<label class="field"><span>' + esc(t("admin.stkQty")) + '</span><input id="blkAmount" inputmode="numeric" value="1"></label>';
    } else if (kind === "status") {
      body = '<label class="field"><span>' + esc(t("admin.prdStatus")) + "</span><select id=\"blkAmount\">" +
        '<option value="published">' + esc(t("admin.stPublished")) + "</option>" +
        '<option value="draft">' + esc(t("admin.stDraft")) + "</option>" +
        '<option value="archived">' + esc(t("admin.stArchived")) + "</option></select></label>";
    } else {
      body = '<label class="field"><span>' + esc(t("admin.prdCategory")) + '</span><select id="blkAmount">' + categoryOptions("") + "</select></label>";
    }
    const TITLE = { price: "blkPrice", stock: "blkStock", status: "blkStatus", cat: "blkMove" };
    openSheet("sheet", t("admin." + TITLE[kind]),
      body + '<p class="hint">' + esc(t("admin.blkPreview", { n: ids.length })) + "</p>",
      '<button type="button" class="btn btn--primary" data-bulk-go>' + esc(t("admin.blkApply", { n: ids.length })) + "</button>");
    qs("[data-bulk-go]", qs("#sheet")).onclick = async () => {
      const mode = qs("#blkMode") ? qs("#blkMode").value : "";
      const amount = qs("#blkAmount") ? qs("#blkAmount").value : "";
      if (kind === "price" && mode === "percent" && Math.abs(Number(amount)) > 50 && !confirm(t("admin.blkBigWarn", { n: Math.abs(Number(amount)) }))) return;
      try {
        const out = await api("bulk", { body: { kind, ids, mode, amount, rounding: qs("#blkRound") ? qs("#blkRound").value : "" } });
        closeSheet("sheet");
        state.selection.clear();
        loadProducts();
        // A bulk change is only usable if it can be taken back.
        toast(esc(t("admin.blkDone", { n: out.changed })), {
          action: {
            label: t("admin.undo"),
            run: async () => {
              try { await api("undo-bulk", { body: { before: out.before } }); toast(esc(t("admin.blkUndoneMsg"))); loadProducts(); }
              catch (e) { fail(e); }
            }
          }
        });
      } catch (e) { fail(e); }
    };
  }

  /* ------------------------------------------------------ product editor */
  let editing = null;
  async function openEditor(id) {
    let data = { product: { name: "", brand: "", category: "", price: "", oldPrice: "", stock: 1, lowAt: state.settings.lowAt || 3, status: "draft" }, gallery: [], seenAt: 0 };
    if (id) {
      try { data = await api("product", { query: { id } }); } catch (e) { fail(e); return; }
    }
    editing = { id: id || 0, seenAt: data.seenAt, gallery: data.gallery.slice(), isNew: !id };
    /* What the gallery looked like when the editor opened, so a save can
       tell whether it needs to write it at all. */
    editing.galleryWas = JSON.stringify(editing.gallery);
    const p = data.product;
    qs("#editorBody").innerHTML =
      '<label class="field"><span>' + esc(t("admin.fieldName")) + '</span><input id="edName" maxlength="200" value="' + esc(p.name) + '"></label>' +
      '<div class="two"><label class="field"><span>' + esc(t("admin.fieldNameEn")) + ' <small>' + esc(t("admin.optional")) + '</small></span><input id="edNameEn" dir="ltr" value="' + esc(p.nameEn || "") + '"></label>' +
      '<label class="field"><span>' + esc(t("admin.fieldNameTr")) + ' <small>' + esc(t("admin.optional")) + '</small></span><input id="edNameTr" dir="ltr" value="' + esc(p.nameTr || "") + '"></label></div>' +
      '<div class="two"><label class="field"><span>' + esc(t("admin.fieldPrice")) + '</span><input id="edPrice" inputmode="decimal" value="' + esc(p.price) + '"></label>' +
      '<label class="field"><span>' + esc(t("admin.fieldOldPrice")) + '</span><input id="edOld" inputmode="decimal" value="' + esc(p.oldPrice || "") + '"></label></div>' +
      '<div class="two"><label class="field"><span>' + esc(t("admin.fieldBrand")) + '</span><input id="edBrand" value="' + esc(p.brand) + '" list="brandList"></label>' +
      '<label class="field"><span>' + esc(t("admin.fieldCategory")) + '</span><select id="edCat">' + categoryOptions(p.category) + "</select></label></div>" +
      '<datalist id="brandList">' + state.brands.map(b => '<option value="' + esc(b.name) + '">').join("") + "</datalist>" +
      '<div class="two"><label class="field"><span>' + esc(t("admin.fieldStock")) + '</span><input id="edStock" inputmode="numeric" value="' + esc(p.stock) + '"></label>' +
      '<label class="field"><span>' + esc(t("admin.fieldLowAt")) + '</span><input id="edLowAt" inputmode="numeric" value="' + esc(p.lowAt) + '"></label></div>' +
      '<label class="field"><span>' + esc(t("admin.fieldStatus")) + '</span><select id="edStatus">' +
        ["published", "draft", "archived"].map(s => '<option value="' + s + '"' + ((p.status || "published") === s ? " selected" : "") + ">" +
          esc(t("admin." + (s === "draft" ? "stDraft" : s === "archived" ? "stArchived" : "stPublished"))) + "</option>").join("") + "</select></label>" +
      '<label class="field"><span>' + esc(t("admin.fieldBadge")) + ' <small>' + esc(t("admin.badgeHint")) + '</small></span><input id="edBadge" maxlength="30" value="' + esc(p.badge || "") + '"></label>' +
      '<label class="field"><span>' + esc(t("admin.fieldDescAr")) + '</span><textarea id="edDescAr" maxlength="2000">' + esc(p.descriptionAr || "") + "</textarea></label>" +
      '<label class="field"><span>' + esc(t("admin.fieldDescEn")) + '</span><textarea id="edDescEn" dir="ltr" maxlength="2000">' + esc(p.description || "") + "</textarea></label>" +
      '<label class="field"><span>' + esc(t("admin.fieldDescTr")) + '</span><textarea id="edDescTr" dir="ltr" maxlength="2000">' + esc(p.descriptionTr || "") + "</textarea></label>" +
      '<div class="block"><div class="block__title">' + esc(t("admin.medProductImages", { n: editing.gallery.length })) + "</div>" +
        '<div id="edGallery"></div></div>';
    qs("#editorTitle").textContent = id ? t("admin.editTitle") : t("admin.newTitle");
    qs("#editorFoot").innerHTML =
      '<button type="button" class="btn btn--primary" data-save-product>' + esc(t("admin.save")) + "</button>" +
      (state.rows.length > 1 ? '<button type="button" class="btn btn--secondary" data-save-next>' + esc(t("admin.prdSaveNext")) +
        ' <span class="pill">' + esc(t("admin.remaining", { n: remainingAfter(id) })) + "</span></button>" : "") +
      '<span class="spacer"></span>' +
      (id ? '<button type="button" class="btn btn--ghost" data-duplicate>' + esc(t("admin.prdDuplicate")) + "</button>" : "") +
      (id && data.isOverridden ? '<button type="button" class="btn btn--ghost" data-revert>' + esc(t("admin.prdRevert")) + "</button>" : "") +
      (id ? '<button type="button" class="btn btn--danger" data-delete>' + esc(t("admin.prdDelete")) + "</button>" : "");
    drawEditorGallery();
    const dialog = qs("#editor");
    if (!dialog.open) dialog.showModal();
    qs("#edName").focus();
    wireEditor();
  }
  const remainingAfter = id => Math.max(0, state.rows.length - 1 - state.rows.findIndex(r => String(r.id) === String(id)));

  function wireEditor() {
    const dialog = qs("#editor");
    const on = (sel, fn) => { const el = qs(sel, dialog); if (el) el.onclick = fn; };
    on("[data-save-product]", () => saveProduct(false));
    on("[data-save-next]", () => saveProduct(true));
    on("[data-duplicate]", () => {
      const clone = collectProduct();
      editing = { id: 0, seenAt: 0, gallery: editing.gallery.slice(), isNew: true };
      editing.galleryWas = JSON.stringify(editing.gallery);
      qs("#edName").value = clone.name + " (2)";
      qs("#editorTitle").textContent = t("admin.newTitle");
    });
    on("[data-revert]", async () => {
      if (!confirm(t("admin.prdConfirmRevert"))) return;
      try { await api("revert", { body: { id: editing.id } }); closeSheet("editor"); loadProducts(); toast(esc(t("admin.saved"))); }
      catch (e) { fail(e); }
    });
    on("[data-delete]", async () => {
      if (!confirm(t("admin.prdConfirmDelete", { name: qs("#edName").value }))) return;
      try { await api("delete", { body: { id: editing.id } }); closeSheet("editor"); loadProducts(); toast(esc(t("admin.saved"))); }
      catch (e) { fail(e); }
    });
  }
  function collectProduct() {
    return {
      id: editing.id || undefined,
      name: qs("#edName").value, nameEn: qs("#edNameEn").value, nameTr: qs("#edNameTr").value,
      price: qs("#edPrice").value, oldPrice: qs("#edOld").value,
      brand: qs("#edBrand").value, category: qs("#edCat").value,
      stock: qs("#edStock").value, lowAt: qs("#edLowAt").value, status: qs("#edStatus").value,
      badge: qs("#edBadge").value, descriptionAr: qs("#edDescAr").value,
      description: qs("#edDescEn").value, descriptionTr: qs("#edDescTr").value,
      image: (editing.gallery[0] && editing.gallery[0].url) || "",
      images: editing.gallery.map(g => g.url)
    };
  }
  async function saveProduct(andNext) {
    const product = collectProduct();
    if (!product.name.trim()) { toast(esc(t("admin.needName")), { error: true }); return; }
    if (!(Number(product.price) > 0)) { toast(esc(t("admin.needPrice")), { error: true }); return; }
    try {
      const out = await api("save", { body: { product, isNew: editing.isNew, seenAt: editing.seenAt } });
      /* Only when the gallery actually changed. Writing it on every save made
         a second state write per product, and the backup that write took was
         of the state AFTER the edit — so it became the newest restore point
         and the restore button handed back the mistake. */
      const galleryNow = JSON.stringify(editing.gallery || []);
      if (galleryNow !== (editing.galleryWas || "[]")) {
        await api("gallery-save", { body: { id: out.id, images: editing.gallery } });
      }
      toast(esc(t("admin.saved")));
      const index = state.rows.findIndex(r => String(r.id) === String(editing.id));
      await loadProducts();
      refreshCounts();
      if (andNext && index >= 0 && state.rows[index + 1]) openEditor(state.rows[index + 1].id);
      else closeSheet("editor");
    } catch (e) { fail(e); }
  }

  /* ---------------------------------------------------------- the gallery */
  function drawEditorGallery(target) {
    const box = qs(target || "#edGallery");
    if (!box) return;
    if (!editing.gallery.length) {
      box.innerHTML = '<div class="empty"><p class="empty__text">' + esc(t("admin.medEmpty")) + "</p>" +
        '<label class="btn btn--primary">' + esc(t("admin.medUpload")) +
        '<input type="file" accept="image/*" multiple hidden data-upload></label></div>';
    } else {
      box.innerHTML = '<div class="gallery">' + editing.gallery.map((shot, index) =>
        '<div class="shot"><img src="' + esc(shot.url.startsWith("/") ? shot.url : "/" + shot.url) + '" alt="" loading="lazy" decoding="async">' +
        (index === 0 ? '<span class="shot__tag">' + esc(t("admin.medMain")) + "</span>" : "") +
        '<div class="shot__bar">' +
          (index === 0 ? "" : '<button type="button" class="btn btn--ghost btn--sm" data-shot-main="' + index + '">' + esc(t("admin.medMakeMain")) + "</button>") +
          '<button type="button" class="btn btn--ghost btn--sm" data-shot-kind="' + index + '">' +
            esc(t("admin." + (shot.kind === "scene" ? "medKindScene" : "medKindPack"))) + "</button>" +
          '<button type="button" class="btn btn--danger btn--sm" data-shot-del="' + index + '">×</button>' +
        "</div></div>").join("") + "</div>" +
        '<p class="hint">' + esc(t("admin.medHint")) + "</p>" +
        '<label class="btn btn--secondary">' + esc(t("admin.medUpload")) +
        '<input type="file" accept="image/*" multiple hidden data-upload></label>';
    }
    qsa("[data-shot-main]", box).forEach(b => {
      b.onclick = () => { const i = Number(b.dataset.shotMain); const [s] = editing.gallery.splice(i, 1); editing.gallery.unshift(s); drawEditorGallery(target); };
    });
    qsa("[data-shot-kind]", box).forEach(b => {
      b.onclick = () => { const s = editing.gallery[Number(b.dataset.shotKind)]; s.kind = s.kind === "scene" ? "pack" : "scene"; drawEditorGallery(target); };
    });
    qsa("[data-shot-del]", box).forEach(b => {
      b.onclick = () => { editing.gallery.splice(Number(b.dataset.shotDel), 1); drawEditorGallery(target); };
    });
    qsa("[data-upload]", box).forEach(input => {
      input.onchange = async () => {
        for (const file of Array.from(input.files || [])) await uploadOne(file, target);
        input.value = "";
      };
    });
  }
  /* The existing pipeline is kept: resize to 1200px, WebP q0.82, presigned PUT.
     It works; it only ever needed to write into an array instead of a string. */
  async function uploadOne(file, target) {
    if (editing.gallery.length >= 12) { toast(esc(t("admin.medTooMany")), { error: true }); return; }
    if (!/^image\//.test(file.type)) { toast(esc(t("admin.medUnsupported")), { error: true }); return; }
    if (file.size > 10 * 1024 * 1024) { toast(esc(t("admin.medTooBig")), { error: true }); return; }
    toast(esc(t("admin.medPreparing")));
    let blob = file, type = file.type;
    try {
      const prepared = await prepareImage(file);
      if (prepared) { blob = prepared; type = "image/webp"; }
    } catch (e) { /* the original is uploaded instead */ }
    try {
      const signed = await api("presign", { body: { contentType: type, size: blob.size, filename: file.name } });
      toast(esc(t("admin.medUploading")));
      const put = await fetch(signed.presignedUrl, {
        method: "PUT", body: blob,
        headers: { "x-vercel-blob-access": "private", "x-api-version": "7", "x-content-type": type, "content-type": type }
      });
      if (!put.ok) throw new Error("upload");
      editing.gallery.push({ url: "/api/image?pathname=" + encodeURIComponent(signed.pathname), kind: "pack", alt: "" });
      toast(esc(t("admin.medUploaded")));
      drawEditorGallery(target);
    } catch (error) {
      toast(esc(t("admin.medFailed", { error: explain(error) || "" })), { error: true });
    }
  }
  function prepareImage(file) {
    return new Promise(resolve => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        const scale = Math.min(1, 1200 / Math.max(image.width, image.height));
        const canvas = doc.createElement("canvas");
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => { URL.revokeObjectURL(url); resolve(blob); }, "image/webp", 0.82);
      };
      image.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      image.src = url;
    });
  }

  /* =============================================================== STOCK */
  const stockFilters = { tab: "low", page: 1 };
  async function renderStock() {
    const screen = qs("#screen-stock");
    screen.innerHTML =
      '<div class="chips">' + [["low", "stkTabLow"], ["out", "stkTabOut"], ["", "stkTabAll"]]
        .map(pair => '<button type="button" class="chip' + (stockFilters.tab === pair[0] ? " is-on" : "") +
          '" data-stock-tab="' + pair[0] + '">' + esc(t("admin." + pair[1])) + "</button>").join("") + "</div>" +
      '<p class="hint">' + esc(t("admin.stkMigrationHint")) + "</p>" +
      '<div id="stkList"></div><div class="pager" id="stkPager"></div>';
    qsa("[data-stock-tab]", screen).forEach(button => {
      button.onclick = () => { stockFilters.tab = button.dataset.stockTab; stockFilters.page = 1; renderStock(); };
    });
    const box = qs("#stkList");
    box.innerHTML = skeleton(4);
    let data;
    try { data = await api("list", { query: { stock: stockFilters.tab, sort: "stockUp", page: stockFilters.page } }); }
    catch (e) { fail(e); return; }
    state.rows = data.rows;
    if (!data.total) {
      box.innerHTML = '<div class="empty"><p class="empty__title">' +
        esc(t("admin." + (stockFilters.tab === "out" ? "stkEmptyOut" : "stkEmptyLow"))) + "</p></div>";
      return;
    }
    // The count is editable in place on a phone too: that inline column plus the
    // Tab key is how 312 counts get entered in one sitting.
    box.innerHTML = isWide()
      ? '<div class="table-wrap"><table class="grid"><thead><tr><th></th>' +
        ["prdColName", "prdColBrand", "stkQty", "stkLowAt"].map(k => "<th>" + esc(t("admin." + k)) + "</th>").join("") +
        "</tr></thead><tbody>" + data.rows.map((row, index) =>
          '<tr data-row="' + index + '"><td>' + thumb(row.img) + "</td><td>" + bdi(row.n) + "</td><td>" + bdi(row.b) + "</td>" +
          '<td class="num"><input class="cell" inputmode="numeric" data-cell="stock" data-id="' + row.id + '" data-row="' + index + '" value="' + esc(row.s) + '" aria-label="' + esc(t("admin.stkQty")) + '"></td>' +
          '<td class="num"><input class="cell" inputmode="numeric" data-cell="lowAt" data-id="' + row.id + '" data-row="' + index + '" value="' + esc(row.la) + '" aria-label="' + esc(t("admin.stkLowAt")) + '"></td></tr>').join("") +
        "</tbody></table></div>"
      : '<div class="list">' + data.rows.map((row, index) =>
          '<div class="item">' + thumb(row.img) +
          '<span class="item__main"><span class="item__name">' + bdi(row.n) +
          '</span><span class="item__meta">' + bdi(row.b) + "</span></span>" +
          '<span class="item__end"><input class="cell" style="inline-size:76px;text-align:center" inputmode="numeric" data-cell="stock" data-id="' +
            row.id + '" data-row="' + index + '" value="' + esc(row.s) + '" aria-label="' + esc(t("admin.stkQty")) + '"></span></div>').join("") + "</div>";
    wireInline();
    pager("#stkPager", data, page => { stockFilters.page = page; renderStock(); });
  }

  /* ============================================================= CONTENT */
  /* The highest-value screen in the console: eleven fields, and filling them
     unhides twelve of the twenty-two answers a customer can ask for. */
  async function renderContent() {
    const screen = qs("#screen-content");
    screen.innerHTML = '<div class="card">' + skeleton(2) + "</div>";
    let data;
    try { data = await api("content"); } catch (e) { fail(e); return; }
    const status = data.status;
    const groups = {};
    status.fields.forEach(field => { (groups[field.group] = groups[field.group] || []).push(field); });
    const GROUP_KEY = { shipping: "cntGroupShipping", returns: "cntGroupReturns", warranty: "cntGroupWarranty", ordering: "cntGroupOrdering" };
    const done = status.filled.length, total = status.fields.length;
    screen.innerHTML =
      '<div class="card"><h2>' + esc(t("admin.cntProgress", { n: done, total })) + "</h2>" +
        '<div class="progress"><span style="inline-size:' + Math.round(done / Math.max(1, total) * 100) + '%"></span></div>' +
        "<p>" + esc(status.hidden ? t("admin.cntHiddenNow", { n: status.hidden }) : t("admin.cntAllDone")) + "</p></div>" +
      Object.keys(groups).map(group =>
        '<div class="card"><h2>' + esc(t("admin." + (GROUP_KEY[group] || "cntTitle"))) + "</h2>" +
        groups[group].map(field =>
          '<div class="block"><div class="block__title">' + esc(t("admin.pol." + field.key)) + "</div>" +
          '<label class="field"><span>' + esc(t("admin.cntLangAr")) + '</span><input data-pol="' + esc(field.key) + '" data-lang="ar" value="' + esc(field.value.ar || "") + '" maxlength="400"></label>' +
          '<p class="hint">' + esc(t("admin.hint." + field.key)) + "</p>" +
          '<div class="two"><label class="field"><span>' + esc(t("admin.cntLangEn")) + '</span><input dir="ltr" data-pol="' + esc(field.key) + '" data-lang="en" value="' + esc(field.value.en || "") + '" maxlength="400"></label>' +
          '<label class="field"><span>' + esc(t("admin.cntLangTr")) + '</span><input dir="ltr" data-pol="' + esc(field.key) + '" data-lang="tr" value="' + esc(field.value.tr || "") + '" maxlength="400"></label></div>' +
          '<button type="button" class="btn btn--ghost btn--sm" data-autofill="' + esc(field.key) + '">' + esc(t("admin.cntAutoTranslate")) + "</button></div>").join("") +
        "</div>").join("") +
      '<div class="card"><h2>' + esc(t("admin.cntPreview")) + '</h2><div id="cntPreview"></div></div>' +
      '<div class="card"><button type="button" class="btn btn--primary" data-save-content>' + esc(t("admin.save")) + "</button></div>";
    drawPolicyPreview(data.preview);
    qsa("[data-autofill]", screen).forEach(button => {
      button.onclick = () => {
        const key = button.dataset.autofill;
        const ar = qs('[data-pol="' + key + '"][data-lang="ar"]').value;
        ["en", "tr"].forEach(code => { qs('[data-pol="' + key + '"][data-lang="' + code + '"]').value = ar; });
      };
    });
    qs("[data-save-content]", screen).onclick = async () => {
      const policies = {};
      qsa("[data-pol]", screen).forEach(input => {
        const key = input.dataset.pol;
        policies[key] = policies[key] || {};
        policies[key][input.dataset.lang] = input.value;
      });
      try {
        await api("content-save", { body: { policies } });
        toast(esc(t("admin.cntSaved")));
        refreshCounts();
        renderContent();
      } catch (e) { fail(e); }
    };
  }
  function drawPolicyPreview(preview) {
    const box = qs("#cntPreview");
    if (!box) return;
    const code = I.current;
    const ready = value => typeof value === "string" && value && !value.includes("[[");
    const blocks = Object.values(preview || {}).map(section => {
      const points = (section.points || []).filter(pt => pt && pt.q && pt.a && ready(pt.q[code]) && ready(pt.a[code]));
      if (!points.length) return "";
      return "<h3>" + esc(section.title[code] || "") + "</h3><dl class=\"kv\">" +
        points.map(pt => "<dt>" + esc(pt.q[code]) + "</dt><dd>" + esc(pt.a[code]) + "</dd>").join("") + "</dl>";
    }).filter(Boolean);
    box.innerHTML = blocks.join("") || '<p class="muted">' + esc(t("admin.nothing")) + "</p>";
  }

  /* ============================================================ TAXONOMY */
  async function ensureTaxonomy(force) {
    if (state.taxonomy && !force) return state.taxonomy;
    const data = await api("taxonomy");
    state.taxonomy = data.taxonomy;
    state.taxonomy.counts = data.counts;
    state.taxonomy.labels = data.labels || {};
    state.brands = (data.taxonomy.brands || []).map(b => Object.assign({}, b, { count: data.brandCounts[b.name] || 0 }));
    return state.taxonomy;
  }
  async function renderTaxonomy() {
    const screen = qs("#screen-taxonomy");
    screen.innerHTML = skeleton(4);
    try { await ensureTaxonomy(true); } catch (e) { fail(e); return; }
    const tax = state.taxonomy;
    const counts = tax.counts || {};
    const label = node => (node.name && (node.name[I.current] || node.name.ar)) || node.id;
    const countOf = node => (counts[node.id] || 0) +
      tax.nodes.filter(n => n.parent === node.id).reduce((sum, child) => sum + (counts[child.id] || 0), 0);
    const nodeRow = (node, child) =>
      '<div class="node' + (child ? " node--child" : "") + (node.visible === false ? " is-hidden" : "") + '">' +
      '<span class="node__name">' + bdi(label(node)) + "</span>" +
      '<span class="node__count">' + esc(t("admin.taxCount", { n: countOf(node) })) + "</span>" +
      '<button type="button" class="btn btn--ghost btn--sm" data-node-edit="' + esc(node.id) + '">' + esc(t("admin.edit")) + "</button>" +
      '<button type="button" class="btn btn--ghost btn--sm" data-node-hide="' + esc(node.id) + '">' +
        esc(node.visible === false ? t("admin.usrEnable") : t("admin.taxVisible")) + "</button>" +
      '<button type="button" class="btn btn--ghost btn--sm" data-node-merge="' + esc(node.id) + '">' + esc(t("admin.taxMerge")) + "</button>" +
      '<button type="button" class="btn btn--danger btn--sm" data-node-del="' + esc(node.id) + '">' + esc(t("admin.del")) + "</button></div>";
    screen.innerHTML =
      '<div class="chips"><button type="button" class="chip is-on">' + esc(t("admin.taxTabTree")) + "</button></div>" +
      '<div class="screen__head"><div class="grow"></div><button type="button" class="btn btn--primary" data-node-new>' + esc(t("admin.taxAdd")) + "</button></div>" +
      '<div class="tree">' + tax.nodes.filter(n => !n.parent).map(top =>
        nodeRow(top, false) + tax.nodes.filter(n => n.parent === top.id).map(child => nodeRow(child, true)).join("")).join("") + "</div>" +
      '<h2 style="margin-block:var(--s-5) var(--s-2)">' + esc(t("admin.taxTabBrands")) + "</h2>" +
      '<div class="screen__head"><div class="grow"></div><button type="button" class="btn btn--secondary" data-brand-new>' + esc(t("admin.brdAdd")) + "</button></div>" +
      '<div class="tree">' + state.brands.map(brand =>
        '<div class="node">' + (brand.logo
          ? '<span class="thumb"><img src="/assets/brands/' + esc(brand.logo) + '" alt="" loading="lazy" width="48" height="48"></span>'
          : '<span class="wordmark" aria-hidden="true">' + esc(String(brand.name).slice(0, 2)) + "</span>") +
        '<span class="node__name">' + bdi(brand.name) + "</span>" +
        '<span class="node__count">' + esc(t("admin.taxCount", { n: brand.count })) + "</span>" +
        (brand.logo ? "" : '<span class="pill pill--off">' + esc(t("admin.brdNoLogo").split("—")[0].trim()) + "</span>") +
        '<button type="button" class="btn btn--ghost btn--sm" data-brand-edit="' + esc(brand.slug) + '">' + esc(t("admin.edit")) + "</button></div>").join("") + "</div>";

    qs("[data-node-new]", screen).onclick = () => nodeSheet(null);
    qsa("[data-node-edit]", screen).forEach(b => { b.onclick = () => nodeSheet(b.dataset.nodeEdit); });
    qsa("[data-node-hide]", screen).forEach(b => {
      b.onclick = async () => {
        const node = tax.nodes.find(n => n.id === b.dataset.nodeHide);
        try { await api("taxonomy-save", { body: { op: "hide", id: node.id, visible: node.visible === false } }); renderTaxonomy(); }
        catch (e) { fail(e); }
      };
    });
    qsa("[data-node-del]", screen).forEach(b => {
      b.onclick = async () => {
        try { await api("taxonomy-save", { body: { op: "delete", id: b.dataset.nodeDel } }); renderTaxonomy(); toast(esc(t("admin.saved"))); }
        catch (error) {
          if (error.code === "node_has_products") toast(esc(t("admin.taxHasProducts", { n: error.detail.count })), { error: true });
          else fail(error);
        }
      };
    });
    qsa("[data-node-merge]", screen).forEach(b => {
      b.onclick = () => {
        const from = tax.nodes.find(n => n.id === b.dataset.nodeMerge);
        openSheet("sheet", t("admin.taxMergeInto", { name: label(from) }),
          '<label class="field"><span>' + esc(t("admin.taxTabTree")) + '</span><select id="mergeInto">' + categoryOptions("") + "</select></label>" +
          '<p class="hint">' + esc(t("admin.taxMergeHint")) + "</p>",
          '<button type="button" class="btn btn--primary" data-merge-go>' + esc(t("admin.apply")) + "</button>");
        qs("[data-merge-go]", qs("#sheet")).onclick = async () => {
          try { await api("taxonomy-save", { body: { op: "merge", id: from.id, into: qs("#mergeInto").value } }); closeSheet("sheet"); renderTaxonomy(); }
          catch (e) { fail(e); }
        };
      };
    });
    qs("[data-brand-new]", screen).onclick = () => brandSheet(null);
    qsa("[data-brand-edit]", screen).forEach(b => { b.onclick = () => brandSheet(b.dataset.brandEdit); });
  }
  function nodeSheet(id) {
    const tax = state.taxonomy;
    const node = id ? tax.nodes.find(n => n.id === id) : { id: "", parent: null, visible: true, name: {}, description: {} };
    openSheet("sheet", t("admin.taxEditTitle"),
      '<label class="field"><span>' + esc(t("admin.taxSlug")) + '</span><input id="ndId" dir="ltr" value="' + esc(node.id) + '"' + (id ? " readonly" : "") + '><small>' + esc(t("admin.taxSlugHint")) + "</small></label>" +
      '<label class="field"><span>' + esc(t("admin.taxNameAr")) + '</span><input id="ndAr" value="' + esc(node.name.ar || "") + '"></label>' +
      '<div class="two"><label class="field"><span>' + esc(t("admin.taxNameEn")) + '</span><input id="ndEn" dir="ltr" value="' + esc(node.name.en || "") + '"></label>' +
      '<label class="field"><span>' + esc(t("admin.taxNameTr")) + '</span><input id="ndTr" dir="ltr" value="' + esc(node.name.tr || "") + '"></label></div>' +
      '<label class="field"><span>' + esc(t("admin.taxParent")) + '</span><select id="ndParent"><option value="">' + esc(t("admin.taxRoot")) + "</option>" +
        tax.nodes.filter(n => !n.parent && n.id !== node.id).map(n =>
          '<option value="' + esc(n.id) + '"' + (node.parent === n.id ? " selected" : "") + ">" +
          esc((n.name && (n.name[I.current] || n.name.ar)) || n.id) + "</option>").join("") + "</select></label>" +
      '<label class="field"><span>' + esc(t("admin.taxOrder")) + '</span><input id="ndOrder" inputmode="numeric" value="' + esc(node.order || 0) + '"></label>' +
      '<label class="switch"><input type="checkbox" id="ndVisible"' + (node.visible === false ? "" : " checked") + ">" + esc(t("admin.taxVisible")) + "</label>" +
      '<p class="hint">' + esc(t("admin.taxHiddenNote")) + "</p>",
      '<button type="button" class="btn btn--primary" data-node-save>' + esc(t("admin.save")) + "</button>");
    qs("[data-node-save]", qs("#sheet")).onclick = async () => {
      try {
        await api("taxonomy-save", {
          body: {
            op: id ? "edit" : "add", id: qs("#ndId").value, parent: qs("#ndParent").value,
            order: qs("#ndOrder").value, visible: qs("#ndVisible").checked,
            nameAr: qs("#ndAr").value, nameEn: qs("#ndEn").value, nameTr: qs("#ndTr").value
          }
        });
        closeSheet("sheet");
        toast(esc(t("admin.taxSaved")));
        renderTaxonomy();
      } catch (e) { fail(e); }
    };
  }
  function brandSheet(slug) {
    const brand = slug ? state.brands.find(b => b.slug === slug) : { slug: "", name: "", logo: null, visible: true, authorised: false, tagline: {} };
    openSheet("sheet", t("admin.brdAdd"),
      '<label class="field"><span>' + esc(t("admin.brdName")) + '</span><input id="brName" value="' + esc(brand.name) + '"></label>' +
      '<label class="field"><span>' + esc(t("admin.brdTagline")) + '</span><input id="brTag" value="' + esc((brand.tagline && brand.tagline.ar) || "") + '"></label>' +
      '<label class="switch"><input type="checkbox" id="brAuth"' + (brand.authorised ? " checked" : "") + ">" + esc(t("admin.brdAuthorised")) + "</label>" +
      '<label class="switch"><input type="checkbox" id="brVisible"' + (brand.visible === false ? "" : " checked") + ">" + esc(t("admin.brdVisible")) + "</label>" +
      // A brand with no logo is normal; the row shows a wordmark tile, and the
      // editor says so rather than leaving a broken image behind.
      '<p class="hint">' + esc(t("admin.brdNoLogo")) + "</p>",
      '<button type="button" class="btn btn--primary" data-brand-save>' + esc(t("admin.save")) + "</button>");
    qs("[data-brand-save]", qs("#sheet")).onclick = async () => {
      try {
        await api("brand-save", {
          body: {
            slug: brand.slug, name: qs("#brName").value, taglineAr: qs("#brTag").value,
            authorised: qs("#brAuth").checked, visible: qs("#brVisible").checked, logo: brand.logo
          }
        });
        closeSheet("sheet");
        toast(esc(t("admin.brdSaved")));
        renderTaxonomy();
      } catch (e) { fail(e); }
    };
  }

  /* =============================================================== MEDIA */
  async function renderMedia() {
    const screen = qs("#screen-media");
    screen.innerHTML =
      '<div class="card"><h2>' + esc(t("admin.medPickProduct")) + "</h2>" +
        '<input type="search" id="mdSearch"><div id="mdResults" class="list" style="margin-block-start:var(--s-2)"></div>' +
        '<div id="mdGallery" style="margin-block-start:var(--s-3)"></div><div id="mdSave"></div></div>' +
      '<div class="card"><h2>' + esc(t("admin.medLibrary")) + '</h2><div id="mdLibrary">' + skeleton(2) + "</div></div>";
    qs("#mdSearch").addEventListener("input", debounce(async () => {
      const q = qs("#mdSearch").value.trim();
      if (q.length < 2) { qs("#mdResults").innerHTML = ""; return; }
      try {
        const data = await api("list", { query: { q, page: 1 } });
        qs("#mdResults").innerHTML = data.rows.slice(0, 6).map(row =>
          '<button type="button" class="item" data-media-product="' + row.id + '">' + thumb(row.img) +
          '<span class="item__main"><span class="item__name">' + bdi(row.n) + "</span></span></button>").join("");
        qsa("[data-media-product]").forEach(button => {
          button.onclick = async () => {
            const id = button.dataset.mediaProduct;
            const data2 = await api("gallery", { query: { id } });
            editing = { id: Number(id), gallery: data2.images.slice(), seenAt: 0, isNew: false };
            editing.galleryWas = JSON.stringify(editing.gallery);
            qs("#mdResults").innerHTML = "";
            drawEditorGallery("#mdGallery");
            qs("#mdSave").innerHTML =
              '<button type="button" class="btn btn--primary" data-gallery-save>' + esc(t("admin.save")) + "</button>";
            qs("[data-gallery-save]").onclick = async () => {
              try { await api("gallery-save", { body: { id, images: editing.gallery } }); toast(esc(t("admin.saved"))); }
              catch (e) { fail(e); }
            };
          };
        });
      } catch (e) { fail(e); }
    }, 200));
    try {
      const data = await api("library");
      qs("#mdLibrary").innerHTML = data.total
        ? '<p class="muted">' + esc(t("admin.medTotal", { n: data.total, mb: Math.round(data.bytes / 104857.6) / 10 })) + "</p>" +
          '<div class="gallery">' + data.rows.slice(0, 60).map(row =>
            '<div class="shot"><img src="' + esc(row.url) + '" alt="" loading="lazy" decoding="async">' +
            '<div class="shot__bar"><span class="small">' + esc(row.uses ? t("admin.medUses", { n: row.uses }) : t("admin.medUnused")) + "</span></div></div>").join("") + "</div>"
        : '<p class="muted">' + esc(t("admin.medLibraryEmpty")) + "</p>";
    } catch (e) { fail(e); }
  }

  /* ============================================================= PRICING */
  async function renderPricing() {
    const screen = qs("#screen-pricing");
    screen.innerHTML = '<div class="card"><p class="hint">' + esc(t("admin.prcHint")) + "</p></div>" +
      '<div class="card"><h2>' + esc(t("admin.prcOnSale")) + '</h2><div id="prcList">' + skeleton(3) + "</div></div>";
    try {
      const data = await api("list", { query: { offer: "sale", page: 1, sort: "priceDown" } });
      qs("#prcList").innerHTML = data.total
        ? '<div class="list">' + data.rows.map(row =>
            '<button type="button" class="item" data-product="' + row.id + '">' + thumb(row.img) +
            '<span class="item__main"><span class="item__name">' + bdi(row.n) + "</span></span>" +
            '<span class="item__end"><span class="price">' + money(row.p) + " <del>" + moneyText(row.o) + "</del></span></span></button>").join("") + "</div>"
        : '<p class="muted">' + esc(t("admin.prcNone")) + "</p>";
    } catch (e) { fail(e); }
  }

  /* ============================================================= REPORTS */
  async function renderReports() {
    const screen = qs("#screen-reports");
    screen.innerHTML = skeleton(4);
    let data;
    try { data = await api("reports"); } catch (e) { fail(e); return; }
    const delta = (now, then) => {
      if (!then) return "";
      const pc = Math.round((now - then) / then * 100);
      return '<span class="kpi__delta ' + (pc >= 0 ? "is-up" : "is-down") + '">' +
        '<bdi dir="ltr">' + (pc >= 0 ? "+" : "") + pc + "%</bdi></span>";
    };
    const barList = (title, map) => {
      const entries = Object.entries(map || {}).sort((a, b) => b[1] - a[1]).slice(0, 8);
      if (!entries.length) return "";
      const max = Math.max.apply(null, entries.map(e => e[1]));
      return '<div class="card"><h2>' + esc(title) + '</h2><div class="bars">' + entries.map(([key, value]) =>
        '<div class="bar"><span>' + bdi(key || t("admin.nothing")) + "</span><span>" + num(value) + "</span>" +
        '<span class="bar__track"><span class="bar__fill" style="inline-size:' + Math.round(value / max * 100) + '%"></span></span></div>').join("") + "</div></div>";
    };
    screen.innerHTML =
      '<div class="card"><h2>' + esc(t("admin.rptMonth")) + '</h2><div class="kpis">' +
        '<div class="kpi"><span class="kpi__label">' + esc(t("admin.rptRevenue")) + '</span><span class="kpi__value">' + money(data.month.revenue) + "</span>" + delta(data.month.revenue, data.previous.revenue) + "</div>" +
        '<div class="kpi"><span class="kpi__label">' + esc(t("admin.rptOrders")) + '</span><span class="kpi__value">' + num(data.month.orders) + "</span>" + delta(data.month.orders, data.previous.orders) + "</div>" +
        '<div class="kpi"><span class="kpi__label">' + esc(t("admin.rptAov")) + '</span><span class="kpi__value">' + money(data.month.aov) + "</span>" + delta(data.month.aov, data.previous.aov) + "</div>" +
      "</div></div>" +
      '<div class="card"><h2>' + esc(t("admin.rptTop")) + "</h2>" +
        (data.top.length ? '<div class="list">' + data.top.map(row =>
          '<div class="item item--plain"><span class="item__main"><span class="item__name">' + bdi(row.name) +
          '</span><span class="item__meta">' + esc(t("admin.rptTopQty", { n: row.qty })) +
          (row.stock === null ? "" : " · " + t("admin.stkQty") + " " + row.stock) + "</span></span>" +
          '<span class="price">' + money(row.revenue) + "</span></div>").join("") + "</div>"
          : '<p class="muted">' + esc(t("admin.rptEmpty")) + "</p>") + "</div>" +
      '<div class="card"><h2>' + esc(t("admin.rptOwed")) + " — " + money(data.owedTotal) + "</h2>" +
        (data.owed.length ? '<div class="list">' + data.owed.map(row =>
          '<button type="button" class="item item--plain" data-order="' + esc(row.no) + '">' +
          '<span class="item__main"><span class="item__name">' + codeOf(row.no) + '</span><span class="item__meta">' + bdi(row.name) + " · " + when(row.at, true) + "</span></span>" +
          '<span class="price">' + money(row.grand) + "</span></button>").join("") + "</div>"
          : '<p class="muted">' + esc(t("admin.nothing")) + "</p>") + "</div>" +
      '<div class="card"><h2>' + esc(t("admin.rptStuck")) + "</h2>" +
        (data.stuck.length ? '<div class="list">' + data.stuck.map(row =>
          '<button type="button" class="item item--plain" data-order="' + esc(row.no) + '">' +
          '<span class="item__main"><span class="item__name">' + codeOf(row.no) + '</span><span class="item__meta">' + esc(t("admin." + (STATUS_KEY[row.st] || "stNew"))) + " · " + when(row.statusAt || row.at, true) + "</span></span>" +
          '<span class="price">' + money(row.grand) + "</span></button>").join("") + "</div>"
          : '<p class="muted">' + esc(t("admin.nothing")) + "</p>") + "</div>" +
      barList(t("admin.rptByCity"), data.byCity) +
      barList(t("admin.rptByChannel"), Object.fromEntries(Object.entries(data.byChannel || {}).map(([k, v]) => [t("admin." + (CHANNEL_KEY[k] || "chWeb")), v]))) +
      barList(t("admin.rptReasons"), Object.fromEntries(Object.entries(data.reasons || {}).map(([k, v]) => [t("admin." + (REASON_KEY[k] || "crOther")), v]))) +
      '<div class="card"><h2>' + esc(t("admin.rptDebt")) + '</h2><div class="chips">' +
        '<button type="button" class="chip" data-debt="auto">' + esc(t("admin.rptDebtNoPhoto", { n: data.debt.noPhoto })) + "</button>" +
        '<span class="chip">' + esc(t("admin.rptDebtNoDesc", { n: data.debt.noArabicDesc })) + "</span>" +
        '<button type="button" class="chip" data-debt="low">' + esc(t("admin.rptDebtLow", { n: data.debt.low })) + "</button>" +
        '<button type="button" class="chip" data-go="content">' + esc(t("admin.cntHomeCard", { n: state.counts.policyFilled || 0, total: state.counts.policyTotal || 11 })) + "</button></div></div>";
    qsa("[data-debt]", screen).forEach(button => {
      button.onclick = () => {
        if (button.dataset.debt === "auto") { productFilters.img = "auto"; productFilters.stock = ""; }
        else { productFilters.stock = "low"; productFilters.img = ""; }
        productFilters.page = 1;
        show("products");
      };
    });
  }

  /* =============================================================== USERS */
  async function renderUsers() {
    const screen = qs("#screen-users");
    screen.innerHTML = skeleton(3);
    let data;
    try { data = await api("users"); } catch (e) { fail(e); return; }
    const ROLE_KEY = { owner: "usrRoleOwner", staff: "usrRoleStaff", editor: "usrRoleEditor" };
    screen.innerHTML =
      '<div class="screen__head"><div class="grow"></div><button type="button" class="btn btn--primary" data-user-new>' + esc(t("admin.usrAdd")) + "</button></div>" +
      (data.rows.length ? '<div class="list">' + data.rows.map(row =>
        '<div class="item"><span class="wordmark">' + esc(String(row.name || row.login).slice(0, 2)) + "</span>" +
        '<span class="item__main"><span class="item__name">' + bdi(row.name || row.login) + "</span>" +
        '<span class="item__meta">' + codeOf(row.login) + " · " + esc(t("admin." + ROLE_KEY[row.role])) + " · " +
        (row.lastSeen ? when(row.lastSeen, true) : esc(t("admin.usrNever"))) + "</span></span>" +
        '<span class="item__end">' + pill(t("admin." + (row.enabled ? "usrEnabled" : "usrDisable")), row.enabled ? "done" : "off") +
        '<button type="button" class="btn btn--ghost btn--sm" data-user-edit="' + esc(row.id) + '">' + esc(t("admin.edit")) + "</button></span></div>").join("") + "</div>"
        : '<div class="empty"><p class="empty__text">' + esc(t("admin.usrEmpty")) + "</p></div>") +
      '<div class="card"><h2>' + esc(t("admin.usrRole")) + "</h2><ul class=\"small\">" +
        ["Owner", "Staff", "Editor"].map(role => "<li><b>" + esc(t("admin.usrRole" + role)) + "</b> — " + esc(t("admin.usrRole" + role + "What")) + "</li>").join("") + "</ul></div>";
    const open = (row) => {
      openSheet("sheet", t("admin.usrAdd"),
        '<label class="field"><span>' + esc(t("admin.usrName")) + '</span><input id="usName" value="' + esc(row ? row.name : "") + '"></label>' +
        '<label class="field"><span>' + esc(t("admin.usrLogin")) + '</span><input id="usLogin" dir="ltr" value="' + esc(row ? row.login : "") + '"></label>' +
        '<label class="field"><span>' + esc(t("admin.usrRole")) + '</span><select id="usRole">' +
          ["staff", "editor", "owner"].map(r => '<option value="' + r + '"' + (row && row.role === r ? " selected" : "") + ">" + esc(t("admin." + ROLE_KEY[r])) + "</option>").join("") + "</select></label>" +
        '<label class="field"><span>' + esc(t("admin.usrPassword")) + '</span><input id="usPass" type="password" autocomplete="new-password"><small>' + esc(t("admin.usrPasswordHint")) + "</small></label>",
        '<button type="button" class="btn btn--primary" data-user-save>' + esc(t("admin.save")) + "</button>" +
        (row ? '<button type="button" class="btn btn--danger" data-user-del>' + esc(t("admin.del")) + "</button>" : ""));
      qs("[data-user-save]", qs("#sheet")).onclick = async () => {
        try {
          await api("user-save", { body: { id: row && row.id, name: qs("#usName").value, login: qs("#usLogin").value, role: qs("#usRole").value, password: qs("#usPass").value } });
          closeSheet("sheet");
          renderUsers();
          toast(esc(t("admin.saved")));
        } catch (e) { fail(e); }
      };
      const del = qs("[data-user-del]", qs("#sheet"));
      if (del) del.onclick = async () => {
        try { await api("user-save", { body: { op: "delete", id: row.id, login: row.login } }); closeSheet("sheet"); renderUsers(); }
        catch (e) { fail(e); }
      };
    };
    qs("[data-user-new]", screen).onclick = () => open(null);
    qsa("[data-user-edit]", screen).forEach(b => { b.onclick = () => open(data.rows.find(r => r.id === b.dataset.userEdit)); });
  }

  /* ===================================================== AUDIT + BACKUPS */
  async function renderBackups() {
    const screen = qs("#screen-backups");
    screen.innerHTML = skeleton(4);
    let backups, log;
    try { backups = await api("backups"); log = await api("audit"); } catch (e) { fail(e); return; }
    const summary = row => row.summaryKey ? t(row.summaryKey, row.summaryVars || {}) : t("admin.bkState");
    const rows = tier => backups.rows.filter(r => r.tier === tier).map(row =>
      '<div class="item item--plain">' +
      '<span class="item__main"><span class="item__name">' + when(row.at, true) + " · " + esc(summary(row)) + "</span>" +
      '<span class="item__meta">' + esc(row.by === "owner" ? t("admin.audOwner") : row.by || "") + "</span></span>" +
      '<span class="item__end"><button type="button" class="btn btn--ghost btn--sm" data-diff="' + esc(row.name) + '">' + esc(t("admin.bkDiff")) + "</button>" +
      '<button type="button" class="btn btn--secondary btn--sm" data-restore="' + esc(row.name) + '" data-at="' + row.at + '">' + esc(t("admin.bkRestore")) + "</button></span></div>").join("");
    screen.innerHTML =
      '<div class="card"><h2>' + esc(t("admin.bkTitle")) + '</h2><p class="hint">' + esc(t("admin.bkSafety")) + "</p>" +
        '<h3 style="margin-block:var(--s-3) var(--s-2)">' + esc(t("admin.bkRolling")) + "</h3>" +
        (backups.rows.length ? '<div class="list">' + rows("rolling") + "</div>"
          : '<div class="empty"><p class="empty__text">' + esc(t("admin.bkEmpty")) + "</p></div>") +
        (backups.rows.some(r => r.tier === "daily")
          ? '<h3 style="margin-block:var(--s-4) var(--s-2)">' + esc(t("admin.bkDaily")) + '</h3><div class="list">' + rows("daily") + "</div>" : "") +
      "</div>" +
      '<div class="card"><h2>' + esc(t("admin.audTitle")) + "</h2>" +
        (log.rows.length ? '<div class="timeline">' + log.rows.map(row =>
          '<div class="event"><time>' + when(row.at, true) + "</time><span>" +
          esc(t("admin.audLine", {
            who: row.by === "owner" ? t("admin.audOwner") : row.by || t("admin.audSystem"),
            area: t("admin.area" + cap(row.area || "state")),
            action: t("admin.act" + cap(String(row.action || "save").replace(/-.*$/, "")))
          })) + (row.label ? " · " + esc(row.label) : "") + (row.target ? " " + codeOf(row.target) : "") + "</span></div>").join("") + "</div>"
          : '<p class="muted">' + esc(t("admin.audEmpty")) + "</p>") + "</div>";
    qsa("[data-diff]", screen).forEach(b => { b.onclick = () => showDiff(b.dataset.diff, null); });
    qsa("[data-restore]", screen).forEach(b => { b.onclick = () => showDiff(b.dataset.restore, Number(b.dataset.at)); });
  }
  const cap = s => String(s).charAt(0).toUpperCase() + String(s).slice(1);

  /* Plain language, before anything happens, and a typed confirmation for a
     destructive action that loses work — an OK button is not enough. */
  async function showDiff(name, at) {
    let data;
    try { data = await api("backup-diff", { query: { name } }); } catch (e) { fail(e); return; }
    const lines = data.changes.map(change => {
      if (change.kind === "added") return "<li>" + esc(t("admin.bkWillAdd", { name: change.name })) + "</li>";
      if (change.kind === "removed") return "<li>" + esc(t("admin.bkWillRemove", { name: change.name })) + "</li>";
      return "<li>" + esc(t("admin.bkWillRevert", { field: fieldName(change.field), name: change.name, from: change.from, to: change.to })) + "</li>";
    });
    const more = data.total > lines.length ? "<li>" + esc(t("admin.bkMore", { n: data.total - lines.length })) + "</li>" : "";
    const stamp = at ? plainTime(at) : "";
    openSheet("sheet", t("admin.bkDiff"),
      (lines.length ? "<ul>" + lines.join("") + more + "</ul>" : "<p>" + esc(t("admin.bkNoDiff")) + "</p>") +
      (at ? '<p class="hint">' + esc(t("admin.bkConfirmHint")) + "</p>" +
        '<label class="field"><span>' + esc(t("admin.bkConfirmType", { time: stamp })) + '</span><input id="bkConfirm" dir="ltr"></label>' : ""),
      at ? '<button type="button" class="btn btn--danger" data-restore-go>' + esc(t("admin.bkRestore")) + "</button>" : "");
    if (!at) return;
    qs("[data-restore-go]", qs("#sheet")).onclick = async () => {
      if (qs("#bkConfirm").value.trim() !== stamp) { toast(esc(t("error.confirm_mismatch")), { error: true }); return; }
      try {
        await api("restore-backup", { body: { name } });
        closeSheet("sheet");
        toast(esc(t("admin.bkRestored")));
        refreshCounts();
        renderBackups();
      } catch (e) { fail(e); }
    };
  }
  function plainTime(ms) {
    try { return new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }); }
    catch (e) { return String(ms); }
  }
  const fieldName = field => ({
    price: t("admin.prdColPrice"), stock: t("admin.prdColStock"), name: t("admin.prdColName"),
    category: t("admin.prdColCat"), inStock: t("admin.prdStock")
  }[field] || field);

  /* ============================================================ SETTINGS */
  async function renderSettings() {
    const screen = qs("#screen-settings");
    screen.innerHTML = skeleton(4);
    let data;
    try { data = await api("settings"); } catch (e) { fail(e); return; }
    const s = data.settings;
    state.settings = s;
    screen.innerHTML =
      '<div class="card"><h2>' + esc(t("admin.setStore")) + "</h2>" +
        field("setStoreName", "stStoreName", s.storeName) +
        field("setAddress", "stAddress", s.address) +
        field("setMapUrl", "stMapUrl", s.mapUrl, "ltr") + "</div>" +
      '<div class="card"><h2>' + esc(t("admin.setContact")) + "</h2>" +
        field("fieldWhatsapp", "stWhatsapp", s.whatsapp, "ltr", "whatsappHint") +
        '<a id="waTest" class="btn btn--ghost btn--sm" target="_blank" rel="noopener" href="https://wa.me/' + esc(s.whatsapp) + '">' + esc(t("admin.testWhatsapp")) + "</a>" +
        field("fieldWhatsapp2", "stWhatsapp2", s.whatsapp2, "ltr") +
        field("fieldEmail", "stEmail", s.email, "ltr") + "</div>" +
      '<div class="card"><h2>' + esc(t("admin.setSelling")) + "</h2>" +
        field("setOrderPrefix", "stPrefix", s.orderPrefix, "ltr", "setOrderPrefixHint") +
        field("setLowAt", "stLowAt", s.lowAt) +
        field("setFreeOver", "stFreeOver", s.freeOver) +
        '<label class="field"><span>' + esc(t("admin.setSoldOut")) + '</span><select id="stSoldOut">' +
          [["show", "soldOutShow"], ["hide", "soldOutHide"], ["preorder", "soldOutPreorder"]].map(([v, k]) =>
            '<option value="' + v + '"' + (s.soldOut === v ? " selected" : "") + ">" + esc(t("admin." + k)) + "</option>").join("") + "</select></label>" +
        '<h3 style="margin-block:var(--s-4) var(--s-2)">' + esc(t("admin.setDelivery")) + "</h3>" +
        '<p class="hint">' + esc(t("admin.setDeliveryHint")) + "</p>" +
        '<div class="two">' + GOVERNORATES.map(gov =>
          '<label class="field"><span>' + esc(t("admin.gov." + gov)) + '</span><input data-gov="' + gov + '" inputmode="decimal" placeholder="' +
          esc(t("admin.agreedLater")) + '" value="' + esc(s.deliveryPrices[gov] === null || s.deliveryPrices[gov] === undefined ? "" : s.deliveryPrices[gov]) + '"></label>').join("") + "</div></div>" +
      '<div class="card"><h2>' + esc(t("admin.setPayments")) + '</h2><p class="hint">' + esc(t("admin.setPaymentsHint")) + "</p>" +
        '<div class="table-wrap"><table class="grid"><tbody><tr><td>✓</td><td>' + esc(t("admin.pmCod")) + "</td><td>" + esc(t("admin.payUnpaid")) + "</td></tr></tbody></table></div></div>" +
      '<div class="card"><h2>' + esc(t("admin.setPaused")) + "</h2>" +
        '<label class="switch"><input type="checkbox" id="stPaused"' + (s.paused ? " checked" : "") + ">" + esc(t("admin.setPaused")) + "</label>" +
        '<label class="field"><span>' + esc(t("admin.setPauseMsg")) + '</span><textarea id="stPauseAr">' + esc((s.pauseMessage && s.pauseMessage.ar) || "") + "</textarea></label></div>" +
      '<div class="card"><button type="button" class="btn btn--primary" data-save-settings>' + esc(t("admin.save")) + "</button>" +
        ' <a class="btn btn--ghost" href="/api/admin?action=export" download="smarttech-export.json">' + esc(t("admin.exportAll")) + "</a></div>";
    qs("[data-save-settings]", screen).onclick = async () => {
      const delivery = {};
      qsa("[data-gov]", screen).forEach(input => { delivery[input.dataset.gov] = input.value.trim(); });
      try {
        const out = await api("settings", {
          body: {
            whatsapp: qs("#stWhatsapp").value, whatsapp2: qs("#stWhatsapp2").value, email: qs("#stEmail").value,
            orderPrefix: qs("#stPrefix").value, lowAt: qs("#stLowAt").value, freeOver: qs("#stFreeOver").value,
            soldOut: qs("#stSoldOut").value, delivery, paused: qs("#stPaused").checked, pauseAr: qs("#stPauseAr").value,
            storeName: qs("#stStoreName").value, address: qs("#stAddress").value, mapUrl: qs("#stMapUrl").value
          }
        });
        state.settings = out.settings;
        toast(esc(t("admin.setSaved")));
      } catch (e) { fail(e); }
    };
  }
  function field(labelKey, id, value, dir, hintKey) {
    return '<label class="field"><span>' + esc(t("admin." + labelKey)) + "</span>" +
      '<input id="' + id + '"' + (dir ? ' dir="' + dir + '"' : "") + ' value="' + esc(value == null ? "" : value) + '">' +
      (hintKey ? "<small>" + esc(t("admin." + hintKey)) + "</small>" : "") + "</label>";
  }

  /* ============================================================ CUSTOMERS */
  async function renderCustomers() {
    const screen = qs("#screen-customers");
    screen.innerHTML = '<div class="filters"><input type="search" class="search" id="cusSearch"></div><div id="cusList">' + skeleton(3) + "</div>";
    qs("#cusSearch").setAttribute("placeholder", t("admin.cusSearch"));
    const load = async () => {
      try {
        const data = await api("customers", { query: { q: qs("#cusSearch").value.trim() } });
        qs("#cusList").innerHTML = data.total
          ? '<div class="list">' + data.rows.map(row =>
              '<div class="item"><span class="wordmark">' + esc(String(row.name || "?").slice(0, 2)) + "</span>" +
              '<span class="item__main"><span class="item__name">' + bdi(row.name || t("admin.nothing")) + "</span>" +
              '<span class="item__meta">' + codeOf(row.phone) + " · " + bdi(row.city) + " · " + when(row.last, true) + "</span></span>" +
              '<span class="item__end"><span class="price">' + money(row.spent) + "</span>" +
              '<span class="small">' + esc(t("admin.cusOrders")) + " " + row.orders + "</span></span></div>").join("") + "</div>"
          : '<div class="empty"><p class="empty__text">' + esc(t("admin.cusEmpty")) + "</p></div>";
      } catch (e) { fail(e); }
    };
    qs("#cusSearch").addEventListener("input", debounce(load, 200));
    load();
  }

  /* ---------------------------------------------------------- the registry */
  const RENDER = {
    orders: renderOrders, customers: renderCustomers, products: renderProducts,
    taxonomy: renderTaxonomy, stock: renderStock, pricing: renderPricing, media: renderMedia,
    content: renderContent, reports: renderReports, users: renderUsers,
    backups: renderBackups, settings: renderSettings
  };
  doc.addEventListener("click", event => {
    const button = event.target.closest("[data-product]");
    if (button) openEditor(button.dataset.product);
  });

  /* ------------------------------------------------------------- helpers */
  /* The phone cards and the desktop table are two presentations of the same
     forty rows. Rendering both and hiding one with CSS doubles the node count
     and leaves an off-screen copy of every row in the document, which is the
     habit this rebuild exists to break. One is built, and the breakpoint
     decides which. */
  const isWide = () => window.matchMedia("(min-width: 960px)").matches;
  let wasWide = isWide();
  window.addEventListener("resize", debounce(() => {
    if (isWide() === wasWide) return;
    wasWide = isWide();
    show(state.screen);
  }, 200));

  function debounce(fn, ms) {
    let timer = 0;
    return function () { clearTimeout(timer); timer = setTimeout(() => fn.apply(this, arguments), ms); };
  }
  /* Waiting is a reserved box, never a spinner. */
  const skeleton = n => '<div class="list">' + Array(n).fill('<div class="item" aria-hidden="true"><span class="thumb"></span><span class="item__main"></span></div>').join("") + "</div>";
  function empty(key, filtered) {
    return '<div class="empty"><p class="empty__text">' + esc(t("admin." + key)) + "</p>" +
      (filtered ? '<button type="button" class="btn btn--secondary" data-clear-filters>' + esc(t("admin.clearFilters")) + "</button>" : "") + "</div>";
  }
  doc.addEventListener("click", event => {
    if (!event.target.closest("[data-clear-filters]")) return;
    if (state.screen === "products") {
      Object.assign(productFilters, { q: "", cat: "", brand: "", status: "", stock: "", img: "", offer: "", page: 1 });
      qs("#prdSearch").value = "";
      renderProducts();
    } else {
      Object.assign(orderFilters, { status: "open", pay: "all", q: "", page: 1, stuck: "" });
      qs("#ordSearch").value = "";
      renderOrders();
    }
  });
  function pager(selector, data, go) {
    const box = qs(selector);
    if (!box) return;
    if (data.pages <= 1) { box.innerHTML = '<span class="pager__info">' + esc(t("admin.resultCount", { n: data.total })) + "</span>"; return; }
    box.innerHTML =
      '<button type="button" class="btn btn--ghost btn--sm" data-page="' + (data.page - 1) + '"' + (data.page <= 1 ? " disabled" : "") + ">‹</button>" +
      '<span class="pager__info">' + t("admin.pageOf", { n: data.page, total: data.pages }) + "</span>" +
      '<button type="button" class="btn btn--ghost btn--sm" data-page="' + (data.page + 1) + '"' + (data.page >= data.pages ? " disabled" : "") + ">›</button>";
    qsa("[data-page]", box).forEach(button => { button.onclick = () => go(Number(button.dataset.page)); });
  }
  async function refreshCounts() {
    try {
      const data = await api("state");
      state.counts = data.counts;
      state.settings = data.settings;
      renderRail();
    } catch (e) { /* the screen still works */ }
  }

  /* ------------------------------------------------------------ keyboard */
  doc.addEventListener("keydown", event => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName);
    if (event.altKey && /^[1-5]$/.test(event.key)) {
      const target = SCREENS.filter(s => s.phone).sort((a, b) => a.phone - b.phone)[Number(event.key) - 1];
      if (target) { event.preventDefault(); show(target.id); }
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      const box = qs(".screen:not([hidden]) input[type=search]");
      if (box) box.focus();
      return;
    }
    if (event.key === "/" && !typing) {
      const box = qs(".screen:not([hidden]) input[type=search]");
      if (box) { event.preventDefault(); box.focus(); }
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      const next = qs("[data-save-next]");
      if (next) { event.preventDefault(); next.click(); }
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      // The browser's own save dialog is never what the owner meant.
      const save = qs("dialog[open] [data-save-product], dialog[open] [data-save-order], .screen:not([hidden]) [data-save-settings], .screen:not([hidden]) [data-save-content]");
      event.preventDefault();
      if (save) save.click();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "p") {
      if (qs("#order").open) { event.preventDefault(); window.print(); }
      return;
    }
    if (event.key === "?" && !typing) { event.preventDefault(); shortcutSheet(); return; }
    if (typing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const rows = qsa(".screen:not([hidden]) [data-order], .screen:not([hidden]) tr[data-row]");
      if (!rows.length) return;
      event.preventDefault();
      state.cursor = Math.max(0, Math.min(rows.length - 1, state.cursor + (event.key === "ArrowDown" ? 1 : -1)));
      rows.forEach(row => row.classList.remove("is-cursor"));
      rows[state.cursor].classList.add("is-cursor");
      rows[state.cursor].scrollIntoView({ block: "nearest" });
    }
    if (event.key === "Enter" && state.cursor >= 0) {
      const rows = qsa(".screen:not([hidden]) [data-order], .screen:not([hidden]) tr[data-row]");
      if (rows[state.cursor]) rows[state.cursor].click();
    }
    if (event.key === " " && state.cursor >= 0) {
      const box = qsa(".screen:not([hidden]) [data-pick-row]")[state.cursor];
      if (box) { event.preventDefault(); box.checked = !box.checked; box.onchange(); }
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a" && state.screen === "products") {
      event.preventDefault();
      state.rows.forEach(row => state.selection.add(row.id));
      qsa("[data-pick-row]").forEach(box => { box.checked = true; });
      drawSelectBar();
    }
    if (event.key === "Escape" && state.selection.size) { state.selection.clear(); loadProducts(); }
  });
  function shortcutSheet() {
    const rows = [["Alt+1…5", "kbdScreens"], ["/  ·  Ctrl+K", "kbdSearch"], ["↑ ↓", "kbdMove"], ["Enter", "kbdOpen"],
      ["Space", "kbdSelect"], ["Ctrl+A", "kbdAll"], ["Esc", "kbdEsc"], ["Ctrl+S", "kbdSave"],
      ["Ctrl+Enter", "kbdSaveNext"], ["Ctrl+P", "kbdPrint"], ["?", "kbdSheet"]];
    openSheet("sheet", t("admin.kbdTitle"), '<dl class="kv">' + rows.map(([keys, key]) =>
      "<dt>" + codeOf(keys) + "</dt><dd>" + esc(t("admin." + key)) + "</dd>").join("") + "</dl>");
  }
  qs("#helpBtn").onclick = shortcutSheet;
  qs("#railToggle").onclick = () => {
    const rail = qs("#rail");
    const narrow = rail.classList.toggle("is-narrow");
    qs("#railToggle").setAttribute("aria-expanded", String(!narrow));
    try { localStorage.setItem("smarttech_rail", narrow ? "1" : "0"); } catch (e) {}
  };

  /* ---------------------------------------------------------------- boot */
  async function boot() {
    let data;
    try { data = await api("state"); }
    catch (error) {
      if (error.message === "__auth") return;
      showLogin(explain(error));
      return;
    }
    state.user = data.user;
    state.settings = data.settings;
    state.counts = data.counts;
    qs("#loginView").hidden = true;
    qs("#adminView").hidden = false;
    try { if (localStorage.getItem("smarttech_rail") === "1") qs("#rail").classList.add("is-narrow"); } catch (e) {}
    await ensureTaxonomy().catch(() => {});
    renderRail();
    // Orders is the landing page after login. That is what he came for.
    const hash = (location.hash || "").slice(1);
    show(SCREENS.some(s => s.id === hash) ? hash : "orders");
    // The loudest thing in the console until the eleven answers are done.
    if (data.counts.policyHidden) {
      toast(esc(t("admin.cntHomeCard", { n: data.counts.policyFilled, total: data.counts.policyTotal })), {
        action: { label: t("admin.open"), run: () => show("content") }
      });
    }
  }

  I.apply();
  fillLanguages();
  boot();
})();
