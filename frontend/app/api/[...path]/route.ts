import type { NextRequest } from "next/server";

const allowed = new Map([
  ["dashboard", ["GET"]],
  ["markets", ["GET"]],
  ["portfolio", ["GET"]],
  ["strategy", ["GET"]],
  ["trades", ["GET"]],
  ["settings", ["GET"]],
  ["health", ["GET"]],
  ["market/candles", ["GET"]],
  ["portfolio/history", ["GET"]],
  ["strategy/config", ["PATCH"]],
  ["strategy/status", ["PATCH"]],
]);
async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const path = (await context.params).path.join("/");
  if (!allowed.has(path))
    return Response.json({ message: "Endpoint not found" }, { status: 404 });
  if (!allowed.get(path)!.includes(request.method))
    return Response.json({ message: "Method not allowed" }, { status: 405 });
  if (
    request.method !== "GET" &&
    request.headers.get("origin") !==
      `${request.nextUrl.protocol}//${request.headers.get("host") ?? request.nextUrl.host}`
  )
    return Response.json(
      { message: "Cross-origin changes are not allowed" },
      { status: 403 },
    );
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (process.env.BACKEND_API_TOKEN)
      headers.Authorization = `Bearer ${process.env.BACKEND_API_TOKEN}`;
    const body = request.method === "PATCH" ? await request.text() : undefined;
    if (body && body.length > 4096)
      return Response.json({ message: "Request too large" }, { status: 413 });
    const response = await fetch(
      `${(process.env.BACKEND_URL ?? "http://127.0.0.1:3001").replace(/\/$/, "")}/api/v1/${path}${request.nextUrl.search}`,
      {
        method: request.method,
        headers,
        body,
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      },
    );
    const payload: unknown = await response.json();
    return Response.json(payload, {
      status: response.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    const invalidResponse = error instanceof SyntaxError;
    return Response.json(
      {
        message: timedOut
          ? "The backend request timed out. Try again."
          : invalidResponse
            ? "Backend returned an invalid response. Try again."
            : "Backend unavailable. Check that it is running and try again.",
      },
      { status: timedOut ? 504 : invalidResponse ? 502 : 503 },
    );
  }
}
export const GET = proxy;
export const PATCH = proxy;
