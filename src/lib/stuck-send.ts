// Sending a prepared stuck sheet (lib/stuck-picture.ts planMaterials) — only on
// Adrian's word: a button on /admin/stuck, a ✅ button under the weekly Telegram
// message, or his typed "send <slug>" / "send <slug> to all". Pure pieces here,
// tested in stuck-send.test.ts; the I/O is in /api/admin/stuck.

import type { PreparedMaterial } from './stuck-picture';
import type { StuckSubject } from './stuck-topics';

export type SendTarget = 'stuck' | 'all';

export interface SentRecord { at: string; target: SendTarget; studentIds: string[]; by: string }
export type StoredMaterial = PreparedMaterial & { sent?: SentRecord[] };

/** The worksheet route's level key for a material (`/api/bot/worksheet`). */
export function worksheetLevel(subject: StuckSubject, level: string | null): string {
  if (subject === 'AM') return 'AM';
  if (subject === 'H2') return 'JC2';
  if (level === 'Sec 1') return 'S1';
  if (level === 'Sec 2') return 'S2';
  return 'EM';
}

/** A material by its slug or its index in the report. */
export function findMaterial(materials: StoredMaterial[], ref: string | number): { index: number; material: StoredMaterial } | null {
  const i = typeof ref === 'number' ? ref : materials.findIndex((m) => m.slug === String(ref).trim().toLowerCase());
  const m = materials[i];
  return m && m.ok && m.pdfUrl ? { index: i, material: m } : null;
}

/** Who gets it: the stuck students or the whole level + subject, minus anyone already sent this sheet. */
export function recipientsFor(m: StoredMaterial, target: SendTarget): { to: string[]; already: string[] } {
  const wanted = target === 'all' ? [...new Set([...m.groupStudents, ...m.stuckStudents])] : m.stuckStudents;
  const sent = new Set((m.sent ?? []).flatMap((s) => s.studentIds));
  return { to: wanted.filter((s) => !sent.has(s)), already: wanted.filter((s) => sent.has(s)) };
}

/** The note the student reads on the card — Adrian's voice, short. */
export function studentNote(m: Pick<PreparedMaterial, 'area'>): string {
  return `A short practice sheet on ${m.area.replace(/^([A-Z])([a-z])/, (_, a, b) => a.toLowerCase() + b)}. Do it on paper and hand it in when you are done.`;
}

/** callback_data for the two buttons under the weekly message: "st:s:<report uuid>:<i>" (≤ 64 bytes). */
export function sendCallback(reportId: string, index: number, target: SendTarget): string {
  return `st:${target === 'all' ? 'a' : 's'}:${reportId}:${index}`;
}
