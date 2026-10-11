import type { Candle, PoolMetadata } from '../contracts.js';
import { parseCandles, parsePositive } from './market-data.js';

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid provider response');
  return value as Record<string, unknown>;
}

export function optionalNumber(value: unknown, signed = false): number | null {
  if (value === null || value === undefined) return null;
  if (
    (typeof value !== 'string' && typeof value !== 'number') ||
    String(value).trim() === ''
  )
    throw new Error('Invalid provider number');
  const result = Number(value);
  if (!Number.isFinite(result) || (!signed && result < 0))
    throw new Error('Invalid provider number');
  return result;
}

export function verifyGeckoPool(
  input: unknown,
  solMint: string,
  usdcMint: string,
): PoolMetadata {
  const pool = record(input);
  const attributes = record(pool.attributes);
  const relations = record(pool.relationships);
  const base = record(record(relations.base_token).data).id;
  const quote = record(record(relations.quote_token).data).id;
  const dex = record(record(relations.dex).data).id;
  const address = attributes.address;
  if (
    base !== `solana_${solMint}` ||
    quote !== `solana_${usdcMint}` ||
    typeof address !== 'string' ||
    !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address) ||
    pool.id !== `solana_${address}` ||
    typeof dex !== 'string'
  )
    throw new Error('Pool is not canonical SOL/USDC on Solana');
  return {
    address,
    network: 'solana',
    dex,
    baseMint: solMint,
    quoteMint: usdcMint,
    quote: 'USDC',
    verifiedAt: new Date().toISOString(),
  };
}

export function parseGeckoCandles(
  input: unknown,
  now: number,
  pool: PoolMetadata,
): Candle[] {
  const body = record(input);
  const meta = record(body.meta);
  if (
    record(meta.base).address !== pool.baseMint ||
    record(meta.quote).address !== pool.quoteMint
  )
    throw new Error('OHLCV token metadata does not match verified pool');
  const rows = record(record(body.data).attributes).ohlcv_list;
  if (!Array.isArray(rows) || rows.length > 1000)
    throw new Error('Invalid GeckoTerminal OHLCV');
  if (rows.length === 0) return [];
  const seen = new Set<number>();
  // GeckoTerminal rows are [timestamp, open, high, low, close, volume].
  const normalized = rows.map((row: unknown) => {
    if (!Array.isArray(row) || row.length !== 6)
      throw new Error('Invalid GeckoTerminal candle');
    if (seen.has(row[0] as number))
      throw new Error('Duplicate candle timestamp');
    seen.add(row[0] as number);
    return [row[0], row[3], row[2], row[1], row[4], row[5]];
  });
  return parseCandles(normalized, now);
}

export function parseDexPair(input: unknown, pool: PoolMetadata) {
  const pairs = record(input).pairs;
  if (!Array.isArray(pairs)) throw new Error('Invalid DexScreener response');
  const pair = pairs
    .map(record)
    .find((value) => value.pairAddress === pool.address);
  if (
    !pair ||
    pair.chainId !== 'solana' ||
    record(pair.baseToken).address !== pool.baseMint ||
    record(pair.quoteToken).address !== pool.quoteMint
  )
    throw new Error('DexScreener pool does not match verified SOL/USDC market');
  return {
    price: parsePositive(pair.priceNative),
    change24h:
      pair.priceChange == null
        ? null
        : optionalNumber(record(pair.priceChange).h24, true),
    volume24h:
      pair.volume == null ? null : optionalNumber(record(pair.volume).h24),
    liquidityUsd:
      pair.liquidity == null
        ? null
        : optionalNumber(record(pair.liquidity).usd),
  };
}
