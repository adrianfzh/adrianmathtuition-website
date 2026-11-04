// 👪 Weekly parent report — reads and writes (SPEC-PARENT-REPORT.md). The
// judgement calls and words live in lib/parent-report.ts (pure, tested).
//
// Supabase data transfer (the org is near its quota): every read selects small
// columns; a paper's big result_json is read only for papers released in the
// last WEAK_DAYS (a handful per student), older papers by score only; the
// report stores ~1 KB of facts per child per week.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PortalAccount } from '@/lib/portal-auth';
import { portalIdentity } from '@/lib/portal-auth';
import { rpcAudience, studentMathLevels } from '@/lib/practice';
import { bankScope } from '@/lib/qb-levels';
import { matchBankTopics, setProgress, slotResult, weekStartISO, type AttemptLite, type StretchItem } from '@/lib/stretch-set';
import { ACCOUNT_COLUMNS, nextOnTopic, setLevelFor } from '@/lib/stretch-set-store';
import { sgtTodayISO } from '@/lib/sgt';
import {
  LOOKBACK_DAYS, WEAK_DAYS, buildReportFacts, reportWords, signReportToken,
  type ReportAttempt, type ReportFacts, type ReportMistake, type ReportPaper, type ReportWords,
} from '@/lib/parent-report';

const DAY = 86_400_000;
export const SITE = 'https://www.adrianmathtuition.com';
export const FOCUS_PATH = '/app/focus';
export const FOCUS_URL = `${SITE}${FOCUS_PATH}`;
export const FOCUS_SIZE = 3; // three Core questions ≈ 10 minutes
const MATH_SUBJECTS = ['A Math', 'E Math', 'H2 Math', 'Math'];

export interface LinkRow {
  id: string; student_identity: string; parent_id: string | null; status: 'pending' | 'active' | 'ended';
  invite_code: string | null; invite_expires_at: string | null; linked_at: string | null; ended_at: string | null; created_at: string;
}
export const LINK_COLUMNS = 'id, student_identity, parent_id, status, invite_code, invite_expires_at, linked_at, ended_at, created_at';

/** The child's account from a portal identity (rec… or acct:<uuid>). */
export async function accountForIdentity(sb: SupabaseClient, identity: string): Promise<PortalAccount | null> {
  const q = sb.from('portal_accounts').select(ACCOUNT_COLUMNS);
  const { data } = identity.startsWith('acct:')
    ? await q.eq('id', identity.slice(5)).limit(1)
    : await q.eq('airtable_student_id', identity).order('deactivated_at', { ascending: false, nullsFirst: true }).limit(1);
  return ((data ?? [])[0] as unknown as PortalAccount) ?? null;
}

/** The child's first name for the parent's page (never stored with the report, never in a link). */
export function firstName(account: Pick<PortalAccount, 'display_name'> | null): string | null {
  const n = (account?.display_name ?? '').trim().split(/\s+/)[0];
  return n && n.length <= 30 ? n : null;
}

// ── one student's week ───────────────────────────────────────────────────────

const num = (v: unknown) => (v == null || v === '' ? null : Number(v));

