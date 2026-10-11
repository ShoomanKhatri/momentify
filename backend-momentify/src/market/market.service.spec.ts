import { ConfigService } from '../config/config.service.js';
import { DatabaseService } from '../database/database.service.js';
import { MarketService } from './market.service.js';
import { RpcService } from './rpc.service.js';
import {
  dexFixture,
  jsonResponse,
  ohlcvFixture,
  poolFixture,
} from './test-fixtures.js';

describe('verified Solana market ingestion', () => {
  const now = Date.parse('2026-10-10T12:00:30Z');
  let market: MarketService, database: DatabaseService;
  let geckoFails = false,
    dexFails = false;
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.stubEnv('DATABASE_PATH', ':memory:');
    vi.stubEnv('SOLANA_RPC_URL', '');
    const config = new ConfigService();
    database = new DatabaseService(config);
    market = new MarketService(config, database, new RpcService(config));
    geckoFails = false;
    dexFails = false;
    fetchMock = vi.fn(async (url: string) => {
      if (url.includes('dexscreener'))
        return dexFails
          ? { ok: false, status: 503 }
          : jsonResponse(dexFixture());
      if (geckoFails) return { ok: false, status: 503 };
      return jsonResponse(
        url.includes('ohlcv')
          ? ohlcvFixture(Date.now())
          : { data: [poolFixture()] },
      );
    });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    database.onApplicationShutdown();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  it('uses one verified pool, parses quote currency correctly and excludes incomplete candles', async () => {
    await market.refresh();
    const result = market.get();
    expect(result.status).toBe('live');
    expect(result.price).toBe(110);
    expect(result.change24h).toBe(-2.5);
    expect(result.volume24h).toBe(500000);
    expect(result.liquidityUsd).toBe(1000000);
    expect(result.candles).toHaveLength(30);
    expect(result.candles.at(-1)!.ema9).toBe(100);
    expect(result.candles.at(-1)!.ema21).toBe(100);
    expect(result.candles[0].ema21).toBeNull();
    expect(result.pool?.quote).toBe('USDC');
    expect(result.quoteTimestampKind).toBe('fetched');
    const candleRequest = fetchMock.mock.calls.find(([url]) => String(url).includes('ohlcv'));
    expect(String(candleRequest?.[0])).toContain(`before_timestamp=${Math.floor(now / 60_000) * 60}`);
  });
  it('deduplicates concurrent refreshes and caches external requests', async () => {
    await Promise.all([market.refresh(), market.refresh(), market.refresh()]);
    const count = fetchMock.mock.calls.length;
    await market.refresh();
    expect(fetchMock).toHaveBeenCalledTimes(count);
    vi.advanceTimersByTime(15000);
    await market.refresh();
    expect(fetchMock).toHaveBeenCalledTimes(count + 1);
  });
  it('keeps backend and quotes connected independently of a failed candle provider', async () => {
    await market.refresh();
    geckoFails = true;
    vi.advanceTimersByTime(60000);
    await market.refresh();
    expect(market.get().quoteStatus).toBe('live');
    expect(market.get().candleStatus).toBe('unavailable');
    expect(market.get().status).toBe('unavailable');
    expect(market.get().candles).toHaveLength(30);
    expect(market.health().backend).toBe('connected');
    expect(market.health().helius.status).toBe('unavailable');
  });
  it('retains completed candles when DexScreener fails', async () => {
    await market.refresh();
    dexFails = true;
    vi.advanceTimersByTime(60000);
    await market.refresh();
    expect(market.get().candleStatus).toBe('live');
    expect(market.get().quoteStatus).toBe('unavailable');
  });
  it('refreshes quotes after a new candle even when discovery shifted the polling cache', async () => {
    vi.stubEnv('MARKET_POLL_INTERVAL_MS', '60000');
    const config = new ConfigService();
    const shifted = new MarketService(config, database, new RpcService(config));
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('dexscreener')) return jsonResponse(dexFixture());
      if (url.includes('ohlcv')) return jsonResponse(ohlcvFixture(Date.now()));
      vi.setSystemTime(Date.now() + 1000);
      return jsonResponse({ data: [poolFixture()] });
    });
    await shifted.refresh();
    const firstQuote = shifted.get().quoteAt;
    vi.setSystemTime(now + 60000);
    await shifted.refresh();
    expect(shifted.get().quoteAt).not.toBe(firstQuote);
    expect(Date.parse(shifted.get().quoteAt!)).toBeGreaterThanOrEqual(
      (shifted.get().candles.at(-1)!.time + 60) * 1000,
    );
  });
  it('does not merge unrelated pools', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (!url.includes('dexscreener'))
        return jsonResponse(
          url.includes('ohlcv') ? ohlcvFixture(now) : { data: [poolFixture()] },
        );
      const body = dexFixture();
      body.pairs[0].pairAddress = 'unrelated';
      return jsonResponse(body);
    });
    await market.refresh();
    expect(market.get().price).toBeNull();
    expect(market.get().quoteStatus).toBe('unavailable');
  });
  it('reports unavailable without fabricated prices or candles when discovery fails', async () => {
    geckoFails = true;
    await market.refresh();
    expect(market.get().status).toBe('unavailable');
    expect(market.get().price).toBeNull();
    expect(market.get().candles).toEqual([]);
    expect(market.health().lastSuccessfulRefresh).toBeNull();
  });
  it('expires candles and quotes as wall clock advances', async () => {
    await market.refresh();
    vi.advanceTimersByTime(181000);
    expect(market.get().status).toBe('stale');
    expect(market.get().quoteStatus).toBe('stale');
    expect(market.get().candleStatus).toBe('stale');
  });
  it('does not hydrate old Kraken candles into a SOL/USDC feed', () => {
    database.saveCandles([
      { time: 180, open: 50, close: 50, high: 50, low: 50, volume: 1 },
    ]);
    expect(market.get().candles).toEqual([]);
  });
  it('respects rate limits without duplicate immediate requests', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Headers({ 'Retry-After': '120' }),
    });
    await market.refresh();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60000);
    await market.refresh();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60000);
    await market.refresh();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(market.health().geckoTerminal.message).toContain('429');
  });
});
