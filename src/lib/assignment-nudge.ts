// The message a student gets when work lands on their list — Telegram text +
// the web-push payload — chosen by what the work IS (SPEC-ASSIGN.md; Practice
// Again on request, 8 Sep 2026). Pure so the three variants are tested:
//   • a Practice Again sheet Adrian released himself → compulsory, says so
//   • a Practice Again sheet the student asked for   → "your sheet is ready"
//   • anything else from the Send-work card           → the original nudge
import { dueLabel } from './assignments';

export interface NudgeSubject {
  kind: string;
  title: string;
  note?: string | null;
  due_on?: string | null;
  source?: string | null;
  source_run_id?: string | null;
  required_at?: string | null;
}

export interface Nudge {
  /** Telegram HTML. */
  text: string;
  push: { title: string; body: string; url: string };
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function assignmentNudge(a: NudgeSubject, site: string): Nudge {
  const practiceAgain = a.source === 'practice-again' && a.kind === 'worksheet';
  if (practiceAgain) {
    // The sheet lives with its paper in the app (/app/marking/[id]), not on a
    // separate to-do page — the link lands them where the Hand in button is.
    const path = a.source_run_id ? `/app/marking/${a.source_run_id}` : '/app/marking';
    if (a.required_at) {
      return {
        text: `📘 Adrian sent you a Practice Again sheet: <b>${esc(a.title)}</b> — he asked you to do this one. Work through the examples, then hand the practice in.\n\nOpen it: ${site}${path}`,
        push: { title: '📘 Practice Again from Adrian', body: `${a.title} — Adrian asked you to do this one`, url: path },
      };
    }
    return {
      text: `📘 Your Practice Again sheet is ready: <b>${esc(a.title)}</b>. Work through the examples, then hand the practice in.\n\nOpen it: ${site}${path}`,
      push: { title: '📘 Your Practice Again sheet is ready', body: a.title, url: path },
    };
  }
  const due = dueLabel(a.due_on ?? null);
  const what = a.kind === 'question' ? 'a question' : 'a worksheet';
  return {
    text: `📬 Adrian sent you ${what}: <b>${esc(a.title)}</b>${due ? ` (${due})` : ''}`
      + (a.note ? `\n\n“${esc(a.note)}”` : '')
      + `\n\nOpen it: ${site}/app`,
    push: { title: '📬 New work from Adrian', body: a.title, url: '/app/assignments' },
  };
}
