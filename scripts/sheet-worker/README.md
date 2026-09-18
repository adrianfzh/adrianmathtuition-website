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
| `SHEET-SPEC.md` | **The sheet as a JSON spec** — the block types, the inline parts, what the renderer enforces. Behind `SHEET_RENDER=spec` — **ON since 17 Sep 2026** (set in `run.sh`); unset it there to go back to hand-built DOCX. |
| `sheet-spec.schema.json` | The spec's JSON schema — the whole block vocabulary, with the house rule on each. |
| `render_sheet.py` | Spec → DOCX + PDF, through `worksheet_lib`, `repair-sheet.py` and Word. Deterministic; `--check-determinism` proves it. |
| `ms_graph_pdf.py` | **Word in the cloud** (18 Sep 2026): DOCX → PDF through Microsoft Graph's converter — Word's own engine — for a machine with no Word (the Fly worker). `render_sheet.export_pdf` uses it whenever `MS_GRAPH_CLIENT_ID` + `MS_GRAPH_REFRESH_TOKEN` are set, and only then falls back to LibreOffice, which is NOT faithful (7.4 and 26.8 both run the aligned equation lines together with "¿" marks and re-paginate). One-time setup below. |

## Word in the cloud — one-time setup (Adrian, ~10 min)

1. **Register an app** at <https://portal.azure.com> → *Microsoft Entra ID* → *App registrations* → *New registration*:
   name `AdrianMath sheet export`; **Supported account types: "Accounts in any organizational directory and personal Microsoft accounts"**; no redirect URI. Copy the **Application (client) ID**.
2. In that app → *Authentication* → **Allow public client flows: Yes** → Save.
3. *API permissions* → *Add a permission* → *Microsoft Graph* → *Delegated* → tick **`Files.ReadWrite.AppFolder`** and **`offline_access`** → Add. (No admin consent needed for a personal account; the sign-in below consents.)
4. On the Mac:
   ```
   python3 scripts/sheet-worker/ms_graph_pdf.py login --client-id <the id from step 1>
   ```
   Open the printed link, enter the code, sign in with the Microsoft account that owns Word. The token lands in `~/.adrianmath_sheets/ms-graph-token.json` (mode 600).
5. Prove it on a real sheet: `python3 scripts/sheet-worker/ms_graph_pdf.py test "<any 3 Practice Again.docx>" /tmp/graph.pdf` and compare with the Word PDF beside it (same page count, same breaks).
6. Ship it to the worker: `bash worker/fly/set-secrets.sh` in the bot repo stages `MS_GRAPH_*` from that file → `fly secrets deploy -a adrianmath-worker`, then `SHEET_SLOTS_ON='1'` in `fly.worker.toml`.

The app sees only its own folder in OneDrive (`Files.ReadWrite.AppFolder`); each export uploads one DOCX there, fetches it as PDF and deletes it. Refresh tokens last 90 days; the newest one Microsoft returns is kept in the state file (on the worker, under `/data`), so it never expires while sheets are being made.
