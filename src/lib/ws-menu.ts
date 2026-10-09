// /admin/worksheets — the Telegram /ws menu as a page (9 Oct 2026, Adrian: "can we
// create an page interface for /ws command in telegram? put in on admin page").
//
// Pure logic: what the page offers and — the part that matters — the request each
// "Make it" becomes. It is a port of the bot's lib/make.js (`jobBody`, `runInstant`,
// `displayTopics`, `topicFamilies`, `clampCount`), so a job made here is the SAME row
// a tap in Telegram writes and the headless builder cannot tell them apart. The
// sibling test holds the bodies the bot's own function returns; change one side and
// the test says so. SPEC-WORKSHEET-MENU.md is the contract for both.

export type WsKind = 1 | 2 | 3 | 4 | 5;

export const WS_KINDS: { n: WsKind; emoji: string; title: string; gets: string; queued: boolean }[] = [
  { n: 1, emoji: '📘', title: 'Revision worksheet', gets: 'A worked example for each skill, with practice under it.', queued: true },
  { n: 2, emoji: '📗', title: 'Practice with notes', gets: 'Your notes at the front, then practice questions. Takes several topics or a whole chapter.', queued: true },
  { n: 3, emoji: '📄', title: 'Questions only', gets: 'A PDF of past-paper questions with answers. No notes.', queued: false },
  { n: 4, emoji: '➕', title: 'New practice on a sheet I have', gets: 'A copy of one of your own sheets with fresh practice at the end.', queued: true },
  { n: 5, emoji: '📝', title: 'Full prelim paper', gets: 'A whole paper of real past-prelim questions, to the usual pattern.', queued: true },
];
export const isQueued = (kind: number) => WS_KINDS.some((k) => k.n === kind && k.queued);

/** The level tokens the bot sends (its lib/worksheet.js LEVELS), with the page's short labels. */
export const WS_LEVELS: { token: string; label: string; long: string }[] = [
  { token: 'S1', label: 'S1', long: 'Sec 1 Math' },
  { token: 'S2', label: 'S2', long: 'Sec 2 Math' },
  { token: 'S3_EM', label: 'S3 EM', long: 'Sec 3 E Math' },
  { token: 'S3_AM', label: 'S3 AM', long: 'Sec 3 A Math' },
  { token: 'EM', label: 'S4 EM', long: 'O-Level E Math' },
  { token: 'AM', label: 'S4 AM', long: 'O-Level A Math' },
  { token: 'JC', label: 'JC', long: 'JC H2 Math' },
];
export const levelLong = (token: string) => WS_LEVELS.find((l) => l.token === token)?.long ?? token;

/** The papers the prelim builder has a pattern for (the bot's PAPERS). */
export const WS_PAPERS: { key: string; label: string; level: string }[] = [
  { key: 'EM-P1', label: 'S4 E Math · Paper 1', level: 'EM' },
  { key: 'EM-P2', label: 'S4 E Math · Paper 2', level: 'EM' },
  { key: 'AM-P1', label: 'S4 A Math · Paper 1', level: 'AM' },
  { key: 'AM-P2', label: 'S4 A Math · Paper 2', level: 'AM' },
  { key: 'JC-P1', label: 'JC H2 · Paper 1', level: 'JC' },
  { key: 'JC-P2', label: 'JC H2 · Paper 2', level: 'JC' },
];
/** The bot's PRESETS, in plain words. `only` = the one paper a preset is written for. */
export const WS_PRESETS: { key: string; label: string; only?: string }[] = [
  { key: 'standard', label: 'Standard' },
  { key: 'top-school-hard', label: 'Harder, top-school style' },
  { key: 'calculus-forward-am-p2', label: 'More calculus', only: 'AM-P2' },
  { key: 'stats-forward-em-p2', label: 'More statistics', only: 'EM-P2' },
  { key: 'vintage-pre2023', label: 'Older style, before 2023' },
];
export const presetsFor = (paper: string | null | undefined) => WS_PRESETS.filter((p) => !p.only || p.only === paper);

export const WS_DEFAULT_COUNT: Record<WsKind, number | null> = { 1: 8, 2: 8, 3: 8, 4: 8, 5: null };
export const WS_MAX_COUNT: Record<WsKind, number | null> = { 1: 20, 2: 20, 3: 12, 4: 20, 5: null };
/** The most topics one sheet takes — past that it is a paper (kind 5). */
export const WS_MAX_TOPICS = 12;
/** Kinds that pick one question per skill, so a skill can be left out (docs/SKILL-PICK.md). */
export const WS_SKILL_KINDS: ReadonlySet<number> = new Set([2, 3, 4]);
/** What the Telegram menu records as "what was asked" when it is driven by buttons. */
export const WS_REQUESTED_TEXT = '/ws';

export type WsTier = 'mixed' | 'standard' | 'advanced';

