# Initial audit

The existing frontend is Next.js 16.4 / React 19.3, App Router, strict TypeScript, Tailwind 4 and Geist. It contains only the scaffold page. Next's installed documentation and `frontend/AGENTS.md` were reviewed before implementation.

The backend is NestJS 12, ESM / NodeNext, strict TypeScript, Vitest and Oxlint. It contains a Hello World controller and an Observe integration with placeholder credentials. There are no market, strategy, trading, risk, portfolio or persistence APIs. Both apps initially default to port 3000.

The existing untracked `.env.example` describes future features. Actual secret values in `.env` are not needed for this implementation and are not exposed. New environment configuration is documented separately in `.env.paper.example`.

Implementation decisions:

- Keep both existing applications, compilers and package managers.
- Set the backend to 3001; use a same-origin Next.js proxy with a server-only backend URL and optional API token.
- Use Kraken's public SOL/USD reference feed, completed one-minute OHLCV candles, and current timestamped trades. Coinbase's endpoint was unreachable from this machine; Kraken was verified successfully. No invented DEX data or assumed USDC/USD peg. Kraken's ticker provides rolling 24h volume but its opening price is UTC midnight, so rolling 24h change remains unavailable.
- Use long-only paper execution, explicit fees and adverse slippage, single-position accounting and persisted risk limits.
- Persist the paper session with Node's SQLite API. Pause on every process restart; do not replay historical signals into fills.
- Keep the product locally operated and single-user. Live execution, wallet connection and authentication are outside this initial implementation.
