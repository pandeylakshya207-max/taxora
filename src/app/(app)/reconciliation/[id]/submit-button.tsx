"use client";

import { useFormStatus } from "react-dom";
import { LoaderCircle } from "lucide-react";

/** Submit button that shows progress. `name`/`value` let one form offer several decisions. */
export function SubmitButton({
  children,
  pendingText,
  className,
  name,
  value,
}: {
  children: React.ReactNode;
  pendingText: string;
  className: string;
  name?: string;
  value?: string;
}) {
  const { pending, data } = useFormStatus();
  // Only the button that was pressed shows the pending text.
  const isMine = pending && (!name || data?.get(name) === value);
  return (
    <button type="submit" name={name} value={value} disabled={pending} className={className}>
      {isMine && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {isMine ? pendingText : children}
    </button>
  );
}
