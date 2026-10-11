import { Injectable } from '@nestjs/common';
import { ConfigService } from '../config/config.service.js';
import type { HealthSnapshot } from '../contracts.js';
import { ProviderHttp } from './provider-http.js';
import { record } from './provider-data.js';

@Injectable()
export class RpcService {
  private readonly http = new ProviderHttp();
  private slot: number | null = null;
  private lastAttempt = -Infinity;
  constructor(private readonly config: ConfigService) {}

  get(): HealthSnapshot['helius'] {
    const state = this.http.get();
    return {
      ...state,
      slot: this.slot,
      network: 'solana-mainnet',
      networkHealth: state.status === 'live' ? 'ok' : 'unavailable',
    };
  }

  async refresh(): Promise<void> {
    if (Date.now() - this.lastAttempt < 60_000) return;
    this.lastAttempt = Date.now();
    if (!this.config.solanaRpcUrl) {
      this.http.fail('SOLANA_RPC_URL is not configured');
      return;
    }
    try {
      const call = async (method: string, params: unknown[]) => {
        const body = record(
          await this.http.request(this.config.solanaRpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: method,
              method,
              params,
            }),
          }),
        );
        if (body.error || body.jsonrpc !== '2.0' || body.id !== method)
          throw new Error('RPC returned an error');
        return body.result;
      };
      const [health, slot, genesis] = await Promise.all([
        call('getHealth', []),
        call('getSlot', [{ commitment: 'confirmed' }]),
        call('getGenesisHash', []),
      ]);
      if (
        health !== 'ok' ||
        typeof slot !== 'number' ||
        !Number.isSafeInteger(slot) ||
        slot <= 0 ||
        genesis !== '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d'
      )
        throw new Error('Unhealthy RPC or incorrect network');
      this.slot = slot;
      this.http.success();
    } catch {
      this.http.fail('Solana mainnet RPC is unavailable or unhealthy');
    }
  }
}
