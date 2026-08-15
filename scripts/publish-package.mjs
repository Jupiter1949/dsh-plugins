// dsh-plugins: publish one package by name.
// Usage: node scripts/publish-package.mjs <package-name>
// Resolves the package to packages/<dirname-matching-package-name>/ and runs
// `npm publish` there (NODE_AUTH_TOKEN must be set by CI).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkgName = process.argv[2];
if (!pkgName) {
  console.error("usage: node scripts/publish-package.mjs <package-name>");
  process.exit(1);
}

// Find the package dir whose package.json name matches pkgName.
let pkgDir = null;
for (const dir of fs.readdirSync(path.join(root, "packages"))) {
  const pjPath = path.join(root, "packages", dir, "package.json");
  if (!fs.existsSync(pjPath)) continue;
  const pj = JSON.parse(fs.readFileSync(pjPath, "utf8"));
  if (pj.name === pkgName) {
    pkgDir = path.join(root, "packages", dir);
    break;
  }
}
if (!pkgDir) {
  console.error(`package "${pkgName}" not found under packages/`);
  process.exit(1);
}

console.log(`publishing ${pkgName} from ${pkgDir}`);
const r = spawnSync("npm", ["publish", "--access", "public"], {
  cwd: pkgDir,
  stdio: "inherit",
  shell: process.platform === "win32",
});
if (r.status !== 0) {
  console.error(`npm publish failed with exit ${r.status}`);
  process.exit(r.status ?? 1);
}
console.log(`✅ published ${pkgName}`);
