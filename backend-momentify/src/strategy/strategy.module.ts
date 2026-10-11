import {
  Body,
  Controller,
  Get,
  Module,
  Patch,
  Post,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { DatabaseModule } from '../database/database.module.js';
import { MarketModule } from '../market/market.module.js';
import { StrategyService } from './strategy.service.js';
import { StrategyConfigDto, StrategyStatusDto } from './strategy.dto.js';

@ApiTags('strategy')
@Controller({ path: 'strategy', version: [VERSION_NEUTRAL, '1'] })
class StrategyController {
  constructor(private readonly strategy: StrategyService) {}
  @Get()
  @ApiOkResponse({ description: 'EMA crossover signal and strategy state' })
  get() {
    return this.strategy.get();
  }
  @Patch('config')
  @ApiOkResponse({ description: 'Updated strategy configuration' })
  configure(@Body() config: StrategyConfigDto) {
    return this.strategy.configure(config);
  }
  @Patch('status')
  @ApiOkResponse({ description: 'Updated running state' })
  status(@Body() value: StrategyStatusDto) {
    return this.strategy.setRunning(value.running);
  }
  @Post('emergency-stop')
  @ApiOkResponse({ description: 'Halts trading and liquation is disabled' })
  emergencyStop() {
    return this.strategy.emergencyStop();
  }
}

@Module({
  imports: [DatabaseModule, MarketModule],
  controllers: [StrategyController],
  providers: [StrategyService],
  exports: [StrategyService],
})
export class StrategyModule {}
