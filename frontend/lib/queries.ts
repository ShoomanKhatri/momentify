"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { usePreferences } from "@/components/providers";
import type { ChartRange } from "./chart-history";

export function useChartHistory(range: ChartRange, pool: string | null) {
  const { refreshInterval } = usePreferences();
  return useQuery({
    queryKey: ["chart-history", pool, range],
    queryFn: ({ signal }) => api.chartHistory(range, pool!, signal),
    enabled: !!pool,
    staleTime: 60_000,
    refetchInterval: refreshInterval ? 60_000 : false,
    retry: false,
  });
}

export function useDashboard() {
  const { refreshInterval } = usePreferences();
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: ({ signal }) => api.dashboard(signal),
    refetchInterval: refreshInterval || false,
  });
}
export function useMarkets() {
  const { refreshInterval } = usePreferences();
  return useQuery({
    queryKey: ["markets"],
    queryFn: ({ signal }) => api.markets(signal),
    refetchInterval: refreshInterval || false,
  });
}
export function useStrategy() {
  const { refreshInterval } = usePreferences();
  return useQuery({
    queryKey: ["strategy"],
    queryFn: ({ signal }) => api.strategy(signal),
    refetchInterval: refreshInterval || false,
  });
}
export function useTrades(page = 1, side = "ALL") {
  const { refreshInterval } = usePreferences();
  return useQuery({
    queryKey: ["trades", page, side],
    queryFn: ({ signal }) => api.trades(signal, page, side),
    refetchInterval: refreshInterval || false,
  });
}
export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: ({ signal }) => api.settings(signal),
    staleTime: Infinity,
  });
}
