import type {
  DashboardSnapshot,
  MarketSnapshot,
  SettingsSnapshot,
  StrategyConfig,
  StrategySnapshot,
  TradesResponse,
  CandlesResponse,
  HealthSnapshot,
} from "./models";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  try {
    const response = await fetch(`/api/${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...options?.headers },
      signal: options?.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(12_000)])
        : AbortSignal.timeout(12_000),
    });
    const payload: unknown = await response.json().catch((error: unknown) => {
      if (error instanceof SyntaxError)
        throw new ApiError(
          "Backend returned an invalid response. Try again.",
          502,
        );
      throw error;
    });
    if (!response.ok) {
      const raw =
        payload && typeof payload === "object" && "message" in payload
          ? payload.message
          : null;
      throw new ApiError(
        Array.isArray(raw)
          ? raw.join(". ")
          : typeof raw === "string"
            ? raw
            : "Could not connect to Momentify",
        response.status,
      );
    }
    return payload as T;
  } catch (error) {
    if (options?.signal?.aborted) throw options.signal.reason;
    if (error instanceof ApiError) throw error;
    if (
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError")
    )
      throw new ApiError("The request timed out. Try again.", 408);
    throw new ApiError(
      "Backend unavailable. Check that it is running and try again.",
      503,
    );
  }
}

export const api = {
  dashboard: (signal?: AbortSignal) =>
    request<DashboardSnapshot>("dashboard", { signal }),
  markets: (signal?: AbortSignal) =>
    request<{ markets: MarketSnapshot[] }>("markets", { signal }),
  strategy: (signal?: AbortSignal) =>
    request<StrategySnapshot>("strategy", { signal }),
  trades: (signal?: AbortSignal, page = 1, side = "ALL") =>
    request<TradesResponse>(
      page === 1 && side === "ALL"
        ? "trades"
        : `trades?page=${page}&limit=25${side === "ALL" ? "" : `&side=${side}`}`,
      { signal },
    ),
  health: (signal?: AbortSignal) =>
    request<HealthSnapshot>("health", { signal }),
  candles: (signal?: AbortSignal) =>
    request<CandlesResponse>("market/candles", { signal }),
  settings: (signal?: AbortSignal) =>
    request<SettingsSnapshot>("settings", { signal }),
  setStrategyStatus: (running: boolean) =>
    request<StrategySnapshot>("strategy/status", {
      method: "PATCH",
      body: JSON.stringify({ running }),
    }),
  configureStrategy: (config: StrategyConfig) =>
    request<StrategySnapshot>("strategy/config", {
      method: "PATCH",
      body: JSON.stringify(config),
    }),
};
