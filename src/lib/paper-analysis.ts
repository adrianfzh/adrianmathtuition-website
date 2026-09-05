// Where a student's marks are actually going — the front page of a marked paper.
//
// Adrian, 1 Sep 2026: "an analysis in the front page to say where in a paper did
// the student lose most marks and the topics/questions they need to work on".
//
// ONE PAPER — the one the page fronts (Adrian, 2 Sep 2026: "we should just
// analyze that particular exam paper, not across 5 papers"). The first version
// read the student's last few scripts so a habit could be told from a bad day,
// and printed "fixed" rows for weaknesses that had stopped. Adrian's call: the
// cover is stapled to ONE script, and a student reading about work handed in
// three weeks ago cannot check it against the paper in their hands. So the
// routes now hand this module the parts of a single run, and the ranking is
// simply: which themes cost the most marks on that paper.
//
// The `live` / `papers` / `latestMarks` fields survive from the multi-paper
// version and still mean what they say — with one paper every theme is live,
// `papers` is 1 and `latestMarks` equals `marks`. They are kept so the shape
// stays stable for the JSON route and so a stale theme could never outrank a
// live one if history were ever fed back in. Everything here is pure — the
// route supplies the rows, the renderer draws the result.

export type LostPart = {
  paperId: string;
  paperName: string;
  createdAt: string;
  question: string;
  label: string;
  lost: number;
  max: number;
  blank: boolean;
  why: string;
  /**
   * The marker's own topic for the question (`marking_output.meta.topic_detected`,
   * one per question, e.g. "Surds; sum and product of roots of a quadratic").
   * Optional: runs from before the field, and parts the caller built without
   * it, simply print no topic.
   */
  topic?: string;
};

export type Theme = {
  key: string;
  title: string;
  marks: number;
  occasions: number;
  papers: number;
  /** Is it still happening in the most recent paper? */
  live: boolean;
  /** Marks lost to it in the newest paper alone. */
  latestMarks: number;
  /** Where it showed up, newest first — the evidence Adrian rules on. */
  examples: { paperName: string; question: string; why: string }[];
  /** Set only when the theme came from the self-study sheet's diagnosis
   *  (lib/sheet-diagnosis.ts): the sheet's own triage — `show` skills are slips
   *  the sheet points at without drilling, and the cover keeps them out of its
   *  top three. Absent on classifier themes. */
  tier?: 'teach' | 'show' | 'optional';
  /** Every question the sheet named for it, e.g. ["Q11(a)", "Q20"] — the
   *  closing line's tie check reads these beside `examples`. Absent on
   *  classifier themes. */
  questions?: string[];
};

/**
 * The themes, in the order they are worth teaching.
 *
 * Deliberately keyword-driven rather than model-driven: this runs on every marked
 * paper, it has to be explainable when Adrian disagrees with it, and a theme that
 * cannot be traced back to the sentences that produced it is not evidence. The
 * classifier is coarse on purpose — its job is to rank, and the examples carry
 * the detail.
 */
//
// TITLES ARE THE NAMES STUDENTS USE (Adrian, 1 Sep 2026: "shape and space are
// not the terms that students usually use — mensuration is fine, it is the topic
// name"). A student looks for the chapter in their own notes, so these are the
// syllabus topic names off the contents page, not the marker's categories. Where
// a theme is a HABIT rather than a topic it is described as the thing they do,
// in the second person, because there is no chapter to look up.
const THEMES: { key: string; title: string; test: RegExp }[] = [
  { key: 'blank', title: 'Questions you left blank', test: /no attempt|left (completely )?blank|not attempted|nothing attempted|no working|no method was shown|no proof was written|part left/i },
  { key: 'explain', title: 'Giving a reason, not just the answer', test: /repeats the claim|restates|no figures|justif|you needed to say|must be stated|never showed|no check shown|\breason\b|explanation/i },
  { key: 'shape', title: 'Mensuration — volume, surface area, arcs and sectors', test: /cylinder|sector|arc\b|kite|surface|curved|cuboid|radius|perimeter|\bcone\b|sphere|prism|pyramid/i },
  { key: 'circle', title: 'Circle properties', test: /circle|tangent|chord|cyclic|\bO\b is the centre|angle at the cent/i },
  { key: 'congruence', title: 'Congruence and similarity', test: /congruen|similar (triangle|figure)|\bAA\b|\bSAS\b|\bRHS\b/i },
  { key: 'scale', title: 'Scale factors — square it for area, cube it for volume', test: /(scale|factor)[^.]*(squar|cube)|squared with|both base and height|areas scale|cube root/i },
  { key: 'accuracy', title: 'Writing the answer the way the question asked', test: /d\.p\.|s\.f\.|significant figure|decimal place|do not round|nearest cent|in terms of|answer line|units?\b/i },
  { key: 'stats', title: 'Statistics — median, quartiles and the mean', test: /quartile|median|mid-value|\bIQR\b|\bmean\b|percentile/i },
  { key: 'algebra', title: 'Signs and slips in the algebra', test: /sign|inequality|dropped|negative|expand|bracket/i },
];

/** Which theme a lost part belongs to, or null. Blank wins over topic: a part
 *  nobody attempted teaches nothing about its topic. */
export function classify(part: Pick<LostPart, 'why' | 'blank'>): string | null {
  const why = String(part.why || '');
  if (part.blank || THEMES[0].test.test(why)) return 'blank';
  for (const t of THEMES.slice(1)) if (t.test.test(why)) return t.key;
  return null;
}

/**
 * Build the ranked themes.
 *
 * `latestPaperId` is the paper this analysis fronts — its presence or absence is
 * what decides `live`, and a theme that has stopped is reported as progress
 * rather than ranked as a gap.
 */
