import { randomUUID } from 'node:crypto';
import type { PaperSession } from '../database/session.js';
import type { Trade } from '../contracts.js';
import { equity } from '../portfolio/accounting.js';

export function executePaperOrder(
  state: PaperSession,
  side: Trade['side'],
  referencePrice: number,
  costs: { feeBps: number; slippageBps: number },
  reason: Trade['reason'],
  timestamp: string,
  candleAt: string | null,
): Trade | null {
  if (!Number.isFinite(referencePrice) || referencePrice <= 0)
    throw new Error('Invalid execution price');
  if (
    (side === 'BUY' && state.position) ||
    (side === 'SELL' && !state.position)
  )
    return null;
  const price =
    referencePrice *
    (1 + ((side === 'BUY' ? 1 : -1) * costs.slippageBps) / 10_000);
  const budget = Math.min(
    state.cash,
    (equity(state, referencePrice) * state.config.positionSizePercent) / 100,
  );
  const quantity =
    side === 'BUY'
      ? Math.floor((budget / (price * (1 + costs.feeBps / 10_000))) * 1e8) / 1e8
      : state.position!.quantity;
  if (quantity <= 0) return null;
  const notional = quantity * price;
  const fee = (notional * costs.feeBps) / 10_000;
  const slippage = quantity * Math.abs(price - referencePrice);
  const realizedPnl =
    side === 'SELL' ? notional - fee - state.position!.costBasis : null;
  if (side === 'BUY') {
    state.cash -= notional + fee;
    state.position = {
      symbol: 'SOL',
      quantity,
      averageEntry: price,
      costBasis: notional + fee,
    };
  } else {
    state.cash += notional - fee;
    state.realizedPnl += realizedPnl!;
    state.position = null;
  }
  state.feesPaid += fee;
  state.slippagePaid += slippage;
  const trade: Trade = {
    id: randomUUID(),
    timestamp,
    symbol: 'SOL',
    side,
    price,
    referencePrice,
    quantity,
    fee,
    slippage,
    realizedPnl,
    status: 'FILLED',
    reason,
    candleAt,
  };
  state.trades.push(trade);
  return trade;
}
