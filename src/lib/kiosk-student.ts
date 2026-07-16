// Kiosk student session — issued after a successful WhatsApp QR pairing and
// carried by the kiosk client on every content request (x-kiosk-student header).
// Hard-locks the kiosk to the student's own level/subjects: the token embeds the
// entitlement set server-side, so the client can't request another level.
//
// Token format mirrors lib/kiosk-session.ts: `${json-base64url}.${hmac}` where
// hmac = HMAC-SHA256(secret, payload). No secret material in the token.
import crypto from 'crypto';
import type { NextRequest } from 'next/server';

export const KIOSK_STUDENT_HEADER = 'x-kiosk-student';
export const STUDENT_SESSION_MINUTES = 30; // kiosk UI resets after 5 min idle anyway

export type StudentEntitlements = {
  practice: string[]; // kiosk practice level tokens: EM / AM / JC2 (KIOSK_LEVELS keys)
  notes: string[];    // note level SLUGS matching NOTE_SLUG_TO_LEVELS: s1 / s2 / em / am / jc
};

export type KioskStudent = {
  id: string;          // Airtable rec id
  name: string;
  level: string;       // Airtable Level, e.g. 'Sec 3'
  entitlements: StudentEntitlements;
  expires: number;
};

// ── Level + Subjects → entitlements ─────────────────────────────────────────
// Airtable (verified live 2026-07-16): Level ∈ {'Sec 1'..'Sec 5','JC1','JC2'};
// Subjects ∈ {'Math','E Math','A Math','IP Math','H1 Math','H2 Math'}.
// Practice pools exist for EM/AM/JC2 only (S1/S2 practice can be added once the
// S1/S2 banks have labelled sub-groups); notes exist for S1/S2/EM/AM/JC2.
export function deriveEntitlements(level: string, subjects: string[]): StudentEntitlements {
  const practice = new Set<string>();
  const notes = new Set<string>();
  const lv = (level || '').trim();
  const subs = new Set((subjects || []).map((s) => s.trim()));

  const isJC = lv === 'JC1' || lv === 'JC2';
  const secN = /^Sec (\d)$/.exec(lv)?.[1];

  if (isJC) {
    // H1 students draw from the same H2 pool (only JC pool served).
    if (subs.has('H2 Math') || subs.has('H1 Math') || subs.size === 0) {
      practice.add('JC2');
      notes.add('jc');
    }
  } else if (secN === '1' || secN === '2') {
    // Lower sec: own practice pool (S1/S2 banks, sub-group-labelled 2026-07-16) + notes.
    practice.add(secN === '1' ? 'S1' : 'S2');
    notes.add(secN === '1' ? 's1' : 's2');
  } else if (secN) {
    // Sec 3–5: subject-driven. IP Math counts as both (integrated syllabus).
    if (subs.has('E Math') || subs.has('Math') || subs.has('IP Math')) {
      practice.add('EM');
      notes.add('em');
    }
    if (subs.has('A Math') || subs.has('IP Math')) {
      practice.add('AM');
      notes.add('am');
    }
  }
  return { practice: [...practice], notes: [...notes] };
}

// ── Token sign / verify ──────────────────────────────────────────────────────
function secret(): string {
  const s = process.env.ADMIN_SESSION_SECRET || process.env.SIGNUP_SECRET;
  if (!s) throw new Error('ADMIN_SESSION_SECRET / SIGNUP_SECRET not set');
  return s;
}

function hmac(payload: string): string {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function signStudentToken(s: Omit<KioskStudent, 'expires'>): string {
  const body: KioskStudent = { ...s, expires: Date.now() + STUDENT_SESSION_MINUTES * 60 * 1000 };
  const payload = Buffer.from(JSON.stringify(body)).toString('base64url');
  return `${payload}.${hmac(payload)}`;
}

export function verifyStudentToken(token: string | undefined | null): KioskStudent | null {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const given = token.slice(dot + 1);
  const expected = hmac(payload);
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const body = JSON.parse(Buffer.from(payload, 'base64url').toString()) as KioskStudent;
    if (!body?.expires || body.expires < Date.now()) return null;
    return body;
  } catch {
    return null;
  }
}

// Convenience: pull + verify the student from a request header.
export function studentFromRequest(req: NextRequest): KioskStudent | null {
  return verifyStudentToken(req.headers.get(KIOSK_STUDENT_HEADER));
}
