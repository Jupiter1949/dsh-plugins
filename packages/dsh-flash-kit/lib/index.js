// dsh-flash-kit - shared one-shot flash caller for dsh plugins.
//
// WHY THIS EXISTS: the agent-level reasoningEffort:"off" setting applies only
// to agent-loop requests. A hand-built ctx.llm.stream() call without an
// explicit reasoningEffort gets the adapter default, and v4-flash then burns
// the whole maxTokens budget on reasoning-deltas and finishes with
// max-tokens and ZERO text. Every plugin flash call MUST go through here.

export const FLASH_PROVIDER = "deepseek-official";
export const FLASH_MODEL = "deepseek-v4-flash";

/**
 * One distilled flash call. Never throws; failures return { ok: false }.
 *
 * @param ctx  Cordis context with the llm service injected.
 * @param options
 *   - prompt: user text (required)
 *   - system: optional system prompt
 *   - maxTokens: default 600
 *   - temperature: default 0.1
 *   - signal: optional AbortSignal
 * @returns { ok: true, text, finishKind, usage? } | { ok: false, reason }
 */
export async function callFlash(ctx, options) {
  const { prompt, system, maxTokens = 600, temperature = 0.1, signal } = options;
  if (typeof prompt !== "string" || prompt.length === 0) {
    return { ok: false, reason: "empty-prompt" };
  }

  const messages = [{
    id: crypto.randomUUID(),
    role: "user",
    content: [{ type: "text", text: prompt }],
    source: { kind: "user" },
  }];

  let stream;
  try {
    stream = ctx.llm.stream({
      provider: FLASH_PROVIDER,
      model: FLASH_MODEL,
      reasoningEffort: "off", // non-negotiable; see header comment
      ...(system ? { system } : {}),
      messages,
      maxTokens,
      temperature,
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    return { ok: false, reason: error && error.message ? error.message : String(error) };
  }

  let text = "";
  let finishKind = null;
  let usage = null;
  try {
    for await (const chunk of stream) {
      if (chunk.type === "text-delta") {
        text += chunk.text;
      } else if (chunk.type === "usage") {
        usage = chunk.usage;
      } else if (chunk.type === "finish") {
        finishKind = chunk.reason ? chunk.reason.kind : null;
      }
    }
  } catch (error) {
    return { ok: false, reason: error && error.message ? error.message : String(error) };
  }

  if (finishKind !== "stop" && finishKind !== "max-tokens") {
    return { ok: false, reason: "finish:" + finishKind };
  }
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: "empty-text" };
  }
  return { ok: true, text: trimmed, finishKind, usage };
}