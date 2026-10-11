import type { Metadata } from "next";
import { StrategyView } from "@/components/strategy-view";
export const metadata: Metadata = { title: "Strategy" };
export default function StrategyPage() {
  return <StrategyView />;
}
