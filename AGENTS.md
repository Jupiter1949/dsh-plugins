# AGENTS.md — dsh-plugins

DSH（DeepSeek Harness）插件 monorepo。用 pnpm workspace 聚合多个独立插件包，统一版本与 git 管理。子 agent 启动时自动加载本文档。

## 项目结构

```
dsh-plugins/
├── new-plugin.mjs            ← 一键生成新插件包的脚手架
├── generate-plugins-index.mjs ← 由 package.json 聚合生成市场索引 plugins.json
├── plugins.json              ← 市场索引（自动生成，勿手改）
├── pnpm-workspace.yaml · package.json
├── .github/workflows/        ← check(CI 门禁) + publish(npm 发布)
└── packages/
    └── cot-smart/            ← 现有插件（含 lib/ tools/ test/ README.md）
```

## 关键命令

```bash
pnpm install                    # 安装 workspace 依赖
pnpm -r test                    # 每个包跑 node:test 单元测试（跨平台，CI 用这个）
pnpm -r check                   # 本机完整门禁（preflight 自检 + 单测）
node new-plugin.mjs <name>      # 新建插件包
node generate-plugins-index.mjs # 更新 plugins.json（改动 package.json 后必须跑）
dsh plugin --profile web add link:...  # 把插件装进 DSH profile
```

## 与外部系统的路径关系（本项目的真实上下文）

- **DSH profile**：`C:\Users\Jupiter\.dsh\profiles\web\package.json` 里通过 `link:` 指向本项目 `packages/<name>`。改包结构后 profile 的 link 需同步。
- **DSH home 是运维区**：`~/.dsh` 不是产出目录。改 profile link、settings 属于运维操作，应批量一次说明，避免逐条触发授权。
- **Git**：本项目是独立 git 仓库，`origin` = `https://github.com/Jupiter1949/dsh-plugins.git`。
- **本项目自身在工作区之外**：`C:\Users\Jupiter\projects\dsh-plugins` 位于 `projects\` 下，若某个 DSH 会话的 workspace 是 `research\`，则本项目的写操作对那个会话属于越界、需 `danger-full-access` 升级——这是预期内的（见第 5 节）。

## 风险分级白名单（把「判断」外包给规则，而非逐条问用户）

> 用户不希望被逐条授权打断，也无法逐条判断。按「后果可逆性 + 影响范围」将操作分三级，每级固定动作。**agent 必须先分级，再决定是否停下来问。**

| 级别 | 判据 | 动作 |
|------|------|------|
| 🟢 绿（自动放行） | 写本项目 `packages/<name>/lib/`、`README.md`、`test/` 内文件；新增文件；可完全撤销的局部编辑；`git add/commit`（不含 push） | **直接执行**，最终答复一句话带过，不问 |
| 🟡 黄（带摘要放行） | 改 `package.json`、`cordis.patch.yml`、根配置；`pnpm install`/`pnpm -r test` 等构建测试；更新 `plugins.json` 并 commit；写 `~/.dsh/profiles/web`（link 运维） | **执行前一句风险摘要**（做什么+落到哪+是否可逆），默认放行，除非用户说停 |
| 🔴 红（必须停下确认） | `git push` / `npm publish`（发布到远端）；删大量文件/破坏性覆盖；写本项目之外的**新**未知目录；`rm -rf`、覆盖关键配置、清 `node_modules` 后不可恢复的重装、改 DSH `settings.yaml` | **停下来等用户明确「同意」才执行**；执行前必先能回滚（git 已提交/备份）才动手 |

**白名单判定规则（每次执行前默念）：**

1. 后果能轻松撤销 → 绿/黄；不可撤销或撤销成本高 → 红。
2. 影响范围只在 `packages/` 或本项目内 → 绿/黄；碰远端/`~/.dsh` 运维/全局 → 至少黄，破坏性的 → 红。
3. 🔴 红级操作执行前必须先具备**回滚能力**（git 已提交可回退 / 备份 / 明确恢复方法），否则先做备份再操作。
4. 不确定级别 → 按更严一级处理（宁黄勿绿、宁红勿黄），并给一句「为什么拿不准」。

### 红级操作对照表（一眼可判）

> 命中下表任一行 → **必是红级**，停下列等用户「同意」才执行，且执行前先具备回滚能力。没命中 → 按绿/黄继续。

| 类别 | dsh-plugins 里的具体例子 | 判断口诀 |
|------|--------------------------|----------|
| **碰远端/发布** | `git push`、`npm publish`、发 tag、从 GitHub 拉取覆盖本地 | 「离开本项目就算红」 |
| **删除/破坏** | 删 `packages/*` 下多个文件、`rm -rf` node_modules、清除已有插件包、覆盖 `package.json` 不保留原稿 | 「没了找不回就是红」 |
| **改关键配置** | 改 `~/.dsh/profiles/web`（DSH link）、`settings.yaml`、`config.toml`、pnpm-workspace 大改 | 「动 DSH 设就算红」 |
| **写本项目外新位置** | 建新的 `projects\` 项目、写别的项目目录、`AppData` 全局、`~/.npmrc` 等 | 「没去过的地方算红」 |
| **不可逆命令** | `npm unpublish`、破坏 package-lock 后无 lockfile 重装、格式化/清数据文件 | 「退不回去算红」 |
| **影响已发布包** | 改已 `npm publish` 过包的 version/行为（涉及线上） | 「动了已发版算红」 |

**反向口诀（绿色）**：只在 `packages/` 内 + 可回滚 + 不 push/publish = 通常绿灯。

## 授权纪律（硬性）

1. 创建任何新文件/项目前，先判断落盘位置——在本项目 `packages/` 内 → 绿/黄；在 `projects\` 其他位置、`~/.dsh`、`AppData` → 越界，需先说明。
2. 越界前必须一句话告知（写哪+为何+是否可逆+是否有区内替代），不得默默 `danger-full-access` 硬闯。
3. 绿/黄级操作不等用户逐条确认，但**任务结束必须诚实列出「本次动了什么、动了哪里」**，让用户可审计可回滚。

## 与 research 工作区的关系

- `research\AGENTS.md` 是研究项目的工作区规则。本项目（dsh-plugins）是**独立插件项目**，不是 research 的一部分。
- 若你的 DSH 会话 workspace 是 `research\`，而任务涉及操作本项目，则本项目对这些会话属越界——按「授权纪律」先说明，不要静默升级。
- 两个项目的规则核心（风险分级）一致，边界各自不同；以各自 AGENTS.md 为准。

## 维护注意

- **改 `package.json`（peer/dependencies）后**：先 `pnpm install --no-frozen-lockfile` 重建 lockfile，再本地 `pnpm install --frozen-lockfile` 验证，最后 `pnpm -r test`——否则 CI 的 frozen-lockfile 会失败（历史踩坑）。
- **改 `package.json` 的 name/repository/keywords/dsh.market 后**：必须跑 `node generate-plugins-index.mjs` 更新 `plugins.json` 并 commit，否则 CI 索引校验失败。
- **`tools/` 是跨平台的但依赖本机 DSH 路径**（preflight.mjs 等卡了本项目实现细节，且引用 `~/.dsh` 与全局路径）——它们只在**本机**跑，不进 CI。CI 只跑 `pnpm -r test`。
