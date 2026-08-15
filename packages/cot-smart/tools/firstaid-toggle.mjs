// dsh-cot-smart 急救：在 web profile patch 里把 cot-smart entry 设为 disabled(off) 或移除 disabled(on)。
// 用法: node firstaid-toggle.mjs off|on
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const y = require("C:/Users/Jupiter/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/js-yaml/index.js");

const f = "C:/Users/Jupiter/.dsh/profiles/web/cordis.patch.yml";
const action = process.argv[2] ?? "off";

let data = y.load(fs.readFileSync(f, "utf8"));
if (!Array.isArray(data)) data = [];
let row = data.find((p) => p && p.id === "cot-smart");
if (!row) {
  row = { id: "cot-smart", name: "dsh-cot-smart" };
  data.push(row);
}
if (action === "on") delete row.disabled;
else row.disabled = true;
fs.writeFileSync(f, y.dump(data), "utf8");
console.log(JSON.stringify(data));
