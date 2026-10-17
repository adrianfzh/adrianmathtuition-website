// One part's mark, for the total over a question with parts (lib/humanities-parts, /app/humanities/group/<id>).
// A point-marked part (Geography short questions) holds its marks in the level fields; a level-marked part has its
// exact mark once the placing read is back (report.mark), or its level's single mark when that level is one mark
// wide. Anything else → got null (the total waits). Pure.
import type { HumanitiesListRow } from './humanities-runs';
import { markRange, printedMarks } from './humanities-marks';
import { placeBand } from './humanities-place';

export function partScore(r: Pick<HumanitiesListRow, 'status' | 'skill' | 'level' | 'levels_max' | 'report_mark' | 'own_marks' | 'own_title'>): { got: number | null; outOf: number | null } {
  if (r.status !== 'marked' || r.level == null) return { got: null, outOf: null };
  const marks = r.own_marks ?? (r.own_title ? printedMarks(r.own_title) : null);
  if (r.skill === 'geo_describe' || r.skill === 'geo_explain') return { got: r.level, outOf: r.levels_max ?? marks };
  const range = markRange(r.skill, marks, r.level, r.level);
  if (!range) return { got: null, outOf: null };
  const band = placeBand(r.skill, marks, r.level);
  const got = band ? (r.report_mark ?? null) : range[0];
  return { got, outOf: range[2] };
}
