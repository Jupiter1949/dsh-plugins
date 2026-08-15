// dsh-cot-smart 决策逻辑单元测试（node:test，零依赖）。
// 运行: node --test test/
import { test } from "node:test";
import assert from "node:assert/strict";

// 用 mock Context 驱动插件 apply 注册的 agent/request listener，
// 返回给定输入下插件提议的 reasoningEffort。
const pluginUrl = new URL("../lib/index.js", import.meta.url).href;
async function route(inputText, mode = "balanced") {
  const plugin = await import(pluginUrl);
  let handler;
  const ctx = {
    logger: () => ({ info() {}, debug() {}, warn() {} }),
    on(name, fn) {
      if (name === "agent/request") handler = fn;
    },
  };
  plugin.apply(ctx, { mode });
  assert.ok(handler, `agent/request listener should be registered (mode=${mode})`);

  const payload = {
    agent: {
      session: {
        events: [
          {
            type: "user/message",
            seq: 1,
            data: { content: [{ type: "text", text: inputText }], source: { kind: "user" } },
          },
        ],
      },
    },
    turn: 1,
    step: 0,
    signal: new AbortController().signal,
  };
  const next = async () => ({ provider: "deepseek-official", model: "deepseek-v4-flash" });
  const out = await handler(payload, next);
  return out.reasoningEffort;
}

const LONG_COMPLEX =
  "从第一性原理推导这个分布式系统在强一致与分区容错间的权衡,因网络分区脑裂需引入Raft。审查:```go\nfunc (n *Node) Propose(v){n.mu.Lock();n.pending=append(n.pending,v);n.mu.Unlock()}\n```证明split-brain,设计leader选举/日志复制,论证Raft优于Paxos,给benchmark,推导CAP含义,分析跨区架构取舍与边界,完整展开设计。";

const MEDIUM_CODE =
  "分析这个函数为何竞态,因为并发写map,证明并修复:```go\nm:=map[string]int{};go func(){m[\"k\"]=1}();\n```请用Mutex解决并权衡性能与正确性。";

test("短输入 -> off（硬性豁免）", async () => {
  assert.equal(await route("你好"), "off");
});

test("中等代码(默认 balanced) -> high", async () => {
  assert.equal(await route(MEDIUM_CODE, "balanced"), "high");
});

test("超复杂长架构(默认 balanced) -> high（balanced 不冲 max）", async () => {
  assert.equal(await route(LONG_COMPLEX, "balanced"), "high");
});

test("aggressive 模式下超复杂 -> max", async () => {
  assert.equal(await route(LONG_COMPLEX, "aggressive"), "max");
});

test("aggressive 模式下中等代码 -> high", async () => {
  assert.equal(await route(MEDIUM_CODE, "aggressive"), "high");
});

test("aggressive 模式下简单 -> off", async () => {
  assert.equal(await route("你好，今天天气如何", "aggressive"), "off");
});

test("只认真实用户消息：系统注入的 user/message 不干扰判断", async () => {
  // 构造一个 events 列表：真实用户复杂提问在前，系统注入(skill-catalog/plugin)在后。
  // 插件应只取 source.kind === "user" 的那条，忽略后面的注入。
  const plugin = await import(pluginUrl);
  let handler;
  const ctx = {
    logger: () => ({ info() {}, debug() {}, warn() {} }),
    on(name, fn) { if (name === "agent/request") handler = fn; },
  };
  plugin.apply(ctx, { mode: "balanced" });
  const events = [
    { type: "user/message", seq: 1, data: { content: [{ type: "text", text: LONG_COMPLEX }], source: { kind: "user" } } },
    { type: "user/message", seq: 2, data: { content: [{ type: "text", text: "<system-reminder> skill catalog ..." }], source: { kind: "skill-catalog" } } },
    { type: "user/message", seq: 3, data: { content: [{ type: "text", text: "workspace instructions ..." }], source: { kind: "agent-instructions" } } },
  ];
  const out = await handler(
    { agent: { session: { events } }, turn: 1, step: 0, signal: new AbortController().signal },
    async () => ({ provider: "deepseek-official", model: "deepseek-v4-flash" })
  );
  assert.equal(out.reasoningEffort, "high"); // 复杂用户提问应判 high，而不是被注入内容带偏成 off
});