export async function loadReportInputs(sb: SupabaseClient, account: PortalAccount, weekStart: string, now: Date) {
  const identity = portalIdentity(account);
  const since = new Date(now.getTime() - LOOKBACK_DAYS * DAY).toISOString();
  const weakSince = new Date(now.getTime() - WEAK_DAYS * DAY).toISOString();
  const [att, runs, mis, stretch] = await Promise.all([
    sb.from('student_attempts')
      .select('question_id, attempted_at, marking_verdict, score:marking_json->>score, out_of:marking_json->>outOf, revealed:marking_json->ladder->>revealed, topics:marking_json->topics, science:marking_json->>science')
      .or(`user_id.eq.${account.id},airtable_student_id.eq."${identity}"`)
      .gte('attempted_at', since).order('attempted_at', { ascending: false }).limit(1500),
    sb.from('paper_marking_runs').select('id, released_at, paper_name, paper_subject, total_awarded, total_max')
      .eq('student_id', identity).not('released_at', 'is', null).is('superseded_by', null)
      .gte('released_at', since).order('released_at', { ascending: false }).limit(40),
    sb.from('notebook_mistakes').select('topic, error_kind, seen_count, last_seen_at')
      .eq('airtable_student_id', identity).in('subject', MATH_SUBJECTS).is('removed_at', null).gte('last_seen_at', since).limit(500),
    sb.from('stretch_sets').select('items, responses, built_at').eq('airtable_student_id', identity).eq('week_start', weekStart).maybeSingle(),
  ]);
  if (att.error) throw new Error(`attempts: ${att.error.message}`);
  if (runs.error) throw new Error(`papers: ${runs.error.message}`);

  // Topics for bank attempts that carry none in marking_json (one small read).
  const rawAtt = (att.data ?? []) as Record<string, unknown>[];
  const needTopic = [...new Set(rawAtt.filter(a => a.question_id && !(Array.isArray(a.topics) && a.topics.length)).map(a => String(a.question_id)))];
  const qTopics = new Map<string, string[]>();
  for (let i = 0; i < needTopic.length; i += 150) {
    const { data } = await sb.from('questions').select('id, topics').in('id', needTopic.slice(i, i + 150));
    for (const q of (data ?? []) as { id: string; topics: unknown }[]) if (Array.isArray(q.topics)) qTopics.set(q.id, q.topics.filter((t): t is string => typeof t === 'string'));
  }
  const attempts: ReportAttempt[] = rawAtt.map(a => ({
    at: String(a.attempted_at),
    questionId: a.question_id ? String(a.question_id) : null,
    topics: Array.isArray(a.topics) && a.topics.length ? (a.topics as unknown[]).filter((t): t is string => typeof t === 'string') : qTopics.get(String(a.question_id)) ?? [],
    verdict: (a.marking_verdict as string) ?? null,
    score: num(a.score), outOf: num(a.out_of), helpSteps: num(a.revealed) ?? 0,
    science: a.science === 'true' || a.science === true,
  }));

  // Marks lost per part, only for the recent papers (their result_json is the big column).
  const runRows = (runs.data ?? []) as Record<string, unknown>[];
  const recentIds = runRows.filter(r => String(r.released_at) >= weakSince).map(r => String(r.id)).slice(0, 8);
  const losses = new Map<string, ReportPaper['losses']>();
  if (recentIds.length) {
    const { data } = await sb.from('paper_marking_runs').select('id, result_json').in('id', recentIds);
    for (const r of (data ?? []) as { id: string; result_json: unknown }[]) losses.set(r.id, paperLosses(r.result_json));
  }
  const papers: ReportPaper[] = runRows.map(r => ({
    releasedAt: String(r.released_at), name: String(r.paper_name ?? 'a paper'), subject: String(r.paper_subject ?? ''),
    awarded: num(r.total_awarded), max: num(r.total_max), losses: losses.get(String(r.id)) ?? [],
  }));
  const mistakes: ReportMistake[] = ((mis.data ?? []) as Record<string, unknown>[]).map(m => ({
    topic: (m.topic as string) ?? null, errorKind: (m.error_kind as string) ?? null, seen: Number(m.seen_count ?? 1) || 1, lastSeenAt: (m.last_seen_at as string) ?? null,
  }));

  let stretchProgress: { done: number; total: number } | null = null;
  const st = stretch.data as { items: StretchItem[]; responses: Record<string, never>; built_at: string } | null;
  if (st?.items?.length) {
    const lite: AttemptLite[] = attempts.filter(a => a.at >= st.built_at && a.questionId).map(a => ({ questionId: a.questionId!, attemptedAt: a.at, verdict: a.verdict, score: a.score, outOf: a.outOf, helpSteps: a.helpSteps }));
    const results = Object.fromEntries(st.items.map(it => [it.slot, slotResult(it.questionId, lite)]));
    const p = setProgress(st.items, results, st.responses ?? {});
    stretchProgress = { done: p.done, total: p.total };
  }
  return { weekStart, now, attempts, papers, mistakes, stretch: stretchProgress };
}