export type WsForm = {
  kind: WsKind | null;
  level?: string | null;
  /** canonical topics, in the order they were picked */
  picked?: string[];
  count?: number | null;
  /** kind 3 only: the bank's own label */
  tier?: WsTier | null;
  /** kind 4: the base sheet's file name */
  sheet?: string | null;
  /** kinds 2, 3, 4 with one topic: skills left out */
  skipSkills?: string[];
  paper?: string | null;
  preset?: string | null;
  /** kind 5: canonical topics to leave out */
  exclude?: string[];
  /** kind 3 only: the brand header switch (lib/worksheet-brand); absent/off = the regular format */
  brand?: 'off' | 'colour' | 'mono' | null;
};

/** Clamp a count to the kind's cap; null when the kind takes none (a paper). */
export function clampCount(kind: WsKind, n: unknown): number | null {
  const max = WS_MAX_COUNT[kind];
  if (max == null) return null;
  const v = Math.floor(Number(n));
  if (n == null || !Number.isFinite(v) || v < 1) return WS_DEFAULT_COUNT[kind];
  return Math.min(v, max);
}

const familyOf = (t: string): string | null => { const m = /^(.*?)\s*\(/.exec(String(t || '')); return m ? m[1].trim() : null; };

/** Chapters: any name before a bracket that two or more topics share ("Trigonometry"). */
export function topicFamilies(topics: string[]): { name: string; members: string[] }[] {
  const map = new Map<string, string[]>();
  for (const t of topics || []) {
    const f = familyOf(t);
    if (!f) continue;
    if (!map.has(f)) map.set(f, []);
    map.get(f)!.push(t);
  }
  return [...map].filter(([, m]) => m.length >= 2).map(([name, members]) => ({ name, members }));
}

/**
 * The name a set of topics goes by on the job and the sheet's title: a whole chapter is
 * "Trigonometry (all)", part of one "Trigonometry (Graphs, Ratios)", the rest as they
 * are, joined by " & ". `allTopics` (the level's list) decides what "all" is.
 */
export function displayTopics(picked: string[], allTopics: string[]): string {
  const list = Array.isArray(picked) ? picked : [];
  if (list.length <= 1) return list.join('');
  const known = topicFamilies(allTopics || []);
  const seen = new Set<string>(); const out: string[] = [];
  for (const t of list) {
    if (seen.has(t)) continue;
    const f = familyOf(t);
    const mine = f ? list.filter((x) => familyOf(x) === f) : [t];
    mine.forEach((x) => seen.add(x));
    const fam = f ? known.find((x) => x.name === f) : undefined;
    if (mine.length === 1) out.push(t);
    else if (fam && mine.length === fam.members.length) out.push(`${f} (all)`);
    else out.push(`${f} (${mine.map((x) => (/\(([^)]*)\)\s*$/.exec(x) || [])[1] || x).join(', ')})`);
  }
  return out.join(' & ');
}

/** Type-to-filter: every typed word must appear in the topic's name. */
export function filterTopics(topics: string[], typed: string): string[] {
  const words = String(typed || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return topics;
  return topics.filter((t) => { const l = t.toLowerCase(); return words.every((w) => l.includes(w)); });
}

/** The first thing still missing, in plain words — null when the form can be made. */
export function missing(form: WsForm, allTopics: string[] | null = null): string | null {
  const kind = form.kind;
  if (!kind || !WS_KINDS.some((k) => k.n === kind)) return 'Choose what to make.';
  if (kind === 5) {
    if (!form.paper || !WS_PAPERS.some((p) => p.key === form.paper)) return 'Choose the paper.';
    if (form.preset && !presetsFor(form.paper).some((p) => p.key === form.preset)) return 'That style is not for this paper. Choose another.';
    if (allTopics) { const bad = (form.exclude ?? []).find((t) => !allTopics.includes(t)); if (bad) return `"${bad}" is not a topic of this paper.`; }
    return null;
  }
  if (!form.level || !WS_LEVELS.some((l) => l.token === form.level)) return 'Choose the level.';
  const picked = form.picked ?? [];
  if (!picked.length) return 'Choose a topic.';
  if (picked.length > WS_MAX_TOPICS) return `That is more than ${WS_MAX_TOPICS} topics. A whole paper is the last choice.`;
  if (allTopics) { const bad = picked.find((t) => !allTopics.includes(t)); if (bad) return `"${bad}" is not a topic at this level.`; }
  if (kind === 4 && !String(form.sheet ?? '').trim()) return 'Choose which of your sheets to add practice to.';
  return null;
}

export type WsQueueBody = {
  kind: 1 | 2 | 4 | 5; level: string; topic: string | null;
  params: Record<string, unknown>; requested_by: number | null;
};
export type WsInstantBody = {
  level: string; topic: string; count: number; answers: true;
  topics?: string[]; title?: string; tier?: 'standard' | 'advanced'; skipSkills?: string[];
  /** the brand header switch (kind 3 only; off = absent) — lib/worksheet-brand */
  brand?: 'colour' | 'mono';
};
export type WsRequest =
  | { ok: false; error: string }
  | { ok: true; lane: 'queued'; body: WsQueueBody }
  | { ok: true; lane: 'instant'; body: WsInstantBody };

/**
 * What "Make it" sends. Queued kinds → the POST body for /api/admin/worksheet-jobs,
 * key for key what the bot's `jobBody` builds; kind 3 → the body for
 * /api/bot/worksheet, what the bot's `runInstant` builds. `chatId` is the Telegram
 * chat the finished file is sent to (the bot passes the chat that tapped).
 */
export function buildWsRequest(form: WsForm, allTopics: string[], chatId: number | string | null): WsRequest {
  const error = missing(form, allTopics);
  if (error) return { ok: false, error };
  const kind = form.kind as WsKind;
  const picked = [...new Set(form.picked ?? [])];
  const multi = picked.length > 1 ? picked.slice(0, WS_MAX_TOPICS) : null;
  const topic = multi ? displayTopics(multi, allTopics) : picked[0];
  const skip = WS_SKILL_KINDS.has(kind) && !multi ? [...new Set(form.skipSkills ?? [])].filter(Boolean) : [];

  if (kind === 3) {
    const body: WsInstantBody = { level: form.level as string, topic, count: clampCount(3, form.count) as number, answers: true };
    if (multi) { body.topics = multi; body.title = topic; }
    if (form.tier === 'standard' || form.tier === 'advanced') body.tier = form.tier;
    if (skip.length) body.skipSkills = skip;
    if (form.brand === 'colour' || form.brand === 'mono') body.brand = form.brand;
    return { ok: true, lane: 'instant', body };
  }

  const params: Record<string, unknown> = {};
  if (kind !== 5) params.count = clampCount(kind, form.count);
  if (kind === 4) params.sheet = String(form.sheet).trim();
  if (skip.length) params.skip_skills = skip;
  if (multi) params.topics = multi;
  if (kind === 5) {
    params.paper = form.paper;
    params.preset = form.preset || 'standard';
    if (form.exclude?.length) params.exclude = [...new Set(form.exclude)];
  }
  params.requested_text = WS_REQUESTED_TEXT;
  const level = kind === 5 ? WS_PAPERS.find((p) => p.key === form.paper)!.level : (form.level as string);
  return {
    ok: true, lane: 'queued',
    body: { kind, level, topic: kind === 5 ? null : topic, params, requested_by: Number(chatId) || null },
  };
}

/** One plain sentence saying what will be made — the line above the button. */
export function summaryLine(form: WsForm, allTopics: string[] = []): string {
  const k = WS_KINDS.find((x) => x.n === form.kind);
  if (!k) return '';
  if (form.kind === 5) {
    const p = WS_PAPERS.find((x) => x.key === form.paper);
    if (!p) return '';
    const preset = WS_PRESETS.find((x) => x.key === (form.preset || 'standard'));
    const n = (form.exclude ?? []).length;
    return `A full ${p.label} paper, ${preset ? preset.label.toLowerCase() : 'standard'}, ${n ? `leaving out ${n} topic${n === 1 ? '' : 's'}` : 'all topics'}.`;
  }
  const picked = form.picked ?? [];
  if (!form.level || !picked.length) return '';
  const n = clampCount(form.kind as WsKind, form.count);
  const topic = displayTopics(picked, allTopics) || picked[0];
  const tier = form.kind === 3 && form.tier && form.tier !== 'mixed' ? `, ${form.tier} only` : '';
  const skip = (form.skipSkills ?? []).length && picked.length === 1 && WS_SKILL_KINDS.has(form.kind as number)
    ? `, leaving out ${form.skipSkills!.length} skill${form.skipSkills!.length === 1 ? '' : 's'}` : '';
  const sheet = form.kind === 4 && form.sheet ? ` added to "${String(form.sheet).replace(/\.docx$/i, '')}"` : '';
  return `${k.title}: ${levelLong(form.level)}, ${topic}, ${n} questions${tier}${skip}${sheet}.`;
}

/** A job's state in plain words, for the list under the form. */
export function jobStateLine(j: { status: string; stage?: string | null; error?: string | null; attempts?: number | null; result?: unknown }): { tone: 'wait' | 'work' | 'ok' | 'bad' | 'off'; text: string } {
  const file = j.result && typeof j.result === 'object' ? String((j.result as { docx_path?: unknown }).docx_path ?? '').split('/').pop() : '';
  if (j.status === 'queued') return { tone: 'wait', text: (j.attempts ?? 0) > 0 ? 'Waiting to be tried again' : 'Waiting to start' };
  if (j.status === 'claimed') return { tone: 'work', text: `Being built${j.stage ? `: ${j.stage}` : ''}` };
  if (j.status === 'done') return { tone: 'ok', text: `Sent to Telegram${file ? `: ${file}` : ''}` };
  if (j.status === 'failed') return { tone: 'bad', text: `Failed${j.error ? `: ${String(j.error).slice(0, 140)}` : ''}` };
  if (j.status === 'cancelled') return { tone: 'off', text: 'Stopped' };
  return { tone: 'off', text: j.status };
}
