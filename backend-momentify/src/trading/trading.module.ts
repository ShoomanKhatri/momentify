import {
  Controller,
  Get,
  Module,
  Query,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { DatabaseModule } from '../database/database.module.js';
import { MarketModule } from '../market/market.module.js';
import { RiskModule } from '../risk/risk.module.js';
import { TradingService } from './trading.service.js';
import { TradesQueryDto } from './trades.dto.js';
import type { TradesResponse } from '../contracts.js';

@ApiTags('trades')
@Controller({ path: 'trades', version: [VERSION_NEUTRAL, '1'] })
class TradingController {
  constructor(private readonly trading: TradingService) {}
  @Get()
  @ApiOkResponse({ description: 'Paper order history, newest first' })
  get(@Query() query: TradesQueryDto): TradesResponse {
    const trades = this.trading
      .getTrades()
      .filter((trade) => !query.side || trade.side === query.side);
    return {
      trades: trades.slice(
        (query.page - 1) * query.limit,
        query.page * query.limit,
      ),
      page: query.page,
      limit: query.limit,
      total: trades.length,
      totalPages: Math.ceil(trades.length / query.limit),
    };
  }
}

@Module({
  imports: [DatabaseModule, MarketModule, RiskModule],
  controllers: [TradingController],
  providers: [TradingService],
  exports: [TradingService],
})
export class TradingModule {}
