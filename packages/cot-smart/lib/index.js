// dsh-cot-smart — Dynamic CoT for DeepSeek Harness.
//
// Hooks the `agent/request` waterfall (see @deepseek-ai/dsh-agent) and, on each
// conversation step, chooses a DeepSeek `reasoningEffort` from input complexity:
//
//   off   -> serialized by the DeepSeek adapter as `thinking: { type: "disabled" }`
//   high  -> thinking enabled via the official top-level `reasoning_effort`
//   max   -> thinking enabled at the highest tier (aggressive mode only)
//
// The heuristic comes from the original `dynamic-cot-smart` design: cheap to
// compute, stateless, and controlled by a single "conservatism" knob.

import z from "@deepseek-ai/schemastery";
import { appendFileSync } from "node:fs";

export const name = "dsh-cot-smart";

export const inject = ["llm"];

// ---------------------------------------------------------------- config ----
export const Config = z.object({
	mode: z
		.union(["conservative", "balanced", "aggressive"])
		.default("balanced")
		.description("conservative: 少用CoT省成本 | aggressive: 多用CoT保质量"),
	logFile: z
		.string()
		.description("观察日志文件路径(如 C:\\Users\\Jupiter\\dsh-cot-smart.log)。留空则只打到 dsh 终端。"),
});

const THRESHOLDS = {
	// 三档自动路由 (off -> high -> max)：
	//   触发条件: score>=minScore 且 len > triggerLen(高分时减半)
	//   升到 max 条件: score>=maxScoreLine 且 len>=maxMinLength
	// maxMinLength=Infinity 表示该模式永不升 max（保守/平衡保持 high 上限）。
	conservative: { minScore: 4, minLength: 160, highScoreFree: 5, maxScoreLine: 999, maxMinLength: Infinity, maxEffortScore: 999 },
	balanced:     { minScore: 3, minLength: 100, highScoreFree: 4, maxScoreLine: 999, maxMinLength: Infinity, maxEffortScore: 999 },
	aggressive:   { minScore: 2, minLength: 60,  highScoreFree: 3, maxScoreLine: 4,   maxMinLength: 120,       maxEffortScore: 4 },
};

// ------------------------------------------------------- feature detector ----
// Pure, stateless. Mirrors the original `extractFeatures`.
function extractFeatures(text) {
	let score = 0;
	const details = [];

	// 1. structural features (code blocks / tables / math)
	if ((text.match(/```/g) || []).length >= 2) { score += 2; details.push("代码块"); }
	if (/\|.*\|/.test(text)) { score += 1; details.push("表格"); }
	if (/\$.*\$/.test(text)) { score += 1; details.push("公式"); }

	// 2. reasoning connectors
	const logicWords = ["因为", "所以", "如果", "那么", "推理", "证明", "导致", "取决于"];
	const logicCount = logicWords.filter((w) => text.includes(w)).length;
	if (logicCount >= 2) { score += 2; details.push("强逻辑"); }
	else if (logicCount >= 1) { score += 1; details.push("弱逻辑"); }

	// 3. action verbs (instruction strength)
	const actionWords = ["分析", "审查", "重构", "优化", "总结", "规划", "拆解", "实现", "设计"];
	if (actionWords.filter((w) => text.includes(w)).length >= 1) { score += 1; details.push("指令明确"); }

	return { score, label: details.join("、") || "通用对话" };
}

// Wire up: collect the last user-role message on the model-visible surface and
// flatten its text blocks into one string.
function textOf(message) {
	if (!message?.content) return "";
	return message.content
		.filter((b) => b?.type === "text" && typeof b.text === "string")
		.map((b) => b.text)
		.join("\n")
		.trim();
}

function lastUserInput(events) {
	if (!Array.isArray(events)) return "";
	// Walk backwards to the most recent TRUE user message. DSH injects many
	// synthetic `user/message` events (system-reminder, agent-instructions,
	// plugin snapshots, skill catalog, …) that appear after the real prompt;
	// taking the last user/message would pick those up and corrupt the heuristic.
	// Only source.kind === "user" is an actual human prompt.
	for (let i = events.length - 1; i >= 0; i--) {
		const e = events[i];
		if (e?.type !== "user/message") continue;
		const data = e.data ?? e.message ?? e;
		if (data?.source?.kind !== "user") continue;
		const t = textOf(data);
		if (t) return t;
	}
	return "";
}

// ------------------------------------------------------------------- apply ---
const LOG_STAMP = () => new Date().toISOString();

export function apply(ctx, config) {
	const { minScore, minLength, highScoreFree, maxScoreLine, maxMinLength } = THRESHOLDS[config.mode];
	const logger = ctx.logger("cot-smart");
	const logFile = config.logFile ? String(config.logFile) : "";
	// Write one observation line to the file (append), if a path is configured.
	function observe(target, score, label, length) {
		if (!logFile) return;
		try {
			appendFileSync(logFile, `${LOG_STAMP()} target=${target} score=${score} (${label}) len=${length}\n`, "utf8");
		} catch (e) {
			logger.warn(`[cot-smart] 无法写入观察日志 ${logFile}: ${e.message}`);
		}
	}

	ctx.on("agent/request", async (payload, next) => {
		const input = lastUserInput(payload?.agent?.session?.events);

		// Hard exemption: ultra-short input never enables thinking.
		if (input.trim().length < 10) {
			const proposal = await next();
			if (!proposal) return proposal;
			if (proposal.reasoningEffort === "off") return proposal;
			observe("off(short)", 0, "短输入豁免", input.length);
			return { ...proposal, reasoningEffort: "off" };
		}

		const { score, label } = extractFeatures(input);
		// 三档自动路由 off -> high -> max：
		//   1. 未达触发门槛 -> off
		//   2. 触发，但未到「超难」双条件 -> high
		//   3. score>=maxScoreLine 且 len>=maxMinLength -> max（极难深度思考）
		const triggerLen = score >= highScoreFree ? Math.floor(minLength / 2) : minLength;
		const shouldEnable = score >= minScore && input.length > triggerLen;
		const isMax = shouldEnable && score >= maxScoreLine && input.length >= maxMinLength;
		const target = !shouldEnable ? "off" : (isMax ? "max" : "high");

		const proposal = await next();
		if (!proposal) return proposal;

		// 无论档位是否改变都记录，确保日志完整（含“保持原档”的情况）。
		logger.info(`[cot-smart] ${target === "off" ? "⏭️ 保持 off" : `✅ 启用 ${target}`} (分=${score}/${label}, 长=${input.length})`);
		observe(target, score, label, input.length);

		if (proposal.reasoningEffort === target) return proposal;
		return { ...proposal, reasoningEffort: target };
	}, true /* priority: run before the default so we see the pre-set config */);

	logger.info(`🧠 dsh-cot-smart 已加载 (模式: ${config.mode}, 三档路由: off / high / max)`);
}
