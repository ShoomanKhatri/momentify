import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type {
  DashboardSnapshot,
  MarketSnapshot,
  StrategySnapshot,
  Trade,
} from "../lib/models";

// These fixtures are confined to browser tests and are never imported by the app.
async function provideApi(
  page: Page,
  options: {
    stale?: boolean;
    staleSignal?: boolean;
    trades?: Trade[];
    emptyMarkets?: boolean;
    geckoUnavailable?: boolean;
  } = {},
) {
  const now = new Date().toISOString();
  const market: MarketSnapshot = {
    symbol: "SOL",
    name: "Solana",
    pair: "SOL-USDC",
    source: "DexScreener",
    candleSource: "GeckoTerminal",
    quoteCurrency: "USDC",
    volumeCurrency: "USD",
    candleVolumeCurrency: "USDC",
    quoteTimestampKind: "fetched",
    pool: null,
    liquidityUsd: 1000000,
    quoteStatus: options.stale ? "stale" : "live",
    candleStatus: options.geckoUnavailable
      ? "unavailable"
      : options.stale
        ? "stale"
        : "live",
    candleUpdatedAt: now,
    status: options.geckoUnavailable
      ? "unavailable"
      : options.stale
        ? "stale"
        : "live",
    price: 100,
    change24h: null,
    volume24h: 200,
    quoteAt: now,
    updatedAt: now,
    candleIntervalSeconds: 60,
    candles: options.geckoUnavailable
      ? []
      : Array.from({ length: 30 }, (_, i) => {
          const time = Math.floor(Date.now() / 60_000) * 60 - (30 - i) * 60;
          return {
            time,
            timestamp: new Date(time * 1000).toISOString(),
            open: 100,
            high: 101,
            low: 99,
            close: 100,
            volume: 20,
            ema9: i >= 8 ? 100 : null,
            ema21: i >= 20 ? 100 : null,
          };
        }),
    message: options.geckoUnavailable
      ? "GeckoTerminal market data unavailable"
      : options.stale
        ? "Waiting for a fresh market quote"
        : null,
  };
  let strategy: StrategySnapshot = {
    config: {
      fastPeriod: 9,
      slowPeriod: 21,
      positionSizePercent: 10,
      maxDailyLossPercent: 5,
      stopLossPercent: 3,
      takeProfitPercent: 6,
    },
    enabled: false,
    lastProcessedCandleAt: null,
    status: "paused",
    startedAt: null,
    lastEvaluatedAt: null,
    message: null,
    signal: options.stale ? null : "HOLD",
    fastEma: 100,
    slowEma: 99,
    candleAt: options.staleSignal
      ? new Date(Date.now() - 180_000).toISOString()
      : now,
    ready: !options.stale && !options.geckoUnavailable,
  };
  const trades = options.trades ?? [];
  const dashboard = (): DashboardSnapshot => ({
    health: {
      status: "ok",
      mode: "paper",
      backend: "connected",
      paperTrading: true,
      liveTradingEnabled: false,
      helius: {
        status: "live",
        slot: 400000000,
        network: "solana-mainnet",
        networkHealth: "ok",
        checkedAt: now,
        lastSuccessAt: now,
        message: null,
      },
      geckoTerminal: {
        status: market.candleStatus,
        checkedAt: now,
        lastSuccessAt: now,
        message: null,
      },
      dexScreener: {
        status: market.quoteStatus,
        checkedAt: now,
        lastSuccessAt: now,
        message: null,
      },
      lastSuccessfulRefresh: now,
      serverTime: now,
    },
    market,
    strategy,
    portfolio: {
      initialBalance: 1000,
      cash: 1000,
      equity: 1000,
      totalPnl: 0,
      totalPnlPercent: 0,
      realizedPnl: 0,
      unrealizedPnl: 0,
      feesPaid: 0,
      slippagePaid: 0,
      position: null,
      equityHistory: [
        {
          timestamp: new Date(Date.now() - 60_000).toISOString(),
          equity: 1000,
        },
        { timestamp: now, equity: 1000 },
      ],
      updatedAt: now,
    },
    recentTrades: trades.slice(0, 5),
    settings: {
      mode: "paper",
      currency: "USDC",
      marketSource: "DexScreener / GeckoTerminal",
      pair: "SOL-USDC",
      candleIntervalSeconds: 60,
      pollIntervalMs: 15_000,
      feeBps: 25,
      slippageBps: 10,
      persistence: "SQLite",
      initialBalance: 1000,
      maxOpenPositions: 1,
    },
    serverTime: now,
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/strategy/config")
      strategy = { ...strategy, config: route.request().postDataJSON() };
    if (path === "/api/strategy/status")
      strategy = {
        ...strategy,
        status: route.request().postDataJSON().running ? "running" : "paused",
      };
    const responses: Record<string, unknown> = {
      "/api/dashboard": dashboard(),
      "/api/strategy": strategy,
      "/api/strategy/config": strategy,
      "/api/strategy/status": strategy,
      "/api/markets": { markets: options.emptyMarkets ? [] : [market] },
      "/api/trades": (() => {
        const params = new URL(route.request().url()).searchParams;
        const filtered = trades.filter(
          (trade) => !params.get("side") || trade.side === params.get("side"),
        );
        const page = Number(params.get("page") ?? 1);
        return {
          trades: filtered.slice((page - 1) * 25, page * 25),
          page,
          limit: 25,
          total: filtered.length,
          totalPages: Math.ceil(filtered.length / 25),
        };
      })(),
      "/api/settings": dashboard().settings,
    };
    await route.fulfill({
      json: responses[path] ?? { message: "Unknown test endpoint" },
      status: responses[path] ? 200 : 404,
    });
  });
  return {
    updateStrategy(update: Partial<StrategySnapshot>) {
      strategy = { ...strategy, ...update };
    },
  };
}

