// "Decide here" on /admin (6 Nov 2026, Adrian: "can we just put all this on admin itself, then
// i will act on it (don't put on telegram)" … "and put them all on main admin page (not
// separate pages)"). Four things wait on him; each is decided on the dashboard itself:
//
//   1. Extraction rules the learner proposed → Ship · Change · Drop. The tap files the same
//      `proposal_requests` row a Telegram button files; the Fly worker applies it within a
//      minute (bot scripts/proposal-ship.js → lib/extraction-rules-store.js decide()). The
//      worker answers a website tap on the page, not in Telegram (bot lib/quiet-messages.js
//      'website-tap-reply').
//   2. Proposals that did not ship → Try again · Drop. Only a proposal whose NEWEST request
//      failed counts: on 6 Nov all nine "did not ship" had shipped on a later tap.
//   3. Extraction papers flagged → Fine as it is (done) · Try again (back in the queue).
//   4. Questions to vet → Publish · Reject (the existing PATCH /api/admin/question-proposals).
//
// Pure: the route (app/api/admin/decide) reads and writes; this file shapes and checks.

import { SLUG_RE, NOTE_MAX } from './overnight';

export type ReqRow = {
  slug: string; action: string; status: string; failure_kind?: string | null;
  result?: string | null; requested_at: string;
};

/** The newest request per slug, from rows in any order. */
export function newestPerSlug(rows: ReqRow[]): Map<string, ReqRow> {
  const out = new Map<string, ReqRow>();
  for (const r of rows) {
    const cur = out.get(r.slug);
    if (!cur || Date.parse(r.requested_at) > Date.parse(cur.requested_at)) out.set(r.slug, r);
  }
  return out;
}

/**
 * The proposals that really did not ship: the newest request for the slug failed (or needs a
 * session). A failed tap followed by a good one is shipped, not failed. Newest first.
 */
export function stillFailed(rows: ReqRow[]): ReqRow[] {
  return [...newestPerSlug(rows).values()]
    .filter((r) => r.status === 'failed' || r.status === 'needs_session')
    .sort((a, b) => Date.parse(b.requested_at) - Date.parse(a.requested_at));
}

/** Why a ship did not go through, in everyday words. */
export function failedWhy(r: Pick<ReqRow, 'status' | 'failure_kind' | 'result'>): string {
  if (r.status === 'needs_session') return 'It clashes with newer work. A Claude session has to redo it.';
  switch (r.failure_kind) {
    case 'gate_failed': return 'Its own check failed, so nothing went live. A Claude session has to fix it.';
    case 'gate_infra': return 'The check machine had a hiccup. Trying again usually works.';
    case 'push_race': return 'Another change went out at the same moment. Trying again usually works.';
    case 'timeout': return 'Its check took too long and was stopped. Trying again may work.';
    case 'no_branch': return 'The change itself could not be found. Drop it, or ask a Claude session.';
    case 'merge_conflict': return 'It clashes with newer work. A Claude session has to redo it.';
    default: {
      const s = String(r.result || '').replace(/^[^A-Za-z]+/, '').split(/(?<=\.)\s/)[0];
      return s ? (s.length > 140 ? `${s.slice(0, 139)}…` : s) : 'It did not finish.';
    }
  }
}

/** Trying again can help — the others need a session or a Drop. */
export function canRetry(r: Pick<ReqRow, 'status' | 'failure_kind'>): boolean {
  return r.status === 'failed' && ['gate_infra', 'push_race', 'timeout', 'other', null, undefined].includes(r.failure_kind as string | null | undefined);
}

/** The words a session needs to pick a failed proposal up — copied, never sent. */
export function sessionAsk(r: Pick<ReqRow, 'slug' | 'result'>): string {
  return `The proposal "${r.slug}" did not ship. The worker said: ${String(r.result || 'no reason given').split('\n')[0]} Please fix it and ship it.`;
}

