import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { ConfigService } from '../config/config.service.js';
import type { Candle } from '../contracts.js';
import type { PaperSession } from './session.js';

const MAX_CANDLES = 5_000;

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  private readonly database: DatabaseSync;
  private state: PaperSession;

  constructor(config: ConfigService) {
    if (config.databasePath !== ':memory:')
      mkdirSync(dirname(config.databasePath), { recursive: true });
    this.database = new DatabaseSync(config.databasePath);
    this.database.exec(
      'PRAGMA locking_mode = EXCLUSIVE; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; CREATE TABLE IF NOT EXISTS session (id INTEGER PRIMARY KEY CHECK (id = 1), state TEXT NOT NULL); CREATE TABLE IF NOT EXISTS candles (time INTEGER PRIMARY KEY, open REAL NOT NULL, high REAL NOT NULL, low REAL NOT NULL, close REAL NOT NULL, volume REAL NOT NULL)',
    );
    this.database.exec(
      'CREATE TABLE IF NOT EXISTS market_candles (pool TEXT NOT NULL, time INTEGER NOT NULL, open REAL NOT NULL, high REAL NOT NULL, low REAL NOT NULL, close REAL NOT NULL, volume REAL NOT NULL, PRIMARY KEY(pool, time))',
    );
    const saved = this.database
      .prepare('SELECT state FROM session WHERE id = 1')
      .get();
    const now = new Date().toISOString();
    if (saved) {
      this.state = JSON.parse(String(saved.state)) as PaperSession;
      if (this.state.version !== 1)
        throw new Error('Unsupported paper session version');
      if (
        this.state.marketPair !== 'SOL-USDC' &&
        (this.state.position || this.state.trades.length > 0)
      )
        throw new Error(
          'Existing paper session belongs to another market. Use a separate DATABASE_PATH for SOL/USDC.',
        );
      this.state.marketPair = 'SOL-USDC';
      this.state.emergencyStopped ??= false;
      this.state.running = false;
      this.state.startedAt = null;
      this.state.message = this.state.emergencyStopped
        ? 'Emergency shutdown is active'
        : 'Paused after restart';
    } else {
      this.state = {
        version: 1,
        marketPair: 'SOL-USDC',
        initialBalance: config.initialBalance,
        cash: config.initialBalance,
        position: null,
        realizedPnl: 0,
        feesPaid: 0,
        slippagePaid: 0,
        config: config.defaults,
        running: config.strategyEnabled,
        startedAt: null,
        lastCandleTime: null,
        lastEvaluatedAt: null,
        message: null,
        riskDay: null,
        dayStartEquity: null,
        dailyHalted: false,
        emergencyStopped: false,
        trades: [],
        equityHistory: [{ timestamp: now, equity: config.initialBalance }],
        updatedAt: now,
      };
    }
    this.persist(this.state);
  }

  read(): PaperSession {
    return structuredClone(this.state);
  }

  saveMarketCandles(pool: string, candles: Candle[]): void {
    const insert = this.database.prepare(
      'INSERT OR REPLACE INTO market_candles VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    for (const candle of candles)
      insert.run(
        pool,
        candle.time,
        candle.open,
        candle.high,
        candle.low,
        candle.close,
        candle.volume,
      );
    this.database
      .prepare(
        'DELETE FROM market_candles WHERE pool = ? AND time NOT IN (SELECT time FROM market_candles WHERE pool = ? ORDER BY time DESC LIMIT ?)',
      )
      .run(pool, pool, MAX_CANDLES);
  }

  update(change: (state: PaperSession) => void): void {
    const next = structuredClone(this.state);
    change(next);
    next.updatedAt = new Date().toISOString();
    this.persist(next);
    this.state = next;
  }

  saveCandles(candles: Candle[]): void {
    if (candles.length === 0) return;
    const insert = this.database.prepare(
      'INSERT OR REPLACE INTO candles (time, open, high, low, close, volume) VALUES (?, ?, ?, ?, ?, ?)',
    );
    for (const candle of candles)
      insert.run(
        candle.time,
        candle.open,
        candle.high,
        candle.low,
        candle.close,
        candle.volume,
      );
    const oldest = this.database
      .prepare('SELECT time FROM candles ORDER BY time DESC LIMIT 1 OFFSET ?')
      .get(MAX_CANDLES - 1) as { time: number } | undefined;
    if (oldest)
      this.database
        .prepare('DELETE FROM candles WHERE time < ?')
        .run(oldest.time);
  }

  readCandles(limit: number): Candle[] {
    const rows = this.database
      .prepare(
        'SELECT time, open, high, low, close, volume FROM candles ORDER BY time DESC LIMIT ?',
      )
      .all(limit) as {
      time: number;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    }[];
    return [...rows].reverse().map((row) => ({ ...row }));
  }

  private persist(state: PaperSession): void {
    this.database
      .prepare(
        'INSERT INTO session (id, state) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET state = excluded.state',
      )
      .run(JSON.stringify(state));
  }

  onApplicationShutdown(): void {
    this.database.close();
  }
}
