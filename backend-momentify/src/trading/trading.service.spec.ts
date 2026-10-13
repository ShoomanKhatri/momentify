import { ConfigService } from '../config/config.service.js';
import { DatabaseService } from '../database/database.service.js';
import { RpcService } from '../market/rpc.service.js';
import { MarketService } from '../market/market.service.js';
import { RiskService } from '../risk/risk.service.js';
import { StrategyService } from '../strategy/strategy.service.js';
import { PortfolioService } from '../portfolio/portfolio.service.js';
import { TradingService } from './trading.service.js';
import { executePaperOrder } from './paper-execution.js';
import type { MarketSnapshot } from '../contracts.js';

describe('paper engine safety', () => {
  let config: ConfigService,
    database: DatabaseService,
    market: MarketService,
    engine: TradingService,
    strategy: StrategyService;
  let snapshot: MarketSnapshot;
  const now = new Date('2026-10-10T12:00:10Z');
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.stubEnv('DATABASE_PATH', ':memory:');
    config = new ConfigService();
    database = new DatabaseService(config);
    market = new MarketService(config, database, new RpcService(config));
    const last = Math.floor(now.getTime() / 60_000) * 60 - 60;
    snapshot = {
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
      candleUpdatedAt: new Date().toISOString(),
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
    vi.spyOn(market, 'get').mockImplementation(() => structuredClone(snapshot));
    vi.spyOn(market, 'refresh').mockResolvedValue();
    database.update((state) => {
      state.config.fastPeriod = 2;
      state.config.slowPeriod = 3;
    });
    engine = new TradingService(
      config,
      database,
      market,
      new RiskService(config),
    );
    strategy = new StrategyService(database, market);
  });
  afterEach(async () => {
    await engine.onModuleDestroy();
    database.onApplicationShutdown();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });
  it('starts paused and never executes a historical signal on start', async () => {
    expect(strategy.get().status).toBe('paused');
    strategy.setRunning(true);
    await engine.tick();
    expect(database.read().trades).toHaveLength(0);
  });
  it('processes a new crossover once, including concurrent ticks', async () => {
    database.update((state) => {
      state.running = true;
      state.lastCandleTime = snapshot.candles.at(-2)!.time;
    });
    await Promise.all([engine.tick(), engine.tick()]);
    await engine.tick();
    expect(database.read().trades).toHaveLength(1);
    expect(database.read().trades[0].side).toBe('BUY');
    expect(database.read().trades[0].referencePrice).toBe(110);
  });
  it('preserves an open position and history when stopped, and never catches up on paused candles', async () => {
    snapshot.price = 99;
    database.update((state) => {
      state.running = true;
      state.lastCandleTime = snapshot.candles.at(-2)!.time;
    });
    await engine.tick();
    expect(database.read().trades).toHaveLength(1);
    expect(database.read().position).not.toBeNull();

    strategy.setRunning(false);
    const paused = database.read();
    expect(paused.running).toBe(false);
    expect(paused.position).not.toBeNull();
    expect(paused.trades).toHaveLength(1);

    const previous = snapshot.candles.at(-1)!;
    const nextTime = previous.time + 60;
    snapshot.candles.push({
      ...previous,
      time: nextTime,
      open: 99,
      high: 99,
      low: 99,
      close: 99,
      timestamp: new Date(nextTime * 1000).toISOString(),
    });
    snapshot.price = 99;
    const resumeTime = new Date((nextTime + 60) * 1000 + 10_000);
    snapshot.quoteAt = resumeTime.toISOString();
    vi.setSystemTime(resumeTime);

    await engine.tick();
    expect(database.read().trades).toHaveLength(1);
    expect(database.read().position).not.toBeNull();

    strategy.setRunning(true);
    await engine.tick();
    expect(database.read().trades).toHaveLength(1);
    expect(database.read().position).not.toBeNull();
  });
  it('does not execute or value positions from an unavailable feed', async () => {
    database.update((state) => {
      state.running = true;
      executePaperOrder(
        state,
        'BUY',
        100,
        config,
        'EMA_CROSSOVER',
        now.toISOString(),
        null,
      );
    });
    snapshot.status = 'stale';
    snapshot.quoteStatus = 'stale';
    snapshot.price = 1;
    await engine.tick();
    expect(database.read().trades).toHaveLength(1);
    expect(new PortfolioService(database, market).get().equity).toBeNull();
    expect(strategy.get().signal).toBeNull();
  });
  it('skips old completed candles after a feed outage', async () => {
    database.update((state) => {
      state.running = true;
    });
    snapshot.candles.forEach((candle) => {
      candle.time -= 600;
    });
    await engine.tick();
    expect(database.read().trades).toHaveLength(0);
    expect(database.read().message).toBe('Skipped a stale candle');
  });
  it('will not use a quote older than the signal candle', async () => {
    database.update((state) => {
      state.running = true;
    });
    snapshot.quoteAt = new Date(now.getTime() - 20_000).toISOString();
    await engine.tick();
    expect(database.read().trades).toHaveLength(0);
  });
  it('blocks crossover entries below the verified pool liquidity threshold', async () => {
    database.update((state) => {
      state.running = true;
    });
    snapshot.liquidityUsd = 999;
    await engine.tick();
    expect(database.read().trades).toHaveLength(0);
  });
  it('exits for a stop loss without waiting for another crossover', async () => {
    database.update((state) => {
      state.running = true;
      state.lastCandleTime = snapshot.candles.at(-1)!.time;
      executePaperOrder(
        state,
        'BUY',
        100,
        config,
        'EMA_CROSSOVER',
        now.toISOString(),
        null,
      );
    });
    snapshot.price = 96;
    await engine.tick();
    expect(database.read().position).toBeNull();
    expect(database.read().trades.at(-1)!.reason).toBe('STOP_LOSS');
  });
  it('exits for take profit with transaction costs included', async () => {
    database.update((state) => {
      state.running = true;
      executePaperOrder(
        state,
        'BUY',
        100,
        config,
        'EMA_CROSSOVER',
        now.toISOString(),
        null,
      );
    });
    snapshot.price = 108;
    await engine.tick();
    expect(database.read().trades.at(-1)!.reason).toBe('TAKE_PROFIT');
    expect(database.read().realizedPnl).toBeGreaterThan(0);
  });
  it('liquidates and pauses after daily loss limit, and refuses same-day resume', async () => {
    database.update((state) => {
      state.running = true;
      state.riskDay = '2026-10-10';
      state.dayStartEquity = 1000;
      state.config.positionSizePercent = 100;
      executePaperOrder(
        state,
        'BUY',
        100,
        config,
        'EMA_CROSSOVER',
        now.toISOString(),
        null,
      );
    });
    snapshot.price = 90;
    await engine.tick();
    expect(database.read().running).toBe(false);
    expect(database.read().dailyHalted).toBe(true);
    expect(database.read().position).toBeNull();
    expect(database.read().trades.at(-1)!.reason).toBe('DAILY_LIMIT');
    expect(() => strategy.setRunning(true)).toThrow('Daily loss limit');
  });
  it('clears the daily halt on the next UTC day without restarting the bot', async () => {
    database.update((state) => {
      state.dailyHalted = true;
      state.riskDay = '2026-10-09';
    });
    await engine.tick();
    expect(database.read().dailyHalted).toBe(false);
    expect(database.read().running).toBe(false);
  });
  it('rejects configuration changes while running and invalid EMA ordering', () => {
    strategy.setRunning(true);
    expect(() => strategy.configure(database.read().config)).toThrow('Pause');
    strategy.setRunning(false);
    expect(() =>
      strategy.configure({ ...database.read().config, fastPeriod: 25 }),
    ).toThrow('Fast EMA');
  });
  it('requires fresh data to resume', () => {
    snapshot.status = 'unavailable';
    expect(() => strategy.setRunning(true)).toThrow('Fresh quotes');
  });
  it('halts on emergency stop and stays halted until acknowledged', () => {
    strategy.setRunning(true);
    const stopped = strategy.emergencyStop();
    expect(database.read().running).toBe(false);
    expect(database.read().emergencyStopped).toBe(true);
    expect(stopped.message).toBe('Emergency shutdown is active');
    expect(() => strategy.setRunning(true)).toThrow('Emergency shutdown');
    strategy.setRunning(false);
    expect(database.read().emergencyStopped).toBe(false);
    expect(strategy.setRunning(true).status).toBe('running');
  });
});
