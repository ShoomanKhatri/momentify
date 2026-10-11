import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { setupApplication } from '../src/setup.js';
import { MarketService } from '../src/market/market.service.js';
import { TradingService } from '../src/trading/trading.service.js';
import { DatabaseService } from '../src/database/database.service.js';
import {
  dexFixture,
  jsonResponse,
  ohlcvFixture,
  poolFixture,
} from '../src/market/test-fixtures.js';

describe('external providers → actual Nest services → paper engine → REST', () => {
  let app: INestApplication;
  beforeAll(async () => {
    vi.stubEnv('DATABASE_PATH', ':memory:');
    vi.stubEnv('BACKEND_API_TOKEN', '');
    vi.stubEnv('STRATEGY_ENABLED', 'false');
    vi.stubEnv(
      'SOLANA_RPC_URL',
      'https://mainnet.helius-rpc.com/?api-key=do-not-expose',
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, options?: RequestInit) => {
        if (options?.method === 'POST') {
          const { id, method } = JSON.parse(String(options.body)) as {
            id: string;
            method: string;
          };
          return jsonResponse({
            jsonrpc: '2.0',
            id,
            result:
              method === 'getHealth'
                ? 'ok'
                : method === 'getSlot'
                  ? 400000000
                  : '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',
          });
        }
        if (url.includes('dexscreener')) return jsonResponse(dexFixture());
        return jsonResponse(
          url.includes('ohlcv')
            ? ohlcvFixture(Date.now(), [
                ...Array.from({ length: 24 }, (_, i) => 100 - i),
                200,
              ])
            : { data: [poolFixture()] },
        );
      }),
    );
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    setupApplication(app);
    await app.init();
    await app.get(TradingService).tick();
  });
  afterAll(async () => {
    if (app) await app.close();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  it('serves verified providers, real EMA calculations and an honest virtual balance without authentication', async () => {
    const response = await request(app.getHttpServer()).get(
      '/api/v1/dashboard',
    );
    expect(response.status).toBe(200);
    const { health, market, strategy, portfolio, recentTrades } = response.body;
    expect(health.helius.slot).toBe(400000000);
    expect(health.helius.status).toBe('live');
    expect(health.geckoTerminal.status).toBe('live');
    expect(health.dexScreener.status).toBe('live');
    expect(health.paperTrading).toBe(true);
    expect(health.liveTradingEnabled).toBe(false);
    expect(market.price).toBe(110);
    expect(market.pool.quote).toBe('USDC');
    expect(market.candles).toHaveLength(25);
    expect(strategy.signal).toBe('BUY');
    expect(strategy.enabled).toBe(false);
    expect(portfolio.equity).toBe(1000);
    expect(portfolio.totalPnl).toBe(0);
    expect(recentTrades).toEqual([]);
    expect(JSON.stringify(response.body)).not.toContain('do-not-expose');
  });
  it('only the engine creates a risk-checked crossover fill, once per candle', async () => {
    const database = app.get(DatabaseService);
    database.update((state) => {
      state.running = true;
      state.lastCandleTime = app.get(MarketService).get().candles.at(-2)!.time;
    });
    await app.get(TradingService).tick();
    await app.get(TradingService).tick();
    const response = await request(app.getHttpServer()).get(
      '/api/v1/trades?page=1&limit=1',
    );
    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
    expect(response.body.trades[0]).toMatchObject({
      side: 'BUY',
      reason: 'EMA_CROSSOVER',
      status: 'FILLED',
    });
    expect(database.read().cash).toBeLessThan(1000);
    expect(
      (
        await request(app.getHttpServer())
          .post('/api/v1/trades')
          .send({ side: 'BUY' })
      ).status,
    ).toBe(404);
  });
  it('documents and validates pagination and exposes completed indicator candles', async () => {
    const candles = await request(app.getHttpServer()).get(
      '/api/v1/market/candles',
    );
    expect(candles.status).toBe(200);
    expect(candles.body.candles.at(-1).ema21).toBeTypeOf('number');
    expect(candles.body.candles[0].ema21).toBeNull();
    expect(candles.body.quoteCurrency).toBe('USDC');
    for (const query of ['page=0', 'limit=101', 'page=abc', 'side=SWAP'])
      expect(
        (await request(app.getHttpServer()).get(`/api/v1/trades?${query}`))
          .status,
      ).toBe(400);
    const sells = await request(app.getHttpServer()).get(
      '/api/v1/trades?side=SELL',
    );
    expect(sells.body.total).toBe(0);
    expect(sells.body.trades).toEqual([]);
    const history = await request(app.getHttpServer()).get(
      '/api/v1/portfolio/history',
    );
    expect(history.body.history.length).toBeGreaterThan(0);
  });
});
