// =============================================================================
// @o/operator/llm — model client
// =============================================================================
// Thin wrapper over OpenAI's chat completions API. We use one provider
// (OpenAI) for the operator because:
//   1. Their tool-use and structured outputs are best-in-class
//   2. The model catalog is wide (4o-mini for drafts, 4o for briefings)
//   3. Cost is predictable and we can cache prompts aggressively
//
// If you want to swap to Anthropic, Mistral, or local models, replace
// this file. The action code is provider-agnostic.

import OpenAI from "openai";
import { z } from "zod";
import { logger } from "@o/logger";

// -----------------------------------------------------------------------------
// Client
// -----------------------------------------------------------------------------

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (client) return client;
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set; cannot call the operator's LLM");
  }
  client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

// -----------------------------------------------------------------------------
// Model catalog
// -----------------------------------------------------------------------------
// Per-token cost (USD). Updated 2026-01; check OpenAI's pricing page before
// changing. These are the prices we record against each call.

export const MODELS = {
  // Cheap + fast. Used for: lead scoring, deal follow-up drafts, invoice
  // reminders, photo progress pings. The vast majority of operator calls.
  "gpt-4o-mini": {
    inputPer1M: 0.15,
    outputPer1M: 0.60,
    maxContext: 128_000,
    label: "GPT-4o mini",
  },
  // Smarter. Used for: morning briefing (it reasons about the day),
  // client brief summary (it reads the whole project and writes a digest).
  "gpt-4o": {
    inputPer1M: 2.50,
    outputPer1M: 10.00,
    maxContext: 128_000,
    label: "GPT-4o",
  },
  // Most capable. Used for: very long client briefs, complex reasoning.
  // Optional — the operator doesn't have to use it.
  "o1": {
    inputPer1M: 15.00,
    outputPer1M: 60.00,
    maxContext: 200_000,
    label: "o1",
  },
} as const;
export type ModelName = keyof typeof MODELS;

export function pickModel(task: "draft" | "briefing" | "summary" | "score"): ModelName {
  switch (task) {
    case "draft":    return "gpt-4o-mini";
    case "score":    return "gpt-4o-mini";
    case "briefing": return "gpt-4o";
    case "summary":  return "gpt-4o";
  }
}

function computeCost(model: ModelName, promptTokens: number, completionTokens: number): number {
  const m = MODELS[model];
  const input = (promptTokens / 1_000_000) * m.inputPer1M;
  const output = (completionTokens / 1_000_000) * m.outputPer1M;
  return input + output;
}

// -----------------------------------------------------------------------------
// Structured output helper
// -----------------------------------------------------------------------------
// Uses OpenAI's json_schema response format. The model is constrained to
// produce JSON that matches the Zod schema. No parsing, no retries, no
// "the model returned a slightly different shape" surprises.
//
// On validation failure: we retry up to MAX_STRUCTURED_RETRIES times
// with increasing temperature. This is what the tutorial doesn't
// show but is table-stakes: even with json_schema mode, the model
// occasionally returns something the schema rejects. A retry with
// higher temperature usually gets it right.

const MAX_STRUCTURED_RETRIES = 3;

export async function callStructured<T>(args: {
  model: ModelName;
  system: string;
  user: string;
  schema: z.ZodType<T>;
  schemaName: string;
  temperature?: number;
}): Promise<{ value: T; promptTokens: number; completionTokens: number; costUsd: number; model: ModelName }> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_STRUCTURED_RETRIES; attempt++) {
    try {
      return await callStructuredOnce(args, attempt);
    } catch (err) {
      lastError = err;
      const isValidation = err instanceof z.ZodError;
      logger.warn("llm.structured.attempt_failed", {
        attempt: attempt + 1,
        max: MAX_STRUCTURED_RETRIES,
        kind: isValidation ? "validation" : "other",
        err: String(err),
      });
      // Bump the temperature on retry. The first attempt was probably
      // too rigid; the next one should explore more.
      args = { ...args, temperature: (args.temperature ?? 0.4) + 0.1 * (attempt + 1) };
    }
  }
  throw lastError;
}

async function callStructuredOnce<T>(args: {
  model: ModelName;
  system: string;
  user: string;
  schema: z.ZodType<T>;
  schemaName: string;
  temperature?: number;
}): Promise<{ value: T; promptTokens: number; completionTokens: number; costUsd: number; model: ModelName }> {
  const t0 = Date.now();
  const openai = getClient();

  const response = await openai.chat.completions.create({
    model: args.model,
    temperature: args.temperature ?? 0.4,
    messages: [
      { role: "system", content: args.system },
      { role: "user", content: args.user },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: args.schemaName,
        strict: true,
        schema: zodToJsonSchema(args.schema),
      },
    },
  });

  const message = response.choices[0]?.message;
  if (!message?.content) throw new Error("LLM returned no content");

  let parsed: T;
  try {
    parsed = args.schema.parse(JSON.parse(message.content));
  } catch (err) {
    logger.error("LLM structured output failed validation", { err: String(err), content: message.content });
    throw err;
  }

  const usage = response.usage ?? { prompt_tokens: 0, completion_tokens: 0 };
  const promptTokens = usage.prompt_tokens;
  const completionTokens = usage.completion_tokens;
  const costUsd = computeCost(args.model, promptTokens, completionTokens);

  logger.info("LLM call", {
    model: args.model,
    promptTokens,
    completionTokens,
    costUsd,
    durationMs: Date.now() - t0,
  });

  return { value: parsed, promptTokens, completionTokens, costUsd, model: args.model };
}

// -----------------------------------------------------------------------------
// Free-form text helper
// -----------------------------------------------------------------------------
// For longer-form drafts (morning briefing, client brief summary), we don't
// constrain the shape — the model writes prose. We still log cost.

export async function callText(args: {
  model: ModelName;
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<{ text: string; promptTokens: number; completionTokens: number; costUsd: number; model: ModelName }> {
  const t0 = Date.now();
  const openai = getClient();

  const response = await openai.chat.completions.create({
    model: args.model,
    temperature: args.temperature ?? 0.6,
    max_tokens: args.maxTokens ?? 1500,
    messages: [
      { role: "system", content: args.system },
      { role: "user", content: args.user },
    ],
  });

  const text = response.choices[0]?.message?.content ?? "";
  const usage = response.usage ?? { prompt_tokens: 0, completion_tokens: 0 };
  const promptTokens = usage.prompt_tokens;
  const completionTokens = usage.completion_tokens;
  const costUsd = computeCost(args.model, promptTokens, completionTokens);

  logger.info("LLM text call", {
    model: args.model,
    promptTokens,
    completionTokens,
    costUsd,
    durationMs: Date.now() - t0,
  });

  return { text, promptTokens, completionTokens, costUsd, model: args.model };
}

// -----------------------------------------------------------------------------
// Zod → JSON Schema
// -----------------------------------------------------------------------------
// Minimal implementation of the subset OpenAI's json_schema supports.
// We only need: object, string, number, boolean, enum, array, nullable.
// For anything else, write the JSON Schema by hand in the action.

import { zodToJsonSchema as realZodToJsonSchema } from "zod-to-json-schema";
function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  // zod-to-json-schema v3 returns a Draft-07 schema by default, which is
  // close enough to what OpenAI's strict mode needs.
  return realZodToJsonSchema(schema) as Record<string, unknown>;
}
