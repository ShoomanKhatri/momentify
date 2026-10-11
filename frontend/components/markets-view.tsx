"use client";
import { ArrowDown, ArrowUpDown, Clock3 } from "lucide-react";
import { useState } from "react";
import { useMarkets, useStrategy } from "@/lib/queries";
import { dateTime, money, number, percent, pnlClass } from "@/lib/format";
import { useFreshMarket, useFreshStrategy } from "@/lib/use-fresh-market";
import {
  EmptyState,
  ErrorState,
  PageHeader,
  PageSkeleton,
  RefreshButton,
  SignalBadge,
  Token,
} from "./ui";

const columns = [
  { key: "symbol", label: "Token" },
  { key: "price", label: "Price" },
  { key: "change24h", label: "24h change" },
  { key: "volume24h", label: "24h volume (USD)" },
] as const;
type SortKey = (typeof columns)[number]["key"];

export function MarketsView() {
  const query = useMarkets();
  const strategy = useStrategy();
  const [sort, setSort] = useState<{ key: SortKey; descending: boolean }>({
    key: "symbol",
    descending: false,
  });
  const fresh = useFreshMarket(query.data?.markets[0]);
  const freshSignal = useFreshStrategy(strategy.data) && !strategy.isError;
  const markets = [...(query.data?.markets ?? [])].sort((a, b) => {
    const left = a[sort.key],
      right = b[sort.key];
    const difference =
      typeof left === "string" && typeof right === "string"
        ? left.localeCompare(right)
        : Number(left ?? -Infinity) - Number(right ?? -Infinity);
    return difference * (sort.descending ? -1 : 1);
  });
  const refresh = () => {
    void query.refetch();
    void strategy.refetch();
  };
  return (
    <>
      <PageHeader title="Markets">
        <RefreshButton
          refresh={refresh}
          busy={query.isFetching || strategy.isFetching}
        />
      </PageHeader>
      {query.isPending ? (
        <PageSkeleton rows />
      ) : query.isError ? (
        <ErrorState error={query.error} retry={refresh} />
      ) : (
        <>
          {!fresh && markets.length > 0 && (
            <div className="feed-notice" role="status">
              <Clock3 size={15} aria-hidden="true" />
              {markets[0]?.message ?? "Waiting for fresh market data."}
            </div>
          )}
          <div
            className="table-wrap"
            role="region"
            aria-label="Market watchlist"
            tabIndex={0}
          >
            <table>
              <caption className="sr-only">
                SOL/USDC · DexScreener
              </caption>
              <thead>
                <tr>
                  {columns.map(({ key, label }) => (
                    <th
                      key={key}
                      scope="col"
                      className={key === "symbol" ? "" : "right"}
                      aria-sort={
                        sort.key === key
                          ? sort.descending
                            ? "descending"
                            : "ascending"
                          : "none"
                      }
                    >
                      <button
                        className="table-sort"
                        aria-pressed={sort.key === key}
                        onClick={() =>
                          setSort({
                            key,
                            descending:
                              sort.key === key ? !sort.descending : true,
                          })
                        }
                      >
                        {label}
                        {sort.key === key && sort.descending ? (
                          <ArrowDown size={12} aria-hidden="true" />
                        ) : (
                          <ArrowUpDown size={12} aria-hidden="true" />
                        )}
                      </button>
                    </th>
                  ))}
                  <th scope="col" className="right">
                    Momentum
                  </th>
                </tr>
              </thead>
              <tbody>
                {markets.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      <EmptyState
                        title="No markets available"
                        detail="Refresh to check your watchlist."
                      />
                    </td>
                  </tr>
                )}
                {markets.map((market) => (
                  <tr key={market.pair}>
                    <td>
                      <Token />
                    </td>
                    <td className="right">
                      {money(fresh ? market.price : null)}
                    </td>
                    <td
                      className={`right ${pnlClass(fresh ? market.change24h : null)}`}
                    >
                      {percent(fresh ? market.change24h : null)}
                    </td>
                    <td className="right muted">
                      {fresh ? number(market.volume24h, 0) : "—"}
                    </td>
                    <td className="right">
                      <SignalBadge
                        signal={
                          fresh && freshSignal ? strategy.data?.signal : null
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="section-footnote">
            <span>GeckoTerminal · 1m completed candles · Volume in USD</span>
            <span>Updated {dateTime(markets[0]?.updatedAt)}</span>
          </div>
        </>
      )}
    </>
  );
}
