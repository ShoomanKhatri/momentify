import type { Candle } from '../contracts.js';

export function parseCandles(
  input: unknown,
  now: number,
  intervalSeconds = 60,
): Candle[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > 730)
    throw new Error('Invalid candle response');
  const candles = new Map<number, Candle>();
  for (const row of input) {
    if (
      !Array.isArray(row) ||
      row.length !== 6 ||
      !row.every(
        (value: unknown) => typeof value === 'number' && Number.isFinite(value),
      )
    ) {
      throw new Error('Invalid candle data');
    }
    const [time, low, high, open, close, volume] = row as number[];
    if (
      !Number.isInteger(time) ||
      time <= 0 ||
      time % intervalSeconds !== 0 ||
      low <= 0 ||
      high < low ||
      open < low ||
      open > high ||
      close < low ||
      close > high ||
      volume < 0
    ) {
      throw new Error('Invalid OHLCV candle');
    }
    if ((time + intervalSeconds) * 1000 <= now)
      candles.set(time, { time, low, high, open, close, volume });
  }
  return [...candles.values()].sort((a, b) => a.time - b.time);
}

export function consecutiveTail(
  candles: Candle[],
  intervalSeconds = 60,
): Candle[] {
  let start = 0;
  for (let i = 1; i < candles.length; i++) {
    if (candles[i].time - candles[i - 1].time !== intervalSeconds) start = i;
  }
  return candles.slice(start);
}

export function parsePositive(value: unknown): number {
  if ((typeof value !== 'string' && typeof value !== 'number') || value === '')
    throw new Error('Invalid market number');
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0)
    throw new Error('Invalid market number');
  return number;
}

export function krakenResult(input: unknown): Record<string, unknown> {
  if (
    !input ||
    typeof input !== 'object' ||
    !('error' in input) ||
    !Array.isArray(input.error) ||
    input.error.length > 0 ||
    !('result' in input) ||
    !input.result ||
    typeof input.result !== 'object'
  )
    throw new Error('Invalid Kraken response');
  return input.result as Record<string, unknown>;
}

export function parseKrakenCandles(
  input: unknown,
  now: number,
  intervalSeconds = 60,
): Candle[] {
  if (!Array.isArray(input) || input.length < 2 || input.length > 730)
    throw new Error('Invalid Kraken candles');
  // Kraken always includes the current, uncommitted candle as the final entry.
  const normalized = input.slice(0, -1).map((row: unknown) => {
    if (
      !Array.isArray(row) ||
      row.length !== 8 ||
      typeof row[0] !== 'number' ||
      typeof row[6] !== 'string' ||
      row[6] === '' ||
      !Number.isFinite(Number(row[6])) ||
      Number(row[6]) < 0
    )
      throw new Error('Invalid Kraken OHLCV');
    return [
      row[0],
      parsePositive(row[3]),
      parsePositive(row[2]),
      parsePositive(row[1]),
      parsePositive(row[4]),
      Number(row[6]),
    ];
  });
  return parseCandles(normalized, now, intervalSeconds);
}

export function rollingChange(
  candles: Candle[],
  currentPrice: number,
  now: number,
  windowSeconds = 86_400,
  intervalSeconds = 3_600,
): number | null {
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) return null;
  const target = now - windowSeconds * 1000;
  let reference: Candle | null = null;
  let bestDelta = Infinity;
  for (const candle of candles) {
    const delta = Math.abs((candle.time + intervalSeconds) * 1000 - target);
    if (delta < bestDelta) {
      bestDelta = delta;
      reference = candle;
    }
  }
  if (!reference || bestDelta > intervalSeconds * 1000) return null;
  return ((currentPrice - reference.close) / reference.close) * 100;
}
