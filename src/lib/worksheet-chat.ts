// The worksheet box on the Next lesson card (5 Oct 2026). Adrian types what he
// wants for one student — "10 questions on sine rule, harder ones" — and a bank
// sheet is made and stored on the student (student_materials, source 'chat').
// A small model call turns his words into a request; everything it says is
// checked here against the course's real topic list, so a made-up topic never
// reaches the sheet. Pure (worksheet-chat.test.ts); the route does the I/O.
import { parseReplyPlain } from './lesson-autolog';
import type { Subject } from './teaching-order';

export const CHAT_MAX_COUNT = 15;
export const CHAT_DEFAULT_COUNT = 8;

export interface ChatAsk {
  subject: Subject;
  topics: string[];
  /** bank sub-skill names to narrow one topic to (checked against the bank later) */
  skills: string[];
  count: number;
  band: 'standard' | 'advanced' | null;
  title: string;
}

export function buildChatPrompt(request: string, student: { name: string; level: string | null }, courses: { subject: Subject; topics: string[]; skills: Record<string, string[]> }[]): string {
  const lists = courses.map((c) => {
    const lines = c.topics.map((t) => (c.skills[t]?.length ? `- ${t} (sub-skills: ${c.skills[t].join('; ')})` : `- ${t}`));
    return `${c.subject}:\n${lines.join('\n')}`;
  }).join('\n\n');
  return `You turn a tutor's request for a practice worksheet into JSON. The student is ${student.name}, ${student.level ?? 'level unknown'}.

The topics (and the bank's sub-skills under some) you may use, by subject:
${lists}

The tutor wrote: """${request.slice(0, 600)}"""

Reply with ONE JSON object and nothing else:
{"subject": "AM"|"EM"|"H2", "topics": [exact topic names from the list, 1 to 4], "skills": [exact sub-skill names when the request names part of ONE topic, else []], "count": number of questions (default ${CHAT_DEFAULT_COUNT}, max ${CHAT_MAX_COUNT}), "band": "advanced" if they ask for harder / challenging / top-school questions, "standard" if easier / basic, else null, "title": a short sheet title in plain words}
If nothing in the list fits, reply {"error": "<one short sentence saying why>"}.`;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

/** The model's reply → a checked request, or an error to show Adrian. */
export function parseChatReply(text: string, courses: { subject: Subject; topics: string[]; skills: Record<string, string[]> }[]): ChatAsk | { error: string } {
  const m = /\{[\s\S]*\}/.exec(text ?? '');
  if (!m) return { error: 'Could not read that request.' };
  let o: Record<string, unknown>;
  try { o = JSON.parse(m[0]); } catch { return { error: 'Could not read that request.' }; }
  if (typeof o.error === 'string') return { error: o.error.slice(0, 200) };
  const course = courses.find((c) => c.subject === o.subject) ?? courses[0];
  if (!course) return { error: 'This student has no maths course on record.' };
  const byNorm = new Map(course.topics.map((t) => [norm(t), t]));
  const topics = [...new Set((Array.isArray(o.topics) ? o.topics : []).map((t) => byNorm.get(norm(String(t)))).filter((t): t is string => !!t))].slice(0, 4);
  if (!topics.length) return { error: `None of those topics is in ${course.subject}'s list.` };
  const allowed = topics.length === 1 ? new Map((course.skills[topics[0]] ?? []).map((s) => [norm(s), s])) : new Map<string, string>();
  const skills = [...new Set((Array.isArray(o.skills) ? o.skills : []).map((s) => allowed.get(norm(String(s)))).filter((s): s is string => !!s))];
  const n = Math.round(Number(o.count));
  const count = Number.isFinite(n) && n > 0 ? Math.min(CHAT_MAX_COUNT, n) : CHAT_DEFAULT_COUNT;
  const band = o.band === 'advanced' || o.band === 'standard' ? o.band : null;
  const title = String(o.title ?? '').trim().slice(0, 60) || (skills.length ? skills.join(' and ') : topics.join(', '));
  return { subject: course.subject, topics, skills, count, band, title };
}

/** Without the model: topics named in the words, a number as the count, "hard" as advanced. */
export function plainChatAsk(request: string, courses: { subject: Subject; topics: string[]; skills: Record<string, string[]> }[]): ChatAsk | { error: string } {
  for (const c of courses) {
    const { topics } = parseReplyPlain(request, c.topics);
    if (!topics.length) continue;
    const n = /\b(\d{1,2})\b/.exec(request);
    const count = n ? Math.min(CHAT_MAX_COUNT, Math.max(1, Number(n[1]))) : CHAT_DEFAULT_COUNT;
    const band = /\b(hard|harder|challenging|difficult|tough)\b/i.test(request) ? 'advanced' : /\b(easy|easier|basic|simple)\b/i.test(request) ? 'standard' : null;
    return { subject: c.subject, topics: topics.slice(0, 4), skills: [], count, band, title: topics.slice(0, 4).join(', ') };
  }
  return { error: 'Name a topic (e.g. "10 questions on Logarithms").' };
}
