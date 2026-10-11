import type { EquityPoint, StrategyConfig, Trade } from '../contracts.js';

export interface PaperSession {
  version: 1;
  marketPair: 'SOL-USDC';
  initialBalance: number;
  cash: number;
  position: {
    symbol: 'SOL';
    quantity: number;
    averageEntry: number;
    costBasis: number;
  } | null;
  realizedPnl: number;
  feesPaid: number;
  slippagePaid: number;
  config: StrategyConfig;
  running: boolean;
  startedAt: string | null;
  lastCandleTime: number | null;
  lastEvaluatedAt: string | null;
  message: string | null;
  riskDay: string | null;
  dayStartEquity: number | null;
  dailyHalted: boolean;
  emergencyStopped: boolean;
  trades: Trade[];
  equityHistory: EquityPoint[];
  updatedAt: string;
}
