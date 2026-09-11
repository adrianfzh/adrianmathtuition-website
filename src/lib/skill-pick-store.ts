// The skill filing a picker needs, from Supabase — docs/SKILL-PICK.md.
// `subgroups` = the topic's skills in syllabus order; `question_subgroups` = which
// skills each question is filed under. Read-only; the picking itself is pure
// (lib/skill-pick.ts). Sec 3 questions use the AM/EM lists, JC1/JC2 the JC list.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SkillRef } from './skill-pick';

/** questions.level / a kiosk level key → the level the `subgroups` table files under. */
export function skillLevelFor(level: string): string {
  const l = String(level ?? '').toUpperCase();
  if (l.startsWith('JC')) return 'JC';
  if (l.endsWith('AM')) return 'AM';
  if (l.endsWith('EM')) return 'EM';
  return l;
}

export type SkillFiling = { skills: SkillRef[]; linksByQuestion: Record<string, string[]> };

export async function loadSkillFiling(
  supa: SupabaseClient,
  level: string,
  topic: string,
  questionIds: string[],
): Promise<SkillFiling> {
  const { data: sg, error: e1 } = await supa
    .from('subgroups')
    .select('id, name, order_index')
    .eq('level', skillLevelFor(level))
    .eq('topic', topic)
    .order('order_index');
  if (e1 || !sg?.length) return { skills: [], linksByQuestion: {} };
  const skills: SkillRef[] = sg.map((r: { id: unknown; name: string; order_index: number | null }) => ({
    id: String(r.id), name: r.name, order: r.order_index ?? 99,
  }));
  const ids = new Set(skills.map((s) => s.id));
  const linksByQuestion: Record<string, string[]> = {};
  for (let i = 0; i < questionIds.length; i += 200) {
    const chunk = questionIds.slice(i, i + 200);
    const { data: links } = await supa
      .from('question_subgroups')
      .select('question_id, subgroup_id')
      .in('question_id', chunk);
    for (const l of (links ?? []) as { question_id: string; subgroup_id: unknown }[]) {
      const sid = String(l.subgroup_id);
      if (!ids.has(sid)) continue;
      (linksByQuestion[l.question_id] ??= []).push(sid);
    }
  }
  return { skills, linksByQuestion };
}

/** The names Adrian dropped on the card, matched loosely against the topic's skills. */
export function dropSkills(skills: SkillRef[], skip: unknown): { kept: SkillRef[]; dropped: string[] } {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const wanted = new Set((Array.isArray(skip) ? skip : []).map((x) => norm(String(x ?? ''))).filter(Boolean));
  if (!wanted.size) return { kept: skills, dropped: [] };
  const dropped: string[] = [];
  const kept = skills.filter((s) => {
    const hit = wanted.has(norm(s.name));
    if (hit) dropped.push(s.name);
    return !hit;
  });
  return { kept, dropped };
}
