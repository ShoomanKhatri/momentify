import type { Candle, SignalSnapshot } from '../contracts.js';
import { consecutiveTail } from '../market/market-data.js';

export function ema(values: number[], period: number): (number | null)[] {
  if (
    !Number.isInteger(period) ||
    period < 2 ||
    values.some((value) => !Number.isFinite(value))
  )
    throw new Error('Invalid EMA inputs');
  let previous: number | null = null;
  const alpha = 2 / (period + 1);
  return values.map((value, index) => {
    if (index < period - 1) return null;
    if (previous === null)
      previous =
        values.slice(0, period).reduce((sum, item) => sum + item, 0) / period;
    else previous = value * alpha + previous * (1 - alpha);
    return previous;
  });
}

export function crossover(
  candles: Candle[],
  fastPeriod: number,
  slowPeriod: number,
): SignalSnapshot {
  const empty: SignalSnapshot = {
    signal: null,
    fastEma: null,
    slowEma: null,
    candleAt: null,
    ready: false,
  };
  if (fastPeriod >= slowPeriod)
    throw new Error('Fast EMA must be less than slow EMA');
  const tail = consecutiveTail(candles);
  const latest = tail.at(-1);
  if (!latest) return empty;
  const candleAt = new Date((latest.time + 60) * 1000).toISOString();
  if (tail.length < slowPeriod + 1) return { ...empty, candleAt };
  const closes = tail.map((candle) => candle.close);
  const fast = ema(closes, fastPeriod);
  const slow = ema(closes, slowPeriod);
  const f = fast.at(-1)!;
  const s = slow.at(-1)!;
  const fp = fast.at(-2)!;
  const sp = slow.at(-2)!;
  if (f === null || s === null || fp === null || sp === null)
    return { ...empty, candleAt };
  const signal =
    fp <= sp && f > s ? 'BUY' : fp >= sp && f < s ? 'SELL' : 'HOLD';
  return { signal, fastEma: f, slowEma: s, candleAt, ready: true };
}
