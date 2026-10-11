# Momentify API v1

Backend: `/api/v1`; the existing `/api` equivalents remain compatible. Next.js proxies to v1 using server-only BACKEND_URL and optional BACKEND_API_TOKEN. Local V1 requires no authentication unless an API token was explicitly configured. All external traffic originates in NestJS.

Response DTO interfaces live in `backend-momentify/src/contracts.ts` and are re-exported by `frontend/lib/models.ts`. Runtime validated strategy DTOs and TradesQueryDto live alongside their controllers. Swagger is available at `/api/docs`.

| GET endpoint | Response type | Contents |
| --- | --- | --- |
| /health | HealthSnapshot | Backend liveness, paper/live flags, independent Helius/GeckoTerminal/DexScreener status, current confirmed slot, last successful combined market refresh |
| /dashboard | DashboardSnapshot | Portfolio, strategy, market, five latest paper fills, settings, health and server time in one cached-query request |
| /market/candles | CandlesResponse | Completed OHLCV, timestamp, EMA 9/21, pool, denomination, freshness and fetch time |
| /markets | { markets: MarketSnapshot[] } | Verified SOL/USDC price, optional 24h change, volume, liquidity, pool metadata and candles |
| /strategy | StrategySnapshot | enabled, status (running/paused), EMA configuration, latest confirmed crossover, last processed candle and evaluation time |
| /trades?page=1&limit=25&side=BUY | TradesResponse | Newest-first trades, page, limit, total, totalPages; optional BUY/SELL filter; limit 1–100 |
| /portfolio/history | { history: EquityPoint[] } | Persisted paper equity snapshots |
| /portfolio | PortfolioSnapshot | Cash, equity, PnL, position, fees/slippage, initial balance |
| /settings | SettingsSnapshot | Effective virtual portfolio and paper execution configuration |

Provider status: connecting/live/stale/unavailable. Missing values are null, not zero. Backend health is independent of upstream health. UTC ISO timestamps identify request/refresh times; candle.time is Unix seconds at candle OPEN and candle.timestamp is its ISO equivalent. strategy.candleAt and lastProcessedCandleAt identify candle CLOSE. Null EMAs indicate warmup; gaps reset EMA segments and crossovers require consecutive completed candles.

Prices and paper accounting are denominated in USDC. GeckoTerminal requests `currency=token&token=base`; candle volume is USDC. DexScreener uses `priceNative` (USDC per SOL), while reported 24h volume and liquidity are USD. DexScreener does not supply quote event timestamps: quoteTimestampKind=fetched makes quoteAt explicitly a backend fetch timestamp, not a claimed on-chain event time. Pool addresses and canonical token mints must match before merging. Pool discovery selects the highest-liquidity canonical SOL/USDC pool above MIN_LIQUIDITY_USD and holds its identity for the process lifetime; SOL_USDC_POOL_ADDRESS pins a pool, which is still verified. No provider fallback to a different pool occurs. Old Kraken candles are never loaded into this market.

GeckoTerminal OHLCV is requested once per completed-minute boundary, with `before_timestamp` excluding the current minute and avoiding reuse of an older unbounded upstream response; quotes follow MARKET_POLL_INTERVAL_MS (a newly completed candle can force a quote refresh after its close); RPC health/slot/mainnet genesis are checked once per 60 seconds. Requests time out after 8 seconds. Concurrent refreshes are deduplicated; provider failures back off and 429 respects Retry-After. Failed providers report unavailable independently of backend connectivity. Last valid values are retained as cached history with their original timestamps; aged successful data reports stale. A completed candle older than 120 seconds blocks strategy execution. Quotes older than 180 seconds are stale. Helius never supplies virtual balances.

Paper orders have no REST creation route. Only the backend engine can create fills, after crossover and risk validation including liquidity, daily loss, position limits, configured fees/slippage and a persisted candle watermark. PAPER_TRADING=true and LIVE_TRADING_ENABLED=false are enforced; no signing or transaction submission exists. STRATEGY_ENABLED=true applies to a new session; existing sessions restart stopped for safety and can be resumed through the existing validated strategy status endpoint.

The default SOL/USDC paper session uses `.data/momentify-sol-usdc.sqlite`. Legacy sessions with positions or trades cannot be loaded under another market identity; use a separate database. Client bundles contain only response types, never provider credentials.
