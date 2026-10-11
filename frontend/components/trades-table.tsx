import type { Trade } from "@/lib/models";
import { dateTime, money, number, pnlClass } from "@/lib/format";
import { EmptyState, Token } from "./ui";

export function TradesTable({
  trades,
  compact = false,
}: {
  trades: Trade[];
  compact?: boolean;
}) {
  if (!trades.length)
    return (
      <div className="table-wrap">
        <EmptyState
          title="No paper trades yet."
          detail="Trades appear after the next qualifying signal."
          href="/strategy"
          action="View strategy"
        />
      </div>
    );
  return (
    <div
      className="table-wrap"
      tabIndex={0}
      role="region"
      aria-label="Trading history"
    >
      <table>
        <caption className="sr-only">
          Paper trading history, all times UTC
        </caption>
        <thead>
          <tr>
            <th scope="col">Time (UTC)</th>
            <th scope="col">Token</th>
            <th scope="col">Side</th>
            <th scope="col" className="right">
              Price
            </th>
            <th scope="col" className="right">
              Quantity
            </th>
            {!compact && (
              <th scope="col" className="right">
                Fee
              </th>
            )}
            <th scope="col">Status</th>
            <th scope="col" className="right">
              Realized PnL
            </th>
          </tr>
        </thead>
        <tbody>
          {trades.map((trade) => (
            <tr key={trade.id}>
              <td className="muted">
                <time dateTime={trade.timestamp}>
                  {dateTime(trade.timestamp)}
                </time>
              </td>
              <td>
                <Token />
              </td>
              <td>
                <span
                  className={`trade-side ${trade.side === "BUY" ? "positive" : "negative"}`}
                >
                  {trade.side.toLowerCase()}
                </span>
              </td>
              <td className="right">{money(trade.price)}</td>
              <td className="right">{number(trade.quantity, 6)}</td>
              {!compact && (
                <td className="right muted">{money(trade.fee, 4)}</td>
              )}
              <td>
                <span className="trade-status">
                  <span className="status-dot green" />
                  Filled
                </span>
              </td>
              <td className={`right ${pnlClass(trade.realizedPnl)}`}>
                {money(trade.realizedPnl)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