/**
 * One short line saying why an extraction paper was put aside, from the worker's long notes:
 * the "Status: FLAGGED (…)" words when there are some, else the FLAG_ file's own name after
 * the year ("FLAG_Catholic_High_P4_2018_q37_missing_angle.md" → "q37 missing angle"),
 * else the first part of the note.
 */
export function flagReason(notes: string | null | undefined, status?: string): string {
  const n = String(notes || '');
  if (status === 'failed' && /^HELD/.test(n)) return 'Held back, not queued';
  const st = n.match(/Status:\s*FLAGGED\s*\(([^)]+)\)/i);
  if (st) return clip(st[1].trim());
  const files = [...n.matchAll(/FLAG_([A-Za-z0-9_-]+)\.md/g)];
  if (files.length) {
    const name = files[files.length - 1][1];
    const after = name.match(/(?:19|20)\d{2}_(.+)$/);
    const words = (after ? after[1] : name).replace(/_/g, ' ').trim();
    if (words) return clip(words.charAt(0).toUpperCase() + words.slice(1));
  }
  if (status === 'failed') return 'The worker stopped part-way';
  const first = n.replace(/^\[[^\]]*\]\s*/, '').split('|').map((s) => s.trim()).filter(Boolean).pop() || '';
  return first ? clip(first) : 'No reason written';
}
const clip = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export type DecideBody =
  | { kind: 'rule'; slug: string; action: 'ship' | 'change' | 'drop'; note: string | null }
  | { kind: 'ship'; slug: string; action: 'ship' | 'drop'; note: null }
  | { kind: 'paper'; id: string; action: 'done' | 'requeue' };

/** Check a tap from the page. */
export function checkDecide(body: unknown): { ok: true; d: DecideBody } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const kind = String(b.kind ?? '');
  const action = String(b.action ?? '').trim().toLowerCase();
  if (kind === 'rule' || kind === 'ship') {
    const slug = String(b.slug ?? '').trim().toLowerCase();
    if (!SLUG_RE.test(slug)) return { ok: false, error: 'That is not a proposal name.' };
    if (kind === 'rule') {
      if (!slug.startsWith('xr-')) return { ok: false, error: 'That is not an extraction rule.' };
      if (action !== 'ship' && action !== 'change' && action !== 'drop') return { ok: false, error: 'Ship, Change or Drop only.' };
      const note = String(b.note ?? '').trim().slice(0, NOTE_MAX);
      if (action === 'change' && !note) return { ok: false, error: 'Say what to change first.' };
      return { ok: true, d: { kind, slug, action, note: action === 'change' ? note : null } };
    }
    if (action !== 'ship' && action !== 'drop') return { ok: false, error: 'Try again or Drop only.' };
    return { ok: true, d: { kind, slug, action, note: null } };
  }
  if (kind === 'paper') {
    const id = String(b.id ?? '').trim();
    if (!/^[0-9a-f-]{8,40}$/i.test(id) && !/^\d+$/.test(id)) return { ok: false, error: 'That is not a paper.' };
    if (action !== 'done' && action !== 'requeue') return { ok: false, error: 'Fine or Try again only.' };
    return { ok: true, d: { kind, id, action } };
  }
  return { ok: false, error: 'Unknown kind of decision.' };
}

/** The line a rule or proposal shows after a tap, from its newest request. */
export function tapWords(r: Pick<ReqRow, 'action' | 'status' | 'result'> | null | undefined): string | null {
  if (!r) return null;
  const busy = r.status === 'pending' || r.status === 'running';
  const verb = r.action === 'ship' ? ['Shipping', 'Shipped'] : r.action === 'drop' ? ['Dropping', 'Dropped'] : ['Sending your change', 'Change noted — the rewritten rule comes back here tomorrow morning'];
  if (busy) return `⏳ ${verb[0]}… usually under a minute`;
  if (r.status === 'done') return `✅ ${verb[1]}`;
  return `❌ ${failedWhy({ status: r.status, failure_kind: null, result: r.result ?? null })}`;
}
