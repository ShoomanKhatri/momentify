import { Injectable } from '@nestjs/common';
import { ConfigService } from './config/config.service.js';
import { DatabaseService } from './database/database.service.js';
import { MarketService } from './market/market.service.js';
import { StrategyService } from './strategy/strategy.service.js';
import { PortfolioService } from './portfolio/portfolio.service.js';
import { TradingService } from './trading/trading.service.js';
import type { DashboardSnapshot, SettingsSnapshot } from './contracts.js';

@Injectable()
export class AppService {
  constructor(
    private readonly config: ConfigService,
    private readonly database: DatabaseService,
    private readonly market: MarketService,
    private readonly strategy: StrategyService,
    private readonly portfolio: PortfolioService,
    private readonly trading: TradingService,
  ) {}

  settings(): SettingsSnapshot {
    return {
      mode: 'paper',
      currency: 'USDC',
      marketSource: 'DexScreener / GeckoTerminal',
      pair: 'SOL-USDC',
      candleIntervalSeconds: this.config.candleIntervalSeconds,
      pollIntervalMs: this.config.pollIntervalMs,
      feeBps: this.config.feeBps,
      slippageBps: this.config.slippageBps,
      persistence: 'SQLite',
      initialBalance: this.database.read().initialBalance,
      maxOpenPositions: 1,
    };
  }

  dashboard(): DashboardSnapshot {
    return {
      health: this.health(),
      portfolio: this.portfolio.get(),
      strategy: this.strategy.get(),
      market: this.market.get(),
      recentTrades: this.trading.getTrades().slice(0, 5),
      settings: this.settings(),
      serverTime: new Date().toISOString(),
    };
  }

  health() {
    return this.market.health();
  }
}
