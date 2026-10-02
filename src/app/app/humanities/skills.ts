// Student-facing names for the six Social Studies source skills — one place, so
// Home, the list and the report all say the same words.
export const SKILL_LABEL: Record<string, string> = {
  inference: 'Inference',
  comparison: 'Comparison',
  reliability: 'Reliability',
  usefulness: 'Usefulness',
  purpose: 'Purpose',
  how_far: 'How far do the sources support…',
};
export const skillLabel = (k: string): string => SKILL_LABEL[k] ?? k;
