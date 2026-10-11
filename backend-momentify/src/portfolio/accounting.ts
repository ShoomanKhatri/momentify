import type { EquityPoint } from '../contracts.js';
import type { PaperSession } from '../database/session.js';

export const MAX_EQUITY_POINTS = 4_000;

export function equity(
  state: Pick<PaperSession, 'cash' | 'position'>,
  price: number,
): number {
  return state.cash + (state.position?.quantity ?? 0) * price;
}

export function liquidationValue(
  state: Pick<PaperSession, 'cash' | 'position'>,
  price: number,
  feeBps: number,
  slippageBps: number,
): number {
  return (
    state.cash +
    (state.position?.quantity ?? 0) *
      price *
      (1 - slippageBps / 10_000) *
      (1 - feeBps / 10_000)
  );
}

export function appendEquityPoint(
  history: EquityPoint[],
  point: EquityPoint,
  max = MAX_EQUITY_POINTS,
): void {
  history.push(point);
  if (history.length <= max) return;
  // Decimate the oldest samples in place so the persisted session stays bounded
  // while preserving the full time span and the most recent reading.
  const stride = Math.ceil(history.length / max);
  const kept = history.filter(
    (_, index) =>
      index === 0 || index === history.length - 1 || index % stride === 0,
  );
  history.length = 0;
  history.push(...kept);
}
