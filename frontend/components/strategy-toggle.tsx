"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pause, Play } from "lucide-react";
import { useRef, useState } from "react";
import { api } from "@/lib/api";
import type { StrategySnapshot } from "@/lib/models";
import { useFreshStrategy } from "@/lib/use-fresh-market";
import { Button } from "./ui";

export function StrategyToggle({
  strategy,
  disabled = false,
}: {
  strategy: StrategySnapshot;
  disabled?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const client = useQueryClient();
  const running = strategy.status === "running";
  const ready = useFreshStrategy(strategy) && !disabled;
  const [targetRunning, setTargetRunning] = useState(!running);
  const mutation = useMutation({
    mutationFn: api.setStrategyStatus,
    onSuccess: async () => {
      await Promise.all(
        ["dashboard", "strategy", "trades"].map((key) =>
          client.invalidateQueries({ queryKey: [key] }),
        ),
      );
      dialog.current?.close();
    },
  });
  return (
    <>
      <Button
        variant={running ? "danger" : "primary"}
        disabled={
          disabled || mutation.isPending || (!running && !ready)
        }
        onClick={() => {
          setTargetRunning(!running);
          mutation.reset();
          dialog.current?.showModal();
        }}
        title={
          !running && !ready
            ? "Waiting for fresh market data and completed candles"
            : undefined
        }
      >
        {running ? (
          <Pause size={14} aria-hidden="true" />
        ) : (
          <Play size={14} aria-hidden="true" />
        )}
        {running ? "Pause bot" : "Start bot"}
      </Button>
      <dialog
        ref={dialog}
        className="dialog"
        aria-labelledby="bot-dialog-title"
        aria-describedby="bot-dialog-description"
        onCancel={(event) => {
          if (mutation.isPending) event.preventDefault();
        }}
      >
        <h2 id="bot-dialog-title">
          {targetRunning ? "Start paper trading?" : "Pause paper trading?"}
        </h2>
        <p id="bot-dialog-description">
          {targetRunning
            ? "The bot will trade the next completed candle using your saved risk limits. All orders are simulated with fees and slippage."
            : "Open positions remain open. Automatic entries and risk exits stop until you resume."}
        </p>
        {mutation.error && (
          <p role="alert" className="field-error">
            {mutation.error.message}
          </p>
        )}
        {targetRunning && !ready && (
          <p role="status" className="field-error">
            Waiting for fresh market data and completed candles.
          </p>
        )}
        <div className="dialog-actions">
          <Button
            disabled={mutation.isPending}
            onClick={() => dialog.current?.close()}
            autoFocus
          >
            Cancel
          </Button>
          <Button
            variant={targetRunning ? "primary" : "danger"}
            disabled={mutation.isPending || (targetRunning && !ready)}
            aria-busy={mutation.isPending}
            onClick={() => mutation.mutate(targetRunning)}
          >
            {mutation.isPending
              ? "Updating…"
              : targetRunning
                ? "Start bot"
                : "Pause bot"}
          </Button>
        </div>
      </dialog>
    </>
  );
}
