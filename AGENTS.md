# AGENTS.md - dsh-plugins monorepo

Self-developed plugin suite for DeepSeek Harness (`dsh`), built 2026-08-16/17.
Mission: **model economics as first-class plumbing** - flash by default, pro only through replay-calibrated gates, every tool result distilled before it enters the model-visible log.

Production plugins below are installed in BOTH profiles (`~/.dsh/profiles/web` and `headless`) via `link:`. Editing `lib/index.js` takes effect on next `dsh` start (no build step).

## Layout

```
packages/
  dsh-flash-kit/       shared one-shot flash caller - ALL plugin flash calls MUST go through callFlash()
  result-distiller/    distills large tool results (tools/post-execute) before they enter the session log
  model-router/        whitelist-gate router (agent/request), defaults flash, calibrates to pro
  router-probe/        observation-only llm/stream probe, writes router.csv
  cot-smart/           (pre-existing) dynamic reasoning-effort router by another author pattern
scripts/
  router-replay.mjs    offline replay simulator over session logs (fzstd, zero token)
  router-audit.mjs     four-layer audit incl. marginal-gain analysis
```

Telemetry (append-only CSVs under `~/.dsh/logs/`):
- `distiller.csv`         timestamp,tool,rawChars,outChars,ratio,ms,status
- `router.csv`            timestamp,kind,provider,model,reasoningEffort,inputChars,msgCount,outputChars,finish
- `router-decisions.csv`  timestamp,len,gate,decision,mode(dryrun|live),action

## Hard rules (each learned from a production incident - do not re-learn them)

1. **callFlash, never raw ctx.llm.stream** for plugin one-shots: hand-built calls WITHOUT explicit `reasoningEffort:"off"` get the adapter default - flash burns the whole maxTokens on reasoning-deltas, finishes `max-tokens`, returns zero text.
2. **UTF-8 without BOM, always**: PowerShell `[Text.Encoding]::UTF8` writes a BOM; dsh `JSON.parse` on plugin manifests dies on it. Use `UTF8Encoding($false)`.
3. **tools/post-execute contract**: default accept carries NO `content`; to replace the projection return `{kind:'accept', content}`. "Someone already replaced" is detected by CONTENT comparison, not presence.
4. **llm/stream listeners MUST be synchronous** (cordis waterfall is `return next()` with no await). To observe output or intercept, return a lazy async generator wrapping `next()` (see router-probe v0.2). Events returning Promise (agent/request, tools/*) may be async.
5. **Session logs are multi-frame zstd**: Node `zstdDecompressSync` reads only frame 1. Use `fzstd` (installed) for offline tooling.
6. **pnpm monorepo**: after adding a package run `pnpm install --no-frozen-lockfile` once.
7. **agent/request pattern**: input text comes from `payload.agent.session.events` filtered to `source.kind === "user"` (dsh injects synthetic user/message AFTER the real prompt); change model by returning `{...config, model}` from `await next()`; pass `true` (prepend) as the 4th arg to speak first.

## Frozen parameters (replay-calibrated 2026-08-17, see Research archive)

- model-router: KEYWORD_FLOOR=200; 9 FORCE_PRO keywords; deep-logic(>=2 words)+len>5000; verbs(>=2)+len>8000; default flash; same session reuses one decision; strips // and /* */ comments before matching.
- result-distiller: MIN_CONTENT_CHARS=2000, RAW_HEAD_CHARS=400, FLASH_INPUT_CAP=12000, flash maxTokens=600.

## Verification commands

```powershell
dsh --profile headless "用一句话说明什么是幂等性"                    # flash path
# deep task containing 权衡/审查 + >200 chars                      # pro gate path
node scripts/router-audit.mjs                                      # four-layer audit
node scripts/router-replay.mjs --days 30 --ratio 10                # recalibrate
```

## Status & next

Done: result-distiller, model-router, router-probe v0.2 (2/8 of the V1.0 plan).
Next (after 72h telemetry): intent-structurer (agent/pre-step, outputs goal/constraints/successCriteria/ambiguities; suggestedModel is a FEATURE only - model decisions belong solely to model-router), then constraint-critic (agent/turn-stopping; flowchart in Research archive).
Human archive: `C:\Users\Jupiter\Documents\Research\deepseek-harness\` (design review, replay report, implementation checklist with all incident post-mortems).