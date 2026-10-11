import { ConfigService } from './config.service.js';
describe('paper-only configuration', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('uses the configured USDC balance and fails closed on ambiguous safety flags', () => {
    vi.stubEnv('INITIAL_BALANCE_USDC', '2500');
    expect(new ConfigService().initialBalance).toBe(2500);
    vi.stubEnv('LIVE_TRADING_ENABLED', 'TRUE');
    expect(() => new ConfigService()).toThrow('Only paper');
  });
  it('rejects enabling live trading', () => {
    vi.stubEnv('LIVE_TRADING_ENABLED', 'true');
    expect(() => new ConfigService()).toThrow('Only paper');
  });
  it('rejects disabling paper trading', () => {
    vi.stubEnv('PAPER_TRADING', 'false');
    expect(() => new ConfigService()).toThrow('Only paper');
  });
  it('rejects invalid polling and EMA periods', () => {
    vi.stubEnv('MARKET_POLL_INTERVAL_MS', '0');
    expect(() => new ConfigService()).toThrow('MARKET_POLL');
  });
  it('requires API protection beyond localhost', () => {
    vi.stubEnv('HOST', '0.0.0.0');
    vi.stubEnv('BACKEND_API_TOKEN', '');
    expect(() => new ConfigService()).toThrow('BACKEND_API_TOKEN');
  });
  it('rejects a simulated slippage beyond the configured limit', () => {
    vi.stubEnv('PAPER_SLIPPAGE_BPS', '150');
    vi.stubEnv('MAX_SLIPPAGE_BPS', '100');
    expect(() => new ConfigService()).toThrow('MAX_SLIPPAGE_BPS');
  });
});
