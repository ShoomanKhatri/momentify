"use client";
import { useState } from "react";
import { useTrades } from "@/lib/queries";
import {
  Button,
  EmptyState,
  ErrorState,
  PageHeader,
  PageSkeleton,
  RefreshButton,
} from "./ui";
import { TradesTable } from "./trades-table";

export function TradesView() {
  const [side, setSide] = useState("ALL");
  const [page, setPage] = useState(0);
  const query = useTrades(page + 1, side);
  const trades = query.data?.trades ?? [];
  const total = query.data?.total ?? 0;
  const pages = Math.max(1, query.data?.totalPages ?? 1);
  const activePage = Math.min(page, pages - 1);
  return (
    <>
      <PageHeader title="Trades">
        <RefreshButton
          busy={query.isFetching}
          refresh={() => {
            void query.refetch();
          }}
        />
      </PageHeader>
      {query.isPending ? (
        <PageSkeleton rows />
      ) : query.isError ? (
        <ErrorState
          error={query.error}
          retry={() => {
            void query.refetch();
          }}
        />
      ) : (
        <>
          <div className="toolbar">
            <div className="filter-controls" aria-label="Filter by trade side">
              {["ALL", "BUY", "SELL"].map((item) => (
                <Button
                  key={item}
                  variant={
                    side === item && item === "BUY"
                      ? "primary-soft"
                      : side === item && item === "SELL"
                        ? "danger-soft"
                        : "secondary"
                  }
                  aria-pressed={side === item}
                  onClick={() => {
                    setSide(item);
                    setPage(0);
                  }}
                >
                  {item === "ALL"
                    ? "All trades"
                    : item === "BUY"
                      ? "Buys"
                      : "Sells"}
                </Button>
              ))}
            </div>
            <span className="toolbar-note">
              {total} {total === 1 ? "execution" : "executions"}
            </span>
          </div>
          {!trades.length && side !== "ALL" ? (
            <div className="table-wrap">
              <EmptyState
                title="No matching trades"
                detail="Choose another side to see executions."
              />
            </div>
          ) : (
            <TradesTable trades={trades} />
          )}
          <div className="section-footnote">
            <span>
              Simulated fills · Realized PnL includes entry and exit costs
            </span>
            <span>All times UTC</span>
          </div>
          {pages > 1 && (
            <div className="toolbar pagination">
              <span className="toolbar-note">
                Page {activePage + 1} of {pages}
              </span>
              <div className="filter-controls">
                <Button
                  disabled={activePage === 0}
                  onClick={() => setPage(activePage - 1)}
                >
                  Previous
                </Button>
                <Button
                  disabled={activePage >= pages - 1}
                  onClick={() => setPage(activePage + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
