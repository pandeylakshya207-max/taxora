"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** Copies the CURRENT text of the given fields (including the user's edits). */
export function CopyButton({ subjectId, bodyId }: { subjectId: string; bodyId: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    const subject = (document.getElementById(subjectId) as HTMLInputElement | null)?.value ?? "";
    const body = (document.getElementById(bodyId) as HTMLTextAreaElement | null)?.value ?? "";
    try {
      await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
      setState("copied");
      setTimeout(() => setState("idle"), 2500);
    } catch {
      setState("failed");
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={copy}
        className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold text-ink hover:bg-surface"
      >
        {state === "copied" ? <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
        {state === "copied" ? "Copied" : "Copy email"}
      </button>
      {state === "failed" && <span role="alert" className="text-xs text-rose-700">Couldn&apos;t copy — select the text and copy it manually.</span>}
    </span>
  );
}
