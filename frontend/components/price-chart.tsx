"use client";
import { ChartNoAxesCombined } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { IndicatorCandle } from "@/lib/models";
import { dateTime, money } from "@/lib/format";

export function PriceChart({ points }: { points: IndicatorCandle[] }) {
  const [range, setRange] = useState("ALL");
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
  const end = points.length
    ? Date.parse(points[points.length - 1].timestamp)
    : 0;
  const duration =
    range === "1D" ? 86_400_000 : range === "1W" ? 604_800_000 : Infinity;
  const data = points.filter(
    (point) => Date.parse(point.timestamp) >= end - duration,
  );
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
  const firstTime = data.length ? Date.parse(data[0].timestamp) : 0;
  const span = Math.max(end - firstTime, 1);
  const x = (point: IndicatorCandle) =>
    left +
    ((Date.parse(point.timestamp) - firstTime) / span) * (width - left - right);
  const y = (value: number) =>
    top + ((high - value) / (high - low)) * (height - top - bottom);
  const selected = hovered === null ? null : data[hovered];
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>SOL/USDC price</h2>
          <p>Completed candles · USDC</p>
        </div>
        <div className="range-controls" aria-label="Price history range">
          {["1D", "1W", "ALL"].map((item) => (
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
        {data.length === 0 ? (
          <div className="chart-empty">
            <ChartNoAxesCombined
              size={24}
              strokeWidth={1.3}
              aria-hidden="true"
            />
            <strong>No completed candles available</strong>
            <span>Waiting for GeckoTerminal market data.</span>
          </div>
        ) : (
          <div className="chart">
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
              <polyline
                points={data
                  .map((point) => `${x(point)},${y(point.close)}`)
                  .join(" ")}
                className="chart-line"
              />
              {(["ema9", "ema21"] as const).map((key) => {
                const paths: string[] = [];
                let path = "";
                for (let i = 0; i < data.length; i++) {
                  const value = data[i][key];
                  const gap = i > 0 && data[i].time - data[i - 1].time !== 60;
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
                    stroke={key === "ema9" ? "#74735f" : "#526a80"}
                    strokeWidth="1.5"
                    strokeDasharray={key === "ema21" ? "5 3" : undefined}
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
                {dateTime(data[0].timestamp)}
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
      <p className="chart-caption">
        GeckoTerminal · Completed 1m candles · SOL close, EMA 9 and EMA 21 ·
        USDC
      </p>
    </>
  );
}
