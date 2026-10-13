import type { Candle } from "./models";
import { buildChartHistory, chartRanges, type ChartHistory, type ChartRange } from "./chart-history";

export const SOL_MINT = "So11111111111111111111111111111111111111112";
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const PAGE_SIZE = 1000;

export class HistoryError extends Error {
  constructor(message: string, readonly status = 502, readonly retryAfter = 0) {
    super(message);
  }
}

function record(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new HistoryError("GeckoTerminal returned invalid historical data.");
  return input as Record<string, unknown>;
}

export function parseHistoryPage(input: unknown, interval: number, now: number) {
  const body = record(input);
  const meta = record(body.meta);
  if (record(meta.base).address !== SOL_MINT || record(meta.quote).address !== USDC_MINT)
    throw new HistoryError("Historical prices do not match the verified SOL/USDC pool.");
  const rows = record(record(body.data).attributes).ohlcv_list;
  if (!Array.isArray(rows) || rows.length > PAGE_SIZE)
    throw new HistoryError("GeckoTerminal returned invalid historical data.");
  const data = new Map<number, Candle>();
  let oldest: number | null = null;
  for (const row of rows) {
    if (!Array.isArray(row) || row.length !== 6 || row.some((value) => typeof value !== "number" || !Number.isFinite(value)))
      throw new HistoryError("GeckoTerminal returned invalid historical data.");
    const [time, open, high, low, close, volume] = row as number[];
    // The provider uses candle OPEN timestamps in Unix seconds, never milliseconds.
    if (!Number.isInteger(time) || time < 0 || time > 10_000_000_000 || time % interval !== 0 ||
      Math.min(open, high, low, close) <= 0 || volume < 0 || high < Math.max(open, close, low) || low > Math.min(open, close))
      throw new HistoryError("GeckoTerminal returned invalid candle values or timestamps.");
    oldest = oldest === null ? time : Math.min(oldest, time);
    if ((time + interval) * 1000 > now) continue;
    const candle = { time, open, high, low, close, volume };
    const previous = data.get(time);
    if (previous && JSON.stringify(previous) !== JSON.stringify(candle))
      throw new HistoryError("GeckoTerminal returned conflicting candle timestamps.");
    data.set(time, candle);
  }
  return { candles: [...data.values()].sort((a, b) => a.time - b.time), count: rows.length, oldest };
}

/** Separate display feed: never writes to the backend, strategy or paper session. */
export class GeckoHistoryClient {
  private cache = new Map<string, { expires: number; value: ChartHistory }>();
  private pending = new Map<string, Promise<ChartHistory>>();
  private attempts: number[] = [];
  private retryAt = 0;

  constructor(
    private readonly baseUrl = "https://api.geckoterminal.com/api/v2",
    private readonly fetcher: typeof fetch = fetch,
    private readonly clock: () => number = Date.now,
  ) {}

  get(pool: string, range: ChartRange): Promise<ChartHistory> {
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(pool))
      return Promise.reject(new HistoryError("A verified SOL/USDC pool is required.", 400));
    const key = `${pool}:${range}`;
    const cached = this.cache.get(key);
    if (cached && cached.expires > this.clock()) return Promise.resolve(cached.value);
    const pending = this.pending.get(key);
    if (pending) return pending;
    const promise = this.load(pool, range).then((value) => {
      const interval = value.intervalSeconds * 1000;
      if (this.cache.size >= 12 && !this.cache.has(key)) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(key, { value, expires: (Math.floor(this.clock() / interval) + 1) * interval });
      return value;
    }).catch((error: unknown) => {
      if (cached) return { ...cached.value, status: "stale" as const, message: error instanceof HistoryError ? error.message : "Historical prices could not be refreshed." };
      throw error;
    }).finally(() => this.pending.delete(key));
    this.pending.set(key, promise);
    return promise;
  }

  private async load(pool: string, range: ChartRange): Promise<ChartHistory> {
    const now = this.clock();
    const config = chartRanges[range];
    let before = Math.floor(now / 1000 / config.intervalSeconds) * config.intervalSeconds;
    const start = config.duration === null ? null : before - config.duration;
    const data = new Map<number, Candle>();
    // Daily bars fit the public six-month history in one page. Support cursor
    // pagination too, without an unbounded request loop if the provider changes.
    for (let page = 0; page < 4; page++) {
      this.attempts = this.attempts.filter((time) => time > this.clock() - 60_000);
      if (this.clock() < this.retryAt || this.attempts.length >= 6) {
        const wait = Math.max(this.retryAt, (this.attempts[0] ?? this.clock()) + 60_000) - this.clock();
        throw new HistoryError("Historical data is rate limited. Try again shortly.", 429, Math.max(1, Math.ceil(wait / 1000)));
      }
      this.attempts.push(this.clock());
      const url = new URL(`${this.baseUrl.replace(/\/$/, "")}/networks/solana/pools/${pool}/ohlcv/${config.timeframe}`);
      url.search = new URLSearchParams({ aggregate: String(config.aggregate), limit: String(PAGE_SIZE), before_timestamp: String(before), currency: "token", token: "base", include_empty_intervals: "false" }).toString();
      let response: Response;
      try {
        response = await this.fetcher(url, { headers: { Accept: "application/json;version=20230203" }, cache: "no-store", signal: AbortSignal.timeout(7000) });
      } catch {
        throw new HistoryError("GeckoTerminal historical data is temporarily unavailable.", 503);
      }
      if (!response.ok) {
        if (response.status === 429) {
          const raw = response.headers.get("retry-after");
          const delay = raw && /^\d+$/.test(raw) ? Number(raw) * 1000 : raw ? Date.parse(raw) - this.clock() : 60_000;
          const wait = Number.isFinite(delay) ? Math.max(60_000, Math.min(delay, 3_600_000)) : 60_000;
          this.retryAt = this.clock() + wait;
          throw new HistoryError("GeckoTerminal is rate limiting historical data. Try again shortly.", 429, Math.ceil(wait / 1000));
        }
        throw new HistoryError("GeckoTerminal historical data is temporarily unavailable.", 503);
      }
      let body: unknown;
      try { body = await response.json(); } catch { throw new HistoryError("GeckoTerminal returned invalid historical data."); }
      const result = parseHistoryPage(body, config.intervalSeconds, now);
      for (const point of result.candles) if (point.time < before) data.set(point.time, point);
      if (result.count < PAGE_SIZE || result.oldest === null || (start !== null && result.oldest <= start))
        return buildChartHistory([...data.values()], range, now);
      if (result.oldest >= before) throw new HistoryError("Historical pagination did not advance.");
      before = result.oldest - 1;
    }
    const history = buildChartHistory([...data.values()], range, now);
    return { ...history, partial: true, message: "Older history could not be fully loaded. Showing the retrieved range." };
  }
}
