// dsh-model-router - whitelist-gate model router (replay-calibrated 2026-08-17).
//
// Policy: every request defaults to flash; pro only via narrow gates.
//   1. keyword gate: a FORCE_PRO keyword AND len >= KEYWORD_FLOOR (replay
//      finding: bare keywords misfire on len=13 chatter and keywords buried
//      in pasted code comments; a real deep task always carries substance)
//   2. deep-logic gate: >=2 logic connectors AND len > 5000
//   3. complex gate: >=2 deep verbs AND len > 8000
// Code comments are stripped before matching so "证明/审查" inside pasted
// code cannot upgrade a deployment task.
//
// Hook: agent/request (waterfall, async allowed, returns Promise<LlmCallConfig>).
// Input comes from payload.agent.session.events, filtered to REAL user input
// (source.kind === "user"; dsh injects synthetic user/message events like
// system-reminder/skill-catalog AFTER the real prompt - taking the last
// user/message unfiltered would corrupt features). We take the LAST real
// user message to capture the newest intent (users send follow-ups).
//
// dryRun=true logs decisions to <home>/logs/router-decisions.csv and keeps
// the original model. Set false in the profile patch to activate switching.

import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import Schema from "@deepseek-ai/schemastery";

export const name = "dsh-model-router";

export const Config = Schema.object({
  dryRun: Schema.boolean().default(true).description("true: log decisions only; false: actually switch the model"),
});

const FLASH_MODEL = "deepseek-v4-flash";
const PRO_MODEL = "deepseek-v4-pro";
const KEYWORD_FLOOR = 200;

const FORCE_PRO_KEYWORDS = ["架构评审", "代码审查", "战略分析", "风险评估", "架构设计", "权衡", "证明", "推演", "审计"];
const LOGIC_WORDS = ["因为", "所以", "如果", "那么", "推理", "证明", "导致", "取决于"];
const DEEP_VERBS = ["分析", "审查", "重构", "优化", "设计", "论证", "评估", "对比"];

function csvPath() {
  const home = process.env.DSH_HOME && process.env.DSH_HOME.length > 0
    ? process.env.DSH_HOME
    : join(process.env.USERPROFILE ? process.env.USERPROFILE : ".", ".dsh");
  return join(home, "logs", "router-decisions.csv");
}

function logCsv(row) {
  try {
    const p = csvPath();
    mkdirSync(join(p, ".."), { recursive: true });
    appendFileSync(p, row.join(",") + "\n");
  } catch { /* telemetry must never break routing */ }
}

function textOf(message) {
  if (!message || !Array.isArray(message.content)) return "";
  return message.content
    .filter(b => b && b.type === "text" && typeof b.text === "string")
    .map(b => b.text).join("\n").trim();
}

// Real human prompts only; newest one wins.
function lastRealUserInput(events) {
  if (!Array.isArray(events)) return "";
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (!e || e.type !== "user/message") continue;
    const data = e.data ?? e.message ?? e;
    if (!data || !data.source || data.source.kind !== "user") continue;
    const t = textOf(data);
    if (t) return t;
  }
  return "";
}

// Strip // and /* */ comments so keywords inside pasted code cannot gate.
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ")
    .replace(/([^:])\/\/.*$/gm, "$1 ");
}

function route(rawInput) {
  const clean = stripComments(rawInput);
  const len = clean.length;
  const kw = FORCE_PRO_KEYWORDS.filter(w => clean.includes(w));
  const logic = LOGIC_WORDS.filter(w => clean.includes(w));
  const verbs = DEEP_VERBS.filter(w => clean.includes(w));

  if (kw.length > 0 && len >= KEYWORD_FLOOR) return { model: PRO_MODEL, gate: "keyword:" + kw[0], len };
  if (logic.length >= 2 && len > 5000) return { model: PRO_MODEL, gate: "deep-logic+long", len };
  if (verbs.length >= 2 && len > 8000) return { model: PRO_MODEL, gate: "multi-verb+verylong", len };
  return { model: FLASH_MODEL, gate: "", len };
}

export function apply(ctx, config) {
  const logger = ctx.logger("model-router");

  ctx.on("agent/request", async (payload, next) => {
    const input = lastRealUserInput(payload?.agent?.session?.events);
    if (input.length === 0) return next();

    const decision = route(input);
    const proposal = await next();
    if (!proposal) return proposal;

    const isSwitch = decision.model !== FLASH_MODEL && proposal.model !== decision.model;
    logCsv([
      new Date().toISOString(),
      decision.len,
      decision.gate || "default-flash",
      decision.model,
      config.dryRun ? "dryrun" : "live",
      isSwitch ? (config.dryRun ? "would-switch" : "switched") : proposal.model,
    ]);

    if (decision.model === FLASH_MODEL) {
      if (proposal.model === FLASH_MODEL) return proposal;
      // An upstream default chose pro for a flash-class request: override down.
      logger.info("[model-router] downgrade to flash (len=" + decision.len + ")");
      return { ...proposal, model: FLASH_MODEL };
    }
    if (!config.dryRun && proposal.model !== decision.model) {
      logger.info("[model-router] upgrade to pro via " + decision.gate + " (len=" + decision.len + ")");
      return { ...proposal, model: decision.model };
    }
    return proposal;
  }, true /* prepend: routing speaks first */);

  logger.info("[model-router] loaded (dryRun=" + config.dryRun + ", gates: keyword>=" + KEYWORD_FLOOR + " / logic+5000 / verbs+8000)");
}