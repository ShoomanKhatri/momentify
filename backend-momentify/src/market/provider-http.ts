import type { ProviderStatus } from '../contracts.js';

export function initialStatus(): ProviderStatus {
  return {
    status: 'connecting',
    checkedAt: null,
    lastSuccessAt: null,
    message: null,
  };
}

/** One instance per provider; URLs and raw error messages never enter API responses or logs. */
export class ProviderHttp {
  private retryAt = 0;
  private failures = 0;
  readonly state = initialStatus();

  async request(url: string, options?: RequestInit): Promise<unknown> {
    if (Date.now() < this.retryAt)
      throw new Error(this.state.message ?? 'Provider retry pending');
    this.state.checkedAt = new Date().toISOString();
    try {
      const response = await fetch(url, {
        ...options,
        headers: { Accept: 'application/json', ...options?.headers },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        if (response.status === 429) {
          const raw = response.headers?.get('retry-after');
          const seconds = raw && /^\d+$/.test(raw) ? Number(raw) : NaN;
          const date = raw ? Date.parse(raw) : NaN;
          const delay = Number.isFinite(seconds)
            ? seconds * 1000
            : Number.isFinite(date)
              ? date - Date.now()
              : 60_000;
          this.retryAt =
            Date.now() + Math.max(60_000, Math.min(delay, 3_600_000));
        }
        throw new Error(`Provider HTTP ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      this.fail(
        error instanceof Error && /^Provider HTTP \d+$/.test(error.message)
          ? error.message
          : 'Provider request failed or timed out',
      );
      throw new Error(this.state.message!);
    }
  }

  success(): void {
    this.failures = 0;
    this.retryAt = 0;
    this.state.status = 'live';
    this.state.lastSuccessAt = new Date().toISOString();
    this.state.message = null;
  }

  fail(message = 'Invalid provider data'): void {
    // Availability describes the provider now. Cached data and lastSuccessAt
    // remain available for inspection, but a failed request is not a live feed.
    this.state.status = 'unavailable';
    this.state.message = message;
    this.retryAt = Math.max(
      this.retryAt,
      Date.now() +
        Math.min(300_000, 15_000 * 2 ** Math.min(this.failures++, 5)),
    );
  }

  get(): ProviderStatus {
    const state = { ...this.state };
    if (
      state.status === 'live' &&
      state.lastSuccessAt &&
      Date.now() - Date.parse(state.lastSuccessAt) > 180_000
    )
      state.status = 'stale';
    return state;
  }
}
