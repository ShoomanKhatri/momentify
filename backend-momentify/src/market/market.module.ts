import { Controller, Get, Module, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { DatabaseModule } from '../database/database.module.js';
import { MarketService } from './market.service.js';
import { RpcService } from './rpc.service.js';

@ApiTags('markets')
@Controller({ path: 'markets', version: [VERSION_NEUTRAL, '1'] })
class MarketController {
  constructor(private readonly market: MarketService) {}
  @Get()
  @ApiOkResponse({ description: 'Latest SOL/USDC market snapshot and candles' })
  get() {
    return { markets: [this.market.get()] };
  }
}

@ApiTags('markets')
@Controller({ path: 'market', version: [VERSION_NEUTRAL, '1'] })
class CandlesController {
  constructor(private readonly market: MarketService) {}
  @Get('candles')
  @ApiOkResponse({
    description:
      'Completed GeckoTerminal SOL/USDC candles with EMA 9 and EMA 21. Null during warmup.',
  })
  get() {
    return this.market.candles();
  }
}

@Module({
  imports: [DatabaseModule],
  controllers: [MarketController, CandlesController],
  providers: [MarketService, RpcService],
  exports: [MarketService],
})
export class MarketModule {}
