// What the essay brain is told to LOOK FOR and how to word its feedback, per kind
// of writing (6 Oct 2026, Adrian: "let's do the english guidance" … "start on step 2").
// Our own words (docs/english-guidance-draft.md), checked against the SEAB 1184
// syllabus. ONE copy, in data/rubrics/english-1184-guidance.json; the website sends
// the lines to the bot with every essay, beside the rubric, so the marker holds no
// copy of its own. The guidance never sets a band — the rubric does. Pure; tested.
import guidance1184 from '../../data/rubrics/english-1184-guidance.json';
import type { EssayKind, EssaySubject } from './essay-rubric';

const BY_KIND: Record<EssayKind, readonly string[]> = {
  continuous_writing: guidance1184.continuous_writing,
  situational_writing: guidance1184.situational_writing,
};

/** The guidance lines for one kind of writing; empty for a subject or kind with none. */
export function essayGuidanceFor(subject: EssaySubject | string, kind: EssayKind | string): string[] {
  if (subject !== 'english') return [];
  const lines = BY_KIND[kind as EssayKind];
  return Array.isArray(lines) ? lines.map((l) => String(l).trim()).filter(Boolean) : [];
}