/** Marks lost per question part from a marked paper's result_json: topic, marks, kind of mistake. */
export function paperLosses(resultJson: unknown): ReportPaper['losses'] {
  let j = resultJson as { results?: unknown } | string | null;
  if (typeof j === 'string') { try { j = JSON.parse(j); } catch { return []; } }
  const results = (j as { results?: unknown } | null)?.results;
  if (!Array.isArray(results)) return [];
  const out: ReportPaper['losses'] = [];
  for (const e of results as Record<string, unknown>[]) {
    if (!e || !e.marking) continue;
    const mo = (e.marking_output ?? {}) as { meta?: { topic_detected?: string }; parts?: unknown };
    const topic = (mo.meta?.topic_detected ?? '').trim();
    if (!topic) continue;
    const parts = Array.isArray(mo.parts) ? (mo.parts as Record<string, unknown>[]) : [];
    if (parts.length) {
      for (const p of parts) {
        const lost = Number(p.max) - Number(p.awarded ?? 0);
        if (lost > 0 && Number.isFinite(lost)) out.push({ topic, lost, kind: typeof p.error_kind === 'string' ? p.error_kind : null });
      }
    } else {
      const m = e.marking as { total_max?: unknown; total_awarded?: unknown };
      const lost = Number(m.total_max) - Number(m.total_awarded ?? 0);
      if (lost > 0 && Number.isFinite(lost)) out.push({ topic, lost, kind: null });
    }
  }
  return out;
}

// ── the 10-minute set ────────────────────────────────────────────────────────

/** Up to three unseen Core questions on the weak topic, through the same serving doors as practice. */
export async function pickFocusSet(sb: SupabaseClient, account: PortalAccount, topic: string, seen: string[]): Promise<{ topic: string; questionIds: string[] } | null> {
  // Every maths subject the student takes, the set's usual level first (an A Math
  // student's weak spot can be an E Math topic).
  const first = setLevelFor(account);
  const levels = [...new Set([first, ...studentMathLevels(account).map(l => l.key)].filter((k): k is string => !!k))];
  // Closest bank topics first: most words shared with the weak topic's name.
  const words = (t: string) => new Set(t.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2));
  const want = words(topic);
  const shared = (t: string) => [...words(t)].filter(w => want.has(w)).length;
  for (const levelKey of levels) {
    const scope = bankScope(levelKey);
    const { data: tRows, error } = await sb.rpc('practice_topics', { p_level: scope.level, p_qlevel: scope.qlevel, ...rpcAudience({ kind: 'student', account }) });
    if (error) throw new Error(`practice_topics: ${error.message}`);
    const bankTopics = ((tRows ?? []) as { topic: string }[]).map(r => r.topic).filter(Boolean);
    const matches = matchBankTopics(topic, bankTopics).sort((a, b) => shared(b) - shared(a)).slice(0, 3);
    if (!matches.length) continue;
    const ctx = { sb, levelKey, account, exclude: [...seen] };
    const ids: string[] = [];
    for (const tier of ['Standard', null] as const) {
      for (const t of matches) {
        while (ids.length < FOCUS_SIZE) {
          const id = await nextOnTopic(ctx, t, tier);
          if (!id) break;
          ids.push(id);
        }
      }
      if (ids.length >= FOCUS_SIZE) break;
    }
    if (ids.length) return { topic: matches[0], questionIds: ids };
  }
  return null;
}

/** The week's facts for one child, with the 10-minute set picked. Nothing is written. */
export async function buildFacts(sb: SupabaseClient, account: PortalAccount, now = new Date()): Promise<ReportFacts> {
  const weekStart = weekStartISO(sgtTodayISO(now));
  const inputs = await loadReportInputs(sb, account, weekStart, now);
  const facts = buildReportFacts(inputs);
  if (facts.weakSpot) {
    const seen = [...new Set(inputs.attempts.map(a => a.questionId).filter((x): x is string => !!x))];
    try { facts.focus = await pickFocusSet(sb, account, facts.weakSpot.topic, seen); }
    catch (e) { console.error('[parent-report] focus set:', (e as Error).message); }
  }
  return facts;
}

