import type { NextRequest } from "next/server";
import { GeckoHistoryClient, HistoryError, SOL_MINT, USDC_MINT } from "@/lib/gecko-history";
import type { ChartRange } from "@/lib/chart-history";
import type { CandlesResponse } from "@/lib/models";

const history = new GeckoHistoryClient(process.env.GECKOTERMINAL_API_URL);

export async function GET(request: NextRequest) {
  const range = request.nextUrl.searchParams.get("range");
  if (range !== "1D" && range !== "1W" && range !== "ALL")
    return Response.json({ message: "Choose 1D, 1W or All history." }, { status: 400 });
  try {
    // Pool identity comes from the backend's verified feed, never a user URL.
    const headers: Record<string, string> = { Accept: "application/json" };
    if (process.env.BACKEND_API_TOKEN) headers.Authorization = `Bearer ${process.env.BACKEND_API_TOKEN}`;
    const response = await fetch(`${(process.env.BACKEND_URL ?? "http://127.0.0.1:3001").replace(/\/$/, "")}/api/v1/market/candles`, { headers, cache: "no-store", signal: AbortSignal.timeout(3000) });
    if (!response.ok) throw new HistoryError("The verified market feed is unavailable. Try again.", 503);
    const market = await response.json() as CandlesResponse;
    const pool = market.pool;
    if (!pool || pool.network !== "solana" || pool.quote !== "USDC" || pool.baseMint !== SOL_MINT || pool.quoteMint !== USDC_MINT)
      throw new HistoryError("Waiting for a verified SOL/USDC pool.", 503);
    if (pool.address !== request.nextUrl.searchParams.get("pool"))
      throw new HistoryError("The market pool changed. Refresh the workspace.", 409);
    const result = await history.get(pool.address, range as ChartRange);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const known = error instanceof HistoryError;
    return Response.json({ message: known ? error.message : "Historical data is temporarily unavailable. Try again." }, {
      status: known ? error.status : 503,
      headers: { "Cache-Control": "no-store", ...(known && error.retryAfter ? { "Retry-After": String(error.retryAfter) } : {}) },
    });
  }
}
