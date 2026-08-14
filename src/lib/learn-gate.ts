// Learn is NOT released to students yet (Adrian, 2026-08-14: "I do not want
// learn units to be released to students yet. More like the /notes we did
// should be released."). Every /api/portal/learn/* route calls this right
// after practiceAuth: students get 403 {error:'learn-closed'} and the client
// points them at /notes instead.
//
// Escape hatch: a student session WITH the admin cookie in the same browser
// passes — that's Adrian previewing Learn through his test student account.
// Flip LEARN_OPEN_TO_STUDENTS to true to release Learn (and delete the 403
// handling in /app/learn if desired — a true flag just stops the 403s).
//
// Server-only module (next/headers via notes-auth) — never import from
// client components.
import { NextResponse } from 'next/server';
import type { PracticeCaller } from './practice';
import { isNotesAuthed } from './notes-auth';

export const LEARN_OPEN_TO_STUDENTS = false;

/** Non-null = the 403 to return; null = caller may proceed. */
export async function learnClosedResponse(caller: PracticeCaller): Promise<NextResponse | null> {
  if (LEARN_OPEN_TO_STUDENTS) return null;
  if (!caller || caller.kind !== 'student') return null;
  if (await isNotesAuthed()) return null; // Adrian testing via a student account
  return NextResponse.json(
    { error: 'learn-closed', notes: '/notes' },
    { status: 403 }
  );
}
