import { Injectable } from '@nestjs/common';
import type { StrategyConfig } from '../contracts.js';

function numberEnv(
  name: string,
  fallback: number,
  min: number,
  max: number,
  integer = false,
): number {
  const raw = process.env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (
    !Number.isFinite(value) ||
    raw === '' ||
    value < min ||
    value > max ||
    (integer && !Number.isInteger(value))
  ) {
    throw new Error(`Invalid configuration: ${name}`);
  }
  return value;
}

@Injectable()
export class ConfigService {
  readonly solanaRpcUrl = process.env.SOLANA_RPC_URL ?? '';
  readonly geckoTerminalUrl =
    process.env.GECKOTERMINAL_API_URL ?? 'https://api.geckoterminal.com/api/v2';
  readonly dexScreenerUrl =
    process.env.DEXSCREENER_API_URL ?? 'https://api.dexscreener.com';
  readonly poolAddress = process.env.SOL_USDC_POOL_ADDRESS ?? '';
  readonly solMint = 'So11111111111111111111111111111111111111112';
  readonly usdcMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  readonly minLiquidityUsd = numberEnv('MIN_LIQUIDITY_USD', 100_000, 0, 1e12);
  readonly strategyEnabled = process.env.STRATEGY_ENABLED === 'true';
  readonly port = numberEnv('PORT', 3001, 1, 65535, true);
  readonly host = process.env.HOST ?? '127.0.0.1';
  readonly databasePath =
    process.env.DATABASE_PATH ?? '.data/momentify-sol-usdc.sqlite';
  readonly apiToken = process.env.BACKEND_API_TOKEN ?? '';
  readonly initialBalance = numberEnv(
    process.env.INITIAL_BALANCE_USDC === undefined
      ? 'INITIAL_BALANCE_USD'
      : 'INITIAL_BALANCE_USDC',
    1000,
    10,
    100_000_000,
  );
  readonly feeBps = numberEnv('PAPER_FEE_BPS', 25, 0, 1000);
  readonly slippageBps = numberEnv('PAPER_SLIPPAGE_BPS', 10, 0, 1000);
  readonly maxSlippageBps = numberEnv('MAX_SLIPPAGE_BPS', 100, 0, 10_000);
  readonly pollIntervalMs = numberEnv(
    'MARKET_POLL_INTERVAL_MS',
    15_000,
    10_000,
    60_000,
    true,
  );
  readonly candleIntervalSeconds = 60;
  readonly defaults: StrategyConfig = {
    fastPeriod: numberEnv('EMA_FAST_PERIOD', 9, 2, 99, true),
    slowPeriod: numberEnv('EMA_SLOW_PERIOD', 21, 3, 100, true),
    positionSizePercent: numberEnv('POSITION_SIZE_PERCENT', 10, 1, 100),
    maxDailyLossPercent: numberEnv('MAX_DAILY_LOSS_PERCENT', 5, 0.1, 50),
    stopLossPercent: numberEnv('STOP_LOSS_PERCENT', 3, 0.1, 50),
    takeProfitPercent: numberEnv('TAKE_PROFIT_PERCENT', 6, 0.1, 100),
  };

  constructor() {
    for (const value of [
      this.geckoTerminalUrl,
      this.dexScreenerUrl,
      this.solanaRpcUrl,
    ].filter(Boolean)) {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password)
        throw new Error(
          'External providers require HTTPS URLs without credentials',
        );
    }
    if (
      this.poolAddress &&
      !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(this.poolAddress)
    )
      throw new Error('Invalid SOL_USDC_POOL_ADDRESS');
    if (
      (process.env.SOL_MINT && process.env.SOL_MINT !== this.solMint) ||
      (process.env.USDC_MINT && process.env.USDC_MINT !== this.usdcMint)
    )
      throw new Error('Only canonical mainnet SOL/USDC is supported');
    if (
      (process.env.LIVE_TRADING_ENABLED !== undefined &&
        process.env.LIVE_TRADING_ENABLED !== 'false') ||
      (process.env.PAPER_TRADING !== undefined &&
        process.env.PAPER_TRADING !== 'true')
    ) {
      throw new Error(
        'Only paper trading is implemented. Live execution is disabled.',
      );
    }
    if (this.defaults.fastPeriod >= this.defaults.slowPeriod) {
      throw new Error('EMA_FAST_PERIOD must be less than EMA_SLOW_PERIOD');
    }
    if (this.slippageBps > this.maxSlippageBps) {
      throw new Error('PAPER_SLIPPAGE_BPS exceeds MAX_SLIPPAGE_BPS');
    }
    if (
      this.host !== '127.0.0.1' &&
      this.host !== 'localhost' &&
      !this.apiToken
    ) {
      throw new Error(
        'BACKEND_API_TOKEN is required when binding beyond localhost',
      );
    }
  }
}
