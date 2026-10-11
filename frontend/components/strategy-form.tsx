"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import type { StrategyConfig, StrategySnapshot } from "@/lib/models";
import { Button } from "./ui";

const fields: {
  key: keyof StrategyConfig;
  label: string;
  min: number;
  max: number;
  integer?: boolean;
  unit: string;
  section: "momentum" | "risk";
}[] = [
  {
    key: "fastPeriod",
    label: "Fast EMA",
    min: 2,
    max: 99,
    integer: true,
    unit: "bars",
    section: "momentum",
  },
  {
    key: "slowPeriod",
    label: "Slow EMA",
    min: 3,
    max: 100,
    integer: true,
    unit: "bars",
    section: "momentum",
  },
  {
    key: "positionSizePercent",
    label: "Position size",
    min: 1,
    max: 100,
    unit: "%",
    section: "momentum",
  },
  {
    key: "maxDailyLossPercent",
    label: "Daily loss limit",
    min: 0.1,
    max: 50,
    unit: "%",
    section: "risk",
  },
  {
    key: "stopLossPercent",
    label: "Stop loss",
    min: 0.1,
    max: 50,
    unit: "%",
    section: "risk",
  },
  {
    key: "takeProfitPercent",
    label: "Take profit",
    min: 0.1,
    max: 100,
    unit: "%",
    section: "risk",
  },
];

type FormValues = Record<keyof StrategyConfig, string>;

function formValues(config: StrategyConfig): FormValues {
  return Object.fromEntries(
    fields.map(({ key }) => [key, String(config[key])]),
  ) as FormValues;
}

function matchesConfig(values: FormValues, config: StrategyConfig) {
  return fields.every(
    ({ key }) => values[key].trim() !== "" && Number(values[key]) === config[key],
  );
}

export function StrategyForm({
  config,
  running,
}: {
  config: StrategyConfig;
  running: boolean;
}) {
  const [draft, setDraft] = useState<{
    base: StrategyConfig;
    values: FormValues;
  } | null>(null);
  const dirtyDraft =
    draft && !matchesConfig(draft.values, draft.base) ? draft : null;
  const values = dirtyDraft?.values ?? formValues(config);
  const changed = !matchesConfig(values, config);
  const conflict =
    changed &&
    !!dirtyDraft &&
    fields.some(({ key }) => dirtyDraft.base[key] !== config[key]);
  const [errors, setErrors] = useState<
    Partial<Record<keyof StrategyConfig, string>>
  >({});
  const [saved, setSaved] = useState(false);
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: api.configureStrategy,
    onSuccess: async (strategy: StrategySnapshot) => {
      client.setQueryData(["strategy"], strategy);
      setDraft(null);
      setErrors({});
      setSaved(true);
      await Promise.all(
        ["dashboard", "strategy", "markets"].map((key) =>
          client.invalidateQueries({ queryKey: [key] }),
        ),
      );
    },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (running || mutation.isPending || conflict || !changed) return;
    const nextErrors: Partial<Record<keyof StrategyConfig, string>> = {};
    const next = {} as StrategyConfig;
    for (const field of fields) {
      const value = Number(values[field.key]);
      next[field.key] = value;
      if (
        !/^\d+(\.\d+)?$/.test(values[field.key]) ||
        !Number.isFinite(value) ||
        value < field.min ||
        value > field.max ||
        (field.integer && !Number.isInteger(value))
      )
        nextErrors[field.key] =
          `${field.integer ? "Use a whole number" : "Use a number"} from ${field.min} to ${field.max}.`;
    }
    if (
      !nextErrors.fastPeriod &&
      !nextErrors.slowPeriod &&
      next.fastPeriod >= next.slowPeriod
    )
      nextErrors.fastPeriod = "Fast EMA must be below slow EMA.";
    setErrors(nextErrors);
    setSaved(false);
    const first = fields.find(({ key }) => nextErrors[key]);
    if (first) {
      event.currentTarget
        .querySelector<HTMLInputElement>(`#${first.key}`)
        ?.focus();
      return;
    }
    mutation.mutate(next);
  }
  return (
    <form onSubmit={submit} noValidate>
      {conflict && (
        <div className="form-notice form-conflict" role="status">
          <span>Saved settings changed. Your edits are preserved.</span>
          <Button
            type="button"
            onClick={() => {
              setDraft(null);
              setErrors({});
              setSaved(false);
              mutation.reset();
            }}
          >
            Use saved values
          </Button>
        </div>
      )}
      {mutation.error && (
        <div className="form-notice error" role="alert">
          {mutation.error.message}
        </div>
      )}
      {saved && (
        <div className="form-notice success" role="status">
          Strategy saved.
        </div>
      )}
      {(["momentum", "risk"] as const).map((section) => (
        <section
          className="form-section"
          key={section}
          aria-labelledby={`${section}-heading`}
        >
          <div>
            <h2 id={`${section}-heading`}>
              {section === "momentum" ? "Momentum" : "Risk limits"}
            </h2>
            <p>
              {section === "momentum"
                ? "Completed 1-minute candles."
                : "One position. No leverage."}
            </p>
          </div>
          <div className="form-grid">
            {fields
              .filter((field) => field.section === section)
              .map(({ key, label, unit, integer }) => (
                <div className="field" key={key}>
                  <label htmlFor={key}>{label}</label>
                  <div className="input-wrap">
                    <input
                      id={key}
                      name={key}
                      type="text"
                      inputMode={integer ? "numeric" : "decimal"}
                      autoComplete="off"
                      spellCheck={false}
                      required
                      value={values[key]}
                      disabled={running || mutation.isPending}
                      aria-invalid={!!errors[key]}
                      aria-describedby={
                        errors[key] ? `${key}-error` : undefined
                      }
                      onChange={(event) => {
                        setDraft({
                          base: dirtyDraft && changed ? dirtyDraft.base : config,
                          values: { ...values, [key]: event.target.value },
                        });
                        setErrors((previous) => ({
                          ...previous,
                          [key]: undefined,
                        }));
                        setSaved(false);
                        mutation.reset();
                      }}
                    />
                    <span>{unit}</span>
                  </div>
                  {errors[key] && (
                    <p className="field-error" id={`${key}-error`}>
                      {errors[key]}
                    </p>
                  )}
                </div>
              ))}
          </div>
        </section>
      ))}
      <div className="form-footer">
        <p>
          {running
            ? "Pause the bot to edit."
            : "Changes apply when the bot resumes."}
        </p>
        <Button
          type="submit"
          variant="primary"
          disabled={running || !changed || conflict || mutation.isPending}
          aria-busy={mutation.isPending}
        >
          {mutation.isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
