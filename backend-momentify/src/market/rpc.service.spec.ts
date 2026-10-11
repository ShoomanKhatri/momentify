import { ConfigService } from '../config/config.service.js';
import { RpcService } from './rpc.service.js';
import { jsonResponse } from './test-fixtures.js';

describe('Helius connectivity without wallet operations', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  it('checks health, confirmed slot and mainnet genesis; caches the result', async () => {
    vi.stubEnv(
      'SOLANA_RPC_URL',
      'https://mainnet.helius-rpc.com/?api-key=test-secret',
    );
    const fetchMock = vi.fn(async (_url: string, options: RequestInit) => {
      const { method, id } = JSON.parse(String(options.body)) as {
        method: string;
        id: string;
      };
      const result =
        method === 'getHealth'
          ? 'ok'
          : method === 'getSlot'
            ? 400000000
            : '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
      return jsonResponse({ jsonrpc: '2.0', id, result });
    });
    vi.stubGlobal('fetch', fetchMock);
    const rpc = new RpcService(new ConfigService());
    await rpc.refresh();
    await rpc.refresh();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(rpc.get().status).toBe('live');
    expect(rpc.get().slot).toBe(400000000);
    expect(JSON.stringify(rpc.get())).not.toContain('test-secret');
    expect(
      fetchMock.mock.calls.every(
        ([, options]) => options.signal instanceof AbortSignal,
      ),
    ).toBe(true);
  });
  it('sanitizes timeout errors and never claims healthy connectivity', async () => {
    vi.stubEnv(
      'SOLANA_RPC_URL',
      'https://mainnet.helius-rpc.com/?api-key=secret',
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('secret endpoint failed');
      }),
    );
    const rpc = new RpcService(new ConfigService());
    await rpc.refresh();
    expect(rpc.get().status).toBe('unavailable');
    expect(rpc.get().slot).toBeNull();
    expect(JSON.stringify(rpc.get())).not.toContain('secret');
  });
  it('rejects RPC-level errors in HTTP 200 responses', async () => {
    vi.stubEnv('SOLANA_RPC_URL', 'https://mainnet.helius-rpc.com');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          jsonrpc: '2.0',
          error: { code: -32005 },
          id: 'getHealth',
        }),
      ),
    );
    const rpc = new RpcService(new ConfigService());
    await rpc.refresh();
    expect(rpc.get().networkHealth).toBe('unavailable');
  });
});
