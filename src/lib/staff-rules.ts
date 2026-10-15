// 📏 Staff rulebook (15 Oct 2026, Adrian: "help me create an employees rulebook — rules of
// engagement for employees … allow me to access in admin hub and allow me to add/change/edit").
// Rows live in Supabase `staff_rules` (migrations/staff_rules.sql); /admin/rulebook edits them
// through /api/admin/rulebook. Pure: the cleaning, grouping and reordering arithmetic only.

export type StaffRule = { id: string; section: string; body: string; important: boolean; position: number; updatedAt: string };

export const DEFAULT_SECTION = 'General';
export const MAX_BODY = 1000;
export const MAX_SECTION = 60;

/** Clean what the page sends. Returns an error sentence instead when the rule is empty or too long. */
export function cleanRuleInput(input: { section?: unknown; body?: unknown; important?: unknown }):
  { ok: true; section: string; body: string; important: boolean } | { ok: false; error: string } {
  const body = String(input.body ?? '').replace(/\s+/g, ' ').trim();
  const section = String(input.section ?? '').replace(/\s+/g, ' ').trim() || DEFAULT_SECTION;
  if (!body) return { ok: false, error: 'Write the rule first.' };
  if (body.length > MAX_BODY) return { ok: false, error: `Keep a rule under ${MAX_BODY} characters.` };
  if (section.length > MAX_SECTION) return { ok: false, error: `Keep a group name under ${MAX_SECTION} characters.` };
  return { ok: true, section, body, important: input.important === true };
}

/** Groups in the order their first rule appears; rules inside a group by position. */
export function groupRules(rules: StaffRule[]): { section: string; rules: StaffRule[] }[] {
  const sorted = [...rules].sort((a, b) => a.position - b.position || a.body.localeCompare(b.body));
  const groups: { section: string; rules: StaffRule[] }[] = [];
  for (const r of sorted) {
    let g = groups.find((x) => x.section === r.section);
    if (!g) { g = { section: r.section, rules: [] }; groups.push(g); }
    g.rules.push(r);
  }
  return groups;
}

/** Position for a new rule: after the last rule of its group, or at the very end for a new group. */
export function positionForNew(rules: StaffRule[], section: string): number {
  const inGroup = rules.filter((r) => r.section === section);
  if (!inGroup.length) return rules.reduce((m, r) => Math.max(m, r.position), 0) + 10;
  const last = Math.max(...inGroup.map((r) => r.position));
  const next = rules.filter((r) => r.position > last).reduce((m, r) => Math.min(m, r.position), Infinity);
  return next === Infinity ? last + 10 : Math.floor((last + next) / 2) === last ? last + 1 : Math.floor((last + next) / 2);
}

/** Swap a rule with its neighbour inside its group. Returns the two new positions to write, or [] when it cannot move. */
export function moveWithinGroup(rules: StaffRule[], id: string, dir: 'up' | 'down'): { id: string; position: number }[] {
  const me = rules.find((r) => r.id === id);
  if (!me) return [];
  const group = groupRules(rules).find((g) => g.section === me.section)?.rules ?? [];
  const i = group.findIndex((r) => r.id === id);
  const j = dir === 'up' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= group.length) return [];
  const other = group[j];
  if (other.position === me.position) {
    // equal positions cannot swap — spread them by one
    return dir === 'up' ? [{ id: me.id, position: other.position - 1 }] : [{ id: me.id, position: other.position + 1 }];
  }
  return [{ id: me.id, position: other.position }, { id: other.id, position: me.position }];
}
