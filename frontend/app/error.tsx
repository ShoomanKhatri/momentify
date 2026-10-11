"use client";
import { ErrorState, PageHeader } from "@/components/ui";
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <>
      <PageHeader title="View unavailable" />
      <ErrorState
        error={new Error("This view could not be displayed. Try again.")}
        retry={reset}
      />
    </>
  );
}
