import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { MarketService } from '../market/market.service.js';
import type { EquityPoint, PortfolioSnapshot } from '../contracts.js';
import { equity } from './accounting.js';

@Injectable()
export class PortfolioService {
  constructor(
    private readonly database: DatabaseService,
    private readonly market: MarketService,
  ) {}

  get(): PortfolioSnapshot {
    const state = this.database.read();
    const market = this.market.get();
    const value = !state.position
      ? state.cash
      : (market.quoteStatus ?? market.status) === 'live' &&
          market.price !== null
        ? equity(state, market.price)
        : null;
    const totalPnl = value === null ? null : value - state.initialBalance;
    return {
      initialBalance: state.initialBalance,
      cash: state.cash,
      equity: value,
      totalPnl,
      totalPnlPercent:
        totalPnl === null ? null : (totalPnl / state.initialBalance) * 100,
      realizedPnl: state.realizedPnl,
      unrealizedPnl:
        value === null
          ? null
          : value - state.cash - (state.position?.costBasis ?? 0),
      feesPaid: state.feesPaid,
      slippagePaid: state.slippagePaid,
      position: state.position,
      equityHistory: state.equityHistory,
      updatedAt: state.updatedAt,
    };
  }

  history(): EquityPoint[] {
    return this.database.read().equityHistory;
  }
}
