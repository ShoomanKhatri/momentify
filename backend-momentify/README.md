# Momentify backend

NestJS + TypeScript paper engine for canonical mainnet SOL/USDC. Requires Node 24+ for SQLite. All external provider requests originate here; no wallet signing, swaps, or transaction submission exists.

## Run locally

Copy `.env.example` to `.env` when configuring a new installation, enter the real backend-only Helius RPC URL, then run `pnpm install`, `pnpm run build`, and `pnpm run start:prod`. The existing installation already has a configured `.env`. Default port is 3001; the frontend runs on 3000 with `BACKEND_URL=http://127.0.0.1:3001`. `pnpm run start:dev` starts watch mode. Local V1 needs no login. BACKEND_API_TOKEN is optional on localhost; use the same server-only token in Next.js if enabled.

`PAPER_TRADING=true` and `LIVE_TRADING_ENABLED=false` are enforced at startup. The default database is `.data/momentify-sol-usdc.sqlite`, separate from legacy SOL/USD history. Existing sessions restart stopped; start the bot through the Overview or Strategy controls after data is fresh. STRATEGY_ENABLED=true only enables a newly created session. Never overwrite an existing database to change the initial balance.

## Data and API

See the [versioned API contract](../docs/api-contract.md) for typed response DTOs, all endpoints, null/freshness semantics and timestamps. Interactive OpenAPI documentation is at `http://127.0.0.1:3001/api/docs`.

GeckoTerminal discovers or verifies a pinned SOL/USDC pool by canonical token mints, then returns completed 1m candles in USDC. DexScreener uses the identical pool for SOL price in USDC, optional 24h price change, and USD volume/liquidity. Helius only checks RPC health, confirmed slot and mainnet genesis. Providers have independent health, 8s request timeouts, rate-limit backoff and request deduplication. Candles are cached by completed-minute boundary, requested with before_timestamp and archived separately by pool; quotes follow MARKET_POLL_INTERVAL_MS. No unrelated-pool fallback exists.

The EMA 9/21 strategy uses SMA-seeded EMAs and confirmed crossovers between consecutive completed candles. Gaps restart warmup. Stale data blocks execution. The backend alone creates fills, with liquidity, one-position, daily loss, stop-loss/take-profit and slippage checks. Virtual balances, fills and equity snapshots persist in SQLite.

## Verify

`pnpm run lint`, `pnpm exec tsc --noEmit`, `pnpm run test`, `pnpm run test:e2e`, and `pnpm run build`. Unit tests cover provider parsing, pool identity, cache/backoff, Helius health, EMA/crossover, accounting and paper risk. Integration tests use actual Nest services, mocked provider transport, the real engine and v1 REST contracts. For live verification through the frontend, run `npm run check:api` in `../frontend` while both servers are running.

Provider references: [GeckoTerminal OpenAPI](https://api.geckoterminal.com/docs/v2/swagger.json), [DexScreener API](https://docs.dexscreener.com/api/reference), [Helius getHealth](https://www.helius.dev/docs/api-reference/rpc/http/gethealth).
