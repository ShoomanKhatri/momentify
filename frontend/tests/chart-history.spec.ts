import { test, expect } from "@playwright/test";
import { buildChartHistory } from "../lib/chart-history";
import { GeckoHistoryClient, HistoryError, parseHistoryPage, SOL_MINT, USDC_MINT } from "../lib/gecko-history";

const pool = "Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE";
const now = Date.parse("2026-10-11T09:12:45.000Z");
const row = (time: number, close = 100) => [time, close, close + 1, close - 1, close, 20];
const body = (rows: number[][]) => ({
  meta: { base: { address: SOL_MINT }, quote: { address: USDC_MINT } },
  data: { attributes: { ohlcv_list: rows } },
});
const rows = (interval: number, count: number, end = Math.floor(now / 1000 / interval) * interval) =>
  Array.from({ length: count }, (_, index) => row(end - (index + 1) * interval));

test("1D requests five-minute candles, covers 24 hours, and warms chart EMAs before the visible range", async () => {
  let url!: URL;
  const client = new GeckoHistoryClient(undefined, async (input, options) => {
    url = new URL(String(input));
    expect(options?.headers).toEqual({ Accept: "application/json;version=20230203" });
    return Response.json(body(rows(300, 350)));
  }, () => now);
  const result = await client.get(pool, "1D");
  expect(url.pathname).toBe(`/api/v2/networks/solana/pools/${pool}/ohlcv/minute`);
  expect(Object.fromEntries(url.searchParams)).toEqual({ aggregate: "5", limit: "1000", before_timestamp: "1791709800", currency: "token", token: "base", include_empty_intervals: "false" });
  expect(result.candles).toHaveLength(288);
  expect(result.requestedFrom).toBe("2026-10-10T09:10:00.000Z");
  expect(result.availableTo).toBe("2026-10-11T09:10:00.000Z");
  expect(result.candles[0].ema21).toBe(100);
  expect(result.partial).toBe(false);
});

test("1W requests hourly candles covering seven days independently of the one-minute feed", async () => {
  let url!: URL;
  const client = new GeckoHistoryClient(undefined, async (input) => {
    url = new URL(String(input));
    return Response.json(body(rows(3600, 200)));
  }, () => now);
  const result = await client.get(pool, "1W");
  expect(url.pathname).toContain("/ohlcv/hour");
  expect(url.searchParams.get("aggregate")).toBe("1");
  expect(result.candles).toHaveLength(168);
  expect(result.intervalSeconds).toBe(3600);
  expect(result.availableFrom).toBe("2026-10-04T09:00:00.000Z");
  expect(result.availableTo).toBe("2026-10-11T09:00:00.000Z");
  expect(result.partial).toBe(false);
});

test("All requests daily candles at the provider maximum and preserves the returned historical range", async () => {
  let url!: URL;
  const client = new GeckoHistoryClient(undefined, async (input) => {
    url = new URL(String(input));
    return Response.json(body(rows(86_400, 184)));
  }, () => now);
  const result = await client.get(pool, "ALL");
  expect(url.pathname).toContain("/ohlcv/day");
  expect(url.searchParams.get("limit")).toBe("1000");
  expect(result.candles).toHaveLength(184);
  expect(result.requestedFrom).toBeNull();
  expect(Date.parse(result.availableTo!) - Date.parse(result.availableFrom!)).toBe(184 * 86_400_000);
});

test("paginates full historical pages using the oldest Unix timestamp without repeating boundary candles", async () => {
  const first = rows(86_400, 1000);
  const oldest = first.at(-1)![0];
  const requests: URL[] = [];
  const client = new GeckoHistoryClient(undefined, async (input) => {
    requests.push(new URL(String(input)));
    return Response.json(body(requests.length === 1 ? first : [row(oldest), row(oldest - 86_400), row(oldest - 2 * 86_400)]));
  }, () => now);
  const result = await client.get(pool, "ALL");
  expect(requests).toHaveLength(2);
  expect(requests[1].searchParams.get("before_timestamp")).toBe(String(oldest - 1));
  expect(result.candles).toHaveLength(1002);
  expect(new Set(result.candles.map((point) => point.time)).size).toBe(1002);
});

test("normalizes Unix seconds, sorting and duplicates while excluding unfinished and future candles", () => {
  const end = Math.floor(now / 1000 / 300) * 300;
  const result = parseHistoryPage(body([row(end), row(end - 300), row(end + 300), row(end - 600), row(end - 300)]), 300, now);
  expect(result.candles.map((point) => point.time)).toEqual([end - 600, end - 300]);
  const history = buildChartHistory(result.candles, "1D", now);
  expect(history.candles.at(-1)?.timestamp).toBe("2026-10-11T09:05:00.000Z");
  expect(history.availableTo).toBe("2026-10-11T09:10:00.000Z");
});

