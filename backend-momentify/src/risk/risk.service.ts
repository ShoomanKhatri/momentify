import { Injectable } from '@nestjs/common';
import { ConfigService } from '../config/config.service.js';
import type { PaperSession } from '../database/session.js';
import type { Trade } from '../contracts.js';
import { liquidationValue } from '../portfolio/accounting.js';

@Injectable()
export class RiskService {
  constructor(private readonly config: ConfigService) {}

  check(
    state: PaperSession,
    price: number,
  ): { exit: Trade['reason'] | null; halt: boolean } {
    const liquidation = liquidationValue(
      state,
      price,
      this.config.feeBps,
      this.config.slippageBps,
    );
    const dailyLoss =
      state.dayStartEquity !== null &&
      liquidation <=
        state.dayStartEquity * (1 - state.config.maxDailyLossPercent / 100);
    if (dailyLoss || state.dailyHalted)
      return { exit: state.position ? 'DAILY_LIMIT' : null, halt: true };
    if (!state.position) return { exit: null, halt: false };
    const returnPercent =
      ((liquidation - state.cash - state.position.costBasis) /
        state.position.costBasis) *
      100;
    if (returnPercent <= -state.config.stopLossPercent)
      return { exit: 'STOP_LOSS', halt: false };
    if (returnPercent >= state.config.takeProfitPercent)
      return { exit: 'TAKE_PROFIT', halt: false };
    return { exit: null, halt: false };
  }

  canBuy(state: PaperSession): boolean {
    return !state.position && !state.dailyHalted && state.cash > 0;
  }
}
