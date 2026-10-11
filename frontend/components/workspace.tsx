"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  ArrowUpRight,
  ChartNoAxesCombined,
  CircleHelp,
  LayoutDashboard,
  ListFilter,
  Settings2,
  SlidersHorizontal,
} from "lucide-react";
import type { ReactNode } from "react";
import { useDashboard } from "@/lib/queries";
import { useFreshCandles, useFreshMarket } from "@/lib/use-fresh-market";

const navigation = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/markets", label: "Markets", icon: ChartNoAxesCombined },
  { href: "/strategy", label: "Strategy", icon: SlidersHorizontal },
  { href: "/trades", label: "Trades", icon: ListFilter },
  { href: "/settings", label: "Settings", icon: Settings2 },
];
export function Logo() {
  return (
    <span className="logo-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none">
        <path
          d="M4 17V8l5 6V5l5 6V3l6 7v7"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
export function Workspace({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data, isError } = useDashboard();
  const freshQuote = useFreshMarket(data?.market);
  const freshCandles = useFreshCandles(data?.market);
  const fresh =
    freshQuote && freshCandles && data?.market.status === "live" && !isError;
  return (
    <div className="workspace">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <Link href="/" className="wordmark" aria-label="Momentify overview">
          <Logo />
          <span>
            momentify<span className="brand-period">.</span>
          </span>
        </Link>
        <div className="workspace-label">WORKSPACE</div>
        <nav aria-label="Main navigation" className="navigation">
          {navigation.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`nav-link ${pathname === href ? "active" : ""}`}
              aria-current={pathname === href ? "page" : undefined}
            >
              <Icon size={17} strokeWidth={1.6} aria-hidden="true" />
              <span>{label}</span>
              {pathname === href && <span className="nav-dot" />}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="mode-note">
            <Activity size={16} aria-hidden="true" />
            <div>
              <strong>Paper workspace</strong>
              <span>Simulated execution</span>
            </div>
          </div>
          <Link className="help-link" href="/settings">
            <CircleHelp size={16} aria-hidden="true" />
            <span>Workspace details</span>
            <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
          <div className="sidebar-footer">
            <Logo />
            <span>Built for momentum.</span>
          </div>
        </div>
      </aside>
      <div className="workspace-body">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Workspace</span>
            <span className="breadcrumb-divider">/</span>
            <strong>
              {navigation.find((item) => item.href === pathname)?.label ??
                "Momentify"}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="paper-badge">Paper trading</span>
            <span className="account-mark" aria-label="Local paper account">
              M
            </span>
          </div>
        </header>
        <main id="main" className="main-content">
          {children}
        </main>
        <footer className="workspace-footer">
          <span>
            <span className={`status-dot ${fresh ? "green" : ""}`} />
            {fresh ? "Market feed connected" : "Waiting for market data"}
          </span>
          <span>USDC · All times UTC</span>
        </footer>
      </div>
    </div>
  );
}
