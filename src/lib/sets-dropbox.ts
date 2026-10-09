// lib/sets-dropbox.ts — the bank's Set papers, kept as PDFs in Dropbox › Apps ›
// AdrianMathNotes › School Papers (9 Oct 2026, Adrian: "there had been changes to the
// papers in the database, and this folder is not updated. can you automatically put the
// papers in the database here?").
//
// The bank is the truth (questions rows, school 'AdrianMath', exam_type 'Set n'); the
// folder is a copy. Each paper's content is fingerprinted; a paper whose fingerprint
// differs from the one in the folder's manifest is printed again by the SAME route the
// bank page's Print button uses (/api/admin/questions action paper-pdf) and replaces
// the file of the same name. Names are the ones already in the folder:
//   AdrianMath-AM-Set1-Paper1.pdf · AdrianMath-EM-Set2-Paper2.pdf · AdrianMath-H2-Set1-Paper1.pdf
// H2 also keeps AdrianMath-H2-Set1-Paper1-solutions.pdf, as the folder did.
// The .docx copies there are NOT made here — they came from a generator run, not the bank.
//
// No timer runs this (Adrian, 9 Oct 2026: "it's not a common thing, do we need a daily
// job?"). It runs from scripts/gce-paper/sync-folder.mts — by hand, and at the end of
// publish.mjs, which is the only way a Set changes. Everything that touches the network
// or the disk is injected, so the script and the test drive the same function.
import { createHash } from 'crypto';
import { subjectShortName } from './print-paper';
import { setNumber, setPaperKey } from './print-sets';
import { PAPER_PDF_RENDER_VERSION } from './render-paper-pdf';

/** Under ~/Dropbox — the app folder the notes library lives in. */
export const SETS_FOLDER = 'Apps/AdrianMathNotes/School Papers';
/** Hidden file in that folder: each paper's fingerprint at its last print. */
export const SETS_MANIFEST = '.sets-sync.json';
/** Columns whose change means the printed paper changed. */
export const SETS_SYNC_COLUMNS = 'id, level, year, exam_type, paper, question_number, total_marks, question_text, parts, answer, solution, image_url, figure_url, has_image, gen_meta';

export interface SetSyncRow {
  id: string; level: string; year: number | null; exam_type: string | null; paper: string | null;
  question_number: string | null; total_marks: number | null; question_text: string | null;
  parts: unknown; answer: string | null; solution: string | null; image_url: string | null;
  figure_url: string | null; has_image: boolean | null; gen_meta: { figure?: { print_width_mm?: unknown; width_mm?: unknown } } | null;
}
export interface SetSyncPaper { level: string; set: number; paper: '1' | '2'; year: number; rows: SetSyncRow[] }
export type SetsManifest = Record<string, { key: string; at: string }>;

/** The folder's letters for a bank level: JC files as H2. */
export function levelCode(level: string): string {
  return /^JC/i.test(level) ? 'H2' : level.toUpperCase();
}
export function setFileBase(level: string, set: number, paper: '1' | '2'): string {
  return `AdrianMath-${levelCode(level)}-Set${set}-Paper${paper}`;
}
/** The title printed on the page — "AdrianMath · A Math · Set 1 · Paper 1". */
export function setFileTitle(level: string, set: number, paper: '1' | '2'): string {
  return `AdrianMath · ${subjectShortName(level)} · Set ${set} · Paper ${paper}`;
}
/** The folder carries a solutions PDF for H2 only. */
export function wantsSolutionsFile(level: string): boolean {
  return /^JC/i.test(level);
}

export function groupSetRows(rows: SetSyncRow[]): SetSyncPaper[] {
  const by = new Map<string, SetSyncPaper>();
  for (const r of rows) {
    const set = setNumber(r.exam_type), pk = setPaperKey(r.paper);
    if (!set || !pk || !r.level) continue;
    const paper = pk === 'P1' ? '1' : '2';
    const k = `${r.level}|${set}|${paper}`;
    if (!by.has(k)) by.set(k, { level: r.level, set, paper, year: Number(r.year) || 0, rows: [] });
    by.get(k)!.rows.push(r);
  }
  const order = ['AM', 'EM'];
  const rank = (l: string) => (order.indexOf(l) + 1) || 9;
  return [...by.values()].sort((a, b) => rank(a.level) - rank(b.level) || a.set - b.set || a.paper.localeCompare(b.paper));
}

