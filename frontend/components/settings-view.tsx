"use client";
import { usePreferences } from "./providers";
import { useSettings } from "@/lib/queries";
import { money } from "@/lib/format";
import { ErrorState, PageHeader, PageSkeleton, RefreshButton } from "./ui";

export function SettingsView() {
  const query = useSettings();
  const { refreshInterval, setRefreshInterval } = usePreferences();
  const data = query.data;
  return (
    <>
      <PageHeader title="Settings">
        <RefreshButton
          busy={query.isFetching}
          refresh={() => {
            void query.refetch();
          }}
        />
      </PageHeader>
      {query.isPending ? (
        <PageSkeleton />
      ) : query.isError ? (
        <ErrorState
          error={query.error}
          retry={() => {
            void query.refetch();
          }}
        />
      ) : (
        data && (
          <div className="form-layout">
            <section className="form-section">
              <div>
                <h2>Workspace</h2>
                <p>Persistent paper account.</p>
              </div>
              <dl className="settings-list">
                <div>
                  <dt>Trading mode</dt>
                  <dd>
                    <span className="paper-badge">Paper trading</span>
                  </dd>
                </div>
                <div>
                  <dt>Starting balance</dt>
                  <dd className="numeric">{money(data.initialBalance)}</dd>
                </div>
                <div>
                  <dt>Quote currency</dt>
                  <dd>{data.currency}</dd>
                </div>
                <div>
                  <dt>Storage</dt>
                  <dd>{data.persistence}</dd>
                </div>
                <div>
                  <dt>Open positions</dt>
                  <dd>{data.maxOpenPositions} maximum</dd>
                </div>
              </dl>
            </section>
            <section className="form-section">
              <div>
                <h2>Execution costs</h2>
                <p>Applied to every paper fill.</p>
              </div>
              <dl className="settings-list">
                <div>
                  <dt>Fee</dt>
                  <dd className="numeric">{data.feeBps} bps / side</dd>
                </div>
                <div>
                  <dt>Slippage</dt>
                  <dd className="numeric">{data.slippageBps} bps / side</dd>
                </div>
              </dl>
            </section>
            <section className="form-section">
              <div>
                <h2>Market data</h2>
                <p>SOL/USDC pool · DexScreener quotes and GeckoTerminal candles.</p>
              </div>
              <dl className="settings-list">
                <div>
                  <dt>Provider</dt>
                  <dd>{data.marketSource}</dd>
                </div>
                <div>
                  <dt>Candle interval</dt>
                  <dd>{data.candleIntervalSeconds / 60} minute</dd>
                </div>
                <div>
                  <dt>Engine polling</dt>
                  <dd>{data.pollIntervalMs / 1000} seconds</dd>
                </div>
              </dl>
            </section>
            <section className="form-section">
              <div>
                <h2>Display</h2>
                <p>Applies to this browser session.</p>
              </div>
              <div className="field">
                <label htmlFor="refresh-interval">Data refresh</label>
                <select
                  id="refresh-interval"
                  value={refreshInterval}
                  onChange={(event) =>
                    setRefreshInterval(Number(event.target.value))
                  }
                >
                  <option value={15_000}>Every 15 seconds</option>
                  <option value={30_000}>Every 30 seconds</option>
                  <option value={60_000}>Every minute</option>
                  <option value={0}>Manual refresh</option>
                </select>
              </div>
            </section>
          </div>
        )
      )}
    </>
  );
}
