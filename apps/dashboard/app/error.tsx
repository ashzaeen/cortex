"use client";
import { Screen } from "@/components/brass/Screen";

// Say what happened and what is safe, then offer one action (design.md 11.16). No raw error strings.
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Screen ring="error" title="Something went wrong" hint="Nothing was changed, and your memories are safe.">
      <button type="button" onClick={reset} className="press press-primary inline-flex min-h-12 items-center rounded-pill bg-brass px-[26px] text-[0.9375rem] font-bold text-ink hover:bg-brass-hi">
        Try Again
      </button>
    </Screen>
  );
}
