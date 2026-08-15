// dsh-cot-smart 安全工具：改动前自检（不启动 dsh web）
// 用法: node preflight.mjs
// 检查: 1) cordis.patch.yml 是合法顶层数组  2) 插件 JS 可导入  3) Config 可解析
// 任一失败 -> 退出码 1（带病改动不要重启 dsh）
import fs from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const require = createRequire(import.meta.url);
const y = require("C:/Users/Jupiter/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/js-yaml/index.js");

let ok = true;

// 1. patch 必须是顶层数组
const patchPath = "C:/Users/Jupiter/.dsh/profiles/web/cordis.patch.yml";
try {
  const data = y.load(fs.readFileSync(patchPath, "utf8"));
  if (!Array.isArray(data)) {
    console.error(`❌ patch 不是顶层数组 (解析为 ${typeof data})。补回 [] 或 - insert: 列表。`);
    ok = false;
  } else {
    console.log(`✅ patch 顶层数组 OK (${data.length} 项)`);
    for (const row of data) {
      if (!row || typeof row !== "object") { console.error("❌ patch 含非法项", row); ok = false; }
    }
  }
} catch (e) {
  console.error("❌ patch 解析失败:", e.message);
  ok = false;
}

// 2. 插件 JS 可导入
try {
  const mod = await import(pathToFileURL("C:/Users/Jupiter/projects/dsh-cot-smart/lib/index.js").href);
  console.log(`✅ 插件导入 OK: ${Object.keys(mod).join(",")}`);
  // 3. Config 可解析（用默认）
  const cfg = mod.Config({});
  console.log(`✅ Config 解析 OK: ${JSON.stringify(cfg)}`);
} catch (e) {
  console.error("❌ 插件导入失败:", e.message);
  ok = false;
}

if (ok) {
  console.log("\n✅ 自检全部通过 — 可以重启 dsh web");
  process.exit(0);
} else {
  console.log("\n❌ 存在错误 — 先修复，或先用 firstaid.ps1 off 禁用插件再重启");
  process.exit(1);
}
