"use client";
import Link from "next/link";
import { Activity, ArrowRight, Clock3 } from "lucide-react";
import { useDashboard } from "@/lib/queries";
import { dateTime, money, number, percent, pnlClass } from "@/lib/format";
import {
  useFreshCandles,
  useFreshMarket,
  useFreshProvider,
  useFreshStrategy,
} from "@/lib/use-fresh-market";
import {
  ErrorState,
  PageHeader,
  PageSkeleton,
  RefreshButton,
  SignalBadge,
} from "./ui";
import { PriceChart } from "./price-chart";
import { StrategyToggle } from "./strategy-toggle";
import { TradesTable } from "./trades-table";

export function Dashboard() {
  const query = useDashboard();
  const data = query.data;
  const fresh = useFreshMarket(data?.market);
  const freshCandles = useFreshCandles(data?.market);
  const freshRpc = useFreshProvider(data?.health.helius);
  const freshData = fresh && freshCandles && data?.market.status === "live";
  const freshSignal = useFreshStrategy(data?.strategy) && freshData;
  const running = data?.strategy.status === "running";
  const equityAvailable = fresh || !data?.portfolio.position;
  return (
    <>
      <PageHeader title="Overview">
        <RefreshButton
          busy={query.isFetching}
          refresh={() => {
            void query.refetch();
          }}
        />
        {data && !query.isError && (
          <StrategyToggle
            strategy={data.strategy}
            disabled={!freshData && !running}
          />
        )}
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
          <>
            {!freshData && (
              <div className="feed-notice" role="status">
                <Clock3 size={15} aria-hidden="true" />
                {data.market.message ??
                  "Waiting for fresh market data. Trading is on hold."}
              </div>
            )}
            <div className="metric-grid">
              <div className="metric">
                <div className="metric-label">Portfolio equity</div>
                <div className="metric-value numeric">
                  {money(equityAvailable ? data.portfolio.equity : null)}
                </div>
                <div className="metric-detail">
                  {money(data.portfolio.cash)} cash available
                </div>
              </div>
              <div className="metric">
                <div className="metric-label">Total PnL</div>
                <div
                  className={`metric-value numeric ${pnlClass(equityAvailable ? data.portfolio.totalPnl : null)}`}
                >
                  {money(equityAvailable ? data.portfolio.totalPnl : null)}
                </div>
                <div
                  className={`metric-detail numeric ${pnlClass(equityAvailable ? data.portfolio.totalPnlPercent : null)}`}
                >
                  {percent(
                    equityAvailable ? data.portfolio.totalPnlPercent : null,
                  )}
                  <span className="muted">all time</span>
                </div>
              </div>
              <div className="metric">
                <div className="metric-label">SOL/USDC price</div>
                <div className="metric-value numeric">
                  {money(fresh ? data.market.price : null)}
                </div>
                <div className="metric-detail">
                  {percent(fresh ? data.market.change24h : null)} · 24h
                </div>
              </div>
              <div className="metric">
                <div className="metric-label">Bot status</div>
                <div className="metric-value bot-value">
                  <span
                    className={`status-dot ${running && freshSignal ? "green" : ""}`}
                  />
                  {running ? (freshSignal ? "Running" : "Waiting") : "Stopped"}
                </div>
                <div className="metric-detail">
                  {running
                    ? freshSignal
                      ? "Paper execution"
                      : "Waiting for a completed candle"
                    : "Strategy disabled"}
                </div>
              </div>
            </div>
            {data.portfolio.position && (
              <div className="position-strip">
                <span>
                  Open position<strong>SOL</strong>
                </span>
                <span>
                  Quantity
                  <strong className="numeric">
                    {number(data.portfolio.position.quantity, 6)}
                  </strong>
                </span>
                <span>
                  Entry
                  <strong className="numeric">
                    {money(data.portfolio.position.averageEntry)}
                  </strong>
                </span>
                <span>
                  Unrealized PnL
                  <strong
                    className={`numeric ${pnlClass(fresh ? data.portfolio.unrealizedPnl : null)}`}
                  >
                    {money(fresh ? data.portfolio.unrealizedPnl : null)}
                  </strong>
                </span>
              </div>
            )}
            <div className="performance-grid">
              <section
                className="performance"
                aria-label="SOL/USDC market chart"
              >
                <PriceChart pool={data.market.pool?.address ?? null} />
                <p className="chart-caption">
                  Strategy feed · 1m candles ·{" "}
                  {freshCandles
                    ? "Fresh"
                    : data.market.candleStatus === "stale" ||
                        data.market.candleStatus === "live"
                      ? "Stale"
                      : "Unavailable"}{" "}
                  · Candles updated {dateTime(data.market.candleUpdatedAt)}
                </p>
              </section>
              <section
                className="strategy-summary"
                aria-label="Current strategy"
              >
                <div className="strategy-summary-top">
                  <Activity size={14} aria-hidden="true" />
                  STRATEGY
                </div>
                <div className="strategy-name">EMA crossover</div>
                <div className="strategy-meta">SOL / USDC · 1m candles</div>
                <div className="summary-signal">
                  <span>Current signal</span>
                  <SignalBadge
                    signal={freshSignal ? data.strategy.signal : null}
                  />
                </div>
                <dl className="summary-list">
                  <div>
                    <dt>EMA {data.strategy.config.fastPeriod}</dt>
                    <dd>{money(freshSignal ? data.strategy.fastEma : null)}</dd>
                  </div>
                  <div>
                    <dt>EMA {data.strategy.config.slowPeriod}</dt>
                    <dd>{money(freshSignal ? data.strategy.slowEma : null)}</dd>
                  </div>
                  <div>
                    <dt>Last processed</dt>
                    <dd>{dateTime(data.strategy.lastProcessedCandleAt)}</dd>
                  </div>
                  <div>
                    <dt>Market data</dt>
                    <dd>
                      {freshData
                        ? "Fresh"
                        : data.market.status === "stale" ||
                            data.market.status === "live"
                          ? "Stale"
                          : "Unavailable"}
                    </dd>
                  </div>
                </dl>
                <Link className="text-link" href="/strategy">
                  Manage strategy
                  <ArrowRight size={13} aria-hidden="true" />
                </Link>
              </section>
            </div>
            <section aria-label="Recent trades">
              <div className="section-heading">
                <h2>Recent trades</h2>
                <Link href="/trades" className="text-link">
                  View all trades
                  <ArrowRight size={13} aria-hidden="true" />
                </Link>
              </div>
              <TradesTable trades={data.recentTrades} compact />
              <div className="section-footnote">
                <span>
                  Paper fills · {data.settings.feeBps} bps fee +{" "}
                  {data.settings.slippageBps} bps slippage
                </span>
                <span>Quote fetched {dateTime(data.market.quoteAt)}</span>
              </div>
            </section>
            <div className="system-status" aria-label="System status">
              {[
                ["Backend API", "Connected", true],
                [
                  "Solana RPC",
                  freshRpc
                    ? "Healthy"
                    : data.health.helius.status === "stale" ||
                        data.health.helius.status === "live"
                      ? "Stale"
                      : "Unavailable",
                  freshRpc,
                ],
                [
                  "Market data",
                  freshData
                    ? "Fresh"
                    : data.market.status === "stale" ||
                        data.market.status === "live"
                      ? "Stale"
                      : "Unavailable",
                  freshData,
                ],
                [
                  "Strategy engine",
                  running ? (freshSignal ? "Running" : "Waiting") : "Stopped",
                  running && freshSignal,
                ],
              ].map(([label, status, ok]) => (
                <span key={String(label)}>
                  <span className={`status-dot ${ok ? "green" : ""}`} />
                  {label}
                  <strong>{status}</strong>
                </span>
              ))}
            </div>
            <div className="section-footnote market-provenance">
              <span>
                DexScreener · Volume{" "}
                {money(fresh ? data.market.volume24h : null)} USD · Liquidity{" "}
                {money(fresh ? data.market.liquidityUsd : null)} USD
              </span>
              {data.market.pool && (
                <a
                  href={`https://www.geckoterminal.com/solana/pools/${data.market.pool.address}`}
                  target="_blank"
                  rel="noreferrer"
                  title={data.market.pool.address}
                >
                  {data.market.pool.dex} ·{" "}
                  {data.market.pool.address.slice(0, 6)}…
                  {data.market.pool.address.slice(-4)} · SOL/USDC
                </a>
              )}
            </div>
          </>
        )
      )}
    </>
  );
}
