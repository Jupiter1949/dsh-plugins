// dsh-plugins scaffold: generate a new DSH plugin package skeleton.
// Usage: node new-plugin.mjs <plugin-name>
//   from C:\Users\Jupiter\projects\dsh-plugins
// Creates packages/<name>/ with package.json, cordis.patch.yml, lib/ skeleton,
// README.md, and a copy of the safety toolkit (rewired to this package).
// The toolkit template lives in packages/cot-smart/tools.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname);           // dsh-plugins/
const toolsSrc = path.join(root, "packages", "cot-smart", "tools");
const name = (process.argv[2] ?? "").trim();

if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
  console.error(`Invalid plugin name "${name}". Use lowercase kebab-case, e.g. xxx-smart`);
  process.exit(1);
}
const pkgDir = path.join(root, "packages", name);
if (fs.existsSync(pkgDir)) {
  console.error(`Package already exists: ${pkgDir}`);
  process.exit(1);
}
fs.mkdirSync(path.join(pkgDir, "lib", "types"), { recursive: true });

const win = (p) => p.replace(/\\/g, "/");

// ---- package.json ----
const packageJson = {
  name,
  description: `DSH plugin: ${name}. Describe what this plugin does.`,
  version: "0.1.0",
  type: "module",
  main: "lib/index.js",
  types: "lib/types/index.d.ts",
  exports: { ".": { types: "./lib/types/index.d.ts", default: "./lib/index.js" }, "./package.json": "./package.json" },
  files: ["lib", "cordis.patch.yml", "README.md"],
  license: "MIT",
  dependencies: { "@deepseek-ai/schemastery": "3.18.1" },
  peerDependencies: { "@deepseek-ai/cordis": ">=4.0.0", "@deepseek-ai/dsh-agent": "*", "@deepseek-ai/dsh-llm": "*" },
  peerDependenciesMeta: { "@deepseek-ai/cordis": { optional: true }, "@deepseek-ai/dsh-agent": { optional: true }, "@deepseek-ai/dsh-llm": { optional: true } },
  keywords: ["deepseek", "harness", "dsh", "plugin", name],
  dsh: { bundle: { patch: "./cordis.patch.yml" } },
};
fs.writeFileSync(path.join(pkgDir, "package.json"), JSON.stringify(packageJson, null, 2) + "\n");
console.log("  package.json");

// ---- cordis.patch.yml ----
fs.writeFileSync(path.join(pkgDir, "cordis.patch.yml"),
`# ${name}: describe your plugin briefly.
# Inserted into the profile when installed via
#   dsh plugin --profile web add link:${win(pkgDir)}
- insert:
    - id: ${name}
      name: ${name}
`);
console.log("  cordis.patch.yml");

// ---- lib/index.js ----
fs.writeFileSync(path.join(pkgDir, "lib", "index.js"),
`// ${name} — DSH plugin.
//
// Hooks DSH extensions (see @deepseek-ai/dsh-agent). Replace this body with
// your logic. Reference the structured plugin package in packages/cot-smart.

import z from "@deepseek-ai/schemastery";

export const name = "${name}";
export const inject = [];

export const Config = z.object({
  enabled: z.boolean().default(true).description("Toggle this plugin on/off"),
});

export function apply(ctx, config) {
  const logger = ctx.logger("${name}");
  logger.info(\`🧩 ${name} loaded (enabled=\${config.enabled})\`);
}
`);
console.log("  lib/index.js");

// ---- lib/types/index.d.ts ----
fs.writeFileSync(path.join(pkgDir, "lib", "types", "index.d.ts"),
`import z from "@deepseek-ai/schemastery";
import type { Context } from "@deepseek-ai/cordis";

export declare const name: "${name}";
export declare const inject: string[];
export declare const Config: z.ZodType<{ enabled: boolean }>;
export declare function apply(ctx: Context, config: { enabled: boolean }): void;
`);
console.log("  lib/types/index.d.ts");

// ---- README.md ----
fs.writeFileSync(path.join(pkgDir, "README.md"),
`# ${name}

DSH plugin. TODO: describe what it does and how to configure it.

## Install

\`\`\`bash
cd ${win(root)}
dsh plugin --profile web add link:${win(pkgDir)}
\`\`\`

## Config

\`\`\`yaml
${name}:
  enabled: true
\`\`\`

## Safety tools

\`\`\`bash
powershell -File tools\\disable.ps1    # escape hatch: skip this plugin on next start
node tools\\preflight.mjs              # self-check before restart
\`\`\`
`);
console.log("  README.md");

// ---- copy safety toolkit (rewired to this package), excluding this scaffold ----
if (fs.existsSync(toolsSrc)) {
  fs.cpSync(toolsSrc, path.join(pkgDir, "tools"), {
    recursive: true,
    filter: (s) => path.basename(s) !== "new-plugin.mjs",
  });
  for (const f of fs.readdirSync(path.join(pkgDir, "tools"))) {
    const p = path.join(pkgDir, "tools", f);
    if (fs.statSync(p).isDirectory()) continue;
    let t = fs.readFileSync(p, "utf8");
    const before = t;
    t = t.split("packages/cot-smart").join(`packages/${name}`);
    t = t.split("packages\\cot-smart").join(`packages\\${name}`);
    if (t !== before) fs.writeFileSync(p, t, "utf8");
  }
  console.log("  tools/ (safety toolkit copied and rewired to " + name + ")");
}

console.log(`\n✅ Created package: ${win(pkgDir)}`);
console.log("Next:");
console.log("  1. pnpm install   (links the new package + installs schemastery)");
console.log("  2. edit lib/index.js with your logic");
console.log("  3. dsh plugin --profile web add link:" + win(pkgDir));
