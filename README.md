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

## 命令

```bash
pnpm install   # 安装所有 workspace 包依赖
pnpm -r build  # 若有构建脚本则批量构建（当前插件无构建步骤）
```

## 后端/版本说明

- 插件运行时不借用 profile 的 node_modules——**每个包必须自带依赖**（脚手架已在 package.json 默认带上它 import 的包）。
- 改插件 `lib/index.js` 需要**重启 `dsh web`** 生效（HMR 不热重载 link 外部源码；只有 profile 的 `cordis.patch.yml` 配置会热重载）。
- 插件配置用 `@deepseek-ai/schemastery`，**不是 Zod**（无 `.optional()`，字段默认可选）。
