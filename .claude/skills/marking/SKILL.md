---
name: marking
description: MANDATORY before touching any marking surface — /admin/mark-paper, /admin/mark (batch), /admin/papers, /admin/mark/triage, /app/marking or /app/submit (student-facing), mark-paper-* or mark-batch/* API routes, render-marking, marked-PDF assembly, the ✏️ Annotate overlay, or the 🌙 marking queue. Routes you to the area runbook and its shipped-bug archaeology before any code is written.
---

# Marking — read the runbook first

**Read [`docs/MARKING.md`](../../../docs/MARKING.md) in full before writing or
editing any marking code.** That file is the source of truth — this skill only
routes you there and pins the traps that shipped real bugs:

- **Vercel caps request bodies at 4.5MB (platform-level)** — mark-paper
  auto-falls back to `phase:'remark'` on the saved run when the inline body
  would bust it (`lib/mark-payload.ts`). Don't "fix" a 413 by bumping memory.
- **Hand-ins and ⚡ Mark now papers are never claimable** by the plan-billed
  Mac marker; student hand-ins auto-release after marking (bot calls
  `mark-triage {action:'release', auto:true}`) — papers Adrian uploads himself
  still need his manual Release in triage.
- **Marking rules are level-conditional**: bare "(rej)" is fine at O-Level;
  only A-Level rejections must state a reason.
- Marked-PDF assembly, annotate tokens, and the batch chunking flow all have
  archaeology in the doc — check it before redesigning any of them.
