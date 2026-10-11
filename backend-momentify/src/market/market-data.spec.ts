import {
  krakenResult,
  parseCandles,
  parseKrakenCandles,
  parsePositive,
  rollingChange,
} from './market-data.js';

describe('market ingestion', () => {
  const start = 1_700_000_040;
  const row = (time: number) => [time, 95, 105, 100, 101, 50];
  it('discards unfinished candles, deduplicates and sorts', () => {
    const parsed = parseCandles(
      [row(start + 120), row(start + 60), row(start), row(start)],
      (start + 130) * 1000,
    );
    expect(parsed.map((item) => item.time)).toEqual([start, start + 60]);
    expect(parsed[0]).toEqual({
      time: start,
      low: 95,
      high: 105,
      open: 100,
      close: 101,
      volume: 50,
    });
  });
  it('rejects invalid OHLCV rather than creating substitute candles', () => {
    expect(() =>
      parseCandles([[start, 105, 95, 100, 101, 50]], (start + 60) * 1000),
    ).toThrow();
    expect(() =>
      parseCandles([[start, 95, 105, 100, 200, 50]], (start + 60) * 1000),
    ).toThrow();
    expect(() =>
      parseCandles([[start, 95, 105, 100, NaN, 50]], (start + 60) * 1000),
    ).toThrow();
    expect(() => parseCandles([row(start + 1)], (start + 60) * 1000)).toThrow();
  });
  it('does not coerce empty, negative or nonfinite prices', () => {
    for (const value of ['', null, -1, Infinity, 'invalid'])
      expect(() => parsePositive(value)).toThrow();
    expect(parsePositive('100.25')).toBe(100.25);
  });
  it('normalizes Kraken OHLCV and always removes the uncommitted final candle', () => {
    const input = [start, start + 60, start + 120].map((time) => [
      time,
      '100',
      '105',
      '95',
      '101',
      '100',
      '50',
      5,
    ]);
    const parsed = parseKrakenCandles(input, (start + 500) * 1000);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({
      time: start,
      open: 100,
      high: 105,
      low: 95,
      close: 101,
      volume: 50,
    });
  });
  it('rejects Kraken errors even when HTTP status is successful', () => {
    expect(() =>
      krakenResult({ error: ['EAPI:Rate limit exceeded'], result: {} }),
    ).toThrow();
    expect(() => krakenResult({ error: [], result: null })).toThrow();
    expect(krakenResult({ error: [], result: { SOLUSD: [] } })).toEqual({
      SOLUSD: [],
    });
  });
  it('honors a non-minute candle interval', () => {
    const hour = start - (start % 3_600);
    const input = [hour, hour + 3_600, hour + 7_200].map((time) => [
      time,
      '100',
      '105',
      '95',
      '101',
      '100',
      '50',
      5,
    ]);
    const parsed = parseKrakenCandles(
      input,
      (hour + 11_000) * 1000,
      3_600,
    );
    expect(parsed.map((item) => item.time)).toEqual([hour, hour + 3_600]);
  });
  it('computes a rolling 24h change from hourly closes', () => {
    const now = start * 1000;
    const hourly = (offsetHours: number, close: number) => ({
      time: start + offsetHours * 3_600 - 3_600,
      open: close,
      high: close,
      low: close,
      close,
      volume: 1,
    });
    const candles = [
      hourly(-25, 50),
      hourly(-24, 100),
      hourly(-23, 200),
      hourly(-1, 110),
    ];
    expect(rollingChange(candles, 120, now)).toBeCloseTo(20);
  });
  it('returns null when the window is not covered', () => {
    const now = start * 1000;
    const candle = {
      time: start - 3_600,
      open: 100,
      high: 100,
      low: 100,
      close: 100,
      volume: 1,
    };
    expect(rollingChange([candle], 120, now)).toBeNull();
    expect(rollingChange([], 120, now)).toBeNull();
    expect(rollingChange([candle], 0, now)).toBeNull();
  });
});