/** Fingerprint of everything that reaches the printed page (and the renderer's version). */
export function paperKey(p: SetSyncPaper): string {
  const rows = [...p.rows].sort((a, b) => String(a.id).localeCompare(String(b.id))).map((r) => [
    r.id, r.question_number, r.total_marks, r.question_text, r.parts, r.answer,
    wantsSolutionsFile(p.level) ? r.solution : null,
    r.image_url, r.figure_url, r.has_image, r.gen_meta?.figure?.print_width_mm ?? null, r.gen_meta?.figure?.width_mm ?? null,
  ]);
  return createHash('sha256').update(JSON.stringify({ v: PAPER_PDF_RENDER_VERSION, rows })).digest('hex').slice(0, 24);
}

export interface SetsSyncDeps {
  loadRows: () => Promise<SetSyncRow[]>;
  readManifest: () => Promise<SetsManifest | null>;
  writeManifest: (m: SetsManifest) => Promise<void>;
  /** The paper as a PDF; with `solutions`, the paper followed by its worked solutions. */
  print: (p: SetSyncPaper, opts: { title: string; solutions: boolean }) => Promise<Buffer>;
  /** Drop the first `n` pages (the paper) and keep the rest (the solutions). */
  pagesAfter: (pdf: Buffer, n: number) => Promise<Buffer>;
  pageCount: (pdf: Buffer) => Promise<number>;
  save: (name: string, pdf: Buffer) => Promise<void>;
  now?: () => Date;
  /** Stop starting new papers after this many ms (the rest go next run). */
  budgetMs?: number;
  /** Print everything, whatever the manifest says. */
  force?: boolean;
}
export interface SetsSyncResult { papers: number; written: string[]; unchanged: number; left: string[]; failed: { name: string; error: string }[] }

export async function syncSets(deps: SetsSyncDeps): Promise<SetsSyncResult> {
  const now = deps.now ?? (() => new Date());
  const t0 = now().getTime();
  const papers = groupSetRows(await deps.loadRows());
  const manifest: SetsManifest = { ...((await deps.readManifest()) ?? {}) };
  const out: SetsSyncResult = { papers: papers.length, written: [], unchanged: 0, left: [], failed: [] };
  let dirty = false;
  for (const p of papers) {
    const base = setFileBase(p.level, p.set, p.paper), key = paperKey(p);
    if (!deps.force && manifest[base]?.key === key) { out.unchanged++; continue; }
    if (deps.budgetMs && now().getTime() - t0 > deps.budgetMs) { out.left.push(base); continue; }
    try {
      const title = setFileTitle(p.level, p.set, p.paper);
      const paperPdf = await deps.print(p, { title, solutions: false });
      await deps.save(`${base}.pdf`, paperPdf);
      out.written.push(`${base}.pdf`);
      if (wantsSolutionsFile(p.level)) {
        const both = await deps.print(p, { title, solutions: true });
        await deps.save(`${base}-solutions.pdf`, await deps.pagesAfter(both, await deps.pageCount(paperPdf)));
        out.written.push(`${base}-solutions.pdf`);
      }
      manifest[base] = { key, at: now().toISOString() };
      dirty = true;
    } catch (e) {
      out.failed.push({ name: base, error: (e as Error).message || String(e) });
    }
  }
  if (dirty) await deps.writeManifest(manifest);
  return out;
}

/** One line for Adrian when files changed; '' when nothing did. */
export function syncMessage(r: SetsSyncResult): string {
  if (!r.written.length && !r.failed.length) return '';
  const lines: string[] = [];
  if (r.written.length) lines.push(`📄 School Papers folder: ${r.written.length} file${r.written.length === 1 ? '' : 's'} replaced with the bank's version.`, ...r.written.map((n) => `• ${n}`));
  if (r.left.length) lines.push(`Still to do next run: ${r.left.join(', ')}`);
  if (r.failed.length) lines.push(`⚠️ Could not print: ${r.failed.map((f) => `${f.name} (${f.error})`).join('; ')}`);
  return lines.join('\n');
}
