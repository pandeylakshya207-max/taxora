import type { ZodError } from "zod";

/** Result shape every form server action returns to its client form. */
export type FormState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
  /** Echo of submitted values so the form keeps what the user typed after an error. */
  values?: Record<string, string>;
};

export const initialFormState: FormState = { status: "idle" };

/** First error message per field, keyed by field name. */
export function fieldErrorsFrom(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}

/** Read the named text fields from FormData as plain strings ("" when missing). */
export function readFields<K extends string>(formData: FormData, keys: readonly K[]): Record<K, string> {
  const out = {} as Record<K, string>;
  for (const key of keys) {
    const value = formData.get(key);
    out[key] = typeof value === "string" ? value : "";
  }
  return out;
}

/** True for a Prisma unique-constraint violation, without importing Prisma internals. */
export function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === "P2002";
}