for (const width of [375, 768, 1280]) {
  for (const route of [
    { path: "/", title: "Overview" },
    { path: "/markets", title: "Markets" },
    { path: "/strategy", title: "Strategy" },
    { path: "/trades", title: "Trades" },
    { path: "/settings", title: "Settings" },
  ]) {
    test(`${route.title} is responsive and accessible at ${width}px`, async ({
      page,
    }) => {
      await provideApi(page);
      await page.setViewportSize({ width, height: 900 });
      await page.goto(route.path);
      await expect(
        page.getByRole("heading", { name: route.title, exact: true }),
      ).toBeVisible();
      await expect(page.getByLabel("Loading workspace")).toHaveCount(0);
      await expect(
        page.getByRole("status", { name: "Backend connected", exact: true }),
      ).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(
        result.violations.map(({ id, nodes }) => ({
          id,
          targets: nodes.map(({ target }) => target),
        })),
      ).toEqual([]);
    });
  }
}

test("validates strategy input and preserves successful save feedback", async ({
  page,
}) => {
  await provideApi(page);
  await page.goto("/strategy");
  await page.getByLabel("Fast EMA").fill("21");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByText("Fast EMA must be below slow EMA."),
  ).toBeVisible();
  await expect(page.getByLabel("Fast EMA")).toBeFocused();
  await page.getByLabel("Fast EMA").fill("9");
  await page.getByLabel("Position size").fill("12");
  const saved = page.waitForRequest(
    (request) =>
      request.url().endsWith("/api/strategy/config") &&
      request.method() === "PATCH",
  );
  await page.getByRole("button", { name: "Save changes" }).click();
  expect((await saved).postDataJSON().positionSizePercent).toBe(12);
  await expect(page.getByText("Strategy saved.")).toBeVisible();
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByText("Strategy saved.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save changes" }),
  ).toBeDisabled();
});

