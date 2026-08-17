// dsh-router-probe - observation-only probe feeding the model-router.
//
// Hook: llm/stream (waterfall). Records every model call to
// <home>/logs/router.csv:
//   timestamp,kind(loop|hand),provider,model,reasoningEffort,inputChars,msgCount,outputChars,finish
//
// CRITICAL (learned 2026-08-16): llm/stream listeners MUST return
// synchronously - cordis composes waterfall with a plain `return next()`, and
// an async listener's Promise becomes the "stream" itself ("stream is not
// async iterable"). To still observe the OUTPUT side, we synchronously return
// a lazy async generator that wraps next() and counts text-delta chars, then
// appends the completed row on finish. This wrapper pattern is also the
// template for any future synchronous llm/stream interceptor.

import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export const name = "dsh-router-probe";
export const inject = ["llm"];

function csvPath() {
  const home = process.env.DSH_HOME && process.env.DSH_HOME.length > 0
    ? process.env.DSH_HOME
    : join(process.env.USERPROFILE ? process.env.USERPROFILE : ".", ".dsh");
  return join(home, "logs", "router.csv");
}

function requestKind(options) {
  try {
    if (options.sessionId !== undefined) return "loop";
    return "hand";
  } catch {
    return "hand";
  }
}

function inputChars(options) {
  let total = 0;
  try {
    for (const message of options.messages || []) {
      for (const block of message.content || []) {
        if (block && typeof block.text === "string") total += block.text.length;
      }
    }
  } catch { /* read-only best effort */ }
  return total;
}

export function apply(ctx) {
  ctx.on("llm/stream", (options, next) => {
    const head = [
      new Date().toISOString(),
      requestKind(options),
      options.provider,
      options.model,
      options.reasoningEffort === undefined ? "" : String(options.reasoningEffort),
      inputChars(options),
      Array.isArray(options.messages) ? options.messages.length : 0,
    ];

    // Synchronous return: a lazy generator wrapping the downstream stream.
    return (async function* () {
      let out = 0;
      let finish = "";
      try {
        for await (const chunk of next()) {
          if (chunk.type === "text-delta") {
            out += typeof chunk.text === "string" ? chunk.text.length : 0;
          } else if (chunk.type === "finish") {
            finish = chunk.reason ? String(chunk.reason.kind) : "";
          }
          yield chunk;
        }
      } finally {
        try {
          const p = csvPath();
          mkdirSync(join(p, ".."), { recursive: true });
          appendFileSync(p, head.join(",") + "," + out + "," + finish + "\n");
        } catch { /* telemetry must never break the stream */ }
      }
    })();
  });
}