/** Build (or keep) this week's stored report for one active link. */
export async function upsertWeekReport(sb: SupabaseClient, link: LinkRow, account: PortalAccount, now = new Date()): Promise<{ id: string; facts: ReportFacts; emailedAt: string | null }> {
  const weekStart = weekStartISO(sgtTodayISO(now));
  const { data: existing } = await sb.from('parent_reports').select('id, facts, emailed_at').eq('link_id', link.id).eq('week_start', weekStart).maybeSingle();
  if (existing) return { id: existing.id as string, facts: existing.facts as ReportFacts, emailedAt: (existing.emailed_at as string) ?? null };
  const facts = await buildFacts(sb, account, now);
  const { data, error } = await sb.from('parent_reports').insert({ link_id: link.id, week_start: weekStart, facts }).select('id').single();
  if (error) throw new Error(`parent_reports write: ${error.message}`);
  return { id: data.id as string, facts, emailedAt: null };
}

// ── links ────────────────────────────────────────────────────────────────────

export async function linksForStudent(sb: SupabaseClient, identity: string): Promise<LinkRow[]> {
  const { data, error } = await sb.from('parent_links').select(LINK_COLUMNS).eq('student_identity', identity).neq('status', 'ended').order('created_at');
  if (error) throw new Error(`parent_links read: ${error.message}`);
  return (data ?? []) as LinkRow[];
}

export function reportUrl(reportId: string, secret: string): string {
  return `${SITE}/parent/r/${signReportToken(reportId, secret)}`;
}

/** WhatsApp "send to" link with the message filled in (the parent picks the chat). */
export function whatsappShare(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

// ── email ────────────────────────────────────────────────────────────────────

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function reportEmailHtml(w: ReportWords, links: { report: string }): string {
  const share = whatsappShare(w.forwardText);
  const li = (xs: string[]) => xs.map(x => `<li style="margin:0 0 6px">${esc(x)}</li>`).join('');
  const sec = (h: string, body: string) => `<p style="margin:18px 0 6px;font-size:13px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.04em">${h}</p>${body}`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f8fafc;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
<div style="max-width:520px;margin:0 auto;padding:20px 16px">
<p style="margin:0;font-size:13px;color:#64748b">${esc(w.title)}</p>
<h1 style="margin:4px 0 0;font-size:22px;color:#1e3a5f">${esc(w.heading)}</h1>
${sec('This week', w.done.length ? `<ul style="margin:0;padding-left:20px;font-size:16px;line-height:1.45">${li(w.done)}</ul>` : '<p style="margin:0;font-size:16px">No practice or papers this week.</p>')}
${w.wins.length ? sec('Going well', `<ul style="margin:0;padding-left:20px;font-size:16px;line-height:1.45">${li(w.wins)}</ul>`) : ''}
${w.weak ? sec('To work on', `<p style="margin:0;font-size:16px">${esc(w.weak)}</p>`) : ''}
<p style="margin:20px 0 10px;font-size:16px">${esc(w.action)}</p>
<a href="${esc(share)}" style="display:block;text-align:center;background:#25D366;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600;font-size:16px">${esc(w.button)}</a>
<p style="margin:14px 0 0;font-size:15px"><a href="${esc(links.report)}" style="color:#1e3a5f">Open the report on the website</a></p>
<p style="margin:24px 0 0;font-size:12px;color:#94a3b8">This link stops working after 14 days. To stop these emails, open the report and tap “Stop these reports”.</p>
</div></body></html>`;
}

export async function sendReportEmail(to: string, w: ReportWords, report: string): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, error: 'no RESEND_API_KEY' };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'AdrianMath <hello@adrianmathtuition.com>',
        to, reply_to: 'adrianmathtuition@gmail.com',
        subject: `${w.heading} — weekly report`,
        html: reportEmailHtml(w, { report }),
      }),
    });
    if (!res.ok) return { sent: false, error: `Resend ${res.status}: ${(await res.text()).slice(0, 160)}` };
    return { sent: true };
  } catch (e) { return { sent: false, error: (e as Error).message }; }
}

export { reportWords };