test("rejects milliseconds, non-aligned timestamps, invalid OHLCV and mismatched quote metadata", () => {
  const time = Math.floor(now / 1000 / 300) * 300 - 300;
  for (const bad of [row(time * 1000), row(time + 1), [time, 100, 99, 98, 100, 20], [time, 100, 101, 99, 100, -1]])
    expect(() => parseHistoryPage(body([bad]), 300, now)).toThrow(HistoryError);
  const wrong = body([row(time)]);
  wrong.meta.quote.address = SOL_MINT;
  expect(() => parseHistoryPage(wrong, 300, now)).toThrow(/verified SOL\/USDC/);
  expect(() => parseHistoryPage(body([row(time, 100), row(time, 101)]), 300, now)).toThrow(/conflicting/);
});

test("reports missing history and gaps without creating candles and resets display EMAs after gaps", () => {
  const input = parseHistoryPage(body(rows(300, 60).filter((_, index) => index !== 30)), 300, now);
  const history = buildChartHistory(input.candles, "1D", now);
  expect(history.candles).toHaveLength(59);
  expect(history.partial).toBe(true);
  expect(history.hasGaps).toBe(true);
  expect(history.availableFrom).toBe(history.candles[0].timestamp);
  const gap = history.candles.findIndex((point, index, points) => index > 0 && point.time - points[index - 1].time !== 300);
  expect(history.candles[gap].ema9).toBeNull();
  expect(history.candles[gap + 7].ema9).toBeNull();
  expect(history.candles[gap + 8].ema9).toBe(100);
});

test("empty provider history remains empty with no synthetic data", async () => {
  const client = new GeckoHistoryClient(undefined, async () => Response.json(body([])), () => now);
  const result = await client.get(pool, "1W");
  expect(result.candles).toEqual([]);
  expect(result.availableFrom).toBeNull();
  expect(result.availableTo).toBeNull();
  expect(result.partial).toBe(true);
});

test("deduplicates concurrent fetches, caches each timeframe separately and refreshes at candle boundaries", async () => {
  let current = now;
  let calls = 0;
  const client = new GeckoHistoryClient(undefined, async (input) => {
    calls++;
    const interval = String(input).includes("/hour?") ? 3600 : 300;
    return Response.json(body(rows(interval, 300)));
  }, () => current);
  await Promise.all([client.get(pool, "1D"), client.get(pool, "1D")]);
  await client.get(pool, "1D");
  expect(calls).toBe(1);
  await client.get(pool, "1W");
  expect(calls).toBe(2);
  current = Date.parse("2026-10-11T09:15:00Z");
  await client.get(pool, "1D");
  expect(calls).toBe(3);
  await client.get(pool, "1W");
  expect(calls).toBe(3);
});

test("honors provider Retry-After and serves only matching cached history on refresh failure", async () => {
  let current = now;
  let calls = 0;
  const client = new GeckoHistoryClient(undefined, async () => {
    calls++;
    return calls === 1 ? Response.json(body(rows(300, 300))) : Response.json({}, { status: 429, headers: { "Retry-After": "120" } });
  }, () => current);
  const initial = await client.get(pool, "1D");
  current += 300_000;
  const stale = await client.get(pool, "1D");
  expect(stale.status).toBe("stale");
  expect(stale.candles).toEqual(initial.candles);
  expect(stale.message).toMatch(/rate limiting/);
  await expect(client.get(pool, "1W")).rejects.toMatchObject({ status: 429, retryAfter: 120 });
  expect(calls).toBe(2);
});

test("limits historical requests to six per minute leaving headroom for the backend strategy feed", async () => {
  let calls = 0;
  const client = new GeckoHistoryClient(undefined, async () => { calls++; return Response.json(body([])); }, () => now);
  for (let index = 0; index < 6; index++) await client.get(String(index + 1).repeat(32), "ALL");
  await expect(client.get("7".repeat(32), "ALL")).rejects.toMatchObject({ status: 429 });
  expect(calls).toBe(6);
});

test("invalid timeframe is rejected by the chart route before contacting providers", async ({ request }) => {
  const response = await request.get(`/api/market/history?range=1M&pool=${pool}`);
  expect(response.status()).toBe(400);
});
