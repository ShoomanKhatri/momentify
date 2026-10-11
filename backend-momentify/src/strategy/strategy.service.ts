import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { MarketService } from '../market/market.service.js';
import type { StrategyConfig, StrategySnapshot } from '../contracts.js';
import { crossover } from './indicators.js';

@Injectable()
export class StrategyService {
  constructor(
    private readonly database: DatabaseService,
    private readonly market: MarketService,
  ) {}

  get(): StrategySnapshot {
    const state = this.database.read();
    const market = this.market.get();
    const signal = crossover(
      market.candles,
      state.config.fastPeriod,
      state.config.slowPeriod,
    );
    const freshCandle =
      signal.candleAt !== null &&
      Date.now() - Date.parse(signal.candleAt) <= 120_000;
    return {
      ...signal,
      enabled: state.running,
      lastProcessedCandleAt:
        state.lastCandleTime === null
          ? null
          : new Date((state.lastCandleTime + 60) * 1000).toISOString(),
      ready: signal.ready && market.status === 'live' && freshCandle,
      signal: market.status === 'live' && freshCandle ? signal.signal : null,
      config: state.config,
      status: state.running ? 'running' : 'paused',
      startedAt: state.startedAt,
      lastEvaluatedAt: state.lastEvaluatedAt,
      message:
        market.status !== 'live'
          ? market.message
          : !freshCandle
            ? 'Waiting for completed candles'
            : !signal.ready
              ? 'Waiting for consecutive candles'
              : state.message,
    };
  }

  configure(config: StrategyConfig): StrategySnapshot {
    if (config.fastPeriod >= config.slowPeriod)
      throw new BadRequestException('Fast EMA must be less than slow EMA');
    if (this.database.read().running)
      throw new ConflictException(
        'Pause the strategy before changing its configuration',
      );
    this.database.update((state) => {
      state.config = { ...config };
      state.message = null;
    });
    return this.get();
  }

  setRunning(running: boolean): StrategySnapshot {
    const current = this.database.read();
    if (!running && current.emergencyStopped) {
      this.database.update((state) => {
        state.emergencyStopped = false;
        state.message = null;
      });
      return this.get();
    }
    if (current.running === running) return this.get();
    if (running) {
      if (current.emergencyStopped)
        throw new ConflictException(
          'Emergency shutdown is active. Clear it before resuming',
        );
      const status = this.get();
      if (!status.ready)
        throw new ServiceUnavailableException(
          'Fresh quotes and completed candles are required to start',
        );
      if (
        current.dailyHalted &&
        current.riskDay === new Date().toISOString().slice(0, 10)
      )
        throw new ConflictException(
          'Daily loss limit reached. Resume after the next UTC day',
        );
    }
    const market = this.market.get();
    this.database.update((state) => {
      state.running = running;
      state.startedAt = running ? new Date().toISOString() : null;
      state.lastCandleTime =
        market.candles.at(-1)?.time ?? state.lastCandleTime;
      state.message = running ? 'Waiting for the next completed candle' : null;
    });
    return this.get();
  }

  emergencyStop(): StrategySnapshot {
    this.database.update((state) => {
      state.running = false;
      state.startedAt = null;
      state.emergencyStopped = true;
      state.message = 'Emergency shutdown is active';
    });
    return this.get();
  }
}
