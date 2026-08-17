// dsh-result-distiller - distill large tool results with deepseek-v4-flash
// before they enter the model-visible session log.
//
// Hook: tools/post-execute (waterfall). Call next() first; when the settled
// success result carries >= MIN_CONTENT_CHARS of text, ONE flash call (via
// dsh-flash-kit, reasoning forced off) distills it into 3-6 factual bullets,
// and the model-visible content becomes [summary + raw head]. The session log
// records the distilled copy, so every later model request (and compaction)
// reads the thin version.
//
// Telemetry: one CSV row appended per distillation attempt to
//   <home>/logs/distiller.csv  (timestamp,tool,rawChars,outChars,ratio,ms,status)

import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { callFlash } from "dsh-flash-kit";

export const name = "dsh-result-distiller";
export const inject = ["tools", "llm"];

const MIN_CONTENT_CHARS = 2000; // below this a flash call is not worth it
const RAW_HEAD_CHARS = 400; // raw head kept beside the summary
const FLASH_INPUT_CAP = 12000; // raw chars fed to flash per distillation

function csvPath() {
  const home = process.env.DSH_HOME && process.env.DSH_HOME.length > 0
    ? process.env.DSH_HOME
    : join(process.env.USERPROFILE ? process.env.USERPROFILE : ".", ".dsh");
  return join(home, "logs", "distiller.csv");
}

function logCsv(row) {
  try {
    const p = csvPath();
    mkdirSync(join(p, ".."), { recursive: true });
    appendFileSync(p, row.join(",") + "\n");
  } catch { /* telemetry must never break the pipeline */ }
}

export function apply(ctx) {
  ctx.on("tools/post-execute", async (exec, result, next) => {
    const decision = await next();
    if (decision.kind !== "accept") return decision;
    if (decision.content !== undefined && !sameContent(decision.content, result.content)) {
      return decision; // another listener replaced the projection; respect it
    }
    if (result.isError) return decision;

    const raw = flatten(result.content);
    if (raw.length < MIN_CONTENT_CHARS) return decision;

    const signal = typeof exec.signal !== "undefined" ? exec.signal : undefined;
    const startedAt = Date.now();
    const outcome = await callFlash(ctx, {
      system: "You distill tool output for an AI agent. Reply with 3-6 concise bullet lines, each starting with \"- \". No preamble, no closing remarks.",
      prompt: 'Tool "' + exec.name + '" returned the result below. Distill it into 3-6 factual bullet points. Keep concrete numbers, names, and paths. Reply with ONLY the bullets.\n\n'
        + raw.slice(0, FLASH_INPUT_CAP),
      maxTokens: 600,
      signal,
    });

    if (!outcome.ok) {
      logCsv([new Date().toISOString(), exec.name, raw.length, "", "", Date.now() - startedAt, "fail:" + outcome.reason]);
      return decision;
    }

    const text =
      "[distilled:" + exec.name + "]\n" + outcome.text + "\n\n" +
      "--- raw head (" + RAW_HEAD_CHARS + " chars) ---\n" + raw.slice(0, RAW_HEAD_CHARS);
    const outChars = text.length;
    logCsv([new Date().toISOString(), exec.name, raw.length, outChars,
      (outChars / raw.length).toFixed(3), Date.now() - startedAt,
      "ok:" + outcome.finishKind]);
    console.log("[result-distiller] " + exec.name + ": " + raw.length + " -> " + outChars + " chars");
    return { kind: "accept", content: [{ type: "text", text }] };
  });
}

function sameContent(a, b) {
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  return sa.length === sb.length && sa === sb;
}

function flatten(content) {
  if (!Array.isArray(content)) return "";
  const parts = [];
  for (const block of content) {
    if (block && block.type === "text" && typeof block.text === "string" && block.text.length > 0) {
      parts.push(block.text);
    } else if (block && block.type) {
      parts.push("[" + block.type + " block]");
    }
  }
  return parts.join("\n");
}