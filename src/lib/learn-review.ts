// Weakness resurfacing over the unit_events ledger (server-only).
//
// Two signals, both scoped to approved units in the student's subjects:
//   1. Unresolved fails — the unit's most recent check/decision outcome is a
//      fail (check_fail / decision_wrong) with no pass since. "Missed last time."
//   2. Stale passes    — a unit last cleared >14 days ago, in a topic the
//      student has otherwise touched recently. "Worth another look."
//
// Everything degrades to [] on error — callers (overview route, Today stack)
// must never 500.
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from './supabase';
import { studentTitle, learnSubjectsForLevel } from './learn';
import type { PortalAccount } from './portal-auth';
import type { UnitKind } from './learn-types';

const FAIL = new Set(['check_fail', 'decision_wrong']);
const PASS = new Set(['check_pass', 'completed', 'explain_pass']);
const DAY = 24 * 60 * 60 * 1000;

export type ReviewItem = { unitId: string; topic: string; title: string; reason: string };

type EventRow = {
  unit_id: string | null; topic: string | null; kind: string | null;
  event: string; created_at: string;
};

// Latest fail-or-pass event per unit, most-recent first. Feeds both signals.
async function latestPerUnit(
  supabase: SupabaseClient, userId: string,
): Promise<{ unitId: string; topic: string | null; kind: string | null; event: string; at: number }[]> {
  const since = new Date(Date.now() - 60 * DAY).toISOString();
  const { data } = await supabase
    .from('unit_events')
    .select('unit_id, topic, kind, event, created_at')
    .eq('user_id', userId)
    .gte('created_at', since)
    .order('created_at', { ascending: false });

  const seen = new Set<string>();
  const out: { unitId: string; topic: string | null; kind: string | null; event: string; at: number }[] = [];
  for (const r of (data || []) as EventRow[]) {
    if (!r.unit_id) continue;
    // Only fail/pass events decide "resolved vs not"; skip anything else.
    if (!FAIL.has(r.event) && !PASS.has(r.event)) continue;
    if (seen.has(r.unit_id)) continue;
    seen.add(r.unit_id);
    out.push({ unitId: r.unit_id, topic: r.topic, kind: r.kind, event: r.event, at: Date.parse(r.created_at) });
  }
  return out;
}

// Units whose most-recent outcome is an unresolved fail, most recent first.
// Exposed for the Today stack's "Review time" card (topic with most fails).
export async function unresolvedFails(
  supabase: SupabaseClient, userId: string,
): Promise<{ unitId: string; topic: string | null }[]> {
  const latest = await latestPerUnit(supabase, userId).catch(() => []);
  return latest.filter(l => FAIL.has(l.event)).map(l => ({ unitId: l.unitId, topic: l.topic }));
}

// The ranked review list for /overview (students only, max 3).
export async function buildReviewList(account: PortalAccount): Promise<ReviewItem[]> {
  try {
    const supabase = getSupabaseAdmin();
    const subjects = learnSubjectsForLevel(account.level);
    const latest = await latestPerUnit(supabase, account.id);
    if (latest.length === 0) return [];

    const now = Date.now();
    // Topics with any recent activity (≤21d) — gates the stale-pass signal.
    const activeTopics = new Set<string>();
    for (const l of latest) if (l.topic && now - l.at <= 21 * DAY) activeTopics.add(l.topic);

    const fails = latest.filter(l => FAIL.has(l.event));                       // most recent first (inherited order)
    const stale = latest
      .filter(l => PASS.has(l.event) && now - l.at > 14 * DAY && l.topic && activeTopics.has(l.topic))
      .sort((a, b) => a.at - b.at);                                            // oldest first

    // Candidate unit ids in priority order (fails before stale), deduped.
    const order: { unitId: string; reason: string }[] = [];
    const used = new Set<string>();
    for (const f of fails) { if (!used.has(f.unitId)) { used.add(f.unitId); order.push({ unitId: f.unitId, reason: 'Missed this last time' }); } }
    for (const s of stale) { if (!used.has(s.unitId)) { used.add(s.unitId); order.push({ unitId: s.unitId, reason: 'Worth another look' }); } }
    if (order.length === 0) return [];

    // Resolve titles/topics from the source of truth; drop anything the student
    // can't currently see (unapproved / wrong subject / deleted).
    const ids = order.map(o => o.unitId);
    const { data: units } = await supabase
      .from('learning_units')
      .select('id, kind, title, topic, subject, status')
      .in('id', ids)
      .eq('status', 'approved')
      .in('subject', subjects);

    const meta = new Map<string, { kind: string; title: string; topic: string }>();
    for (const u of (units || []) as { id: string; kind: string; title: string; topic: string }[]) {
      meta.set(u.id, { kind: u.kind, title: u.title, topic: u.topic });
    }

    const out: ReviewItem[] = [];
    for (const o of order) {
      const m = meta.get(o.unitId);
      if (!m) continue;
      out.push({
        unitId: o.unitId,
        topic: m.topic,
        title: studentTitle(m.kind as UnitKind, m.title),
        reason: o.reason,
      });
      if (out.length >= 3) break;
    }
    return out;
  } catch {
    return [];
  }
}
