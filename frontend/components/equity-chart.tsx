"use client";
import { ChartNoAxesCombined } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { EquityPoint } from "@/lib/models";
import { dateTime, money } from "@/lib/format";

export function EquityChart({ points }: { points: EquityPoint[] }) {
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
    ? data.reduce((lowest, point) => Math.min(lowest, point.equity), Infinity)
    : 0;
  const max = data.length
    ? data.reduce(
        (highest, point) => Math.max(highest, point.equity),
        -Infinity,
      )
    : 0;
  const pad = Math.max((max - min) * 0.2, max * 0.002, 1);
  const low = min - pad,
    high = max + pad;
  const firstTime = data.length
    ? range === "ALL"
      ? Date.parse(data[0].timestamp)
      : end - duration
    : 0;
  const span = Math.max(end - firstTime, 1);
  const x = (point: EquityPoint) =>
    left +
    ((Date.parse(point.timestamp) - firstTime) / span) * (width - left - right);
  const y = (value: number) =>
    top + ((high - value) / (high - low)) * (height - top - bottom);
  const selected = hovered === null ? null : data[hovered];
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>Portfolio performance</h2>
          <p>Equity · USDC</p>
        </div>
        <div className="range-controls" aria-label="Equity history range">
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
          Use the left and right arrow keys to inspect recorded equity values.
        </p>
        {data.length < 2 ? (
          <div className="chart-empty">
            <ChartNoAxesCombined
              size={24}
              strokeWidth={1.3}
              aria-hidden="true"
            />
            <strong>Collecting equity history</strong>
            <span>Recorded from your paper session.</span>
          </div>
        ) : (
          <div className="chart">
            <svg
              viewBox={`0 0 ${width} ${height}`}
              preserveAspectRatio="none"
              role="img"
              tabIndex={0}
              aria-describedby={instructions}
              aria-label={`Portfolio equity, ${money(data[0].equity)} to ${money(data[data.length - 1].equity)}`}
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
                      {money(value, 0)}
                    </text>
                  </g>
                );
              })}
              <polyline
                points={data
                  .map((point) => `${x(point)},${y(point.equity)}`)
                  .join(" ")}
                className="chart-line"
              />
              {selected && (
                <circle
                  cx={x(selected)}
                  cy={y(selected.equity)}
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
                {dateTime(selected.timestamp)} · {money(selected.equity)}
              </div>
            )}
          </div>
        )}
      </div>
      <p className="chart-caption">
        Executed fees and slippage included. Open positions marked to market.
      </p>
    </>
  );
}
