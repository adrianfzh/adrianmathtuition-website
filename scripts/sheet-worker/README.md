# scripts/sheet-worker — the Practice Again sheet worker

The launchd worker that turns a marked paper into the self-study sheet Adrian
vets and releases. One job per session, on plan usage.

| file | |
|---|---|
| `WORKER_PROMPT.md` | What the headless session is told to do — claim, diagnose, author, verify, file, complete. The authority on the job; the teaching rules live in `.claude/skills/self-study-sheet/SKILL.md`. |
| `run.sh` | The launchd wrapper: peek the queue, pull the repo, refresh its own installed copy, run one `claude -p` session, log. |
| `install.sh` / `install-slot.sh` | Install the worker (slot 1) / an extra slot with its own state dir. |
| `com.adrianmath.sheetworker.plist` | The launchd job. |
| `repair-sheet.py` | Enforces the typesetting rules on a finished sheet — stacked fractions, boxes hugging their content, the gap between parts, no source lines. A required build step, not a safety net. |
| `SHEET-SPEC.md` | **The sheet as a JSON spec** — the block types, the inline parts, what the renderer enforces. Behind `SHEET_RENDER=spec`; not switched on. |
| `sheet-spec.schema.json` | The spec's JSON schema — the whole block vocabulary, with the house rule on each. |
| `render_sheet.py` | Spec → DOCX + PDF, through `worksheet_lib`, `repair-sheet.py` and Word. Deterministic; `--check-determinism` proves it. |
