// Shared payload types for the Learn player. Pure types + tiny pure helpers —
// safe to import from both server routes and client components. The payload
// shapes mirror the Stage-2 schemas in MAC_B_NOTES_INGEST_SKILL.md exactly.

export type UnitKind = 'core' | 'example' | 'check' | 'autopsy' | 'try';

// core — the 30-second cram screen
export interface CorePayload {
  summary_md: string;
  formula_md?: string;
  remember_md?: string;
  figure_svg?: string;      // self-contained inline SVG diagram (geometry etc.)
}

// example — step-reveal player
export interface ExampleStep {
  label?: string;
  math?: string;            // raw LaTeX (no $ delimiters); rendered as display math
  annotation_md?: string;   // Adrian's arrow comment → gold bubble (short cue)
  more_md?: string;         // optional deeper "why" — collapsed behind a tap
  figure_svg?: string;      // diagram state AT this step — successive steps add
                            // construction lines/marks, so tapping animates the build
}
export interface DecisionOption {
  label_md: string;
  ok?: boolean;
  feedback_md?: string;
}
export interface Decision {
  after_step: number;       // 1-based: appears after this many steps are revealed
  context_strip_md?: string;
  prompt_md: string;
  options: DecisionOption[];
}
export interface ExamplePayload {
  problem_md: string;
  steps: ExampleStep[];
  decisions?: Decision[];
  answer_md?: string;
}

// check — 5-second micro-check
export interface CheckPayload {
  prompt_md: string;
  options: DecisionOption[];
}

// autopsy — spot-the-error. wrong_line is 1-based (matches playbook example).
export interface AutopsyPayload {
  problem_md: string;
  working: string[];
  wrong_line: number;
  why_md: string;
  fix_md: string;
}

// try — bridge to practice
export interface TryPayload {
  problem_md: string;
  answer_md?: string;
  note_md?: string;
}

export type UnitPayload =
  | CorePayload | ExamplePayload | CheckPayload | AutopsyPayload | TryPayload;

// Lightweight unit descriptor used in lists (overview + player siblings).
export interface UnitSummary {
  id: string;
  kind: UnitKind;
  title: string;
  unit_order: number;
  status: string;
  pending?: boolean;   // set when status !== 'approved' (admin view only)
}

// Full unit returned by /unit.
export interface LearnUnit {
  id: string;
  subject: string;
  topic: string;
  kind: UnitKind;
  title: string;
  unit_order: number;
  status: string;
  pending?: boolean;
  payload: UnitPayload;
}

export interface LearnTopic {
  subject: string;
  topic: string;
  spine_order: number;
  units: UnitSummary[];
  // Strategy-layer passthrough (present only when a topic_meta row exists for
  // this subject|topic). Harmless when absent; powers later readiness hints.
  prereqs?: string[];
  examWeight?: number;
  difficulty?: number;
}
