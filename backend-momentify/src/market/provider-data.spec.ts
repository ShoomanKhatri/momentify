import {
  parseDexPair,
  parseGeckoCandles,
  verifyGeckoPool,
} from './provider-data.js';
import { withIndicators } from './market.service.js';
import {
  SOL,
  USDC,
  poolFixture,
  dexFixture,
  ohlcvFixture,
} from './test-fixtures.js';

describe('provider parsing and identity', () => {
  const now = Date.parse('2026-10-10T12:00:30Z');
  const pool = verifyGeckoPool(poolFixture(), SOL, USDC);
  it('validates token mints rather than trusting symbols', () => {
    const body = poolFixture();
    body.relationships.quote_token.data.id = 'solana_fakeUSDC';
    expect(() => verifyGeckoPool(body, SOL, USDC)).toThrow();
  });
  it('normalizes OHLCV field order and sorts completed candles', () => {
    const body = ohlcvFixture(now, [99, 100]);
    body.data.attributes.ohlcv_list[1] = [
      body.data.attributes.ohlcv_list[1][0],
      100,
      105,
      98,
      103,
      50,
    ];
    const candles = parseGeckoCandles(body, now, pool);
    expect(candles).toHaveLength(2);
    expect(candles[1]).toMatchObject({
      open: 100,
      high: 105,
      low: 98,
      close: 103,
      volume: 50,
    });
    expect(candles[0].time).toBeLessThan(candles[1].time);
  });
  it('rejects duplicate timestamps, malformed prices and wrong OHLCV metadata', () => {
    const duplicate = ohlcvFixture(now);
    duplicate.data.attributes.ohlcv_list.push(
      duplicate.data.attributes.ohlcv_list[1],
    );
    expect(() => parseGeckoCandles(duplicate, now, pool)).toThrow('Duplicate');
    const malformed = ohlcvFixture(now);
    malformed.data.attributes.ohlcv_list[1][2] = -1;
    expect(() => parseGeckoCandles(malformed, now, pool)).toThrow();
    const wrong = ohlcvFixture(now);
    wrong.meta.quote.address = SOL;
    expect(() => parseGeckoCandles(wrong, now, pool)).toThrow('metadata');
  });
  it('preserves unavailable daily stats as null and rejects invalid quote numbers', () => {
    const body = dexFixture();
    delete (body.pairs[0] as Partial<(typeof body.pairs)[0]>).priceChange;
    expect(parseDexPair(body, pool).change24h).toBeNull();
    body.pairs[0].priceNative = 'NaN';
    expect(() => parseDexPair(body, pool)).toThrow();
  });
  it('resets chart EMAs across gaps instead of connecting a false crossover', () => {
    const candles = parseGeckoCandles(ohlcvFixture(now), now, pool);
    candles[25].time += 10;
    const result = withIndicators(candles);
    expect(result.at(-1)!.ema9).toBeNull();
  });
});
