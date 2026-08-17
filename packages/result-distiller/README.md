# dsh-result-distiller

Distill large tool results with `deepseek-v4-flash` before they enter the
model-visible session log.

## What it does

Hooks the `tools/post-execute` waterfall. When a successful tool result carries
more than ~2000 characters of text, one flash call distills it into 3-6 factual
bullets, and the model-visible content becomes:

```
[distilled:<tool>]
- bullet 1
- bullet 2
...
--- raw head (400 chars) ---
<first 400 chars of the raw output>
```

The distilled copy is what the session log records, so every later model request
(and compaction) reads the thin version. Pro's reasoning tokens are spent on the
essence, not on raw dumps.

## Safety

- Failure results, blocked decisions, and already-replaced results pass through untouched.
- Any distillation error (flash down, bad output) silently keeps the raw result.
- Zero runtime npm dependencies: the one-shot flash message is a plain object.

## Install

```
dsh plugin --profile web add C:/Users/Jupiter/Projects/dsh-plugins/packages/result-distiller
```

Knobs are constants at the top of `lib/index.js` (v1). Promote to a Schemastery
Config once compression ratios are measured.