/*
 * The whole cash-on-delivery path, as a customer and the owner live it:
 *
 *   search → product page → add to basket → /checkout → order written to the store →
 *   receipt → the owner moves the order on → /track by number + phone →
 *   the receipt shows the owner's step.
 */
import { test, expect } from "@playwright/test";
import { E2E, storedOrder, adminCookie, admin, setDelivery } from "./helpers.mjs";

const PRODUCT = 35141;          // Anker Prime Power Bank, in stock in the catalogue
const PRICE = 229.99;
const PHONE_TYPED = "0949 951 985";
const PHONE_STORED = "+963949951985";

test.describe.configure({ mode: "serial" });

let ref = "";
let cookie = "";

test.beforeAll(async ({ request }) => {
  cookie = await adminCookie(request);
  /* Aleppo has a price, Hama is left empty (to be agreed), and free delivery
     starts above anything this basket reaches. */
  await setDelivery(request, cookie, { "sy-aleppo": 3, "sy-hama": "" }, 1000);
});

test("browse → add to basket → COD checkout → order in the store", async ({ page }) => {
  /* Browse: the shop's own search, then the product's card. */
  await page.goto("/?q=" + encodeURIComponent("Prime Power Bank") + "&lang=en");
  const card = page.locator('.pcard[data-product="' + PRODUCT + '"] .pcard__hit');
  await expect(card).toBeVisible();
  await card.click();
  await page.waitForURL(new RegExp("/p/" + PRODUCT));
  await page.locator(".pdp__actions [data-add]").first().click();

  await page.goto("/checkout?lang=en");
  await expect(page.locator("[data-goods]")).toContainText(String(PRICE));

  await page.fill("#co-phone", PHONE_TYPED);
  await page.fill("#co-name", "E2E Customer");
  /* No price for Hama: the checkout keeps the honest expression. */
  await page.selectOption("#co-city", "sy-hama");
  await expect(page.locator("[data-grand]")).toContainText("+");
  /* Aleppo has one: the delivery line and the total become figures. */
  await page.selectOption("#co-city", "sy-aleppo");
  await expect(page.locator("[data-deliv]")).toContainText("3.00");
  await expect(page.locator("[data-grand]")).toContainText("232.99");
  await page.fill("#co-address", "Al-Jamiliyeh, building 4, floor 2");

  await page.locator("[data-submit]").click();
  await page.waitForURL(/\/o\/[A-Z]{2,8}-\d{6}-\d{3}-[0-9a-f]{6}/);
  ref = /\/o\/([A-Z]{2,8}-\d{6}-\d{3})-/.exec(page.url())[1];

  /* The receipt the customer lands on. */
  await expect(page.locator("h1").first()).toBeVisible();
  await expect(page.locator("[data-status]")).toHaveAttribute("data-status", "new");
  await expect(page.locator("body")).toContainText(ref);

  /* And the record itself. */
  const order = storedOrder(ref);
  expect(order, "order blob written").not.toBeNull();
  expect(order.status).toBe("new");
  expect(order.payment.method).toBe("cod");
  expect(order.customer.phone).toBe(PHONE_STORED);
  expect(order.customer.city).toBe("sy-aleppo");
  expect(order.lines.map(l => [l.pid, l.qty, l.unit])).toEqual([[PRODUCT, 1, PRICE]]);
  expect(order.totals.items).toBe(PRICE);
  expect(order.totals.delivery).toBe(3);
  expect(order.delivery.fee).toBe(3);
  expect(order.totals.grand).toBe(232.99);
});

test("the owner moves the order on → tracking reflects it", async ({ page, request }) => {
  expect(ref, "previous test placed an order").not.toBe("");

  for (const status of ["confirmed", "packed", "shipped"]) {
    const out = await admin(request, cookie, "order-status", { no: ref, status });
    expect(out.status, status + ": " + JSON.stringify(out.json)).toBe(200);
  }
  expect(storedOrder(ref).status).toBe("shipped");

  /* A customer who lost the link: number + phone, typed loosely. */
  await page.goto("/track?lang=en");
  await page.fill("input[name=ref]", ref.toLowerCase());
  await page.fill("input[name=phone]", "+963 949 951 985");
  await page.locator("#track button[type=submit]").click();
  await page.waitForURL(new RegExp("/o/" + ref + "-"));

  const card = page.locator("[data-status]");
  await expect(card).toHaveAttribute("data-status", "shipped");
  await expect(card.locator("[aria-current=step]")).toContainText("Out for delivery");
  await expect(card.locator(".step.is-done")).toHaveCount(4);
});

test("a wrong phone is refused without saying whether the order exists", async ({ page, request }) => {
  await page.goto("/track?lang=en");
  await page.fill("input[name=ref]", ref);
  await page.fill("input[name=phone]", "0933 000 000");
  await page.locator("#track button[type=submit]").click();
  await expect(page.locator("#err")).toContainText("found no order");
  expect(page.url()).toContain("/track");

  const wrongPhone = await request.post("/api/track", { data: { ref, phone: "0933000000" } });
  const noSuchOrder = await request.post("/api/track", { data: { ref: "SY-991231-999", phone: "0949951985" } });
  expect(wrongPhone.status()).toBe(404);
  expect(noSuchOrder.status()).toBe(404);
  expect(await wrongPhone.json()).toEqual(await noSuchOrder.json());
});

test("tracking works without JavaScript", async ({ request }) => {
  const res = await request.post("/api/track", {
    form: { ref, phone: PHONE_TYPED, lang: "ar" }, maxRedirects: 0
  });
  expect(res.status()).toBe(303);
  expect(res.headers()["location"]).toMatch(new RegExp("^/o/" + ref + "-[0-9a-f]{6}\\?lang=ar$"));
});

test("tracking is rate limited", async ({ request }) => {
  let last = null;
  for (let i = 0; i < 12 && (!last || last.status() !== 429); i++) {
    last = await request.post("/api/track", { data: { ref, phone: "09330000" + String(i).padStart(2, "0") } });
  }
  expect(last.status()).toBe(429);
  expect(Number(last.headers()["retry-after"])).toBeGreaterThan(0);
});
