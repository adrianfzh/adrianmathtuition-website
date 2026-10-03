// Student-facing names for the source skills and the two structured-response
// parts — one place, so
// Home, the list and the report all say the same words.
export const SKILL_LABEL: Record<string, string> = {
  inference: 'Inference',
  comparison: 'Comparison',
  reliability: 'Reliability',
  usefulness: 'Usefulness',
  purpose: 'Purpose',
  how_far: 'How far do the sources support…',
  sr_explain: 'Explain two ways',
  sr_weigh: 'Do you agree?',
};
export const skillLabel = (k: string): string => SKILL_LABEL[k] ?? k;
