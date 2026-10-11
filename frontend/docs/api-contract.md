# Frontend API contract

The canonical [Momentify API v1 contract](../../docs/api-contract.md) documents all endpoints, response DTOs, pool identity, denominations, refresh timestamps, freshness and paper safety.

The frontend imports shared types from `backend-momentify/src/contracts.ts` through `lib/models.ts`. Its typed client calls the same-origin Next.js proxy, which forwards to NestJS `/api/v1`. All provider URLs and keys remain server-only. The Overview and workspace header share one React Query dashboard cache. Requests time out and retry once; external provider health remains independent of backend connectivity.
