"use client";

import { useSyncExternalStore } from "react";
import type {
  MarketSnapshot,
  ProviderStatus,
  StrategySnapshot,
} from "./models";

let currentTime = 0;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    currentTime = Date.now();
    timer = setInterval(() => {
      currentTime = Date.now();
      listeners.forEach((notify) => notify());
    }, 5000);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const getSnapshot = () => currentTime;
const getServerSnapshot = () => 0;

function useNow() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useFreshMarket(market?: MarketSnapshot) {
  const now = useNow();
  return (
    now > 0 &&
    !!market &&
    (market.quoteStatus ?? market.status) === "live" &&
    !!market.quoteAt &&
    !!market.updatedAt &&
    now - Date.parse(market.quoteAt) <= 180_000 &&
    now - Date.parse(market.updatedAt) <= 180_000
  );
}

export function useFreshStrategy(strategy?: StrategySnapshot) {
  const now = useNow();
  return (
    now > 0 &&
    !!strategy?.ready &&
    !!strategy.candleAt &&
    now - Date.parse(strategy.candleAt) <= 120_000
  );
}

export function useFreshCandles(market?: MarketSnapshot) {
  const now = useNow();
  const latest = market?.candles.at(-1);
  return (
    now > 0 &&
    !!latest &&
    market?.candleStatus === "live" &&
    now - (latest.time + 60) * 1000 <= 120_000
  );
}

export function useFreshProvider(provider?: ProviderStatus) {
  const now = useNow();
  return (
    now > 0 &&
    provider?.status === "live" &&
    !!provider.lastSuccessAt &&
    now - Date.parse(provider.lastSuccessAt) <= 180_000
  );
}
