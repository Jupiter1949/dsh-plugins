# dsh-plugins

DeepSeek Harness (DSH) 插件 monorepo。用 pnpm workspace 聚合多个独立插件包，统一版本管理与 git 仓库管理。

## 结构

```
dsh-plugins/
├── new-plugin.mjs        ← 一键生成新插件包的脚手架
├── pnpm-workspace.yaml
├── package.json
└── packages/
    ├── cot-smart/        ← 现有插件（动态 CoT：按输入复杂度自动路由 off/high/max）
    └── <你的新插件>/     ← 以后用脚手架生成
```

每个 `packages/<name>/` 是一个独立的 DSH 插件包，自带：

- `package.json`（DSH 插件标准结构，含 `dsh.bundle.patch`）
- `cordis.patch.yml`（profile 组合入口）
- `lib/index.js`（插件逻辑）
- `tools/`（安全工具：disable/preflight/backup/rollback）
- `README.md`

## 新建插件的用法（脚手架）

```bash
# 1. 在 monorepo 根生成新插件包
cd C:\Users\Jupiter\projects\dsh-plugins
node new-plugin.mjs <your-plugin-name>

# 2. 安装依赖（链接 workspace + 装默认的 schemastery）
pnpm install

# 3. 编辑插件逻辑
#    打开 packages/<your-plugin-name>/lib/index.js，参照 packages/cot-smart 的写法实现你的功能

# 4. 装进 DSH profile
dsh plugin --profile web add link:C:\Users\Jupiter\projects\dsh-plugins\packages\<your-plugin-name>

# 5. 重启 dsh web 生效，然后提交
git add -A && git commit -m "add <your-plugin-name>"
```

> 插件名用**小写 kebab-case**（如 `my-smart`）。脚手架会自动生成全套骨架并复制安全工具（路径已重连到新包）。

## 安全工具（每个包自带 `tools/`）

| 工具 | 命令 | 作用 |
|------|------|------|
| 🚑 急救禁用 | `powershell -File tools\disable.ps1` | 该插件出错时，标记 disabled → dsh 跳过它正常启动 |
| 🔓 恢复启用 | `powershell -File tools\enable.ps1` | 移除 disabled，插件恢复 |
| 🛡 改动前自检 | `node tools\preflight.mjs` | 改代码/配置后先验证（patch 数组 + 插件可导入 + Config 可解析），通过才重启 |
| 💾 备份/回滚 | `powershell -File tools\backup.ps1` / `tools\rollback.ps1` | 备份 profile + 插件，出问题一键还原（备份自动清理，默认保留 10 个） |

### 安全工作流

```
改动前   →  tools\backup.ps1
重启前   →  node tools\preflight.mjs   (通过才重启)
启动失败 →  tools\disable.ps1 → 重启(逃生) → 排查 → tools\enable.ps1 → 重启
彻底搞乱 →  tools\rollback.ps1
```

> **DSH 是 fail-loud 设计**：任何「已启用」的插件加载失败都会让 `dsh web` 崩溃退出；只有 `disabled` 的插件失败是合法的。所以改插件务必"先自检、失败先 disable"。

## 插件规范（对标官方 publish 规范）

每个插件包遵循 DSH 官方插件发布规范：

- `package.json` 必须声明 `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`（否则 `loadProfile` fail-loud）。
- 发布元数据：`repository`（git 地址 + directory）、`engines.node >= 20`、`publishConfig.access: "public"`。
- `exports` 含 `.`、`./invariant`、`./package.json` 三个入口。
- 每个包带 `lib/invariant.js`（invariant companion）：导出 `name`/`inject: ["invariants"]`/`apply`，调用 `ctx.invariants.register(包名, installer)`。纯逻辑包用空 installer 并注释说明原因（见 `@deepseek-ai/dsh-invariants`）。
- 插件配置用 `@deepseek-ai/schemastery`（不是 Zod：字段默认可选，无 `.optional()`）。

## 市场索引（plugins.json）

`plugins.json` 是插件市场清单（字段对齐 awesome-dsh-plugin / dsh-plugin-hub），**由脚本自动生成，勿手改**：

```bash
node generate-plugins-index.mjs   # 聚合各 packages/*/package.json -> plugins.json
```

- 每个包的 `dsh.market` 可声明 `author`/`category`/`modes`，用于市场展示。
- CI 会校验 `plugins.json` 是否最新（防止手改漂移）。

## 测试与质量门禁

```bash
pnpm -r check   # 每个包跑 preflight 自检 + node:test 单元测试
```

- 单测用 Node 内置 `node:test`（零依赖），放在 `packages/<name>/test/`。
- 脚手架生成的包 `check` 脚本默认可用；写好逻辑后补测试用例即可。

## CI 与发布

- **check**（`.github/workflows/check.yml`）：push/PR 时跑 `pnpm -r check` + 校验 plugins.json 一致。
- **publish**（`.github/workflows/publish.yml`）：打 `<包名>@<版本>` tag 时发布对应包到 npm（需配 `NPM_TOKEN` secret）。

发布一个包：

```bash
git tag dsh-cot-smart@1.1.0 && git push origin dsh-cot-smart@1.1.0
# CI 自动跑 check 后 npm publish
```

## 命令

```bash
pnpm install   # 安装所有 workspace 包依赖
pnpm -r build  # 若有构建脚本则批量构建（当前插件无构建步骤）
```

## 后端/版本说明

- 插件运行时不借用 profile 的 node_modules——**每个包必须自带依赖**（脚手架已在 package.json 默认带上它 import 的包）。
- 改插件 `lib/index.js` 需要**重启 `dsh web`** 生效（HMR 不热重载 link 外部源码；只有 profile 的 `cordis.patch.yml` 配置会热重载）。
- 插件配置用 `@deepseek-ai/schemastery`，**不是 Zod**（无 `.optional()`，字段默认可选）。
