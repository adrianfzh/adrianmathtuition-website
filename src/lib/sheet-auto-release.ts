// Release-by-silence for Practice Again sheets (Adrian, 6 Sep 2026: "12 hours").
//
// A finished sheet that passes the machine gates is scheduled to go out WITH
// the marked paper after a hold window; Adrian's Telegram says when, and the
// desk shows a Hold button. If he does nothing it releases; if he holds, it
// waits on the desk as before. Every hold is recorded (held_at) so the
// 20-sheet review can tell how often the window was needed.
//
// Pure: the gate and the wording are tested; the cron and the route do I/O.
import { sgtClock } from './sgt';

export const DEFAULT_HOLD_HOURS = 12;

export function holdHours(env: string | undefined = process.env.SHEET_AUTO_RELEASE_HOURS): number {
  if (env == null || env === '') return DEFAULT_HOLD_HOURS;
  const n = Number(env);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_HOLD_HOURS;
}

export interface GateInput {
  noSheet: boolean;
  /** The worker's "73/73 sympy" stamp. */
  verified: string | null | undefined;
  wave: string[] | null | undefined;
  /** The second reader's verdict on the worked examples (lib/sheet-example-check). */
  exampleCheck: { checked: number; disagreements: unknown[]; skipped?: string } | null | undefined;
  /** The run is grounded on the real paper — `paper_match.source` when the run has it; null = unknown (older runs). */
  grounded: boolean | null;
}

export interface GateResult { ok: boolean; reasons: string[] }

/**
 * May this sheet release without Adrian? Every reason is a sentence he can
 * read on the desk. Unknown grounding (older runs without the stamp) is
 * allowed through; a known ungrounded paper is not.
 */
export function autoReleaseGate(g: GateInput): GateResult {
  const reasons: string[] = [];
  if (g.noSheet) reasons.push('no sheet was written for this paper');
  const v = String(g.verified || '').match(/^(\d+)\s*\/\s*(\d+)/);
  // Adrian, 8 Sep 2026: "what does it mean by the practice answers carry no
  // verification stamp?" — say what the stamp is and what the worker wrote.
  if (!v) {
    const wrote = String(g.verified || '').trim();
    reasons.push(wrote
      ? `the worker did not stamp the answers as verified in the form "N/N" — it wrote "${wrote.slice(0, 70)}${wrote.length > 70 ? '…' : ''}", so nothing here proves every answer was checked`
      : 'the worker did not stamp the answers as verified (no "N/N answers checked" line), so nothing proves every answer was checked');
  } else if (v[1] !== v[2]) reasons.push(`only ${v[1]} of ${v[2]} practice answers verified`);
  if (!g.wave || !g.wave.length) reasons.push('the sheet teaches nothing (empty wave)');
  if (!g.exampleCheck) reasons.push('the worked examples were not checked by a second reader');
  else if (g.exampleCheck.skipped) reasons.push(`the example check was skipped: ${g.exampleCheck.skipped}`);
  else if (g.exampleCheck.checked === 0) reasons.push('no worked example was found to check');
  else if (g.exampleCheck.disagreements.length) reasons.push(`a second reader disagrees with ${g.exampleCheck.disagreements.length} worked example(s)`);
  if (g.grounded === false) reasons.push('the marking was not grounded on the real paper');
  return { ok: reasons.length === 0, reasons };
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Sun 9:12am" in Singapore time. */
export function sgtShort(at: string | number | Date): string {
  const ms = typeof at === 'string' ? Date.parse(at) : at instanceof Date ? at.getTime() : at;
  const c = sgtClock(ms);
  const h12 = c.hour % 12 === 0 ? 12 : c.hour % 12;
  return `${DAYS[c.weekday]} ${h12}:${String(c.minute).padStart(2, '0')}${c.hour < 12 ? 'am' : 'pm'}`;
}

/** The two lines Telegram gets after a sheet passes or fails the gate — both name the student and the paper (Adrian, 8 Sep 2026: "doesn't say which marked pdf"). */
export function scheduledLine(at: string, deskUrl: string, who?: string | null, paper?: string | null): string {
  const head = who ? `⏱ <b>${who}</b>${paper ? ` — ${paper}` : ''}: the marked paper and the Practice Again sheet go out` : '⏱ Goes out with the marked paper';
  return `${head} at ${sgtShort(at)} unless you hold them on the desk.\nDesk: ${deskUrl}`;
}

export function heldLine(who: string, paper: string | null | undefined, reasons: string[], deskUrl: string): string {
  const why = reasons.length ? reasons.map(r => `• ${r}`).join('\n') : '• (no reason recorded)';
  return `🖐 <b>${who}</b>${paper ? ` — ${paper}` : ''}: the sheet is filed but waits for you on the desk — it will NOT go out on its own. Why:\n${why}\nRelease it from the desk when you are happy with it: ${deskUrl}`;
}

export function releasedLine(who: string, paper: string | null): string {
  return `✅ Auto-released ${who}${paper ? ` — ${paper}` : ''}: marked paper + Practice Again sheet (the 12-hour window passed with no hold).`;
}
