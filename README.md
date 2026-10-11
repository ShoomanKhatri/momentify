# Momentify

A local, single-user Solana momentum dashboard and paper trading engine. Next.js displays verified SOL/USDC market data from the NestJS backend, with GeckoTerminal completed candles, EMA 9/21 crossover signals, DexScreener quotes and Helius RPC health.

Run NestJS on port 3001 and Next.js on port 3000. Configure the backend-only `.env` and frontend `BACKEND_URL=http://127.0.0.1:3001`. See the [backend setup](backend-momentify/README.md), [frontend setup](frontend/README.md), and [API v1 contract](docs/api-contract.md).

Only virtual USDC balances and backend-created paper fills exist. PAPER_TRADING=true and LIVE_TRADING_ENABLED=false are enforced. No login or wallet signing is required.
