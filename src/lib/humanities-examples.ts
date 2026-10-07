// The example bank for Social Studies structured response (SPEC-HUMANITIES.md
// §A3, 7 Oct 2026): short, checked, real examples a student can learn and use
// in "Explain two ways" / "Do you agree?". Our own wording. Pure.
import file from '../../data/humanities/social-studies/examples.json';
import { SS_THEMES, type SsTheme } from './humanities-questions';

export interface HumanitiesExample {
  id: string;
  theme: SsTheme;
  name: string;
  /** The facts, one short line each. */
  what: string[];
  /** What the example shows — the link a student writes after it. */
  shows: string;
  /** The kinds of question it fits. */
  use: string[];
}

const FILE = file as unknown as { checked: string | null; examples: HumanitiesExample[] };
/** The date the facts were last checked against public sources. */
export const EXAMPLES_CHECKED: string | null = FILE.checked;

export function allExamples(): HumanitiesExample[] { return FILE.examples; }
export function examplesByTheme(): { theme: SsTheme; examples: HumanitiesExample[] }[] {
  return SS_THEMES.map(theme => ({ theme, examples: FILE.examples.filter(e => e.theme === theme) }));
}
