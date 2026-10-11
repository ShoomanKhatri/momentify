"use client";
import { useStrategy } from "@/lib/queries";
import { dateTime } from "@/lib/format";
import { useFreshStrategy } from "@/lib/use-fresh-market";
import {
  ErrorState,
  PageHeader,
  PageSkeleton,
  RefreshButton,
  SignalBadge,
} from "./ui";
import { StrategyToggle } from "./strategy-toggle";
import { StrategyForm } from "./strategy-form";

export function StrategyView() {
  const query = useStrategy();
  const data = query.data;
  const fresh = useFreshStrategy(data);
  return (
    <>
      <PageHeader title="Strategy">
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
            <div className="strategy-status-row">
              <div>
                <h2>
                  <span
                    className={`status-dot ${data.status === "running" && fresh ? "green" : ""}`}
                  />
                  EMA crossover
                  <span className="status-badge">
                    {data.status === "running"
                      ? fresh
                        ? "Running"
                        : "Waiting"
                      : "Stopped"}
                  </span>
                </h2>
                <p>
                  {data.message ??
                    (!fresh
                      ? "Waiting for a fresh completed candle"
                      : "SOL / USDC · Long only · Paper execution")}
                </p>
              </div>
              <StrategyToggle strategy={{ ...data, ready: fresh }} />
            </div>
            <div className="toolbar">
              <span className="toolbar-note">
                Last candle {dateTime(data.candleAt)} UTC
              </span>
              <SignalBadge signal={fresh ? data.signal : null} />
            </div>
            <StrategyForm
              config={data.config}
              running={data.status === "running"}
            />
          </div>
        )
      )}
    </>
  );
}
