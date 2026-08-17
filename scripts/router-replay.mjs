// router-replay - offline replay simulator for the upcoming model-router.
//
// Pure CPU: decompresses every session log under DSH_HOME/sessions, extracts
// REAL user inputs (source.kind === "user" only - synthetic user/message
// events like system-reminder/skill-catalog are filtered), runs the
// "whitelist gate" routing policy over each input, and reports what the
// router would have done, with a parameterized cost-ratio saving estimate.
//
// Usage: node scripts/router-replay.mjs [--ratio 10] [--days 7]
//   --ratio  assumed pro:flash input price ratio (default 10)
//   --days   only sessions modified within N days (default 7)

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { decompress } from "fzstd";

const args = process.argv.slice(2);
const ratio = Number(args[args.indexOf("--ratio") + 1] ?? 10);
const days = Number(args[args.indexOf("--days") + 1] ?? 7);

const HOME = process.env.DSH_HOME && process.env.DSH_HOME.length > 0
  ? process.env.DSH_HOME
  : join(process.env.USERPROFILE, ".dsh");
const ROOT = join(HOME, "sessions");
const CUTOFF = Date.now() - days * 86400e3;

// ---- routing policy (whitelist gate; mirrors cot-smart feature extraction) ----
const FORCE_PRO_KEYWORDS = ["架构评审", "代码审查", "战略分析", "风险评估", "架构设计", "权衡", "证明", "推演", "审计"];
const LOGIC_WORDS = ["因为", "所以", "如果", "那么", "推理", "证明", "导致", "取决于"];
const DEEP_VERBS = ["分析", "审查", "重构", "优化", "设计", "论证", "评估", "对比"];

const KEYWORD_FLOOR = 200; // replay finding: bare keywords misfire on short
// chatter ("我们对今天的工作进行原审计", len=13) and on keywords buried in
// pasted code comments. A real deep task always carries substance.

function route(text) {
  const len = text.length;
  const kw = FORCE_PRO_KEYWORDS.filter(w => text.includes(w));
  const logic = LOGIC_WORDS.filter(w => text.includes(w));
  const verbs = DEEP_VERBS.filter(w => text.includes(w));
  if (kw.length > 0 && len >= KEYWORD_FLOOR) return { model: "pro", why: "keyword:" + kw[0] };
  if (logic.length >= 2 && len > 5000) return { model: "pro", why: "deep-logic+long" };
  if (verbs.length >= 2 && len > 8000) return { model: "pro", why: "multi-verb+verylong" };
  return { model: "flash", why: "" };
}

// ---- session log walking ----
function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (name === "session.jsonl.zstd" && st.mtimeMs >= CUTOFF) out.push({ full, m: st.mtimeMs });
  }
  return out;
}

function textOf(message) {
  if (!message || !Array.isArray(message.content)) return "";
  return message.content
    .filter(b => b && b.type === "text" && typeof b.text === "string")
    .map(b => b.text).join("\n").trim();
}

function realUserInputs(lines) {
  const inputs = [];
  for (const line of lines) {
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (e.type !== "user/message") continue;
    const data = e.data ?? e.message ?? e;
    if (!data || !data.source || data.source.kind !== "user") continue; // real humans only
    const t = textOf(data);
    if (t) inputs.push(t);
  }
  return inputs;
}

const files = (() => { try { return walk(ROOT, []); } catch { console.log("no sessions dir:", ROOT); process.exit(0); } })();
const sessions = [];
let totalInputs = 0, flash = 0, pro = 0;
const proSamples = [], lenList = [];
let undecoded = 0;

for (const { full, m } of files) {
  let text;
  try { text = new TextDecoder().decode(decompress(readFileSync(full))); }
  catch { undecoded++; continue; }
  const lines = text.split("\n").filter(l => l.trim());
  const inputs = realUserInputs(lines);
  if (inputs.length === 0) continue;
  const routed = inputs.map(t => ({ t, ...route(t) }));
  sessions.push({ full, m, routed });
  totalInputs += routed.length;
  for (const r of routed) {
    lenList.push(r.t.length);
    if (r.model === "pro") { pro++; proSamples.push({ len: r.t.length, why: r.why, head: r.t.slice(0, 60) }); }
    else flash++;
  }
}

lenList.sort((a, b) => a - b);
const q = p => lenList.length ? lenList[Math.min(lenList.length - 1, Math.floor(lenList.length * p))] : 0;

// Cost model: baseline "everything runs on pro" vs gate "only pro-gated on pro".
// Input chars ~ proportional to input tokens; output ignored (same either way).
const flashChars = lenList.reduce((a, b) => a + b, 0) - proSamples.reduce((a, s) => a + s.len, 0);
const proChars = proSamples.reduce((a, s) => a + s.len, 0);
// baseline pro cost = totalChars * 1 (unit); gate cost = flashChars * (1/ratio) + proChars * 1
const totalChars = flashChars + proChars;
const gateCost = flashChars / ratio + proChars;
const saving = totalChars > 0 ? (1 - gateCost / totalChars) * 100 : 0;

console.log("=== router replay report ===");
console.log("window: last " + days + "d | price ratio assumption: pro = " + ratio + "x flash (input)");
console.log("sessions with real user input:", sessions.length, "(undecodable:", undecoded + ")");
console.log("real user inputs:", totalInputs, "| flash:", flash, "| pro-gated:", pro);
console.log("input length  p50/p90/max:", q(0.5) + "/" + q(0.9) + "/" + (lenList[lenList.length - 1] ?? 0));
console.log("pro-gated samples:");
for (const s of proSamples.slice(0, 10)) console.log("  [" + s.why + "] len=" + s.len + " | " + s.head.replace(/\n/g, " "));
console.log("cost: baseline all-pro = " + Math.round(totalChars) + "u | gate = " + Math.round(gateCost) + "u | saving = " + saving.toFixed(1) + "%");