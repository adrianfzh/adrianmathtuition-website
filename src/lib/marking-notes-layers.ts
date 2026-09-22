// ⬇ Which ink layers ride into a marked-paper download (Adrian, 22 Sep 2026:
// "download row should be a three-way menu" — marked / with my notes / with
// Adrian's notes). The route's ?notes= value picks the layers; `1` is the
// legacy "both" from 17–18 Sep 2026 and stays honoured.
export type NotesChoice = 'none' | 'mine' | 'adrian' | 'all';

export function notesChoice(param: string | null | undefined): NotesChoice {
  const v = (param ?? '').trim().toLowerCase();
  if (v === 'mine' || v === 'me' || v === 'student') return 'mine';
  if (v === 'adrian' || v === 'teacher') return 'adrian';
  if (v === '1' || v === 'all' || v === 'both' || v === 'true') return 'all';
  return 'none';
}

/** Which layers to bake, in draw order (teacher first, the student's on top). */
export function layersFor(choice: NotesChoice): { teacher: boolean; student: boolean } {
  return { teacher: choice === 'adrian' || choice === 'all', student: choice === 'mine' || choice === 'all' };
}

/** The file-name tail for each choice. */
export function notesSuffix(choice: NotesChoice): string {
  if (choice === 'mine') return ' (with my notes)';
  if (choice === 'adrian') return " (with Adrian's notes)";
  if (choice === 'all') return ' (with notes)';
  return '';
}
