import type { Candle } from '../contracts.js';
import { crossover, ema } from './indicators.js';

const candles = (values: number[]): Candle[] =>
  values.map((close, i) => ({
    time: 1_700_000_040 + i * 60,
    open: close,
    close,
    high: close,
    low: close,
    volume: 1,
  }));

describe('EMA indicators', () => {
  it('seeds with an SMA, then uses the EMA multiplier', () => {
    expect(ema([10, 20, 30, 40, 50], 3)).toEqual([null, null, 20, 30, 40]);
  });
  it('requires enough completed candles for both crossover sides', () => {
    expect(crossover(candles([100, 99, 98]), 2, 3).ready).toBe(false);
    expect(crossover(candles(Array(21).fill(100)), 9, 21).signal).toBeNull();
  });
  it('detects an upward crossover', () => {
    expect(crossover(candles([100, 99, 98, 97, 110]), 2, 3).signal).toBe('BUY');
  });
  it('detects a downward crossover', () => {
    expect(crossover(candles([100, 101, 102, 103, 90]), 2, 3).signal).toBe(
      'SELL',
    );
  });
  it('holds when the trend remains above the slow EMA', () => {
    expect(crossover(candles([100, 101, 102, 103, 104]), 2, 3).signal).toBe(
      'HOLD',
    );
  });
  it('resets warmup after a missing candle', () => {
    const input = candles([100, 99, 98, 97, 110]);
    input[4].time += 60;
    expect(crossover(input, 2, 3).ready).toBe(false);
  });
  it('uses EMA 9/21 for the default strategy', () => {
    expect(
      crossover(
        candles([...Array.from({ length: 24 }, (_, i) => 100 - i), 200]),
        9,
        21,
      ).signal,
    ).toBe('BUY');
  });
  it('rejects invalid indicator parameters', () => {
    expect(() => ema([1, NaN], 2)).toThrow();
    expect(() => crossover(candles([1, 2, 3]), 3, 2)).toThrow();
  });
});
