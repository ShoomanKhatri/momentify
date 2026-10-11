import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { MarketModule } from './market/market.module.js';
import { StrategyModule } from './strategy/strategy.module.js';
import { TradingModule } from './trading/trading.module.js';
import { PortfolioModule } from './portfolio/portfolio.module.js';
import { ApiTokenGuard } from './common/api-token.guard.js';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    MarketModule,
    StrategyModule,
    TradingModule,
    PortfolioModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ApiTokenGuard }],
})
export class AppModule {}
