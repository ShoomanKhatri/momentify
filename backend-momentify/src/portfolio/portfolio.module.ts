import { Controller, Get, Module, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { DatabaseModule } from '../database/database.module.js';
import { MarketModule } from '../market/market.module.js';
import { PortfolioService } from './portfolio.service.js';

@ApiTags('portfolio')
@Controller({ path: 'portfolio', version: [VERSION_NEUTRAL, '1'] })
class PortfolioController {
  constructor(private readonly portfolio: PortfolioService) {}
  @Get()
  @ApiOkResponse({ description: 'Cash, position, equity and PnL' })
  get() {
    return this.portfolio.get();
  }
  @Get('history')
  @ApiOkResponse({ description: 'Historical equity curve' })
  history() {
    return { history: this.portfolio.history() };
  }
}

@Module({
  imports: [DatabaseModule, MarketModule],
  controllers: [PortfolioController],
  providers: [PortfolioService],
  exports: [PortfolioService],
})
export class PortfolioModule {}
