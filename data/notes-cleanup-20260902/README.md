# Notes-content cleanup — 2026-09-02 (Layers 1+2, residual pass)

Audit trail for the `subgroups` table (1,127 rows) that powers the /notes reader
tree and the practice picker. Data went live directly; this directory is the
before/after record. Backup table: `subgroups_desc_backup_20260902`
(id, name, description — 1,127 rows, taken before the first write).

This pass is the **residual** after the 29 Aug 2026 vetting pass (backup
`subgroups_vetting_backup_20260829`: 652 descriptions → TeX, 56 leak cleans,
516 renames, two renames vetoed by Adrian — ids 118 and 120, untouched here).

## Files
- `layer1-descriptions.jsonl` — one line per detector-flagged row (145):
  `action: rewrite` (77, with `before`/`after`), `action: none` (68, with the
  reason the remaining glyphs are deliberate prose).
- `layer1-edits.json` — the exact find→replace pairs applied (prose is provably
  untouched: the applier refuses an absent or ambiguous `find`, checks the
  letter-word sequence is unchanged, KaTeX-renders every `$…$` span with
  `throwOnError`, and runs the whole string through `mathHtml`).
- `layer2-renames.jsonl` — one line per renamed sub-group (84): `before`,
  `after`, note. `renames.js` is the applied set with the reason per row.
- `vocabulary.md` — Adrian's library vocabulary the names were drawn from.

## Layer 1a rules (match the house style the 29 Aug pass established)
- Equations, identities, symbol runs, sequence notation, set expressions,
  named angles/segments in a relation → inline TeX (`$T_n = 4n+1$`,
  `$(A \cup B')'$`, `$PQ \parallel RS$`, `$0° \le x \le 180°$`).
- Bare unit and degree VALUES stay prose (`156°`, `72 km/h`, `cm²`, `-218°C`),
  as do word-level formulas (`speed = distance / time`, `density × volume`)
  and workflow arrows (`→`).
- Currency near a new span is written `\$` so it can never pair with a
  delimiter (`mathHtml` restores the plain dollar).

## Layer 2 rules
- Title Case, ≤ 45 chars, plain Singapore syllabus phrasing from Adrian's
  library; no "via / reasoning / formulation / reconstruction / adjustment".
- Sibling names within one (level, topic) stay distinct — checked for exact
  names and for `/notes` slugs (`topicSlug`) before writing.
- Nothing joins on `subgroups.name`: filing (`question_subgroups`), the
  practice RPCs (`practice_subgroups`, `practice_next`) and
  `find_similar_questions` key on the id; names are display labels. /notes
  URLs derive from names, so renamed sub-groups have new URLs (accepted).
- No beyond-syllabus flags raised: every renamed row carries linked
  Singapore school-paper questions, and the "Vieta" row is Adrian's own
  "Sum and Product of Roots → Form Equation" chapter.
