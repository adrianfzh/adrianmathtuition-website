// 🧑‍🏫 Tutor portal — the pure rules (Adrian, 5 Nov 2026: "yes shall we build it first? but
// gatekeep first"). SPEC-TUTOR-TOOLS.md §7. Everything here is pure and tested
// (tutor-portal.test.ts); the database half is lib/tutor-store.ts, the cookie half
// lib/tutor-auth.ts.
//
// The shape: another tutor hands in THEIR students' papers; the papers ride the same 🌙
// marking queue Adrian's students use, but only when that queue is quiet, one at a time,
// and never more than the tutor's monthly cap.
import crypto from 'crypto';
import { sgtDateISO } from '@/lib/sgt';

// ── identity on the marking run ─────────────────────────────────────────────
// paper_marking_runs.student_id is plain text ('rec…' tuition, 'acct:<uuid>' strangers).
// A tutor's student is 'tutor:<tutor_students.id>' — no name, so the marked data Adrian
// keeps is anonymous. The name lives only in tutor_students, read only by that tutor.
export const TUTOR_SID_PREFIX = 'tutor:';
export const tutorRunStudentId = (tutorStudentId: string): string => `${TUTOR_SID_PREFIX}${tutorStudentId}`;
export const isTutorRunStudentId = (sid: string | null | undefined): boolean =>
  typeof sid === 'string' && sid.startsWith(TUTOR_SID_PREFIX);
/** What the run's student_name says — the tutor, never the student. */
export const tutorRunStudentName = (tutorName: string): string => `Tutor: ${tutorName}`.slice(0, 80);

// ── the monthly meter ───────────────────────────────────────────────────────
/** The billing month, Singapore time: 'YYYY-MM'. */
export const sgtMonthKey = (now: number | Date = Date.now()): string => sgtDateISO(now).slice(0, 7);

export interface CapState { used: number; cap: number; left: number; full: boolean }
export function capState(used: number, cap: number): CapState {
  const u = Math.max(0, Math.floor(used || 0));
  const c = Math.max(0, Math.floor(cap || 0));
  return { used: u, cap: c, left: Math.max(0, c - u), full: u >= c };
}

/** Marking cost per paper (Opus, overnight batch) — for Adrian's usage line only. */
export const USD_PER_PAPER = 1.4;

// ── the waiting room: when may a tutor paper join the marking queue? ───────────
// Adrian's own students come first. A tutor paper is sent to the queue only when no
// student paper is waiting, at most MAX_TUTOR_IN_QUEUE at a time, and at most
// DAILY_TUTOR_RELEASES across all tutors in one Singapore day.
export const MAX_TUTOR_IN_QUEUE = 1;
export const DAILY_TUTOR_RELEASES = 15;

export interface ReleaseInput {
  /** Papers of Adrian's own students waiting in the queue right now (not tutor papers). */
  studentWaiting: number;
  /** Tutor papers already in the queue, not yet marked. */
  tutorInQueue: number;
  /** Tutor papers sent to the queue so far today (SGT). */
  releasedToday: number;
  /** Waiting tutor papers, oldest first. */
  waiting: { id: string }[];
}
export function tutorPapersToRelease(i: ReleaseInput): string[] {
  if (i.studentWaiting > 0) return [];
  const room = Math.min(MAX_TUTOR_IN_QUEUE - i.tutorInQueue, DAILY_TUTOR_RELEASES - i.releasedToday);
  if (room <= 0) return [];
  return i.waiting.slice(0, room).map(w => w.id);
}

// ── what the tutor sees on a paper ──────────────────────────────────────────
export type TutorPaperState = 'waiting' | 'marking' | 'marked' | 'failed';
export function tutorPaperState(p: { status: string; marked: boolean }): TutorPaperState {
  if (p.marked) return 'marked';
  if (p.status === 'failed') return 'failed';
  if (p.status === 'queued') return 'marking';
  return 'waiting';
}
export const STATE_WORDS: Record<TutorPaperState, string> = {
  waiting: 'Waiting to be marked',
  marking: 'Being marked',
  marked: 'Marked',
  failed: 'Could not be marked — we are looking at it',
};

/** Weak topics: marks lost per topic, biggest first. */
export function weakTopics(dropped: { topic: string | null; awarded: number; max: number }[], limit = 5): { topic: string; lost: number }[] {
  const by = new Map<string, number>();
  for (const q of dropped) {
    const lost = Math.max(0, (Number(q.max) || 0) - (Number(q.awarded) || 0));
    if (!lost) continue;
    const t = (q.topic || '').trim() || 'Other';
    by.set(t, (by.get(t) ?? 0) + lost);
  }
  return [...by.entries()].map(([topic, lost]) => ({ topic, lost }))
    .sort((a, b) => b.lost - a.lost || a.topic.localeCompare(b.topic)).slice(0, limit);
}

// ── input checks ────────────────────────────────────────────────────────────
export function cleanName(v: unknown, max = 60): string | null {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\s+/g, ' ').trim().slice(0, max);
  return s.length ? s : null;
}
export function cleanEmail(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 120 ? s : null;
}
export const MIN_PASSWORD = 10;
export const MAX_PAGES = 30;
export const TUTOR_SUBJECTS = ['A Math', 'E Math', 'H2 Math'] as const;

// ── passwords (scrypt) ──────────────────────────────────────────────────────
export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(pw, salt, 32);
  return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`;
}
export function verifyPassword(pw: string, stored: string | null | undefined): boolean {
  if (!stored || typeof pw !== 'string') return false;
  const [kind, salt, key] = stored.split('$');
  if (kind !== 'scrypt' || !salt || !key) return false;
  const want = Buffer.from(key, 'base64url');
  const got = crypto.scryptSync(pw, Buffer.from(salt, 'base64url'), want.length);
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

// ── invite tokens ───────────────────────────────────────────────────────────
export const INVITE_DAYS = 14;
export const hashToken = (t: string): string => crypto.createHash('sha256').update(t).digest('hex');
export function newInviteToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(24).toString('base64url');
  return { token, hash: hashToken(token) };
}

// ── session cookie ──────────────────────────────────────────────────────────
// `${tutorId}.${expires}.${hmac('tutor.' + tutorId + '.' + expires)}` — its own label,
// so an admin session token can never pass as a tutor one (and back).
export const TUTOR_SESSION_COOKIE = 'tutor_session';
export const TUTOR_SESSION_DAYS = 30;
const mac = (payload: string, secret: string) => crypto.createHmac('sha256', secret).update(payload).digest('base64url');
export function signTutorSession(tutorId: string, secret: string, now = Date.now()): string {
  const expires = now + TUTOR_SESSION_DAYS * 86_400_000;
  return `${tutorId}.${expires}.${mac(`tutor.${tutorId}.${expires}`, secret)}`;
}
export function verifyTutorSession(token: string | null | undefined, secret: string | null | undefined, now = Date.now()): string | null {
  if (!token || !secret) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [id, exp, sig] = parts;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const expires = Number(exp);
  if (!Number.isFinite(expires) || expires < now) return null;
  const want = Buffer.from(mac(`tutor.${id}.${expires}`, secret));
  const got = Buffer.from(sig);
  return want.length === got.length && crypto.timingSafeEqual(want, got) ? id : null;
}
