import "server-only";
import type { z } from "zod";
import { SYSTEM_PROMPT } from "./prompts";
import { extractToolInput, failureForStatus, type AiFailure } from "./parse";

/**
 * Minimal server-side client for the Anthropic Messages API.
 * The API key is read from the server environment only and is never logged,
 * returned, or sent to the browser.
 */

const ENDPOINT = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-haiku-5-5";
const TIMEOUT_MS = 25_000;

export const aiModel = () => process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
export const isAiConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY);

type Tool = { name: string; description: string; input_schema: Record<string, unknown> };

export async function callStructured<T>(opts: {
  prompt: string;
  tool: Tool;
  schema: z.ZodType<T>;
  maxTokens?: number;
}): Promise<{ ok: true; data: T; model: string } | { ok: false; reason: AiFailure }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, reason: "not_configured" };
  const model = aiModel();

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model,
        max_tokens: opts.maxTokens ?? 1024,
        system: SYSTEM_PROMPT,
        tools: [opts.tool],
        tool_choice: { type: "tool", name: opts.tool.name },
        messages: [{ role: "user", content: opts.prompt }],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    console.error("[ai] request failed", { timedOut, name: error instanceof Error ? error.name : "unknown" });
    return { ok: false, reason: timedOut ? "timeout" : "provider_error" };
  }

  if (!res.ok) {
    // Log the status and the provider's error type only — never the key or the prompt.
    const type = await res.json().then((j: { error?: { type?: string } }) => j?.error?.type).catch(() => undefined);
    console.error("[ai] provider error", { status: res.status, type });
    return { ok: false, reason: failureForStatus(res.status) };
  }

  const json: unknown = await res.json().catch(() => null);
  const out = extractToolInput(json, opts.tool.name, opts.schema);
  if (!out.ok) {
    console.error("[ai] invalid output discarded", { model });
    return out;
  }
  return { ok: true, data: out.data, model };
}
