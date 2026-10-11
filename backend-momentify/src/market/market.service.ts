import { Injectable } from '@nestjs/common';
import { ConfigService } from '../config/config.service.js';
import { DatabaseService } from '../database/database.service.js';
import type {
  Candle,
  CandlesResponse,
  HealthSnapshot,
  IndicatorCandle,
  MarketSnapshot,
  PoolMetadata,
} from '../contracts.js';
import { ema } from '../strategy/indicators.js';
import { ProviderHttp } from './provider-http.js';
import {
  optionalNumber,
  parseDexPair,
  parseGeckoCandles,
  record,
  verifyGeckoPool,
} from './provider-data.js';
import { RpcService } from './rpc.service.js';

export function withIndicators(candles: Candle[]): IndicatorCandle[] {
  const result: IndicatorCandle[] = [];
  let start = 0;
  for (let end = 1; end <= candles.length; end++) {
    if (
      end < candles.length &&
      candles[end].time - candles[end - 1].time === 60
    )
      continue;
    const segment = candles.slice(start, end);
    const closes = segment.map((candle) => candle.close);
    const fast = ema(closes, 9),
      slow = ema(closes, 21);
    result.push(
      ...segment.map((candle, index) => ({
        ...candle,
        timestamp: new Date(candle.time * 1000).toISOString(),
        ema9: fast[index],
        ema21: slow[index],
      })),
    );
    start = end;
  }
  return result;
}

@Injectable()
export class MarketService {
  private readonly gecko = new ProviderHttp();
  private readonly dex = new ProviderHttp();
  private pending: Promise<void> | null = null;
  private candleBucket = -1;
  private quoteAttempt = -Infinity;
  private lastSuccessfulRefresh: string | null = null;
  private snapshot: MarketSnapshot = {
    symbol: 'SOL',
    name: 'Solana',
    pair: 'SOL-USDC',
    source: 'DexScreener',
    candleSource: 'GeckoTerminal',
    quoteCurrency: 'USDC',
    volumeCurrency: 'USD',
    candleVolumeCurrency: 'USDC',
    quoteTimestampKind: 'fetched',
    pool: null,
    liquidityUsd: null,
    quoteStatus: 'connecting',
    candleStatus: 'connecting',
    candleUpdatedAt: null,
    status: 'connecting',
    price: null,
    change24h: null,
    volume24h: null,
    quoteAt: null,
    updatedAt: null,
    candleIntervalSeconds: 60,
    candles: [],
    message: null,
  };

  constructor(
    private readonly config: ConfigService,
    private readonly database: DatabaseService,
    private readonly rpc: RpcService,
  ) {}

  get(): MarketSnapshot {
    const value = structuredClone(this.snapshot);
    value.quoteStatus = this.dex.get().status;
    value.candleStatus = this.gecko.get().status;
    const latest = value.candles.at(-1);
    if (
      value.candleStatus === 'live' &&
      (!latest || Date.now() - (latest.time + 60) * 1000 > 120_000)
    )
      value.candleStatus = 'stale';
    value.status =
      value.candleStatus === 'live' && value.quoteStatus === 'live'
        ? 'live'
        : value.candleStatus === 'unavailable' ||
            value.quoteStatus === 'unavailable'
          ? 'unavailable'
          : value.candleStatus === 'connecting' ||
              value.quoteStatus === 'connecting'
            ? 'connecting'
            : 'stale';
    value.message =
      value.candleStatus !== 'live'
        ? (this.gecko.get().message ??
          'Waiting for fresh completed GeckoTerminal candles')
        : value.quoteStatus !== 'live'
          ? (this.dex.get().message ?? 'Waiting for a fresh DexScreener quote')
          : null;
    return value;
  }

  health(): HealthSnapshot {
    const market = this.get();
    return {
      status: 'ok',
      mode: 'paper',
      backend: 'connected',
      paperTrading: true,
      liveTradingEnabled: false,
      helius: this.rpc.get(),
      geckoTerminal: { ...this.gecko.get(), status: market.candleStatus },
      dexScreener: this.dex.get(),
      lastSuccessfulRefresh: this.lastSuccessfulRefresh,
      serverTime: new Date().toISOString(),
    };
  }

  candles(): CandlesResponse {
    const market = this.get();
    return {
      candles: market.candles,
      source: 'GeckoTerminal',
      pool: market.pool,
      quoteCurrency: 'USDC',
      volumeCurrency: 'USDC',
      status: market.candleStatus,
      updatedAt: market.candleUpdatedAt,
    };
  }

