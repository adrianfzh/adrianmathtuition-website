// Student-facing names for the source skills and the two structured-response
// parts — one place, so
// Home, the list and the report all say the same words.
export const SKILL_LABEL: Record<string, string> = {
  inference: 'Inference',
  comparison: 'Comparison',
  reliability: 'Reliability',
  usefulness: 'Usefulness',
  purpose: 'Purpose',
  surprise: 'Are you surprised?',
  how_far: 'How far do the sources support…',
  sr_explain: 'Explain two ways',
  geo_describe: 'Describe',
  geo_explain: 'Explain',
  geo_evaluate: 'To what extent…',
  hist_evaluate: 'Essay',
  sr_weigh: 'Do you agree?',
};
export const skillLabel = (k: string): string => SKILL_LABEL[k] ?? k;
