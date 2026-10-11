"use client";
import { AlertCircle, ArrowRight, Inbox, RefreshCw } from "lucide-react";
import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Button({
  children,
  variant = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?:
    | "primary"
    | "danger"
    | "primary-soft"
    | "danger-soft"
    | "secondary"
    | "ghost";
}) {
  return (
    <button {...props} className={`button button-${variant} ${className}`}>
      {children}
    </button>
  );
}
export function PageHeader({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
      </div>
      <div className="page-actions">{children}</div>
    </div>
  );
}
export function RefreshButton({
  refresh,
  busy,
}: {
  refresh: () => void;
  busy: boolean;
}) {
  return (
    <Button onClick={refresh} disabled={busy} aria-busy={busy}>
      <RefreshCw size={14} className={busy ? "spin" : ""} aria-hidden="true" />
      <span>Refresh</span>
    </Button>
  );
}
export function ErrorState({
  error,
  retry,
  title = "Could not load this view",
}: {
  error: Error;
  retry: () => void;
  title?: string;
}) {
  return (
    <div className="error-state" role="alert">
      <AlertCircle size={18} aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        <p>{error.message}</p>
      </div>
      <Button onClick={retry}>Try again</Button>
    </div>
  );
}
export function EmptyState({
  title,
  detail,
  href,
  action,
}: {
  title: string;
  detail?: string;
  href?: string;
  action?: string;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Inbox size={20} strokeWidth={1.5} aria-hidden="true" />
      </span>
      <strong>{title}</strong>
      {detail && <p>{detail}</p>}
      {href && (
        <Link className="text-link" href={href}>
          {action}
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
export function PageSkeleton({ rows = false }: { rows?: boolean }) {
  return (
    <div className="page-skeleton" role="status" aria-label="Loading workspace">
      <div className="skeleton-metrics">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i}>
            <div className="skeleton skeleton-label" />
            <div className="skeleton skeleton-value" />
            <div className="skeleton skeleton-label" />
          </div>
        ))}
      </div>
      <div
        className={`skeleton ${rows ? "skeleton-table" : "skeleton-chart"}`}
      />
      {rows && <div className="skeleton skeleton-table" />}
    </div>
  );
}
export function SignalBadge({ signal }: { signal: string | null | undefined }) {
  return (
    <span
      className={`signal-badge ${signal === "BUY" ? "signal-buy" : signal === "SELL" ? "signal-sell" : ""}`}
    >
      <span className="status-dot" />
      {signal ?? "Unavailable"}
    </span>
  );
}
export function Token() {
  return (
    <span className="token">
      <span className="token-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="m6 5 13 0-3 3H3zm-3 6h13l3 3H6zm3 6h13l-3 3H3z" />
        </svg>
      </span>
      <span>
        <strong>Solana</strong>
        <small>SOL / USDC</small>
      </span>
    </span>
  );
}
