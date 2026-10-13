import type { Candle, IndicatorCandle } from "./models";

export type ChartRange = "1D" | "1W" | "ALL";

export const chartRanges = {
  "1D": { timeframe: "minute", aggregate: 5, intervalSeconds: 300, duration: 86_400, label: "5m" },
  "1W": { timeframe: "hour", aggregate: 1, intervalSeconds: 3600, duration: 604_800, label: "1h" },
  ALL: { timeframe: "day", aggregate: 1, intervalSeconds: 86_400, duration: null, label: "1d" },
} as const;

export interface ChartHistory {
  range: ChartRange;
  intervalSeconds: number;
  candles: IndicatorCandle[];
  requestedFrom: string | null;
  requestedTo: string;
  availableFrom: string | null;
  availableTo: string | null;
  partial: boolean;
  hasGaps: boolean;
  status: "ready" | "stale";
  message: string | null;
}

// These EMAs are display-only, on the selected chart interval. Trading continues
// to use the backend's separate completed one-minute candles and indicators.
export function buildChartHistory(candles: Candle[], range: ChartRange, now: number): ChartHistory {
  const { intervalSeconds: interval, duration } = chartRanges[range];
  const end = Math.floor(now / 1000 / interval) * interval;
  const start = duration === null ? null : end - duration;
  const completed = [...new Map(candles
    .filter((point) => point.time + interval <= end)
    .map((point) => [point.time, point])).values()].sort((a, b) => a.time - b.time);
  let segment: number[] = [];
  let ema9: number | null = null;
  let ema21: number | null = null;
  const indicators = completed.map((point, index) => {
    if (index && point.time - completed[index - 1].time !== interval) {
      segment = [];
      ema9 = ema21 = null;
    }
    segment.push(point.close);
    const nextEma = (previous: number | null, period: number) =>
      segment.length < period ? null : previous === null
        ? segment.slice(-period).reduce((sum, value) => sum + value, 0) / period
        : point.close * (2 / (period + 1)) + previous * (1 - 2 / (period + 1));
    ema9 = nextEma(ema9, 9);
    ema21 = nextEma(ema21, 21);
    return { ...point, timestamp: new Date(point.time * 1000).toISOString(), ema9, ema21 };
  }).filter((point) => start === null || point.time >= start);
  const data = indicators;
  const hasGaps = data.some((point, index) => index > 0 && point.time - data[index - 1].time !== interval);
  const first = data[0];
  const last = data.at(-1);
  return {
    range, intervalSeconds: interval, candles: indicators,
    requestedFrom: start === null ? null : new Date(start * 1000).toISOString(),
    requestedTo: new Date(end * 1000).toISOString(),
    availableFrom: first ? new Date(first.time * 1000).toISOString() : null,
    availableTo: last ? new Date((last.time + interval) * 1000).toISOString() : null,
    partial: start !== null && (!first || !last || first.time > start || last.time + interval < end || hasGaps),
    hasGaps, status: "ready", message: null,
  };
}
