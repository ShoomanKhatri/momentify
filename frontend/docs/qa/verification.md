# Frontend verification — 2026-10-10

- Production build passed using Next.js 16.4 and local Geist fonts.
- ESLint and strict TypeScript checks passed.
- All 30 Playwright checks passed in Chromium.
- Every page was checked at 375, 768 and 1280 pixels. No page-level horizontal overflow; wide tables scroll within their region.
- Axe found no WCAG A/AA violations in those page checks. Keyboard confirmations, focus restoration, input-error focus and chart inspection were checked separately.
- Six real NestJS read endpoints were verified through the same-origin frontend proxy. The market feed was live; the strategy was paused.
- A real strategy save through the browser returned HTTP 200. The original temporary QA configuration was restored. The bot stayed paused.
- Loading, failed requests, recovery, empty markets/trades, filled-trade filtering and stale quote expiration were checked using test-only response fixtures.
- Fresh quotes with stale completed candles suppress EMA signals and disable starts. A start dialog also disables confirmation when its market data expires.
- Refreshed settings update untouched fields. Conflicting saved settings preserve the draft and prevent accidental overwrite until saved values are selected.
- Invalid JSON displays an actionable error. Stalled browser requests reach the real 12-second timeout, retry once, and recover through the retry control.
- Origin regression checks exercise the actual Next.js route: a valid incoming-host origin reaches upstream handling, and a foreign origin receives 403.

[Desktop preview](overview-desktop.png) · [Mobile preview](overview-mobile.png)

Screenshots show actual API data from an isolated paper session. The flat equity line reflects an account with no executed trades. Test fixture data is never imported by the production UI.

These automated checks are not a substitute for manual screen-reader and cross-browser testing. Current API and dependency limitations are listed in the frontend README.
