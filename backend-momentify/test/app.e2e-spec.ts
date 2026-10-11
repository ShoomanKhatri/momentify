import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { MarketService } from '../src/market/market.service.js';
import { DatabaseService } from '../src/database/database.service.js';
import { setupApplication } from '../src/setup.js';
import { withIndicators } from '../src/market/market.service.js';
import type { MarketSnapshot } from '../src/contracts.js';

describe('Momentify API integration', () => {
  let app: INestApplication<App>;
  const token = 'integration-test-token';
  let market: MarketSnapshot;
  beforeAll(async () => {
    vi.stubEnv('DATABASE_PATH', ':memory:');
    vi.stubEnv('BACKEND_API_TOKEN', token);
    const now = Date.now();
    const last = Math.floor(now / 60_000) * 60 - 60;
    market = {
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
      price: 100,
      change24h: 1,
      volume24h: 20,
      quoteAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
      candleIntervalSeconds: 60,
      message: null,
      candles: Array.from({ length: 30 }, (_, i) => ({
        time: last - (29 - i) * 60,
        open: 100,
        close: 100,
        high: 100,
        low: 100,
        volume: 1,
        timestamp: new Date((last - (29 - i) * 60) * 1000).toISOString(),
        ema9: null,
        ema21: null,
      })),
    };
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MarketService)
      .useValue({
        get: () => structuredClone(market),
        refresh: async () => {},
        health: () => ({
          status: 'ok',
          mode: 'paper',
          backend: 'connected',
          helius: { status: 'unavailable' },
          geckoTerminal: { status: market.status },
          dexScreener: { status: market.status },
        }),
        candles: () => ({
          candles: withIndicators(market.candles),
          source: 'GeckoTerminal',
          status: market.status,
          quoteCurrency: 'USDC',
        }),
      })
      .compile();
    app = module.createNestApplication();
    setupApplication(app);
    await app.init();
  });
  beforeEach(() => {
    market.status = 'live';
    app.get(DatabaseService).update((state) => {
      state.running = false;
      state.emergencyStopped = false;
      state.message = null;
    });
  });
  afterAll(async () => {
    if (app) await app.close();
    vi.unstubAllEnvs();
  });
  const get = (path: string) =>
    request(app.getHttpServer())
      .get(`/api/${path}`)
      .set('Authorization', `Bearer ${token}`);
  const patch = (path: string, value: unknown) =>
    request(app.getHttpServer())
      .patch(`/api/${path}`)
      .set('Authorization', `Bearer ${token}`)
      .send(value as object);

  it('requires the configured API token', async () => {
    const result = await request(app.getHttpServer()).get('/api/dashboard');
    expect(result.status).toBe(401);
    expect(result.body.message).toBe('API authentication required');
  });
  it('reports paper mode and an honest starting portfolio', async () => {
    const result = await get('dashboard');
    expect(result.status).toBe(200);
    expect(result.body.settings.mode).toBe('paper');
    expect(result.body.portfolio.equity).toBe(1000);
    expect(result.body.portfolio.totalPnl).toBe(0);
    expect(result.body.strategy.status).toBe('paused');
    expect(result.body.recentTrades).toEqual([]);
  });
  it('serves market, portfolio, strategy, trades, settings and health endpoints', async () => {
    for (const endpoint of [
      'markets',
      'portfolio',
      'strategy',
      'trades',
      'settings',
      'health',
    ])
      expect((await get(endpoint)).status).toBe(200);
  });
  it('validates DTO types and rejects additional fields', async () => {
    expect((await patch('strategy/status', { running: 'true' })).status).toBe(
      400,
    );
    expect(
      (await patch('strategy/status', { running: true, live: true })).status,
    ).toBe(400);
    expect((await patch('strategy/config', { fastPeriod: 9 })).status).toBe(
      400,
    );
  });
  it('persists a validated configuration and rejects invalid EMA ordering', async () => {
    const config = app.get(DatabaseService).read().config;
    const result = await patch('strategy/config', {
      ...config,
      positionSizePercent: 12,
    });
    expect(result.status).toBe(200);
    expect(result.body.config.positionSizePercent).toBe(12);
    expect(
      (
        await patch('strategy/config', {
          ...config,
          fastPeriod: 21,
          slowPeriod: 9,
        })
      ).status,
    ).toBe(400);
  });
  it('starts and pauses the bot, rejecting edits during execution', async () => {
    const start = await patch('strategy/status', { running: true });
    expect(start.status).toBe(200);
    expect(start.body.status).toBe('running');
    expect(
      (await patch('strategy/config', app.get(DatabaseService).read().config))
        .status,
    ).toBe(409);
    const pause = await patch('strategy/status', { running: false });
    expect(pause.status).toBe(200);
    expect(pause.body.status).toBe('paused');
  });
  it('refuses to start on an unavailable feed', async () => {
    market.status = 'unavailable';
    expect((await patch('strategy/status', { running: true })).status).toBe(
      503,
    );
    expect((await get('dashboard')).body.strategy.signal).toBeNull();
  });
  it('returns a consistent JSON error for unknown endpoints', async () => {
    const result = await get('not-a-real-endpoint');
    expect(result.status).toBe(404);
    expect(result.body.statusCode).toBe(404);
    expect(result.body.timestamp).toBeDefined();
  });
  it('exposes the same resources under the versioned /api/v1 prefix', async () => {
    for (const endpoint of [
      'health',
      'dashboard',
      'markets',
      'strategy',
      'trades',
      'portfolio',
      'portfolio/history',
    ])
      expect((await get(`v1/${endpoint}`)).status).toBe(200);
  });
  it('publishes the OpenAPI document', async () => {
    const result = await request(app.getHttpServer()).get('/api/docs-json');
    expect(result.status).toBe(200);
    expect(result.body.info.title).toBe('Momentify API');
    expect(result.body.paths['/api/v1/dashboard']).toBeDefined();
  });
  it('returns the historical equity curve', async () => {
    const result = await get('v1/portfolio/history');
    expect(result.status).toBe(200);
    expect(Array.isArray(result.body.history)).toBe(true);
    expect(result.body.history[0].equity).toBe(1000);
  });
  it('emergency stop halts trading until acknowledged', async () => {
    const stopped = await request(app.getHttpServer())
      .post('/api/v1/strategy/emergency-stop')
      .set('Authorization', `Bearer ${token}`);
    expect(stopped.status).toBe(201);
    expect(stopped.body.message).toBe('Emergency shutdown is active');
    expect((await patch('strategy/status', { running: true })).status).toBe(
      409,
    );
    const cleared = await patch('strategy/status', { running: false });
    expect(cleared.status).toBe(200);
    expect((await patch('strategy/status', { running: true })).status).toBe(
      200,
    );
    await patch('strategy/status', { running: false });
  });
});
