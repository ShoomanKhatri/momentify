// Provider fixtures used only by tests. Never imported by runtime services.
export const SOL = 'So11111111111111111111111111111111111111112';
export const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const POOL = 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE';
export const poolFixture = () => ({
  id: `solana_${POOL}`,
  attributes: { address: POOL, reserve_in_usd: '1000000' },
  relationships: {
    base_token: { data: { id: `solana_${SOL}` } },
    quote_token: { data: { id: `solana_${USDC}` } },
    dex: { data: { id: 'orca' } },
  },
});
export const dexFixture = () => ({
  pairs: [
    {
      chainId: 'solana',
      pairAddress: POOL,
      dexId: 'orca',
      baseToken: { address: SOL },
      quoteToken: { address: USDC },
      priceNative: '110',
      priceUsd: '109.9',
      priceChange: { h24: -2.5 },
      volume: { h24: 500000 },
      liquidity: { usd: 1000000 },
    },
  ],
});
export function ohlcvFixture(
  now: number,
  closes = Array(30).fill(100) as number[],
) {
  const bucket = Math.floor(now / 60000) * 60;
  return {
    meta: { base: { address: SOL }, quote: { address: USDC } },
    data: {
      attributes: {
        ohlcv_list: [
          ...closes.map((close, i) => [
            bucket - (closes.length - i) * 60,
            close,
            close + 1,
            close - 1,
            close,
            20,
          ]),
          [bucket, 110, 111, 109, 110, 1],
        ].reverse(),
      },
    },
  };
}
export function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => body,
  };
}
