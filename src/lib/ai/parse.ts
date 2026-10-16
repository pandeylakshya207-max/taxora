import type { z } from "zod";

export type AiFailure = "not_configured" | "timeout" | "rate_limited" | "provider_error" | "invalid_output";

/**
 * Pull the tool input out of a Messages API response and validate it.
 * Free text, a missing tool call or a schema mismatch all count as invalid —
 * nothing unvalidated is ever returned.
 */
export function extractToolInput<T>(
  response: unknown,
  toolName: string,
  schema: z.ZodType<T>,
): { ok: true; data: T } | { ok: false; reason: "invalid_output" } {
  const content = (response as { content?: unknown })?.content;
  if (!Array.isArray(content)) return { ok: false, reason: "invalid_output" };
  const block = content.find(
    (b): b is { type: "tool_use"; name: string; input: unknown } =>
      !!b && typeof b === "object" && (b as { type?: unknown }).type === "tool_use" && (b as { name?: unknown }).name === toolName,
  );
  if (!block) return { ok: false, reason: "invalid_output" };
  const parsed = schema.safeParse(block.input);
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, reason: "invalid_output" };
}

/** Map an HTTP status from the provider to an honest failure reason. */
export function failureForStatus(status: number): AiFailure {
  if (status === 429) return "rate_limited";
  if (status === 529 || status === 503) return "rate_limited";
  return "provider_error";
}

export const FAILURE_MESSAGE: Record<AiFailure, string> = {
  not_configured: "AI assistance is not configured on this server (ANTHROPIC_API_KEY is not set). The engine's own explanation above still applies.",
  timeout: "The AI service did not respond in time. Nothing was saved — please try again.",
  rate_limited: "The AI service is busy or the request limit was reached. Please try again in a minute.",
  provider_error: "The AI service returned an error. Nothing was saved — please try again later.",
  invalid_output: "The AI response did not match the expected format, so it was discarded and not shown.",
};
