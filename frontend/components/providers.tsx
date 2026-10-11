"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useContext, useState, type ReactNode } from "react";

const Preferences = createContext<{
  refreshInterval: number;
  setRefreshInterval: (value: number) => void;
}>({ refreshInterval: 15_000, setRefreshInterval: () => {} });
export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 10_000, retry: 1, refetchOnWindowFocus: true },
        },
      }),
  );
  const [refreshInterval, setRefreshInterval] = useState(15_000);
  return (
    <QueryClientProvider client={client}>
      <Preferences.Provider value={{ refreshInterval, setRefreshInterval }}>
        {children}
      </Preferences.Provider>
    </QueryClientProvider>
  );
}
export function usePreferences() {
  return useContext(Preferences);
}
