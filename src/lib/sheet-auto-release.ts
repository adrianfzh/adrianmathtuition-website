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
  /** The paper's own accuracy hold (lib/mark-triage computeAutoHold reasons) — the sheet must not carry a held paper out. null = not checked. */
  paperHold?: string[] | null;
}

export interface GateResult { ok: boolean; reasons: string[]; watch: string[] }

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
  // The paper's accuracy signals are WATCH-OUTS, not a refusal (Adrian, 8 Sep
  // 2026: "we should just release them, but ping me for anything important").
  // Only a paper with nothing marked stops the clock.
  const watch = (Array.isArray(g.paperHold) ? g.paperHold : []).filter(r => r !== 'no questions were marked');
  if ((g.paperHold || []).includes('no questions were marked')) reasons.push('the paper has nothing marked');
  return { ok: reasons.length === 0, reasons, watch };
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Sun 9:12am" in Singapore time. */
export function sgtShort(at: string | number | Date): string {
  const ms = typeof at === 'string' ? Date.parse(at) : at instanceof Date ? at.getTime() : at;
  const c = sgtClock(ms);
  const h12 = c.hour % 12 === 0 ? 12 : c.hour % 12;
  return `${DAYS[c.weekday]} ${h12}:${String(c.minute).padStart(2, '0')}${c.hour < 12 ? 'am' : 'pm'}`;
}

/** The cron's line when the clock ran out but the paper is held: nothing goes out. */
export function heldByPaperLine(who: string, paper: string | null | undefined, reasons: string[], deskUrl: string): string {
  const why = reasons.length ? reasons.map(r => `• ${r}`).join('\n') : '• (no reason recorded)';
  return `🖐 <b>${who}</b>${paper ? ` — ${paper}` : ''}: the 12-hour window passed but NOT released — the paper is held:\n${why}\nCheck it, then Approve &amp; release from the desk: ${deskUrl}`;
}

/** The two lines Telegram gets after a sheet passes or fails the gate — both name the student and the paper (Adrian, 8 Sep 2026: "doesn't say which marked pdf"). */
export function scheduledLine(at: string, deskUrl: string, who?: string | null, paper?: string | null, watch: string[] = []): string {
  const head = who ? `⏱ <b>${who}</b>${paper ? ` — ${paper}` : ''}: the marked paper and the Practice Again sheet go out` : '⏱ Goes out with the marked paper';
  const w = watch.length ? `\n⚠️ Watch out for: ${watch.join(' · ')}` : '';
  return `${head} at ${sgtShort(at)} unless you hold them on the desk.${w}\nDesk: ${deskUrl}`;
}

/** The released line with the paper's watch-outs (the cron, 8 Sep 2026). */
export function releasedWithWatchLine(who: string, paper: string | null, watch: string[]): string {
  return releasedLine(who, paper) + (watch.length ? `\n⚠️ Watch out for: ${watch.join(' · ')}` : '');
}

export function heldLine(who: string, paper: string | null | undefined, reasons: string[], deskUrl: string): string {
  const why = reasons.length ? reasons.map(r => `• ${r}`).join('\n') : '• (no reason recorded)';
  return `🖐 <b>${who}</b>${paper ? ` — ${paper}` : ''}: the sheet is filed but waits for you on the desk — it will NOT go out on its own. Why:\n${why}\nRelease it from the desk when you are happy with it: ${deskUrl}`;
}

export function releasedLine(who: string, paper: string | null): string {
  return `✅ Auto-released ${who}${paper ? ` — ${paper}` : ''}: marked paper + Practice Again sheet (the 12-hour window passed with no hold).`;
}

// ── Practice Again on request (8 Sep 2026) ───────────────────────────────────
// A sheet the STUDENT asked for from the app goes out the moment it clears the
// gate — no clock, nobody waiting on Adrian. These three lines tell him what
// happened; a held one names the reasons so the desk has something to act on.

export function requestedSentLine(who: string, paper: string | null | undefined, watch: string[] = []): string {
  const w = watch.length ? `\n⚠️ Watch out for: ${watch.join(' · ')}` : '';
  return `📘 <b>${who}</b>${paper ? ` — ${paper}` : ''}: asked for Practice Again from the app — the sheet is written and with them now.${w}`;
}

export function requestedHeldLine(who: string, paper: string | null | undefined, reasons: string[], deskUrl: string): string {
  const why = reasons.length ? reasons.map(r => `• ${r}`).join('\n') : '• (no reason recorded)';
  return `🖐 <b>${who}</b>${paper ? ` — ${paper}` : ''}: asked for Practice Again from the app, but the sheet waits for you on the desk — it will NOT go out on its own. Why:\n${why}\nThe app tells them Adrian is checking it. Release it from the desk: ${deskUrl}`;
}

export function requestedStoppedLine(who: string, paper: string | null | undefined, error: string, deskUrl: string): string {
  return `⚠️ <b>${who}</b>${paper ? ` — ${paper}` : ''}: asked for Practice Again from the app, but the sheet could not be sent: ${error}. Release it from the desk: ${deskUrl}`;
}