/**
 * Which theme a lost part belongs to — THE MARKER'S OWN TOPIC first.
 *
 * Adrian, 5 Sep 2026, on Kassandra's cover: "the topics are not correct — why
 * are they not correct in the first place?" Because the cover was built from the
 * keyword classifier below whenever the sheet's diagnosis had not landed yet:
 * "tangent sketches" in a stationary-point note matched Circle properties, and
 * "units²" in an area note matched Writing the answer the way the question
 * asked. The marker already names every question's topic (meta.topic_detected —
 * "Differentiation — stationary points"), so that is the theme now, cut by
 * topicLabel. Blank parts keep their own habit theme (a part nobody attempted
 * teaches nothing about its topic); the keyword classifier remains only for
 * runs from before topics were stored.
 */
export function themeOf(part: Pick<LostPart, 'why' | 'blank' | 'topic'>): { key: string; title: string } | null {
  const why = String(part.why || '');
  if (part.blank || THEMES[0].test.test(why)) return { key: 'blank', title: THEMES[0].title };
  const topic = topicLabel(part.topic);
  if (topic) return { key: `topic:${topic.toLowerCase()}`, title: topic };
  const key = classify(part);
  if (!key) return null;
  return { key, title: THEMES.find(t => t.key === key)!.title };
}

export function analyse(parts: LostPart[], latestPaperId: string): Theme[] {
  const byKey = new Map<string, Theme>();

  for (const p of parts || []) {
    const theme = themeOf(p);
    if (!theme) continue;
    const { key } = theme;
    let th = byKey.get(key);
    if (!th) {
      th = { key, title: theme.title, marks: 0, occasions: 0, papers: 0, live: false, latestMarks: 0, examples: [] };
      byKey.set(key, th);
    }
    th.marks += p.lost;
    th.occasions += 1;
    if (p.paperId === latestPaperId) { th.live = true; th.latestMarks += p.lost; }
    if (th.examples.length < 3 && p.why) {
      th.examples.push({ paperName: p.paperName, question: `Q${p.question}${p.label || ''}`, why: p.why });
    }
  }

  for (const th of byKey.values()) {
    th.papers = new Set((parts || []).filter(p => themeOf(p)?.key === th.key).map(p => p.paperId)).size;
  }

  // Live themes first, then by marks. A theme absent from the newest paper is
  // still returned — Adrian decides whether it is worth a word — but it can
  // never outrank one the student still has.
  return [...byKey.values()].sort((a, b) =>
    (Number(b.live) - Number(a.live)) || (b.marks - a.marks));
}

/**
 * The marker's topic string, cut to what fits beside a bar on the cover.
 *
 * Adrian, 3 Sep 2026, on Kassandra's cover: "it will be useful to say what
 * topic Q9 is on the cover page". The marker writes the topic as a list —
 * "Surds; sum and product of roots of a quadratic", "Differentiation —
 * maxima and minima", "Integration (area under a curve)". The FIRST clause is
 * the syllabus topic; the rest is the sub-skill, which the theme rows already
 * cover. So: first clause, then a hard cap on a word boundary, so a long
 * label can never wrap a bar row onto a second line and push the page past
 * one A4 sheet.
 */
export const TOPIC_LABEL_MAX = 34;
export function topicLabel(raw: unknown): string {
  let s = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  s = s.split(/\s*(?:;|—|–| - |:|\(|\/)\s*/)[0].trim();
  s = s.replace(/[,.\s]+$/, '');
  if (s.length > TOPIC_LABEL_MAX) {
    const cut = s.slice(0, TOPIC_LABEL_MAX);
    const sp = cut.lastIndexOf(' ');
    s = (sp > TOPIC_LABEL_MAX * 0.5 ? cut.slice(0, sp) : cut).replace(/[,.\s]+$/, '') + '…';
  }
  return s;
}

/** Which questions bled most on THIS paper — the "where in the paper" half. */
export function worstQuestions(parts: LostPart[], paperId: string, limit = 5) {
  const byQ = new Map<string, { question: string; lost: number; max: number; why: string; topic: string }>();
  for (const p of (parts || []).filter(x => x.paperId === paperId)) {
    // The marker's question_number is not always a number — it comes back as
    // "(b)", "c" or "?" when a page carried no printed question number. Prefixing
    // those with Q produced "Q(b)" and "Qc" on the first live run. A label with no
    // digit in it is not a question number, so it is shown as the marker wrote it.
    const k = /\d/.test(p.question) ? `Q${p.question}` : (p.question || '?');
    const cur = byQ.get(k) || { question: k, lost: 0, max: 0, why: p.why, topic: '' };
    cur.lost += p.lost; cur.max += p.max;
    // The first part that carries a topic names the question; parts of one
    // question share the marker's meta, so this is the only one there is.
    if (!cur.topic) cur.topic = topicLabel(p.topic);
    byQ.set(k, cur);
  }
  return [...byQ.values()].sort((a, b) => b.lost - a.lost).slice(0, limit);
}

/** One honest sentence for the top of the page. */
export function headline(themes: Theme[], awarded: number, max: number): string {
  const pct = max > 0 ? Math.round((awarded / max) * 100) : 0;
  const live = themes.filter(t => t.live);
  if (!live.length) return `${awarded}/${max} (${pct}%). Nothing here repeats — the losses are scattered, so work through the marked script itself.`;
  const first = live[0];
  return `${awarded}/${max} (${pct}%). The biggest single thing to fix is **${first.title.toLowerCase()}** — ${first.marks} mark${first.marks === 1 ? '' : 's'} on this paper.`;
}
