import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigService } from '../config/config.service.js';
import { DatabaseService } from '../database/database.service.js';
import { RpcService } from '../market/rpc.service.js';
import { MarketService } from '../market/market.service.js';
import { RiskService } from '../risk/risk.service.js';
import { TradingService } from './trading.service.js';
import type { MarketSnapshot } from '../contracts.js';

function liveSnapshot(now: Date): MarketSnapshot {
  const last = Math.floor(now.getTime() / 60_000) * 60 - 60;
  return {
    symbol: 'SOL',
    name: 'Solana',
    pair: 'SOL-USDC',
    source: 'DexScreener',
    candleSource: 'GeckoTerminal',
    quoteCurrency: 'USDC',
    volumeCurrency: 'USD',
    candleVolumeCurrency: 'USDC',
    quoteTimestampKind: 'fetched',
    pool: null,
    liquidityUsd: 1_000_000,
    quoteStatus: 'live',
    candleStatus: 'live',
    candleUpdatedAt: now.toISOString(),
    status: 'live',
    price: 110,
    change24h: 1,
    volume24h: 10,
    quoteAt: now.toISOString(),
    updatedAt: now.toISOString(),
    candleIntervalSeconds: 60,
    message: null,
    candles: [100, 99, 98, 97, 110].map((close, i) => ({
      time: last - (4 - i) * 60,
      open: close,
      close,
      low: close,
      high: close,
      volume: 10,
      timestamp: new Date((last - (4 - i) * 60) * 1000).toISOString(),
      ema9: null,
      ema21: null,
    })),
  };
}

function buildEngine(
  config: ConfigService,
  database: DatabaseService,
  snapshot: MarketSnapshot,
): TradingService {
  const market = new MarketService(config, database, new RpcService(config));
  vi.spyOn(market, 'get').mockImplementation(() => structuredClone(snapshot));
  vi.spyOn(market, 'refresh').mockResolvedValue();
  return new TradingService(config, database, market, new RiskService(config));
}

describe('paper engine restart safety', () => {
  it('pauses on restart, preserves state, and never replays the last completed candle', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'momentify-restart-'));
    const now = new Date('2026-10-10T12:00:10Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.stubEnv('DATABASE_PATH', join(directory, 'paper.sqlite'));
    try {
      const config = new ConfigService();
      const snapshot = liveSnapshot(now);

      const firstDatabase = new DatabaseService(config);
      firstDatabase.update((state) => {
        state.config.fastPeriod = 2;
        state.config.slowPeriod = 3;
        state.running = true;
        state.lastCandleTime = snapshot.candles.at(-2)!.time;
      });
      const firstEngine = buildEngine(config, firstDatabase, snapshot);
      await firstEngine.tick();
      const processed = firstDatabase.read();
      expect(processed.trades).toHaveLength(1);
      expect(processed.trades[0].side).toBe('BUY');
      expect(processed.lastCandleTime).toBe(snapshot.candles.at(-1)!.time);
      const watermark = processed.lastCandleTime;
      await firstEngine.onModuleDestroy();
      firstDatabase.onApplicationShutdown();

      const secondDatabase = new DatabaseService(config);
      const resumed = secondDatabase.read();
      expect(resumed.running).toBe(false);
      expect(resumed.startedAt).toBeNull();
      expect(resumed.lastCandleTime).toBe(watermark);
      expect(resumed.trades).toHaveLength(1);
      expect(resumed.position).not.toBeNull();

      const secondEngine = buildEngine(config, secondDatabase, snapshot);
      secondDatabase.update((state) => {
        state.running = true;
      });
      await secondEngine.tick();
      expect(secondDatabase.read().trades).toHaveLength(1);
      await secondEngine.onModuleDestroy();
      secondDatabase.onApplicationShutdown();
    } finally {
      vi.useRealTimers();
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