  refresh(): Promise<void> {
    if (this.pending) return this.pending;
    this.pending = Promise.all([this.refreshMarket(), this.rpc.refresh()])
      .then(() => {})
      .finally(() => {
        this.pending = null;
      });
    return this.pending;
  }

  private async discoverPool(): Promise<PoolMetadata> {
    const base = this.config.geckoTerminalUrl.replace(/\/$/, '');
    const configured = this.config.poolAddress;
    const body = record(
      await this.gecko.request(
        configured
          ? `${base}/networks/solana/pools/${configured}`
          : `${base}/networks/solana/tokens/${this.config.solMint}/pools?page=1`,
      ),
    );
    if (configured) {
      const pool = verifyGeckoPool(
        body.data,
        this.config.solMint,
        this.config.usdcMint,
      );
      if (pool.address !== configured)
        throw new Error('Configured pool mismatch');
      return pool;
    }
    if (!Array.isArray(body.data)) throw new Error('Invalid pool discovery');
    const candidates = body.data
      .flatMap((input: unknown) => {
        try {
          const pool = verifyGeckoPool(
            input,
            this.config.solMint,
            this.config.usdcMint,
          );
          const liquidity = optionalNumber(
            record(record(input).attributes).reserve_in_usd,
          );
          return liquidity !== null && liquidity >= this.config.minLiquidityUsd
            ? [{ pool, liquidity }]
            : [];
        } catch {
          return [];
        }
      })
      .sort((a, b) => b.liquidity - a.liquidity);
    if (!candidates[0]) throw new Error('No verified liquid SOL/USDC pool');
    return candidates[0].pool;
  }

  private async refreshCandles(): Promise<void> {
    const bucket = Math.floor(Date.now() / 60_000);
    if (bucket === this.candleBucket) return;
    this.candleBucket = bucket;
    try {
      if (!this.snapshot.pool) this.snapshot.pool = await this.discoverPool();
      const pool = this.snapshot.pool;
      const body = await this.gecko.request(
        `${this.config.geckoTerminalUrl.replace(/\/$/, '')}/networks/solana/pools/${pool.address}/ohlcv/minute?aggregate=1&limit=300&currency=token&token=base&include_empty_intervals=false&before_timestamp=${bucket * 60}`,
      );
      const candles = parseGeckoCandles(body, Date.now(), pool);
      this.snapshot.candles = withIndicators(candles);
      this.snapshot.candleUpdatedAt = new Date().toISOString();
      this.database.saveMarketCandles(pool.address, candles);
      this.gecko.success();
    } catch {
      if (
        this.gecko.state.status === 'live' ||
        this.gecko.state.status === 'connecting'
      )
        this.gecko.fail('GeckoTerminal market data unavailable or invalid');
    }
  }

  private async refreshQuote(): Promise<void> {
    const latest = this.snapshot.candles.at(-1);
    const quoteBehindCandle =
      latest &&
      this.snapshot.quoteAt &&
      (latest.time + 60) * 1000 > Date.parse(this.snapshot.quoteAt);
    // A newly completed candle needs a quote fetched after its close, even if
    // discovery/request latency shifted the polling timer inside the cache TTL.
    if (
      Date.now() - this.quoteAttempt < this.config.pollIntervalMs &&
      !quoteBehindCandle
    )
      return;
    this.quoteAttempt = Date.now();
    if (!this.snapshot.pool) {
      this.dex.fail('Waiting for verified SOL/USDC pool');
      return;
    }
    try {
      const body = await this.dex.request(
        `${this.config.dexScreenerUrl.replace(/\/$/, '')}/latest/dex/pairs/solana/${this.snapshot.pool.address}`,
      );
      Object.assign(this.snapshot, parseDexPair(body, this.snapshot.pool));
      this.snapshot.quoteAt = new Date().toISOString();
      this.snapshot.updatedAt = this.snapshot.quoteAt;
      this.dex.success();
    } catch {
      if (
        this.dex.state.status === 'live' ||
        this.dex.state.status === 'connecting'
      )
        this.dex.fail('DexScreener market data unavailable or invalid');
    }
  }

  private async refreshMarket(): Promise<void> {
    if (!this.snapshot.pool) await this.refreshCandles();
    await Promise.all([this.refreshCandles(), this.refreshQuote()]);
    const latest = this.snapshot.candles.at(-1);
    if (
      latest &&
      this.snapshot.quoteAt &&
      (latest.time + 60) * 1000 > Date.parse(this.snapshot.quoteAt)
    )
      await this.refreshQuote();
    if (this.get().status === 'live')
      this.lastSuccessfulRefresh = this.snapshot.updatedAt;
  }
}
