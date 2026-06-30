import type { Ann } from './segment';

// The grading JSON contract the /solo UI depends on. validateFeedback() returns
// a list of problems ([] = valid) so the route or a test can guard the shape.
export type Feedback = {
  mode: 'english' | 'math';
  overall: { band: string | null; score: number | null; outOf: number | null; summary: string };
  rubric: { criterion: string; band: string; comment: string }[];
  annotations: Ann[];
  strengths: string[];
  nextSteps: string[];
};

export function validateFeedback(o: any): string[] {
  const errs: string[] = [];
  if (!o || typeof o !== 'object') return ['not an object'];
  if (o.mode !== 'english' && o.mode !== 'math') errs.push('mode must be english|math');
  if (!o.overall || typeof o.overall !== 'object') errs.push('overall missing');
  else if (typeof o.overall.summary !== 'string') errs.push('overall.summary must be string');
  if (!Array.isArray(o.rubric)) errs.push('rubric must be array');
  if (!Array.isArray(o.annotations)) errs.push('annotations must be array');
  else for (const a of o.annotations) {
    if (typeof a?.quote !== 'string' || typeof a?.comment !== 'string') { errs.push('annotation needs quote+comment strings'); break; }
  }
  if (!Array.isArray(o.strengths)) errs.push('strengths must be array');
  if (!Array.isArray(o.nextSteps)) errs.push('nextSteps must be array');
  return errs;
}
