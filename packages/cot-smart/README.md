# dsh-cot-smart

针对 DeepSeek Harness (DSH) 的**动态 CoT** 插件：按输入复杂度，在每个对话 step 自动切换 DeepSeek 的推理强度（`reasoningEffort`），**省 thinking token、不牺牲质量**。

- 简单/短输入 → `reasoningEffort: off`（DeepSeek adapter 序列化为 `thinking: {type:"disabled"}`）
- 复杂输入（代码/表格/公式/强逻辑/明确指令）→ `reasoningEffort: high`（`aggressive` 模式用 `max`）

## 原理

Hook DSH 的 `agent/request` waterfall（见 `@deepseek-ai/dsh-agent`），在 `prepareCall()` 之前替换请求配置里的 `reasoningEffort`。读最近一条 `user/message`，用原 `dynamic-cot-smart` 的特征打分启发式决定开关：

| 特征 | 加分 |
|------|------|
| 代码块 (```` ``` ````) | +2 |
| 表格 (`|`) | +1 |
| 公式 (`$...$`) | +1 |
| 强逻辑 (≥2 个推理连接词) | +2 |
| 弱逻辑 (1 个) | +1 |
| 明确指令动作词 | +1 |

决策：**三档自动路由 off → high → max**

1. 未达触发门槛 → `off`
2. 触发，但未到「超难」双条件 → `high`
3. `score ≥ maxScoreLine 且 len ≥ maxMinLength` → `max`（极难深度思考）

| 模式 | 触发条件 | 升 max 条件 |
|------|----------|-------------|
| conservative | 分≥4 且长>160 | 永不升 max |
| balanced (默认) | 分≥3 且长>100 | 永不升 max |
| aggressive | 分≥2 且长>60 | 分≥4 且长≥120 |

- 高分豁免长度：`score ≥ highScoreFree` 时，触发长度减半。
- 硬性豁免：输入 < 10 字符永不开启。
- 插件只读取**真正的用户提问**（`source.kind === "user"`），自动跳过 DSH 注入的 `<system-reminder>`、技能目录、工作区指令等系统消息，避免这些"假 user message"干扰复杂度判断。

## 安装（web profile）

```bash
# 0. 前提：本插件以 link 方式挂外部目录，必须先保证插件自带依赖
#    （见下方「故障排查 → 外部 link: 插件必须自带依赖」），否则 dsh 启动报 ERR_MODULE_NOT_FOUND
cd C:\Users\Jupiter\projects\dsh-plugins\packages\cot-smart
pnpm install

# 1. 从插件工作区自链接安装
dsh plugin --profile web add link:C:/Users/Jupiter/projects/dsh-plugins/packages/cot-smart

# 2. 重启 web 使插件生效
# 停止当前 dsh web，再执行：
dsh web
```

> 也可手动在 `cordis.patch.yml`（插件目录）里确认 insert 条目已被合并。

## 配置

在 profile 的 `.dsh/profiles/web/` 配置或插件设置里选择模式：
```yaml
cot-smart:
  mode: balanced   # conservative | balanced | aggressive
```

## 说明与边界

- 依赖 DSH 的 DeepSeek adapter（`deepseek-official`）。`reasoningEffort` 取值 `off`/`high`/`max` 由该 adapter 支持；其余 provider（如 pi-ai）若注册为 `deepseek` 供应商，字段语义相同。
- `agent/request` 只能改调用配置，不能改模型可见消息——因此这里只改 `reasoningEffort`。
- 仅在 `user/message` 输入可读时生效；无输入（如纯工具步骤）时保持 `next()` 原配置。
- 与 `dsh-theme`/`dsh-reasoning-effort` 之类的部署锁可能存在冲突：若 provider 配置了 `thinking: disabled` 部署锁，`high`/`max` 会导致该请求报 `UNSUPPORTED_REASONING_EFFORT`。此时请保持默认 `off` 或使用 `conservative`。

## 安全操作工具（`tools/`）

DSH 采用 **fail-loud** 设计：任何「启用的插件」加载失败都会让 `dsh web` 直接崩溃退出；只有 `disabled` 的插件的失败是被许可的。因此**插件开发/调试出问题时，可能把你挡在系统外**。`tools/` 下提供了四件套工具来加一道安全网（均已实测可用）：

| 工具 | 命令 | 作用 |
|------|------|------|
| 🚑 急救禁用 | `powershell -File tools\disable.ps1` | 把 `cot-smart` entry 设为 `disabled: true` → 下次启动 DSH **跳过插件、正常启动**（不删任何东西，可逆） |
| 🔓 恢复启用 | `powershell -File tools\enable.ps1` | 移除 `disabled` 标记 → 插件恢复 |
| 🛡 改动前自检 | `node tools\preflight.mjs` | 改代码/配置后先验证：① `cordis.patch.yml` 是合法顶层数组 ② 插件可导入 ③ Config 可解析。**通过才重启** |
| 💾 备份/回滚 | `powershell -File tools\backup.ps1 [keep]` / `tools\rollback.ps1` | 改动前备份 profile + 插件；出问题一键还原。**备份会自动清理**：`backup.ps1` 每次创建新备份后只保留最新 `keep` 个（默认 10），更早的自动删除，不会无限堆积 |

### 建议工作流（避免被挡在系统外）

```
改插件/配置前         →  tools\backup.ps1           (先备份)
改完、重启前          →  node tools\preflight.mjs    (自检)
    ├─ 通过            →  放心重启 dsh web
    └─ 失败            →  修复，或 tools\disable.ps1 逃生后再重启
dsh web 起不来/不知原因 →  tools\disable.ps1 → 重启(系统正常进) → 慢慢排查
排查完               →  tools\enable.ps1 → 重启(插件恢复)
彻底搞乱              →  tools\rollback.ps1          (还原备份)
```

### 逃生舱原理

`dsh-app-boot` 的 `assertEntriesLoaded` 遍历 loader entry，**只对 `entry.disabled === false` 且 `fiber === undefined` 的条目抛错**。所以在 `cordis.patch.yml` 里把插件 entry 标成 `disabled: true`，DSH 就把它当作合法的未激活条目跳过，其余 bundle 正常加载。**这是 DSH 官方允许的免于崩溃的唯一途径**，比删依赖快且可逆。

### 观察插件路由（验证有效性）

插件会往 `logFile` 配置的路径（当前 `C:\Users\Jupiter\dsh-cot-smart.log`）**追加**每次决策（`时间 target=off/high/max score=X(标签) len=N`）。查看：

```bash
node C:\Users\Jupiter\projects\dsh-plugins\packages\cot-smart\watch.js        # 最近30条
node C:\Users\Jupiter\projects\dsh-plugins\packages\cot-smart\watch.js 100    # 最近100条
```

对照判断是否合理：简单→`off`、中等→`high`、超复杂→`max`。不合理就把相关行发给维护者调阈值。

## 故障排查

### 外部 `link:` 插件必须自带依赖（重点！）

本插件以 `link:` 方式挂到**外部目录**。DSH 的 module 解析从插件的**真实路径**（`lib/index.js` 所在处）向上查找 node_modules，**不会**借用 profile 的依赖。若插件目录没有自己所需的依赖，启动会报：

```
Error: plugin tree failed to load: ... failed to import loader entry cot-smart (dsh-cot-smart):
Cannot find package '@deepseek-ai/schemastery' imported from ...\dsh-cot-smart\lib\index.js
```

**修复**：在插件目录内安装它 import 的包（版本对齐 DSH 内部的），并放进 `dependencies`（不要只放 peerDependencies）：

```bash
cd C:\Users\Jupiter\projects\dsh-plugins\packages\cot-smart
pnpm add "@deepseek-ai/schemastery@3.18.1"   # 版本 = DSH 内部版本，见 ~/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/schemastery/package.json
pnpm install                                  # 顺带解析 peer 依赖，使插件自足
```

检查要点：

- `dsh-cot-smart/node_modules/@deepseek-ai/schemastery` 存在。
- `package.json` 里 `@deepseek-ai/schemastery` 在 `dependencies`（运行时必带），`cordis`/`dsh-agent`/`dsh-llm` 保留在 `peerDependencies`（由 DSH 提供，类型与 `ctx`/事件运行时用）。
- 以 `link:` 挂载且需要跑起来的 DSH 插件，一律按**自带依赖**处理。

**验证加载**（启动 `dsh web` 时插件树不报错即可）：
```bash
dsh web --port 3091    # 换端口避免与现有实例冲突；能看到启动横幅即说明插件树通过
```

### 其它

- **`dsh plugin add` 后未入 bundles**：`dsh plugin` 的 `reconcile` 只在 pnpm `add` 退出码为 0 时执行。若 profile 里已有 ignore-builds（如 `node-pty`/`protobufjs`）导致 pnpm exit 1，需手动把包名追加进 `dsh.profile.bundles`。也请确认插件 `package.json` 声明了 `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`。
- **修改 profile `package.json` 务必用无 BOM 的 UTF-8**：Windows PowerShell `Set-Content -Encoding utf8` 会写 BOM，导致 `readProfileManifest` 的 `JSON.parse` 报 `Unexpected token '﻿'` 使整个 `dsh` 启动失败。用 node 写或确保无 BOM。
- **`.ps1` 脚本必须 UTF-8 with BOM（或纯 ASCII）**：Windows PowerShell 5.1 读无 BOM 的 UTF-8 `.ps1` 会把中文按 ANSI 解析，导致字符串引号错乱、语法报错。`tools/` 下的 `.ps1` 已处理为 BOM 或 ASCII。
- **插件用 Schemastery 而不是 Zod**：`@deepseek-ai/schemastery` 没有 `.optional()`（字段默认可选，必填才用 `.required()`），也没有 `z.literal`（用 `z.union([...])` 直接列字符串）。把 Zod API 当 Schemastery 用会在插件 import 时崩溃。
- **`console.log` 查看插件日志**：插件通过 `ctx.logger('cot-smart')` 输出，会打到启动 `dsh web` 的终端。观察 `[cot-smart] ✅ 启用 thinking ...` / `⏭️ 保持 off ...` 即可确认是否生效。
