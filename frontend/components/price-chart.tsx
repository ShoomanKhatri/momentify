"use client";
import { ChartNoAxesCombined } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { IndicatorCandle } from "@/lib/models";
import { dateTime, money } from "@/lib/format";
import { chartRanges, type ChartRange } from "@/lib/chart-history";
import { useChartHistory } from "@/lib/queries";

const emaLineColors = {
  ema9: "var(--chart-ema9)",
  ema21: "var(--chart-ema21)",
} as const;
const emaLineWidths = { ema9: 2.25, ema21: 2.25 } as const;

export function PriceChart({ pool }: { pool: string | null }) {
  const [range, setRange] = useState<ChartRange>("ALL");
  const query = useChartHistory(range, pool);
  const history = query.data;
  const data = history?.candles ?? [];
  const interval = chartRanges[range].intervalSeconds;
  const [hovered, setHovered] = useState<number | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const [{ width, height }, setSize] = useState({ width: 600, height: 272 });
  const instructions = useId();
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: Math.max(260, entry.contentRect.width),
        height: entry.contentRect.height,
      }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const end = data.length ? data[data.length - 1].time * 1000 : 0;
  const left = 4,
    right = 72,
    top = 16,
    bottom = 32;
  const min = data.length
    ? data.reduce(
        (lowest, point) =>
          Math.min(
            lowest,
            point.close,
            point.ema9 ?? point.close,
            point.ema21 ?? point.close,
          ),
        Infinity,
      )
    : 0;
  const max = data.length
    ? data.reduce(
        (highest, point) =>
          Math.max(
            highest,
            point.close,
            point.ema9 ?? point.close,
            point.ema21 ?? point.close,
          ),
        -Infinity,
      )
    : 0;
  const pad = Math.max((max - min) * 0.2, max * 0.002, 1);
  const low = min - pad,
    high = max + pad;
  // Fit the real returned history. Missing history is explained below the chart.
  const firstTime = data.length ? data[0].time * 1000 : 0;
  const span = Math.max(end - firstTime, 1);
  const x = (point: IndicatorCandle) =>
    left +
    ((point.time * 1000 - firstTime) / span) * (width - left - right);
  const y = (value: number) =>
    top + ((high - value) / (high - low)) * (height - top - bottom);
  const selected = hovered === null ? null : data[hovered];
  const segments: IndicatorCandle[][] = [];
  for (const point of data) {
    const previous = segments.at(-1)?.at(-1);
    if (!previous || point.time - previous.time !== interval) segments.push([]);
    segments[segments.length - 1].push(point);
  }
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>SOL/USDC price</h2>
          <p>Completed {chartRanges[range].label} candles · USDC</p>
        </div>
        <div className="range-controls" aria-label="Price history range">
          {(["1D", "1W", "ALL"] as const).map((item) => (
            <button
              key={item}
              aria-pressed={item === range}
              onClick={() => {
                setRange(item);
                setHovered(null);
              }}
            >
              {item === "ALL" ? "All" : item}
            </button>
          ))}
        </div>
      </div>
      <div ref={container}>
        <p id={instructions} className="sr-only">
          Use the left and right arrow keys to inspect completed prices and EMA
          values.
        </p>
        {pool && query.isPending ? (
          <div className="chart-empty" role="status" aria-label="Loading price history">
            <ChartNoAxesCombined size={24} strokeWidth={1.3} aria-hidden="true" />
            <strong>Loading price history</strong>
            <span>Fetching completed {chartRanges[range].label} candles.</span>
          </div>
        ) : query.isError && !history ? (
          <div className="chart-empty" role="alert">
            <strong>Could not load price history</strong>
            <span>{query.error.message}</span>
            <button className="text-link" onClick={() => { void query.refetch(); }}>Try again</button>
          </div>
        ) : data.length === 0 ? (
          <div className="chart-empty">
            <ChartNoAxesCombined
              size={24}
              strokeWidth={1.3}
              aria-hidden="true"
            />
            <strong>No completed candles available</strong>
            <span>{pool ? `No completed ${chartRanges[range].label} candles returned for ${range === "ALL" ? "the available history" : range}.` : "Waiting for a verified SOL/USDC pool."}</span>
          </div>
        ) : (
          <div className="chart">
            <div className="chart-legend">
              <span>
                <i style={{ borderTopColor: "var(--chart-close)" }} />
                Close
              </span>
              <span>
                <i style={{ borderTopColor: emaLineColors.ema9 }} />
                EMA 9
              </span>
              <span>
                <i
                  className="dashed"
                  style={{ borderTopColor: emaLineColors.ema21 }}
                />
                EMA 21
              </span>
            </div>
            <svg
              viewBox={`0 0 ${width} ${height}`}
              preserveAspectRatio="none"
              role="img"
              tabIndex={0}
              aria-describedby={instructions}
              aria-label={`SOL/USDC price, ${money(data[0].close)} to ${money(data[data.length - 1].close)}`}
              onKeyDown={(event) => {
                if (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
                  return;
                event.preventDefault();
                setHovered((previous) =>
                  Math.min(
                    data.length - 1,
                    Math.max(
                      0,
                      (previous ??
                        (event.key === "ArrowLeft" ? data.length : -1)) +
                        (event.key === "ArrowLeft" ? -1 : 1),
                    ),
                  ),
                );
              }}
              onBlur={() => setHovered(null)}
              onPointerMove={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                const pointerX =
                  ((event.clientX - rect.left) / rect.width) * width;
                if (pointerX < x(data[0]) || pointerX > x(data[data.length - 1])) {
                  setHovered(null);
                  return;
                }
                let closest = 0;
                for (let i = 1; i < data.length; i++)
                  if (
                    Math.abs(x(data[i]) - pointerX) <
                    Math.abs(x(data[closest]) - pointerX)
                  )
                    closest = i;
                setHovered(closest);
              }}
              onPointerLeave={() => setHovered(null)}
            >
              {[0, 1, 2, 3, 4].map((i) => {
                const value = high - ((high - low) / 4) * i;
                return (
                  <g key={i}>
                    <line
                      x1={left}
                      x2={width - right + 4}
                      y1={y(value)}
                      y2={y(value)}
                      className="chart-grid"
                      strokeDasharray="3 4"
                    />
                    <text
                      x={width - right + 12}
                      y={y(value) + 4}
                      className="chart-label"
                    >
                      {money(value, 2)}
                    </text>
                  </g>
                );
              })}
              {segments.map((segment) => (
              <polyline
                key={segment[0].time}
                points={segment
                  .map((point) => `${x(point)},${y(point.close)}`)
                  .join(" ")}
                className="chart-line"
              />
              ))}
              {segments.filter((segment) => segment.length === 1).map(([point]) => (
                <circle key={point.time} cx={x(point)} cy={y(point.close)} r={3} className="chart-dot" />
              ))}
              {(["ema9", "ema21"] as const).map((key) => {
                const paths: string[] = [];
                let path = "";
                for (let i = 0; i < data.length; i++) {
                  const value = data[i][key];
                  const gap = i > 0 && data[i].time - data[i - 1].time !== interval;
                  if (value === null || gap) {
                    if (path) paths.push(path);
                    path = "";
                  }
                  if (value !== null)
                    path += `${path ? " L" : "M"}${x(data[i])},${y(value)}`;
                }
                if (path) paths.push(path);
                return paths.map((d, index) => (
                  <path
                    key={`${key}-${index}`}
                    d={d}
                    fill="none"
                    stroke={emaLineColors[key]}
                    strokeWidth={String(emaLineWidths[key])}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                    strokeDasharray={key === "ema21" ? "6 4" : undefined}
                  />
                ));
              })}
              {selected && (
                <circle
                  cx={x(selected)}
                  cy={y(selected.close)}
                  r={4}
                  className="chart-dot"
                />
              )}
              {data.length === 1 && !selected && (
                <circle
                  cx={x(data[0])}
                  cy={y(data[0].close)}
                  r={4}
                  className="chart-dot"
                />
              )}
              <text x={left} y={height - 4} className="chart-label">
                {dateTime(new Date(firstTime).toISOString())}
              </text>
              <text
                x={width - right}
                y={height - 4}
                className="chart-label"
                textAnchor="end"
              >
                {dateTime(data[data.length - 1].timestamp)}
              </text>
            </svg>
            {selected && (
              <div className="chart-tooltip numeric" role="status">
                {dateTime(selected.timestamp)} · {money(selected.close)} USDC ·
                EMA 9 {money(selected.ema9)} · EMA 21 {money(selected.ema21)}
              </div>
            )}
          </div>
        )}
      </div>
      {data.length > 0 && (history?.partial || history?.hasGaps || range === "ALL") && (
        <p className="chart-caption" role="status">
          Available: {dateTime(history?.availableFrom)} – {dateTime(history?.availableTo)} UTC.
          {history?.partial && " History is incomplete for this timeframe."}
          {history?.hasGaps && " Intervals without trades are omitted."}
          {range === "ALL" && " All available public history · up to 6 months."}
        </p>
      )}
      {(history?.message || query.isError) && data.length > 0 && (
        <p className="chart-caption" role="status">
          {history?.message ?? "History could not be refreshed. Showing previously fetched prices."}
        </p>
      )}
      <p className="chart-caption">
        GeckoTerminal · Completed {chartRanges[range].label} candles · SOL close,
        EMA 9 and EMA 21 · USDC
      </p>
    </>
  );
}
