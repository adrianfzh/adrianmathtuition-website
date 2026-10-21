// Humanities content notes (21 Oct 2026, Adrian: "instead of quizzes, can we build 'notes' for the content?" → "yes").
// One page per syllabus topic, in our own words, checked against the school answer schemes in the bank (what earns
// marks), a reference chapter from the library (what the syllabus covers) and an independent fact check. One topic
// first (History: the end of World War II) for Adrian to look at; the rest follow its shape. Data in
// data/humanities/notes/<subject>/<id>.json. Pure.
import endOfWw2 from '../../data/humanities/notes/history/end-of-ww2.json';
import type { HumanitiesChoice } from './portal-prefs';

export interface NotesPage {
  id: string;
  subject: 'social-studies' | 'history' | 'geography';
  /** Which courses the topic is in: history_e / history_p / geography_e / geography_p (Social Studies: everyone). */
  courses: string[];
  unit: string;
  title: string;
  bigIdea: string[];
  timeline?: { when: string; what: string }[];
  terms: { term: string; meaning: string }[];
  chains: { title: string; steps: string[] }[];
  reasons?: { reason: string; side: string; evidence: string[] }[];
  inExam: string[];
  example?: { question: string; text: string };
  checked: { on: string; by: string; reference: string } | null;
}

const PAGES: NotesPage[] = [endOfWw2 as NotesPage];

export function notesPage(id: string): NotesPage | null {
  return PAGES.find(p => p.id === id) ?? null;
}

/** The pages for a student's subjects: Social Studies always, then the courses they ticked. [] choices = every page. */
export function notesFor(choices: HumanitiesChoice[]): NotesPage[] {
  if (!choices.length) return PAGES;
  return PAGES.filter(p => p.subject === 'social-studies' || p.courses.some(c => choices.includes(c as HumanitiesChoice)));
}

export const NOTES_SUBJECT_NAME: Record<NotesPage['subject'], string> = { 'social-studies': 'Social Studies', history: 'History', geography: 'Geography' };
