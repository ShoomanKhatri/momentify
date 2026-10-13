export type Signal = 'BUY' | 'SELL' | 'HOLD';
export type MarketStatus = 'connecting' | 'live' | 'stale' | 'unavailable';

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IndicatorCandle extends Candle {
  /** Candle OPEN time in UTC; time is the equivalent Unix timestamp in seconds. */
  timestamp: string;
  ema9: number | null;
  ema21: number | null;
}

export interface ProviderStatus {
  status: MarketStatus;
  checkedAt: string | null;
  lastSuccessAt: string | null;
  message: string | null;
}

export interface PoolMetadata {
  address: string;
  network: 'solana';
  dex: string;
  baseMint: string;
  quoteMint: string;
  quote: 'USDC';
  verifiedAt: string;
}

export interface HealthSnapshot {
  status: 'ok';
  mode: 'paper';
  paperTrading: true;
  liveTradingEnabled: false;
  backend: 'connected';
  helius: ProviderStatus & {
    slot: number | null;
    networkHealth: 'ok' | 'unavailable';
    network: 'solana-mainnet';
  };
  geckoTerminal: ProviderStatus;
  dexScreener: ProviderStatus;
  lastSuccessfulRefresh: string | null;
  serverTime: string;
}

export interface MarketSnapshot {
  symbol: 'SOL';
  name: 'Solana';
  pair: 'SOL-USDC';
  source: 'DexScreener';
  candleSource: 'GeckoTerminal';
  quoteCurrency: 'USDC';
  volumeCurrency: 'USD';
  candleVolumeCurrency: 'USDC';
  pool: PoolMetadata | null;
  liquidityUsd: number | null;
  quoteStatus: MarketStatus;
  candleStatus: MarketStatus;
  candleUpdatedAt: string | null;
  /** DexScreener does not expose a quote event timestamp. quoteAt is fetch time. */
  quoteTimestampKind: 'fetched';
  status: MarketStatus;
  price: number | null;
  change24h: number | null;
  volume24h: number | null;
  quoteAt: string | null;
  updatedAt: string | null;
  candleIntervalSeconds: number;
  candles: IndicatorCandle[];
  message: string | null;
}

export interface StrategyConfig {
  fastPeriod: number;
  slowPeriod: number;
  positionSizePercent: number;
  maxDailyLossPercent: number;
  stopLossPercent: number;
  takeProfitPercent: number;
}

export interface SignalSnapshot {
  signal: Signal | null;
  fastEma: number | null;
  slowEma: number | null;
  candleAt: string | null;
  ready: boolean;
}

export interface StrategySnapshot extends SignalSnapshot {
  enabled: boolean;
  lastProcessedCandleAt: string | null;
  config: StrategyConfig;
  status: 'running' | 'paused';
  startedAt: string | null;
  lastEvaluatedAt: string | null;
  message: string | null;
}

export interface Trade {
  id: string;
  timestamp: string;
  symbol: 'SOL';
  side: 'BUY' | 'SELL';
  price: number;
  referencePrice: number;
  quantity: number;
  fee: number;
  slippage: number;
  status: 'FILLED';
  realizedPnl: number | null;
  reason: 'EMA_CROSSOVER' | 'STOP_LOSS' | 'TAKE_PROFIT' | 'DAILY_LIMIT';
  candleAt: string | null;
}

export interface EquityPoint {
  timestamp: string;
  equity: number;
}

export interface PortfolioSnapshot {
  initialBalance: number;
  cash: number;
  equity: number | null;
  totalPnl: number | null;
  totalPnlPercent: number | null;
  realizedPnl: number;
  unrealizedPnl: number | null;
  feesPaid: number;
  slippagePaid: number;
  position: {
    symbol: 'SOL';
    quantity: number;
    averageEntry: number;
    costBasis: number;
  } | null;
  equityHistory: EquityPoint[];
  updatedAt: string;
}

export interface SettingsSnapshot {
  mode: 'paper';
  currency: 'USDC';
  marketSource: 'DexScreener / GeckoTerminal';
  pair: 'SOL-USDC';
  candleIntervalSeconds: number;
  pollIntervalMs: number;
  feeBps: number;
  slippageBps: number;
  persistence: 'SQLite';
  initialBalance: number;
  maxOpenPositions: 1;
}

export interface DashboardSnapshot {
  health: HealthSnapshot;
  portfolio: PortfolioSnapshot;
  strategy: StrategySnapshot;
  market: MarketSnapshot;
  recentTrades: Trade[];
  settings: SettingsSnapshot;
  serverTime: string;
}

export interface CandlesResponse {
  candles: IndicatorCandle[];
  source: 'GeckoTerminal';
  pool: PoolMetadata | null;
  quoteCurrency: 'USDC';
  volumeCurrency: 'USDC';
  status: MarketStatus;
  updatedAt: string | null;
}

export interface TradesResponse {
  trades: Trade[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export type DemoActivityKind = 'status' | 'signal' | 'execution';

export interface DemoActivity {
  id: string;
  at: string;
  kind: DemoActivityKind;
  side: 'BUY' | 'SELL' | null;
  price: number | null;
  message: string;
}

/**
 * Result of the isolated, accelerated historical replay used for demo videos.
 * Demo state never touches the live paper session stored in SQLite.
 */
export interface DemoSnapshot {
  mode: 'demo';
  simulated: true;
  label: string;
  running: boolean;
  status: 'idle' | 'running' | 'paused' | 'complete';
  source: 'sample' | 'geckoterminal';
  stepMs: number;
  totalCandles: number;
  cursor: number;
  progress: number;
  startedAt: string | null;
  currentCandleAt: string | null;
  currentPrice: number | null;
  signal: SignalSnapshot;
  config: StrategyConfig;
  portfolio: PortfolioSnapshot;
  trades: Trade[];
  activity: DemoActivity[];
  message: string | null;
  updatedAt: string;
}
