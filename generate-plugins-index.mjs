// dsh-plugins: generate the market index (plugins.json) from each package's manifest.
// Usage: node generate-plugins-index.mjs
// Reads every packages/*/package.json, aggregates name/description/version/keywords
// + optional dsh.market { author, category, modes } into a single plugins.json.
// This is the source of truth for the market listing — never hand-edit plugins.json.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const packagesDir = path.join(root, "packages");

const plugins = [];
for (const dir of fs.readdirSync(packagesDir)) {
  const pjPath = path.join(packagesDir, dir, "package.json");
  if (!fs.existsSync(pjPath)) continue;
  const pj = JSON.parse(fs.readFileSync(pjPath, "utf8"));
  const market = pj.dsh?.market ?? {};
  const repoUrl = (pj.repository?.url ?? `https://github.com/Jupiter1949/dsh-plugins`)
    .replace(/^git\+/, "")
    .replace(/\.git$/, "");
  const repoDir = pj.repository?.directory ?? `packages/${dir}`;
  plugins.push({
    name: pj.name,
    description: pj.description ?? "",
    version: pj.version ?? "0.0.0",
    author: market.author ?? pj.author ?? "",
    repository: repoDir ? `${repoUrl.replace(/\.git$/, "")}/tree/main/${repoDir}` : repoUrl,
    install: `dsh plugin --profile web add ${pj.name}`,
    keywords: pj.keywords ?? [],
    category: market.category ?? "general",
    modes: market.modes ?? ["web"],
  });
}

plugins.sort((a, b) => a.name.localeCompare(b.name));

const index = {
  schema: "dsh-plugins-index/1",
  description: "DSH 插件市场索引：由 generate-plugins-index.mjs 从各 packages/*/package.json 自动生成，勿手动编辑。",
  plugins,
};

fs.writeFileSync(path.join(root, "plugins.json"), JSON.stringify(index, null, 2) + "\n");
console.log(`✅ generated plugins.json with ${plugins.length} plugin(s):`);
for (const p of plugins) console.log(`  - ${p.name} v${p.version} [${p.category}]`);
