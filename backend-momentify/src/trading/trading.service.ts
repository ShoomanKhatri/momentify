import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '../config/config.service.js';
import { DatabaseService } from '../database/database.service.js';
import { MarketService } from '../market/market.service.js';
import { RiskService } from '../risk/risk.service.js';
import { crossover } from '../strategy/indicators.js';
import { executePaperOrder } from './paper-execution.js';
import {
  appendEquityPoint,
  equity,
  liquidationValue,
} from '../portfolio/accounting.js';

@Injectable()
export class TradingService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(TradingService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private pending: Promise<void> | null = null;
  private stopping = false;

  constructor(
    private readonly config: ConfigService,
    private readonly database: DatabaseService,
    private readonly market: MarketService,
    private readonly risk: RiskService,
  ) {}

  onApplicationBootstrap(): void {
    void this.tick();
    this.timer = setInterval(() => {
      void this.tick();
    }, this.config.pollIntervalMs);
    this.timer.unref();
  }

  tick(): Promise<void> {
    if (this.pending) return this.pending;
    this.pending = this.process()
      .catch((error: unknown) => {
        this.logger.error({
          event: 'paper_engine_failed',
          message:
            error instanceof Error ? error.message : 'Unknown engine error',
        });
        try {
          this.database.update((state) => {
            state.running = false;
            state.message = 'Engine paused after an error';
          });
        } catch {
          this.logger.error({ event: 'paper_engine_pause_failed' });
        }
      })
      .finally(() => {
        this.pending = null;
      });
    return this.pending;
  }

  private async process(): Promise<void> {
    await this.market.refresh();
    if (this.stopping) return;
    const market = this.market.get();
    if (
      market.status !== 'live' ||
      market.price === null ||
      market.quoteAt === null
    )
      return;
    const referencePrice = market.price;
    const now = new Date().toISOString();
    const day = now.slice(0, 10);
    const last = market.candles.at(-1);
    const candleAt = last
      ? new Date((last.time + 60) * 1000).toISOString()
      : null;
    this.database.update((state) => {
      if (state.riskDay !== day) {
        state.riskDay = day;
        state.dayStartEquity = liquidationValue(
          state,
          referencePrice,
          this.config.feeBps,
          this.config.slippageBps,
        );
        state.dailyHalted = false;
      }
      if (state.running) {
        const risk = this.risk.check(state, referencePrice);
        let exited = false;
        if (risk.exit)
          exited =
            executePaperOrder(
              state,
              'SELL',
              referencePrice,
              this.config,
              risk.exit,
              now,
              null,
            ) !== null;
        if (risk.halt) {
          state.dailyHalted = true;
          state.running = false;
          state.startedAt = null;
          state.message = 'Daily loss limit reached';
        }
        if (
          state.running &&
          last &&
          (state.lastCandleTime === null || last.time > state.lastCandleTime)
        ) {
          const signal = crossover(
            market.candles,
            state.config.fastPeriod,
            state.config.slowPeriod,
          );
          const fresh =
            candleAt !== null &&
            Date.now() - Date.parse(candleAt) <= 120_000 &&
            Date.parse(market.quoteAt!) >= Date.parse(candleAt);
          // Persist the candle watermark with the fill; never execute past candles after an outage.
          state.lastCandleTime = last.time;
          state.lastEvaluatedAt = now;
          state.message = !fresh
            ? 'Skipped a stale candle'
            : !signal.ready
              ? 'Waiting for consecutive candles'
              : null;
          if (!exited && fresh && signal.ready) {
            if (
              signal.signal === 'BUY' &&
              this.risk.canBuy(state) &&
              market.liquidityUsd !== null &&
              market.liquidityUsd >= this.config.minLiquidityUsd
            )
              executePaperOrder(
                state,
                'BUY',
                referencePrice,
                this.config,
                'EMA_CROSSOVER',
                now,
                candleAt,
              );
            if (signal.signal === 'SELL' && state.position)
              executePaperOrder(
                state,
                'SELL',
                referencePrice,
                this.config,
                'EMA_CROSSOVER',
                now,
                candleAt,
              );
          }
        }
      }
      const latestPoint = state.equityHistory.at(-1);
      const value = equity(state, referencePrice);
      if (
        !latestPoint ||
        Date.parse(now) - Date.parse(latestPoint.timestamp) >= 60_000 ||
        Math.abs(latestPoint.equity - value) > 0.000001
      ) {
        appendEquityPoint(state.equityHistory, {
          timestamp: now,
          equity: value,
        });
      }
    });
  }

  getTrades() {
    return [...this.database.read().trades].reverse();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    await this.pending;
  }
}
