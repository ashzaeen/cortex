import Link from "next/link";
import { Screen } from "@/components/brass/Screen";

export default function NotFound() {
  return (
    <Screen ring="paused" title="That page isn't here" hint="Your memories are safe.">
      <Link href="/" className="press press-primary inline-flex min-h-12 items-center rounded-pill bg-brass px-[26px] text-[0.9375rem] font-bold text-ink hover:bg-brass-hi">
        Back to Cortex
      </Link>
    </Screen>
  );
}
