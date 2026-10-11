import { ConfigService } from '../config/config.service.js';
import { DatabaseService } from '../database/database.service.js';
import { executePaperOrder } from './paper-execution.js';
import { equity } from '../portfolio/accounting.js';

describe('paper portfolio accounting', () => {
  let database: DatabaseService;
  beforeEach(() => {
    vi.stubEnv('DATABASE_PATH', ':memory:');
    database = new DatabaseService(new ConfigService());
  });
  afterEach(() => {
    database.onApplicationShutdown();
    vi.unstubAllEnvs();
  });
  const costs = { feeBps: 25, slippageBps: 10 };
  const now = '2026-10-10T12:00:00.000Z';
  it('budgets entry fees and applies adverse buy slippage', () => {
    const state = database.read();
    const trade = executePaperOrder(
      state,
      'BUY',
      100,
      costs,
      'EMA_CROSSOVER',
      now,
      now,
    )!;
    expect(trade.price).toBeCloseTo(100.1);
    expect(trade.fee).toBeCloseTo(trade.quantity * trade.price * 0.0025);
    expect(state.cash).toBeCloseTo(900, 5);
    expect(state.position!.costBasis).toBeCloseTo(100, 5);
    expect(equity(state, 100)).toBeLessThan(1000);
  });
  it('loses both fees and slippage on a flat-price round trip', () => {
    const state = database.read();
    executePaperOrder(state, 'BUY', 100, costs, 'EMA_CROSSOVER', now, now);
    const sell = executePaperOrder(
      state,
      'SELL',
      100,
      costs,
      'EMA_CROSSOVER',
      now,
      now,
    )!;
    expect(sell.price).toBeCloseTo(99.9);
    expect(sell.realizedPnl).toBeLessThan(0);
    expect(state.cash - state.initialBalance).toBeCloseTo(state.realizedPnl);
    expect(state.realizedPnl).toBeCloseTo(-state.feesPaid - state.slippagePaid);
    expect(state.position).toBeNull();
  });
  it('never spends beyond available cash at 100% position size', () => {
    const state = database.read();
    state.config.positionSizePercent = 100;
    executePaperOrder(state, 'BUY', 123.456, costs, 'EMA_CROSSOVER', now, now);
    expect(state.cash).toBeGreaterThanOrEqual(0);
    expect(state.cash).toBeLessThan(0.00001);
  });
  it('is long-only and prevents repeated entry', () => {
    const state = database.read();
    expect(
      executePaperOrder(state, 'SELL', 100, costs, 'EMA_CROSSOVER', now, now),
    ).toBeNull();
    executePaperOrder(state, 'BUY', 100, costs, 'EMA_CROSSOVER', now, now);
    expect(
      executePaperOrder(state, 'BUY', 100, costs, 'EMA_CROSSOVER', now, now),
    ).toBeNull();
    expect(state.trades).toHaveLength(1);
  });
  it('rejects invalid execution prices', () => {
    expect(() =>
      executePaperOrder(
        database.read(),
        'BUY',
        NaN,
        costs,
        'EMA_CROSSOVER',
        now,
        now,
      ),
    ).toThrow();
  });
  it('rolls back an unsuccessful persistence update', () => {
    expect(() =>
      database.update((state) => {
        state.cash = 0;
        throw new Error('Simulated failure');
      }),
    ).toThrow();
    expect(database.read().cash).toBe(1000);
  });
});