test("confirms bot actions and restores keyboard focus on Escape", async ({
  page,
}) => {
  await provideApi(page);
  await page.goto("/");
  const start = page
    .getByRole("button", { name: "Start bot", exact: true })
    .first();
  await start.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(start).toBeFocused();
  await start.click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Start bot" })
    .click();
  await expect(
    page.getByRole("button", { name: "Pause bot", exact: true }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Pause bot", exact: true })
    .first()
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Pause bot" })
    .click();
  await expect(
    page.getByRole("button", { name: "Start bot", exact: true }).first(),
  ).toBeVisible();
});

test("refreshes pristine settings and preserves drafts when saved values change", async ({
  page,
}) => {
  const backend = await provideApi(page);
  await page.goto("/strategy");
  const positionSize = page.getByLabel("Position size");
  await expect(positionSize).toHaveValue("10");
  const config = {
    fastPeriod: 10,
    slowPeriod: 21,
    positionSizePercent: 15,
    maxDailyLossPercent: 5,
    stopLossPercent: 3,
    takeProfitPercent: 6,
  };
  backend.updateStrategy({ config });
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByLabel("Fast EMA")).toHaveValue("10");
  await expect(positionSize).toHaveValue("15");
  await expect(
    page.getByRole("button", { name: "Save changes" }),
  ).toBeDisabled();
  await positionSize.fill("12");
  backend.updateStrategy({ config: { ...config, positionSizePercent: 20 } });
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(
    page.getByText("Saved settings changed. Your edits are preserved."),
  ).toBeVisible();
  await expect(positionSize).toHaveValue("12");
  await expect(
    page.getByRole("button", { name: "Save changes" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Use saved values" }).click();
  await expect(positionSize).toHaveValue("20");
  await expect(
    page.getByText("Saved settings changed. Your edits are preserved."),
  ).toHaveCount(0);
});

test("hides stale candle signals while keeping fresh quotes visible", async ({
  page,
}) => {
  await provideApi(page, { staleSignal: true });
  await page.goto("/");
  await expect(
    page
      .locator(".metric")
      .filter({ hasText: "SOL/USDC price" })
      .locator(".metric-value"),
  ).toHaveText("$100.00");
  await expect(page.locator(".summary-signal")).toContainText("Unavailable");
  await expect(
    page.locator(".summary-list").getByText("$100.00", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Start bot", exact: true }).first(),
  ).toBeDisabled();
});

test("blocks a confirmed start when data expires with the dialog open", async ({
  page,
}) => {
  await provideApi(page);
  await page.clock.install();
  await page.goto("/settings");
  await page.getByLabel("Data refresh").selectOption("0");
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await page
    .getByRole("button", { name: "Start bot", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Start bot" })).toBeEnabled();
  await page.clock.fastForward(185_000);
  await expect(
    dialog.getByRole("button", { name: "Start bot" }),
  ).toBeDisabled();
  await expect(
    dialog.getByText("Waiting for fresh market data and completed candles."),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).not.toBeVisible();
});

test("suppresses stale prices and disables new bot starts", async ({
  page,
}) => {
  await provideApi(page, { stale: true });
  await page.goto("/");
  await expect(
    page.getByText("Waiting for a fresh market quote"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start bot", exact: true }).first(),
  ).toBeDisabled();
  await expect(
    page
      .locator(".metric")
      .filter({ hasText: "SOL/USDC price" })
      .locator(".metric-value"),
  ).toHaveText("—");
});

test("supports keyboard inspection of completed candle prices and EMA overlays", async ({
  page,
}) => {
  await provideApi(page);
  await page.goto("/");
  const chart = page.getByRole("img", { name: /SOL\/USDC price/ });
  await chart.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".chart-tooltip")).toContainText("$100.00");
  await page.getByRole("button", { name: "1D", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "1D", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("shows market empty states and updates table sort semantics", async ({
  page,
}) => {
  await provideApi(page);
  await page.goto("/markets");
  await page.getByRole("button", { name: "Price", exact: true }).click();
  await expect(
    page.getByRole("columnheader", { name: "Price", exact: true }),
  ).toHaveAttribute("aria-sort", "descending");
  await page.getByRole("button", { name: "Price", exact: true }).click();
  await expect(
    page.getByRole("columnheader", { name: "Price", exact: true }),
  ).toHaveAttribute("aria-sort", "ascending");
  await page.unroute("**/api/**");
  await provideApi(page, { emptyMarkets: true });
  await page.reload();
  await expect(page.getByText("No markets available")).toBeVisible();
});

test("expires cached quotes when manual refresh is selected", async ({
  page,
}) => {
  await provideApi(page);
  await page.clock.install();
  await page.goto("/settings");
  await page.getByLabel("Data refresh").selectOption("0");
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  const quote = page
    .locator(".metric")
    .filter({ hasText: "SOL/USDC price" })
    .locator(".metric-value");
  await expect(quote).toHaveText("$100.00");
  await page.clock.fastForward(185_000);
  await expect(quote).toHaveText("—");
  await expect(page.locator(".system-status")).toContainText(
    "Market dataStale",
  );
  await expect(
    page.getByRole("button", { name: "Start bot", exact: true }).first(),
  ).toBeDisabled();
});

test("filters filled trades and shows net realized PnL", async ({ page }) => {
  const now = new Date().toISOString();
  const base: Trade = {
    id: "test-buy",
    timestamp: now,
    symbol: "SOL",
    side: "BUY",
    price: 100,
    referencePrice: 99.9,
    quantity: 1,
    fee: 0.25,
    slippage: 0.1,
    status: "FILLED",
    realizedPnl: null,
    reason: "EMA_CROSSOVER",
    candleAt: now,
  };
  await provideApi(page, {
    trades: [
      base,
      {
        ...base,
        id: "test-sell",
        side: "SELL",
        price: 101,
        realizedPnl: 0.4975,
      },
    ],
  });
  await page.goto("/trades");
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await page.getByRole("button", { name: "Sells", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText("$0.50");
  await expect(page.locator("tbody")).toContainText("Filled");
});

test("shows loading and recovers from API errors without refreshing the page", async ({
  page,
}) => {
  await provideApi(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/dashboard", async (route) => {
    await gate;
    await route.fulfill({
      status: 503,
      json: { message: "Backend unavailable. Try again." },
    });
  });
  await page.goto("/");
  await expect(page.getByLabel("Loading workspace")).toBeVisible();
  await expect(page.locator("header .connection")).toHaveCount(0);
  release();
  await expect(
    page.getByRole("alert").filter({ hasText: "Backend unavailable" }),
  ).toContainText("Backend unavailable. Try again.");
  await expect(page.getByRole("status", { name: "Backend offline" })).toHaveCount(0);
  await page.setViewportSize({ width: 375, height: 900 });
  await expect(page.getByRole("status", { name: "Backend offline" })).toHaveCount(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
  await page.unroute("**/api/dashboard");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.locator(".metric-grid")).toBeVisible();
  await expect(page.locator("header .connection")).toHaveCount(0);
});

test("shows invalid API responses and recovers on retry", async ({ page }) => {
  await provideApi(page);
  await page.route("**/api/trades", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<html>Upstream unavailable</html>",
    }),
  );
  await page.goto("/trades");
  await expect(
    page.getByRole("alert").filter({ hasText: "Could not load this view" }),
  ).toContainText("Backend returned an invalid response. Try again.");
  await page.unroute("**/api/trades");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("No paper trades yet.")).toBeVisible();
});

test("times out stalled requests and can retry successfully", async ({
  page,
}) => {
  test.setTimeout(45_000);
  await provideApi(page);
  let release!: () => void;
  const stalled = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/trades", async (route) => {
    await stalled;
    await route.abort().catch(() => {});
  });
  await page.goto("/trades");
  try {
    await expect(
      page.getByRole("alert").filter({ hasText: "Could not load this view" }),
    ).toContainText("The request timed out. Try again.", { timeout: 35_000 });
  } finally {
    release();
  }
  await page.unroute("**/api/trades");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("No paper trades yet.")).toBeVisible();
});

test("proxy rejects cross-origin strategy changes", async ({ request }) => {
  const response = await request.patch("/api/strategy/status", {
    headers: { Origin: "https://external.example" },
    data: { running: false },
  });
  expect(response.status()).toBe(403);
});

test("proxy accepts the incoming host for valid same-origin requests", async ({
  request,
  baseURL,
}) => {
  const response = await request.patch("/api/strategy/status", {
    headers: { Origin: baseURL! },
    data: { running: "invalid" },
  });
  // The test server deliberately has no upstream API; a valid origin reaches
  // request handling and produces an unavailable response instead of a 403.
  expect(response.status()).toBe(503);
});

test("keeps backend and quotes connected when GeckoTerminal is unavailable", async ({
  page,
}) => {
  await provideApi(page, { geckoUnavailable: true });
  await page.goto("/");
  await expect(page.locator("header .connection")).toHaveCount(0);
  await expect(page.locator(".system-status")).toContainText("Backend APIConnected");
  await expect(
    page.getByText("GeckoTerminal market data unavailable", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("No completed candles available", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator(".metric")
      .filter({ hasText: "SOL/USDC price" })
      .locator(".metric-value"),
  ).toHaveText("$100.00");
  await expect(
    page
      .locator(".metric")
      .filter({ hasText: "Bot status" })
      .locator(".metric-value"),
  ).toHaveText("Stopped");
  await expect(
    page.getByText("No paper trades yet.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".system-status")).toContainText(
    "Market dataUnavailable",
  );
  await expect(
    page.getByRole("button", { name: "Start bot", exact: true }),
  ).toBeDisabled();
});

test("shares one overview query across the header and dashboard", async ({
  page,
}) => {
  await provideApi(page);
  let dashboardRequests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/dashboard")
      dashboardRequests++;
  });
  await page.goto("/");
  await expect(page.locator(".system-status")).toBeVisible();
  expect(dashboardRequests).toBe(1);
  await expect(
    page
      .locator(".metric")
      .filter({ hasText: "Portfolio equity" })
      .locator(".metric-value"),
  ).toHaveText("$1,000.00");
  await expect(
    page
      .locator(".metric")
      .filter({ hasText: "Total PnL" })
      .locator(".metric-value"),
  ).toHaveText("$0.00");
});

test("paginates trade history on the backend and shows only five recent fills", async ({
  page,
}) => {
  const trades: Trade[] = Array.from({ length: 51 }, (_, i) => ({
    id: `fill-${i}`,
    timestamp: new Date(Date.now() - i * 60000).toISOString(),
    symbol: "SOL",
    side: "BUY",
    price: 100,
    referencePrice: 100,
    quantity: 1,
    fee: 0.25,
    slippage: 0.1,
    status: "FILLED",
    realizedPnl: null,
    reason: "EMA_CROSSOVER",
    candleAt: null,
  }));
  await provideApi(page, { trades });
  await page.goto("/");
  await expect(page.locator("tbody tr:visible")).toHaveCount(5);
  await page.getByRole("link", { name: "View all trades" }).click();
  await expect(page.locator("tbody tr:visible")).toHaveCount(25);
  await expect(page.getByText("Page 1 of 3")).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Page 2 of 3")).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.locator("tbody tr:visible")).toHaveCount(1);
});
