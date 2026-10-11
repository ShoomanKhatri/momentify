# Momentify frontend

A minimal paper-trading workspace built with the existing Next.js App Router, strict TypeScript and Tailwind 4. Geist is bundled locally. Lucide supplies icons; TanStack Query handles requests, caching and refresh. Native buttons, inputs and modal dialogs provide accessible primitives without a second component runtime.

## Local development

Use Node 24+ and run from this directory:

```bash
npm ci
npm run dev -- --hostname 127.0.0.1
```

Open http://localhost:3000. The existing NestJS API must be running independently. Its default connection is http://127.0.0.1:3001/api.

To use a different backend, create `.env.local` using the variables in `.env.example`:

```dotenv
BACKEND_URL=http://127.0.0.1:3001
BACKEND_API_TOKEN=
```

`BACKEND_URL` excludes `/api`. The optional token must match the backend token. Both variables stay on the Next.js server; do not prefix them with `NEXT_PUBLIC_`. Restart Next.js after changing them.

When the API is offline, the UI shows an error and an inline retry. Trading metrics never receive fallback numbers.

## Pages

- **Overview:** equity, net PnL, SOL quote, bot status, recorded equity history and recent trades.
- **Markets:** sortable API watchlist with price, 24h change when available, USD volume and liquidity and momentum signal.
- **Strategy:** validated EMA and risk controls, saved-state feedback and confirmed bot actions.
- **Trades:** execution history, side filters, pagination, fees and net realized PnL.
- **Settings:** actual execution assumptions and an adjustable browser-session refresh interval.

Light surfaces, restrained forest-green accents, shared spacing and tabular numbers define the design. Navigation stays visible at every breakpoint. Price and signal freshness expire even with manual refresh selected. Charts support pointer and keyboard inspection. Reduced motion and visible focus styles are built in.

Live API screenshots: [desktop](docs/qa/overview-desktop.png) · [mobile](docs/qa/overview-mobile.png).

## Existing API integration

Browser requests go through the same-origin `app/api/[...path]/route.ts` proxy. It forwards only these existing endpoints, preserves API statuses, enforces request timeouts and rejects cross-origin mutations:

| Method | NestJS endpoint | Frontend use |
| --- | --- | --- |
| GET | `/api/health` | Connection smoke check |
| GET | `/api/dashboard` | Overview and workspace connection |
| GET | `/api/markets` | Watchlist |
| GET | `/api/portfolio` | Available through the proxy |
| GET | `/api/strategy` | Configuration, status and momentum |
| PATCH | `/api/strategy/config` | Save configuration |
| PATCH | `/api/strategy/status` | Start/pause with `{ "running": true/false }` |
| GET | `/api/trades` | Execution history |
| GET | `/api/settings` | Actual paper execution settings |

`lib/models.ts` imports the existing backend contract types without modifying them. The repo must contain the sibling backend directory for TypeScript checks. `lib/api.ts` centralizes typed requests and errors. `lib/queries.ts` owns server-state queries.

Configuration requests contain `fastPeriod`, `slowPeriod`, `positionSizePercent`, `maxDailyLossPercent`, `stopLossPercent` and `takeProfitPercent`. The API requires the strategy to be paused before saving. HTTP errors expose a `message` string or validation-message array; the frontend preserves input and shows it inline.

The [frontend API contract](docs/api-contract.md) documents response semantics, accepted configuration, freshness rules and error handling. Untouched controls follow backend refreshes; edits remain intact when saved settings change. Stale candles suppress signals independently of fresh quotes, including while a start confirmation is open.

## Verification

```bash
npm run lint
npm run type-check
npm run build
npx playwright install chromium
npm run test:e2e
```

The browser suite starts a production frontend on port 3200. Its response fixtures are confined to `tests/`; no fixture data is included in the application. Checks cover every page at 375, 768 and 1280 pixels, WCAG A/AA rules with axe, confirmations, keyboard focus, strategy validation/save feedback, chart keyboard interaction, stale data, market sorting/empty states, filled trades, loading and error recovery. Additional checks exercise the real Next.js proxy to reject cross-origin changes and accept valid incoming-host origins; its test upstream is intentionally unavailable.

To check a running frontend against its actual NestJS connection:

```bash
npm run check:api
# Or point the read-only check at another running preview:
MOMENTIFY_URL=http://127.0.0.1:3100 npm run check:api
```

Production preview:

```bash
npm run build
npm run start -- --hostname 127.0.0.1
```

## Current limits

- Market coverage and strategy signals depend on the existing backend. Its verified SOL/USDC pool supplies GeckoTerminal completed candles and DexScreener quotes, 24h change, USD volume and USD liquidity. Missing fields render as an em dash. See [the v1 contract](../docs/api-contract.md).
- No wallet or live execution controls are presented. Login is not part of the current API; this workspace assumes trusted local access.
- Trade pagination is performed on the current API's complete response. Large histories need a paginated backend endpoint before scaling.
- Refresh preferences apply to the current browser session.
- `npm audit` reports five inherited high-severity findings in the development lint dependency chain, originating in `braces <=3.0.3`. At verification time the registry's latest release was 3.0.3; the suggested forced fix would downgrade the Next.js lint configuration across major versions. Runtime application dependencies are not the affected chain.

Live verification: with both servers running, `npm run check:api` checks eight real REST resources and `npm run check:dashboard` checks actual provider data, EMA overlays, responsive rendering and runtime errors. The browser check uses the Playwright browser installation (run `npx playwright install chromium` if needed). It never changes strategy state or creates orders.
