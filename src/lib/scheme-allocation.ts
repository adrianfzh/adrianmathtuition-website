// lib/scheme-allocation.ts — the split a marking used, from its stored results
// (8 Sep 2026). Twin of the bot's lib/scheme-derive.js allocationFrom — the
// desk's "re-derive from this marking" door needs it without a bot round trip.
// Pure; tested.

export type AllocationPart = { label: string; marks: number; scheme?: string };
export type AllocationQuestion = { number: string; marks: number; parts: AllocationPart[] };

type ResultLike = {
  question_number?: unknown; question_found?: unknown;
  marking_output?: { parts?: { label?: unknown; max?: unknown; scheme?: unknown }[] } | null;
};

/** "(whole)", "" and null all mean the undivided question. */
export function partLabel(label: unknown): string {
  const l = String(label ?? '').trim();
  return /^\(?whole\)?$/i.test(l) ? '' : l;
}

export function allocationFrom(results: unknown): AllocationQuestion[] {
  const byQ = new Map<string, Map<string, AllocationPart>>();
  for (const r of Array.isArray(results) ? (results as ResultLike[]) : []) {
    if (!r || r.question_found === false) continue;
    const number = String(r.question_number ?? '').trim();
    if (!number || number === '?') continue;
    if (!byQ.has(number)) byQ.set(number, new Map());
    const parts = byQ.get(number)!;
    for (const p of r.marking_output?.parts ?? []) {
      const max = Number(p?.max);
      if (!Number.isFinite(max) || max <= 0) continue;
      const label = partLabel(p?.label);
      if (parts.has(label)) continue;
      const scheme = String(p?.scheme ?? '').replace(/\s+/g, ' ').trim().slice(0, 400);
      parts.set(label, { label, marks: max, ...(scheme ? { scheme } : {}) });
    }
  }
  const out: AllocationQuestion[] = [];
  for (const [number, parts] of byQ) {
    const list = [...parts.values()];
    if (!list.length) continue;
    out.push({ number, marks: list.reduce((s, p) => s + p.marks, 0), parts: list });
  }
  const num = (s: string) => { const m = s.match(/\d+/); return m ? Number(m[0]) : Infinity; };
  return out.sort((a, b) => num(a.number) - num(b.number) || a.number.localeCompare(b.number));
}
