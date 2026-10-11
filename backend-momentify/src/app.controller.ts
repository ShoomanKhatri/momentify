import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service.js';

@ApiTags('system')
@Controller({ version: [VERSION_NEUTRAL, '1'] })
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  @ApiOkResponse({ description: 'Liveness probe and active trading mode' })
  health() {
    return this.appService.health();
  }
  @Get('dashboard')
  @ApiOkResponse({
    description: 'Combined portfolio, strategy and market view',
  })
  dashboard() {
    return this.appService.dashboard();
  }
  @Get('settings')
  @ApiOkResponse({ description: 'Effective paper-trading configuration' })
  settings() {
    return this.appService.settings();
  }
}
