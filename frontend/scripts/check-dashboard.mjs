import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";

// Read-only live smoke check: no fixtures, strategy changes or order requests.
const baseURL = (process.env.MOMENTIFY_URL ?? "http://127.0.0.1:3000").replace(
  /\/$/,
  "",
);
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const dashboardResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/dashboard" && response.ok(),
  );
  await page.goto(baseURL);
  const dashboard = await (await dashboardResponse).json();
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Backend connected", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: /SOL\/USDC price/ }),
  ).toBeVisible();
  await expect(page.getByLabel("Loading workspace")).toHaveCount(0);
  assert.equal(dashboard.health.paperTrading, true);
  assert.equal(dashboard.health.liveTradingEnabled, false);
  for (const source of ["helius", "geckoTerminal", "dexScreener"])
    assert.equal(
      dashboard.health[source].status,
      "live",
      `${source} must be live for this smoke check`,
    );
  assert.equal(dashboard.market.quoteCurrency, "USDC");
  assert.equal(dashboard.market.pool.network, "solana");
  assert.ok(Number.isFinite(dashboard.market.price));
  assert.ok(dashboard.market.candles.length >= 22);
  dashboard.market.candles.forEach((candle, index, candles) => {
    assert.ok(
      (candle.time + 60) * 1000 <= Date.now(),
      "Never chart an incomplete candle",
    );
    if (index) assert.ok(candle.time > candles[index - 1].time);
  });
  const latest = dashboard.market.candles.at(-1);
  if (
    dashboard.strategy.config.fastPeriod === 9 &&
    dashboard.strategy.config.slowPeriod === 21
  ) {
    assert.equal(dashboard.strategy.fastEma, latest.ema9);
    assert.equal(dashboard.strategy.slowEma, latest.ema21);
  }
  await expect(page.locator(".system-status")).toContainText(
    "Solana RPCHealthy",
  );
  await expect(page.locator(".chart svg path")).not.toHaveCount(0);
  await page.getByRole("img", { name: /SOL\/USDC price/ }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".chart-tooltip")).toContainText("EMA 9");
  await page.screenshot({
    path: "/tmp/momentify-overview-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 375, height: 900 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: "/tmp/momentify-overview-mobile.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    `Live dashboard verified at ${baseURL}: ${dashboard.market.candles.length} completed candles, EMA overlays, pool ${dashboard.market.pool.address}, RPC slot ${dashboard.health.helius.slot}, responsive desktop/mobile and no runtime errors.`,
  );
} finally {
  await browser.close();
}
