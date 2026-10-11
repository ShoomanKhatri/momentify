import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigService } from '../config/config.service.js';
import { DatabaseService } from './database.service.js';
import { executePaperOrder } from '../trading/paper-execution.js';

describe('persistent paper session', () => {
  it('preserves portfolio, configuration and trades while pausing after restart', () => {
    const directory = mkdtempSync(join(tmpdir(), 'momentify-test-'));
    vi.stubEnv('DATABASE_PATH', join(directory, 'paper.sqlite'));
    const config = new ConfigService();
    const first = new DatabaseService(config);
    first.update((state) => {
      state.running = true;
      state.config.fastPeriod = 8;
      executePaperOrder(
        state,
        'BUY',
        100,
        config,
        'EMA_CROSSOVER',
        new Date().toISOString(),
        null,
      );
    });
    const saved = first.read();
    first.onApplicationShutdown();
    const second = new DatabaseService(config);
    expect(second.read().running).toBe(false);
    expect(second.read().cash).toBe(saved.cash);
    expect(second.read().trades).toEqual(saved.trades);
    expect(second.read().position).toEqual(saved.position);
    expect(second.read().config.fastPeriod).toBe(8);
    second.onApplicationShutdown();
    vi.unstubAllEnvs();
    rmSync(directory, { recursive: true });
  });
});
