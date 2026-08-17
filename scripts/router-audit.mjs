// router-audit - Monday three-layer penetration audit for model-router.
// Usage: node scripts/router-audit.mjs
// Layer 1: length buckets (<500 / 500-3000 / >5000) -> flash/pro distribution
// Layer 2: keyword-gated pro samples (for manual spot-check of ~20)
// Layer 3: complexity proxy via msgCount buckets (1-3 / 4-7 / 8+) -> pro share
//          (msgCount is a proxy; true tool-chain length needs session-log join, v1.1)

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const HOME = process.env.DSH_HOME && process.env.DSH_HOME.length > 0
  ? process.env.DSH_HOME : join(process.env.USERPROFILE, ".dsh");
const DEC = join(HOME, "logs", "router-decisions.csv");
const RT = join(HOME, "logs", "router.csv");

if (!existsSync(DEC)) { console.log("no router-decisions.csv yet"); process.exit(0); }

// ---- decisions: timestamp,len,gate,decision,mode,action ----
const decisions = readFileSync(DEC, "utf8").split("\n").filter(l => l && !l.startsWith("#"))
  .map(l => { const [ts, len, gate, model, mode, action] = l.split(","); return { ts, len: Number(len), gate, model, mode, action }; });

const live = decisions.filter(d => d.mode === "live");
const bucket = len => len < 500 ? "a:<500" : len <= 3000 ? "b:500-3000" : len <= 5000 ? "c:3000-5000" : "d:>5000";
const byBucket = {};
for (const d of live) {
  const b = bucket(d.len);
  byBucket[b] ??= { flash: 0, pro: 0 };
  byBucket[b][d.model === "deepseek-v4-pro" ? "pro" : "flash"]++;
}

console.log("=== Layer 1: length buckets (live decisions) ===");
console.log("expect: <500 all flash; 500-3000 few pro; >5000 mostly pro");
for (const [b, v] of Object.entries(byBucket).sort()) {
  const total = v.flash + v.pro;
  console.log(`  ${b.padEnd(12)} n=${String(total).padStart(4)} flash=${v.flash} pro=${v.pro} (${(v.pro / total * 100).toFixed(1)}%)`);
}

console.log("=== Layer 2: keyword-gated pro samples (spot-check ~20) ===");
const kw = live.filter(d => d.gate.startsWith("keyword:"));
for (const d of kw.slice(-20)) console.log(`  [${d.gate}] len=${d.len} ${d.ts}`);

console.log("=== Layer 3: complexity proxy (msgCount buckets, from router.csv loop rows) ===");
if (existsSync(RT)) {
  const rows = readFileSync(RT, "utf8").split("\n").filter(l => l && !l.startsWith("#"))
    .map(l => { const p = l.split(","); return { kind: p[1], model: p[3], msgs: Number(p[6]), out: p.length >= 8 ? Number(p[7]) || 0 : undefined, eff: p[4] }; })
    .filter(r => r.kind === "loop");
  const mb = r => r.msgs <= 3 ? "a:1-3" : r.msgs <= 7 ? "b:4-7" : "c:8+";
  const byM = {};
  for (const r of rows) {
    const k = mb(r);
    byM[k] ??= { n: 0, pro: 0 };
    byM[k].n++;
    if (r.model === "deepseek-v4-pro") byM[k].pro++;
  }
  console.log("expect: pro share rises with msg count");
  for (const [k, v] of Object.entries(byM).sort()) {
    console.log(`  ${k.padEnd(8)} n=${String(v.n).padStart(4)} pro=${v.pro} (${(v.pro / v.n * 100).toFixed(1)}%)`);
  }
} else {
  console.log("  router.csv missing");
}
console.log(`\ntotal live decisions: ${live.length} (dryrun rows: ${decisions.length - live.length})`);

console.log("=== Layer 4: marginal-gain analysis ===");
// 4a. threshold-edge band: inputs near KEYWORD_FLOOR(200) that were NOT keyword-gated.
//     A thick flash band hugging the floor suggests the floor can drop (150?) -> replay to test.
const EDGE_LO = 150, EDGE_HI = 350;
const edge = live.filter(d => d.len >= EDGE_LO && d.len <= EDGE_HI && !d.gate.startsWith("keyword:"));
console.log(`  [4a] non-keyword inputs in ${EDGE_LO}-${EDGE_HI} band (near KEYWORD_FLOOR=200): n=${edge.length}, all flash=${edge.every(d => d.model !== "deepseek-v4-pro")}`);
console.log("       -> if n is large and all flash, replay with KEYWORD_FLOOR=150 and compare misjudgment slope");

// 4b. pro requests with tiny output = likely misjudged gates; whitelist-pruning material.
if (existsSync(RT)) {
  // NOTE: re-parse ALL rows here (not the loop-only `rows` from Layer 3) -
  // a misjudged pro gate may surface on hand calls too, and Layer 3's `rows`
  // is block-scoped to that if and already filtered to kind === "loop".
  const allRows = readFileSync(RT, "utf8").split("\n").filter(l => l && !l.startsWith("#"))
    .map(l => { const p = l.split(","); return { kind: p[1], model: p[3], msgs: Number(p[6]), out: p.length >= 8 ? Number(p[7]) || 0 : undefined, eff: p[4] }; });
  const proShort = allRows.filter(r => r.model === "deepseek-v4-pro" && r.out !== undefined && r.out > 0 && r.out < 400);
  console.log(`  [4b] pro requests with output < 400 chars: n=${proShort.length}`);
  for (const r of proShort.slice(-10)) console.log(`       out=${r.out} msgs=${r.msgs} in-model=pro`);
  console.log("       -> each is whitelist-pruning candidate material");
}