import assert from "node:assert/strict";

const baseURL = (process.env.MOMENTIFY_URL ?? "http://127.0.0.1:3000").replace(
  /\/$/,
  "",
);
const paths = [
  "health",
  "dashboard",
  "markets",
  "market/candles",
  "strategy",
  "trades",
  "settings",
  "portfolio/history",
];
const results = await Promise.all(
  paths.map(async (path) => {
    const response = await fetch(`${baseURL}/api/${path}`, {
      signal: AbortSignal.timeout(15_000),
    });
    assert.equal(
      response.status,
      200,
      `${path}: expected a successful API response`,
    );
    return [path, await response.json()];
  }),
);
const data = Object.fromEntries(results);
assert.equal(data.health.mode, "paper");
assert.equal(data.health.paperTrading, true);
assert.equal(data.health.liveTradingEnabled, false);
assert.equal(data.dashboard.market.pair, "SOL-USDC");
assert.ok(Array.isArray(data["market/candles"].candles));
assert.ok(Array.isArray(data["portfolio/history"].history));
assert.ok(Number.isInteger(data.trades.total));
assert.equal(data.settings.mode, "paper");
assert.equal(data.dashboard.settings.mode, "paper");
assert.ok(Array.isArray(data.markets.markets));
assert.ok(Array.isArray(data.trades.trades));
assert.ok(["running", "paused"].includes(data.strategy.status));
assert.ok(
  data.dashboard.portfolio.equity === null ||
    Number.isFinite(data.dashboard.portfolio.equity),
);
console.log(
  `Verified ${paths.length} real NestJS endpoints through ${baseURL}. Market: ${data.dashboard.market.status}; strategy: ${data.strategy.status}.`,
);
