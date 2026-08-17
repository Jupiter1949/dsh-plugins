# dsh-router-probe

Observation-only probe on `llm/stream`, feeding the upcoming model-router with
real routing data. Never modifies any request.

## Output

One CSV row per model call, appended to `<DSH_HOME>/logs/router.csv`:

```
timestamp,kind,provider,model,reasoningEffort,inputChars,msgCount
2026-08-16T16:00:00Z,loop,deepseek-official,deepseek-v4-flash,off,3120,9
```

- `kind=loop` rows are the router's training set (agent-loop requests)
- `kind=hand` rows are plugin one-shots (distiller etc.)

Run for a few days, then bucket `inputChars` by outcome to derive data-driven
routing thresholds instead of guessing.