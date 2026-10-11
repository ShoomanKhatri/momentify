import type { EquityPoint } from '../contracts.js';
import { appendEquityPoint, equity, liquidationValue } from './accounting.js';

const point = (index: number): EquityPoint => ({
  timestamp: new Date(1_700_000_000_000 + index * 60_000).toISOString(),
  equity: 1_000 + index,
});

describe('portfolio accounting helpers', () => {
  it('values cash plus marked position', () => {
    expect(equity({ cash: 100, position: null }, 50)).toBe(100);
    expect(
      equity(
        {
          cash: 100,
          position: { symbol: 'SOL', quantity: 2, averageEntry: 10, costBasis: 20 },
        },
        50,
      ),
    ).toBe(200);
  });

  it('applies fees and slippage to the liquidation value', () => {
    const value = liquidationValue(
      {
        cash: 0,
        position: { symbol: 'SOL', quantity: 2, averageEntry: 10, costBasis: 20 },
      },
      100,
      25,
      10,
    );
    expect(value).toBeCloseTo(2 * 100 * 0.999 * 0.9975);
  });

  it('keeps the equity history bounded while preserving span and the latest point', () => {
    const history: EquityPoint[] = [];
    for (let i = 0; i < 25; i++) appendEquityPoint(history, point(i), 10);
    expect(history.length).toBeLessThanOrEqual(10);
    expect(history.at(-1)).toEqual(point(24));
    expect(history[0]).toEqual(point(0));
  });

  it('does not mutate the history while under the cap', () => {
    const history: EquityPoint[] = [point(0)];
    appendEquityPoint(history, point(1), 10);
    expect(history).toEqual([point(0), point(1)]);
  });
});
