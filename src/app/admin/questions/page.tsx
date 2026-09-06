'use client';
// /admin/questions — the Question Bank browser (22 Aug 2026).
// Adrian's phone-first replacement for opening Dropbox PDFs: search the bank,
// read any question with its worked solution, or open a whole paper in order.
// Deep links: ?id=<uuid> opens a question, ?school=&year=(&level=&paper=) opens
// a paper — so triage notes, the bleed table and chats can link straight in.

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import 'katex/dist/katex.min.css';
import { ensureAdminSession, loginAdminSession } from '@/lib/admin-client';
import { mathHtml } from '@/lib/math-inline';
import { splitPipeTables } from '@/lib/pipe-tables';
import { assessCoverage } from '@/lib/paper-reconstruction';
import {
  A_MATH_EXAM_TOPICS, EM_OWN_TOPICS, JC_TOPICS, S1_EXAM_TOPICS, S2_EXAM_TOPICS,
} from '@/lib/canonical-topics';

/** Topic options per AI-pick level — flat canonical names (kiosk pool keys). */
const AI_TOPIC_LISTS: Record<string, string[]> = {
  AM: A_MATH_EXAM_TOPICS.flatMap(c => c.topics),
  EM: EM_OWN_TOPICS.flatMap(c => c.topics),
  JC2: JC_TOPICS.flatMap(c => c.topics),
  S1: S1_EXAM_TOPICS.flatMap(c => c.topics),
  S2: S2_EXAM_TOPICS.flatMap(c => c.topics),
};

const C = {
  bg: '#f8fafc', card: '#ffffff', border: '#e2e8f0', muted: '#64748b',
  navy: '#1c3a5e', accent: '#1d4ed8', chipBg: '#eef2ff', good: '#15803d',
  warn: '#b45309', flagBg: '#fffbeb',
};

function MathText({ text }: { text: string }) {
  return <span dangerouslySetInnerHTML={{ __html: mathHtml(text) }} />;
}
/**
 * Question text on screen. Prose keeps its line breaks; a GFM pipe table
 * becomes a real table — the same split the printed paper uses (@/lib/
 * pipe-tables), so a stem cannot read as a table on paper and as literal
 * "| t | 1 | 2 |" rows in the browser (GCE 2022 AM P1 Q2, Adrian).
 */
function MathBlock({ text }: { text: string }) {
  const blocks = splitPipeTables(text);
  if (blocks.length === 1 && blocks[0].kind === 'text') {
    return <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55 }} dangerouslySetInnerHTML={{ __html: mathHtml(text) }} />;
  }
  return (
    <>
      {blocks.map((b, i) => b.kind === 'text'
        ? (b.text.trim()
            ? <div key={i} style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55 }} dangerouslySetInnerHTML={{ __html: mathHtml(b.text) }} />
            : null)
        : (
          // A wide table scrolls inside its own box rather than stretching the
          // question card — data tables run to a dozen columns.
          <div key={i} style={{ overflowX: 'auto', margin: '8px 0' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 14 }}>
              <tbody>
                {/* Row 0 is the header, exactly as the printed paper treats it
                    (<thead>) — anything cleverer here and the same stem would
                    look different on paper and on screen. */}
                {b.rows.map((row, r) => (
                  <tr key={r}>
                    {row.map((cell, c) => (
                      <td key={c} style={{
                        border: '1px solid #cbd5e1', padding: '4px 12px', whiteSpace: 'nowrap',
                        fontWeight: r === 0 ? 600 : 400,
                        background: r === 0 ? '#f8fafc' : '#fff',
                      }}>
                        <span dangerouslySetInnerHTML={{ __html: mathHtml(cell) }} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </>
  );
}

type Card = {
  id: string; excerpt: string; marks: number | null; school: string | null; year: number | null;
  paper: string | null; examType: string | null; qnum: string | null; level: string | null;
  topics: string[]; hasFigure: boolean; aiGenerated: boolean; thumb: string | null;
};
type Part = {
  label?: string; text?: string; marks?: number; answer?: string; solution?: string;
  // image_url_after is a figure that belongs BELOW the part's words; 1.7k parts
  // carry a solution_image (a drawn graph, typically) and nothing drew either.
  image_url?: string; image_url_after?: string; solution_image?: string; subparts?: Part[];
};
type Detail = Card & {
  questionMd: string; parts: Part[]; solution: string | null; answer: string | null;
  difficulty: string | null; sourceFile: string | null; watermarkStatus: string | null;
  images: string[]; solutionImages: string[];
  // Figure edit history depth + which stem figures are queued for a redraw.
  canUndo: number; canRedo: number; flaggedFigures: string[];
};
type PaperMeta = { school: string; year: number; level?: string | null; paper?: string | null; examType?: string | null };
type PaperRow = PaperMeta & {
  count: number;
  marksTotal?: number | null;
  numbered?: number | null;
  coverage?: { status: string; missingMarks: number; label: string } | null;
};

const LEVELS = ['AM', 'EM', 'EM_NA', 'S3_AM', 'S3_EM', 'S3_EM_NA', 'S3_EM_NT', 'S2', 'S1', 'JC2', 'JC1', 'JC2_H1'];

export default function QuestionBankPage() {
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [tab, setTab] = useState<'search' | 'papers'>('search');
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState('');
  const [year, setYear] = useState('');
  const [school, setSchool] = useState('');
  const [results, setResults] = useState<Card[]>([]);
  const [moreOffset, setMoreOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');

  const [papers, setPapers] = useState<PaperRow[]>([]);
  const [papersTotal, setPapersTotal] = useState(0);
  // Tick several papers and print them in one go. Each paper still renders on
  // its OWN request — one PDF per paper, never merged — because a Puppeteer
  // render is ~20s against a 60s function limit, so a server-side batch would
  // time out on the third paper. The client queue also gives honest progress.
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [batch, setBatch] = useState<{
    running: boolean; done: number; total: number; current: string;
    kind: 'paper' | 'solutions';
    results: { label: string; url?: string; count?: number; marksTotal?: number; cached?: boolean; missingSolutions?: number; error?: string }[];
  } | null>(null);

  const [openDetail, setOpenDetail] = useState<Detail | null>(null);
  // Which questions are showing their worked solution, keyed by id — the paper
  // view puts ten questions on screen at once, so one global flag won't do.
  const [solOpen, setSolOpen] = useState<Record<string, boolean>>({});
  // details=1 on open, so every question in a paper arrives COMPLETE — text,
  // parts, figures and solution — and renders in full with no further network.
  const [paperView, setPaperView] = useState<{ meta: PaperMeta; questions: Detail[] } | null>(null);
  const [toast, setToast] = useState('');

  const [mode, setMode] = useState<'text' | 'smart'>('text');
  const [ocrBusy, setOcrBusy] = useState(false);
  const cameraRef = useRef<HTMLInputElement | null>(null);

  const [basket, setBasket] = useState<string[]>([]);
  const [basketOpen, setBasketOpen] = useState(false);
  const [wsAnswers, setWsAnswers] = useState(true);
  const [wsSpace, setWsSpace] = useState(true);

  // 🤖 AI-pick: model-curated basket fill (level+topic → picks with reasons).
  const [aiLevel, setAiLevel] = useState('AM');
  const [aiTopic, setAiTopic] = useState('');
  const [aiCount, setAiCount] = useState(10);
  const [aiInstruction, setAiInstruction] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiPicks, setAiPicks] = useState<{ id: string; reason: string }[]>([]);
  const [wsBusy, setWsBusy] = useState(false);
  const [solBusy, setSolBusy] = useState(false);
  const [solWithQuestions, setSolWithQuestions] = useState(true);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfSpace, setPdfSpace] = useState(true);
  const [pdfAnswerKey, setPdfAnswerKey] = useState(true);
  const [pdfOrigNum, setPdfOrigNum] = useState(true);
  // Append the worked solutions after the paper (and after the answers, when
  // both are on). Off by default — a paper you hand a student must not carry
  // its own solutions.
  const [pdfSolutions, setPdfSolutions] = useState(false);
  const [pdfTitle, setPdfTitle] = useState(''); // prefilled with the auto title on paper open, editable in place
  const [pdfResult, setPdfResult] = useState<{ url: string; count: number; marksTotal: number; cached: boolean } | null>(null);
  const [solResult, setSolResult] = useState<{ url: string; count: number } | null>(null);
  const replaceRef = useRef<HTMLInputElement | null>(null);
  const [replaceTarget, setReplaceTarget] = useState<string | null>(null); // figure URL being replaced
  const [replBusy, setReplBusy] = useState(false);
  const [figBusy, setFigBusy] = useState('');
  const [zipBusy, setZipBusy] = useState(false); // '' | 'clean:<url>' | 'undo' | 'redo' | 'flag:<url>'
  const [cardCache, setCardCache] = useState<Record<string, Card>>({});

  const [students, setStudents] = useState<{ id: string; name: string; level: string }[]>([]);
  const [assignFor, setAssignFor] = useState<Card | null>(null);
  const [assignFilter, setAssignFilter] = useState('');
  const [assignBusy, setAssignBusy] = useState('');

  const cacheCards = useCallback((cards: Card[]) => {
    setCardCache(prev => {
      const next = { ...prev };
      for (const c of cards) next[c.id] = c;
      return next;
    });
  }, []);

  const flash = (t: string) => { setToast(t); setTimeout(() => setToast(''), 1800); };

  const search = useCallback(async (offset = 0) => {
    setLoading(true); setApiError('');
    try {
      const p = new URLSearchParams();
      if (query.trim()) p.set('q', query.trim());
      if (level) p.set('level', level);
      if (year) p.set('year', year);
      if (school) p.set('school', school);
      if (offset) p.set('offset', String(offset));
      let d: { error?: string; results?: Card[] };
      if (mode === 'smart') {
        const r = await fetch('/api/admin/questions', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'semantic', q: query.trim(), level: level || undefined }),
        });
        d = await r.json();
        setMoreOffset(null); // semantic returns one ranked page
      } else {
        const r = await fetch(`/api/admin/questions?${p}`);
        d = await r.json();
        setMoreOffset(((d.results as Card[]) || []).length === 30 ? offset + 30 : null);
      }
      if (d.error) { setApiError(d.error); return; }
      const got = d.results || [];
      cacheCards(got);
      setResults(prev => (offset && mode !== 'smart' ? [...prev, ...got] : got));
    } catch (e) { setApiError((e as Error).message); }
    finally { setLoading(false); }
  }, [query, level, year, school, mode, cacheCards]);

  const loadPapers = useCallback(async () => {
    setLoading(true); setApiError('');
    try {
      const p = new URLSearchParams({ papers: '1' });
      if (level) p.set('level', level);
      if (year) p.set('year', year);
      if (school) p.set('q', school);
      const r = await fetch(`/api/admin/questions?${p}`);
      const d = await r.json();
      if (d.error) { setApiError(d.error); return; }
      setPapers(d.papers || []); setPapersTotal(d.total || 0);
      // A new filter means a new list — a tick left over from the old one would
      // silently print a paper that is no longer on screen.
      setPicked(new Set()); setBatch(null);
    } catch (e) { setApiError((e as Error).message); }
    finally { setLoading(false); }
  }, [level, year, school]);

  // Full details already in hand, keyed by id. Opening a question reads from
  // here first, so a tap paints immediately instead of waiting on a round trip
  // (a paper's questions all land here when the paper opens).
  const detailCache = useRef<Map<string, Detail>>(new Map());
  const rememberDetails = useCallback((ds: Detail[]) => {
    for (const d of ds) if (d && d.id) detailCache.current.set(d.id, d);
  }, []);

  // Warm one question on intent (pointer over the card, or the touch that
  // precedes the tap) — by the time the tap lands the detail is usually home.
  // The in-flight set is what stops a hover and the tap it precedes from
  // firing the same request twice.
  const inFlight = useRef<Set<string>>(new Set());
  const fetchDetail = useCallback(async (id: string): Promise<Detail | null> => {
    const known = detailCache.current.get(id);
    if (known) return known;
    if (inFlight.current.has(id)) return null;
    inFlight.current.add(id);
    try {
      const r = await fetch(`/api/admin/questions?id=${id}`);
      const d = await r.json();
      if (d?.question) {
        detailCache.current.set(id, d.question);
        cacheCards([d.question]);
        return d.question as Detail;
      }
      if (d?.error) flash(d.error);
      return null;
    } catch (e) { flash((e as Error).message); return null; }
    finally { inFlight.current.delete(id); }
  }, [cacheCards]);

  const prefetchQuestion = useCallback((id: string) => {
    if (id) void fetchDetail(id);
  }, [fetchDetail]);

  // The detail card renders at the TOP of the page, so a tap from far down a
  // paper used to look like nothing happened — scroll to it (Adrian, 31 Aug).
  const showDetail = useCallback((d: Detail) => {
    setOpenDetail(d);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const openQuestion = useCallback(async (id: string) => {
    const known = detailCache.current.get(id);
    if (known) { showDetail(known); return; }   // instant
    // A prefetch may already be in flight; poll the cache briefly rather than
    // duplicating the request, then fall back to fetching it ourselves.
    for (let i = 0; i < 20 && inFlight.current.has(id); i++) {
      await new Promise(res => setTimeout(res, 25));
      const arrived = detailCache.current.get(id);
      if (arrived) { showDetail(arrived); return; }
    }
    const d = await fetchDetail(id);
    if (d) showDetail(d);
  }, [fetchDetail, showDetail]);

  const openPaper = useCallback(async (meta: PaperMeta) => {
    setLoading(true);
    try {
      // details=1: the whole paper arrives complete, so every question in it
      // opens with no further network at all.
      const p = new URLSearchParams({ paperView: '1', details: '1', school: meta.school, year: String(meta.year) });
      if (meta.level) p.set('level', meta.level);
      if (meta.paper) p.set('paper', meta.paper);
      if (meta.examType) p.set('exam_type', meta.examType);
      const r = await fetch(`/api/admin/questions?${p}`);
      const d = await r.json();
      if (d.error) { setApiError(d.error); return; }
      cacheCards(d.questions || []);
      rememberDetails(d.questions || []);
      setPaperView({ meta, questions: d.questions || [] });
      // Prefill the print title with the auto title so Adrian edits in place
      // instead of retyping; the API treats it the same either way.
      setPdfTitle([
        `${meta.school} ${meta.year}`, meta.level,
        meta.paper ? `Paper ${String(meta.paper).replace(/^P/i, '')}` : null, meta.examType,
      ].filter(Boolean).join(' · '));
      setPdfResult(null); setSolResult(null);
      setOpenDetail(null);
      window.scrollTo({ top: 0 });
    } catch (e) { setApiError((e as Error).message); }
    finally { setLoading(false); }
  }, [cacheCards, rememberDetails]);

  // Auth + deep links (?id= / ?school=&year=).
  useEffect(() => {
    (async () => {
      if (await ensureAdminSession()) {
        setAuthed(true);
        const p = new URLSearchParams(window.location.search);
        const id = p.get('id');
        const school0 = p.get('school'); const year0 = p.get('year');
        if (id) openQuestion(id);
        else if (school0 && year0) openPaper({ school: school0, year: Number(year0), level: p.get('level'), paper: p.get('paper'), examType: p.get('exam_type') });
        else search(0);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (authed && tab === 'papers') loadPapers(); }, [authed, tab, loadPapers]);

  const login = async () => {
    setAuthLoading(true); setAuthError('');
    if (await loginAdminSession(password)) { setAuthed(true); search(0); }
    else setAuthError('Wrong password');
    setAuthLoading(false);
  };

  const copyLink = (params: string, label: string) => {
    navigator.clipboard?.writeText(`${window.location.origin}/admin/questions?${params}`)
      .then(() => flash(`${label} link copied`))
      .catch(() => flash('Copy failed'));
  };

  const badge = (c: Card) => [c.school, c.year, c.level, c.paper ? `P${String(c.paper).replace(/^P/i, '')}` : null, c.examType]
    .filter(Boolean).join(' · ');

  // ── basket (persisted) ─────────────────────────────────────────────────────
  useEffect(() => {
    try { setBasket(JSON.parse(localStorage.getItem('qb_basket_v1') || '[]')); } catch { /* fresh */ }
  }, []);
  const saveBasket = (ids: string[]) => {
    setBasket(ids);
    try { localStorage.setItem('qb_basket_v1', JSON.stringify(ids)); } catch { /* private mode */ }
  };
  const inBasket = useCallback((qid: string) => basket.includes(qid), [basket]);
  const toggleBasket = (c: Card) => {
    cacheCards([c]);
    if (basket.includes(c.id)) { saveBasket(basket.filter(x => x !== c.id)); flash('Removed from basket'); }
    else if (basket.length >= 20) flash('Basket is full (20 max)');
    else { saveBasket([...basket, c.id]); flash(`In basket (${basket.length + 1})`); }
  };
  const moveInBasket = (qid: string, dir: -1 | 1) => {
    const i = basket.indexOf(qid);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= basket.length) return;
    const next = [...basket];
    [next[i], next[j]] = [next[j], next[i]];
    saveBasket(next);
  };
  // Basket entries can outlive the card cache (reload); backfill lazily.
  useEffect(() => {
    if (!basketOpen) return;
    const missing = basket.filter(qid => !cardCache[qid]);
    if (!missing.length) return;
    (async () => {
      for (const qid of missing.slice(0, 20)) {
        try {
          const r = await fetch(`/api/admin/questions?id=${qid}`);
          const d = await r.json();
          if (d.question) cacheCards([d.question]);
        } catch { /* card stays as id-only row */ }
      }
    })();
  }, [basketOpen, basket, cardCache, cacheCards]);

  // 🤖 AI-pick: server curates from the eligible pool; picks land in the basket
  // (replacing it — the reasons list below maps 1:1 to the new contents).
  const aiPick = async () => {
    if (!aiTopic || aiBusy) return;
    setAiBusy(true); setAiPicks([]);
    try {
      const r = await fetch('/api/admin/questions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ai-pick', level: aiLevel, topic: aiTopic, count: aiCount, instruction: aiInstruction }),
      });
      const d = await r.json();
      if (d.error) { flash(d.error); return; }
      const picks: { id: string; reason: string }[] = d.picks || [];
      saveBasket(picks.map(p => p.id));
      setAiPicks(picks);
      flash(`AI picked ${picks.length} from a pool of ${d.pool}`);
    } catch (e) { flash((e as Error).message); }
    finally { setAiBusy(false); }
  };

  const generateWorksheet = async () => {
    if (!basket.length || wsBusy) return;
    setWsBusy(true);
    try {
      const r = await fetch('/api/admin/questions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'worksheet', ids: basket, answers: wsAnswers, workspace: wsSpace }),
      });
      const d = await r.json();
      if (d.error) { flash(d.error); return; }
      (d.warnings || []).forEach((w: string) => flash(w));
      window.open(d.url, '_blank');
      navigator.clipboard?.writeText(d.url).catch(() => {});
      flash(`Worksheet ready — ${d.count} questions (link copied)`);
    } catch (e) { flash((e as Error).message); }
    finally { setWsBusy(false); }
  };

  const paperKey = (p: PaperRow | PaperMeta) =>
    `${p.school}|${p.year}|${p.level ?? ''}|${p.paper ?? ''}|${p.examType ?? ''}`;
  const paperLabel = (p: PaperRow | PaperMeta) =>
    [`${p.school} ${p.year}`, p.level, p.paper ? `P${String(p.paper).replace(/^P/i, '')}` : null, p.examType]
      .filter(Boolean).join(' · ');
  const togglePick = (p: PaperRow) => setPicked(cur => {
    const next = new Set(cur); const k = paperKey(p);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });

  /** Save every built PDF as one archive. Six links is six saves a browser
   *  will fight you over, and a Blob URL ends in a timestamp — so the archive
   *  is also where the files finally get readable names. */
  const saveAllBuilt = async () => {
    const files = (batch?.results ?? []).filter(r => r.url).map(r => ({ url: r.url!, label: r.label }));
    if (!files.length || zipBusy) return;
    setZipBusy(true);
    try {
      const r = await fetch('/api/admin/questions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'zip-pdfs', files,
          zipName: files.length === 1 ? files[0].label : `${files[0].label.split(' ')[0]} papers`,
        }),
      });
      const d = await r.json();
      if (d.error) { flash(d.error); return; }
      if (d.failed?.length) flash(`${d.failed.length} could not be added`);
      window.location.href = d.url;                 // the browser saves it
      flash(`${d.count} PDFs in ${d.name}`);
    } catch (e) { flash((e as Error).message); }
    finally { setZipBusy(false); }
  };

  /** Build every ticked paper, one request each, in order — as sit-able papers
   *  or as worked solutions. A paper that fails is recorded and the queue
   *  carries on: one bad paper must not cost the other nine their renders. */
  const runBatch = async (kind: 'paper' | 'solutions') => {
    const rows = papers.filter(pp => picked.has(paperKey(pp)));
    if (!rows.length || batch?.running) return;
    setBatch({ running: true, done: 0, total: rows.length, current: '', kind, results: [] });
    const results: NonNullable<typeof batch>['results'] = [];
    for (let i = 0; i < rows.length; i++) {
      const pp = rows[i];
      const label = paperLabel(pp);
      setBatch(b => (b ? { ...b, done: i, current: label } : b));
      try {
        if (kind === 'paper') {
          const r = await fetch('/api/admin/questions', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'paper-pdf', school: pp.school, year: pp.year,
              level: pp.level || undefined, paper: pp.paper || undefined, examType: pp.examType || undefined,
              workingSpace: pdfSpace, answerKey: pdfAnswerKey, originalNumbering: pdfOrigNum,
              solutions: pdfSolutions,
              // No shared title — each paper keeps its own auto title.
            }),
          });
          const d = await r.json();
          if (d.error) results.push({ label, error: d.error });
          else results.push({ label, url: d.url, count: d.count, marksTotal: d.marksTotal, cached: !!d.cached });
        } else {
          // Solutions are addressed by question id, so each paper needs its id
          // list first. Fetched WITHOUT details=1 — the whole paper's parts and
          // solutions would be megabytes the client never looks at.
          const q = new URLSearchParams({ paperView: '1', school: pp.school, year: String(pp.year) });
          if (pp.level) q.set('level', pp.level);
          if (pp.paper) q.set('paper', pp.paper);
          if (pp.examType) q.set('exam_type', pp.examType);
          const lr = await fetch(`/api/admin/questions?${q}`);
          const ld = await lr.json();
          const ids: string[] = ((ld.questions || []) as { id: string }[]).map(x => x.id).filter(Boolean);
          if (ld.error || !ids.length) { results.push({ label, error: ld.error || 'no questions in this paper' }); }
          else {
            const r = await fetch('/api/admin/questions', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'solutions-pdf', ids, title: label, includeQuestions: solWithQuestions }),
            });
            const d = await r.json();
            if (d.error) results.push({ label, error: d.error });
            else results.push({ label, url: d.url, count: d.count, missingSolutions: d.missingSolutions ?? 0 });
          }
        }
      } catch (e) { results.push({ label, error: (e as Error).message }); }
      setBatch(b => (b ? { ...b, results: [...results] } : b));
    }
    setBatch(b => (b ? { ...b, running: false, done: rows.length, current: '' } : b));
  };

  // Reconstructed-paper PDF — the open paper as a sit-able exam paper, with
  // working space / answer key / original-numbering toggles.
  const generatePaperPdf = async () => {
    if (!paperView || pdfBusy) return;
    setPdfBusy(true);
    try {
      const m = paperView.meta;
      const r = await fetch('/api/admin/questions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'paper-pdf', school: m.school, year: m.year,
          level: m.level || undefined, paper: m.paper || undefined, examType: m.examType || undefined,
          workingSpace: pdfSpace, answerKey: pdfAnswerKey, originalNumbering: pdfOrigNum,
          solutions: pdfSolutions,
          title: pdfTitle.trim() || undefined,
        }),
      });
      const d = await r.json();
      if (d.error) { flash(d.error); return; }
      (d.warnings || []).forEach((w: string) => flash(w));
      // No navigation — the result renders as a row in the print card, so the
      // page stays put for the next paper or interaction.
      setPdfResult({ url: d.url, count: d.count, marksTotal: d.marksTotal, cached: !!d.cached });
      navigator.clipboard?.writeText(d.url).catch(() => {});
    } catch (e) { flash((e as Error).message); }
    finally { setPdfBusy(false); }
  };

  // Honest coverage of the open paper, from the same lib the API uses.
  const paperCoverage = useMemo(() => {
    if (!paperView) return null;
    const marks = paperView.questions.reduce(
      (s, c) => s + (typeof c.marks === 'number' && c.marks > 0 ? c.marks : 0), 0);
    return { marks, assessed: assessCoverage(marks, paperView.questions.length, paperView.meta.level) };
  }, [paperView]);

  // Worked-solutions PDF — whole paper (reading order) or the basket selection.
  const generateSolutions = async (ids: string[], title: string) => {
    if (!ids.length || solBusy) return;
    setSolBusy(true);
    try {
      const r = await fetch('/api/admin/questions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'solutions-pdf', ids, title, includeQuestions: solWithQuestions }),
      });
      const d = await r.json();
      if (d.error) { flash(d.error); return; }
      if (d.missingSolutions > 0) flash(`${d.missingSolutions} without a worked solution — [Ans:] printed instead`);
      setSolResult({ url: d.url, count: d.count });
      navigator.clipboard?.writeText(d.url).catch(() => {});
    } catch (e) { flash((e as Error).message); }
    finally { setSolBusy(false); }
  };

  /** Every figure action returns the whole refreshed question, so the client
   *  never patches image URLs by hand (that used to miss canUndo/canRedo). */
  const applyDetail = useCallback((q: Detail | null | undefined) => {
    if (!q) return;
    detailCache.current.set(q.id, q);
    setOpenDetail(cur => (cur && cur.id === q.id ? q : cur));
    setPaperView(pv => (pv && pv.questions.some(x => x.id === q.id)
      ? { ...pv, questions: pv.questions.map(x => (x.id === q.id ? q : x)) } : pv));
  }, []);

  /** clean / undo / redo / flag — one call shape, one busy key. */
  const figureAction = async (
    payload: Record<string, unknown>, busyKey: string, okMsg: (d: Record<string, unknown>) => string,
  ) => {
    if (figBusy) return;
    setFigBusy(busyKey);
    try {
      const r = await fetch('/api/admin/questions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (d.error) { flash(d.error); return; }
      applyDetail(d.question as Detail | undefined);
      flash(okMsg(d));
    } catch (e) { flash((e as Error).message); }
    finally { setFigBusy(''); }
  };

  // ♻️ Replace a stem-level figure: original pixels, no recompression — the
  // API stores it as a new bucket object and repoints this question at it.
  const onReplaceFigurePicked = async (file: File | null) => {
    if (!file || !openDetail || !replaceTarget) return;
    if (file.size > 3_000_000) { flash('Image too big — keep it under 3MB'); return; }
    setReplBusy(true);
    try {
      const dataUrl = await new Promise<string>((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result as string);
        fr.onerror = () => rej(new Error('could not read file'));
        fr.readAsDataURL(file);
      });
      const r = await fetch('/api/admin/questions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'replace-figure', id: openDetail.id, oldUrl: replaceTarget,
          imageBase64: dataUrl.split(',')[1], mediaType: file.type || 'image/png',
        }),
      });
      const d = await r.json();
      if (d.error) { flash(d.error); return; }
      applyDetail(d.question as Detail | undefined);
      flash('Figure replaced — ↩ Undo puts the old one back');
    } catch (e) { flash((e as Error).message); }
    finally { setReplBusy(false); setReplaceTarget(null); }
  };

  // ── camera → OCR → smart search ────────────────────────────────────────────
  const onPhotoPicked = async (file: File | null) => {
    if (!file) return;
    setOcrBusy(true); setApiError('');
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bmp.width * scale);
      canvas.height = Math.round(bmp.height * scale);
      canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
      const r = await fetch('/api/admin/questions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'semantic', imageBase64: dataUrl.split(',')[1], mediaType: 'image/jpeg', level: level || undefined }),
      });
      const d = await r.json();
      if (d.error) { setApiError(d.error); return; }
      setMode('smart');
      if (d.extractedText) setQuery(String(d.extractedText).slice(0, 200));
      cacheCards(d.results || []);
      setResults(d.results || []);
      setPaperView(null); setOpenDetail(null); setTab('search');
      setMoreOffset(null);
      if (!(d.results || []).length) flash('No close match in the bank');
    } catch (e) { setApiError((e as Error).message); }
    finally { setOcrBusy(false); if (cameraRef.current) cameraRef.current.value = ''; }
  };

  // ── assign to student ──────────────────────────────────────────────────────
  const openAssign = async (c: Card) => {
    setAssignFor(c); setAssignFilter('');
    if (!students.length) {
      try {
        const r = await fetch('/api/admin/progress/students');
        const d = await r.json();
        setStudents(d.students || []);
      } catch { flash('Could not load students'); }
    }
  };
  const doAssign = async (studentId: string, studentName: string) => {
    if (!assignFor || assignBusy) return;
    setAssignBusy(studentId);
    try {
      const r = await fetch('/api/admin/assignments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId, kind: 'question', questionId: assignFor.id,
          level: assignFor.level, topic: assignFor.topics[0] || null, tier: null, note: null, dueOn: null,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      flash(`Sent to ${studentName.split(' ')[0]}${j.notified ? ' — Telegram nudge delivered' : ''}`);
      setAssignFor(null);
    } catch (e) { flash((e as Error).message); }
    finally { setAssignBusy(''); }
  };
  const visibleStudents = useMemo(
    () => students.filter(st => st.name.toLowerCase().includes(assignFilter.toLowerCase())),
    [students, assignFilter],
  );

  if (!authed) {
    return (
      <main style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24, width: 340 }}>
          <h1 style={{ fontSize: 18, marginBottom: 12 }}>📚 Question Bank</h1>
          <input
            type="password" value={password} placeholder="Admin password" autoFocus
            onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && login()}
            style={{ width: '100%', padding: 10, fontSize: 16, border: `1px solid ${C.border}`, borderRadius: 8 }}
          />
          {authError && <div style={{ color: '#b91c1c', fontSize: 13, marginTop: 8 }}>{authError}</div>}
          <button onClick={login} disabled={authLoading}
            style={{ marginTop: 12, width: '100%', padding: 10, fontSize: 15, fontWeight: 600, color: '#fff', background: C.navy, border: 'none', borderRadius: 8 }}>
            {authLoading ? '…' : 'Open'}
          </button>
        </div>
      </main>
    );
  }

  const partBlock = (pt: Part, depth = 0, showSol = false) => (
    <div key={`${pt.label}-${depth}-${(pt.text || '').slice(0, 12)}`} style={{ marginLeft: depth * 14, marginTop: 8 }}>
      <div style={{ fontSize: 14.5 }}>
        {pt.label && <strong>{pt.label} </strong>}
        {pt.text && <MathText text={pt.text} />}
        {pt.marks != null && <span style={{ float: 'right', color: C.muted }}>[{pt.marks}]</span>}
      </div>
      {pt.image_url && <img src={pt.image_url} alt="" style={{ maxWidth: '100%', borderRadius: 8, margin: '6px 0' }} />}
      {pt.image_url_after && <img src={pt.image_url_after} alt="" style={{ maxWidth: '100%', borderRadius: 8, margin: '6px 0' }} />}
      {showSol && pt.solution && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '6px 10px', margin: '6px 0', fontSize: 14 }}>
          <MathBlock text={pt.solution} />
        </div>
      )}
      {showSol && pt.solution_image && (
        <img src={pt.solution_image} alt="worked solution" style={{ maxWidth: '100%', borderRadius: 8, margin: '6px 0', display: 'block' }} />
      )}
      {showSol && pt.answer && (
        <div style={{ color: '#843C0C', fontSize: 13.5, margin: '2px 0' }}>Ans: <MathText text={pt.answer} /></div>
      )}
      {(pt.subparts || []).map(sp => partBlock(sp, depth + 1, showSol))}
    </div>
  );

  const isSolOpen = (qid: string) => !!solOpen[qid];
  const toggleSol = (qid: string) => setSolOpen(m => ({ ...m, [qid]: !m[qid] }));
  const solButton = (d: Detail) => (
    <button onClick={() => toggleSol(d.id)}
      style={{ fontSize: 13.5, fontWeight: 600, color: '#fff', background: isSolOpen(d.id) ? C.muted : C.good, border: 'none', borderRadius: 8, padding: '6px 13px', cursor: 'pointer' }}>
      {isSolOpen(d.id) ? 'Hide solution' : '✅ Show solution'}
    </button>
  );

  /** The worked solution, exactly as the detail card has always shown it. */
  const solutionBlock = (d: Detail) => (
    <div style={{ marginTop: 10 }}>
      {d.solution && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: 12, fontSize: 14.5 }}>
          <MathBlock text={d.solution} />
        </div>
      )}
      {(d.solutionImages || []).map(u => <img key={u} src={u} alt="solution" style={{ maxWidth: '100%', borderRadius: 8, margin: '6px 0' }} />)}
      {d.answer && <div style={{ color: '#843C0C', marginTop: 8, fontSize: 14.5 }}>Ans: <MathText text={d.answer} /></div>}
      {!d.solution && !(d.parts || []).some(pt => pt.solution || pt.solution_image) && !d.answer && (
        <div style={{ color: C.muted, fontSize: 13.5, marginTop: 6 }}>No stored solution on this question.</div>
      )}
    </div>
  );

  /** has_image is set but nothing is stored — worth saying out loud on a paper
   *  that is about to be printed, rather than showing a silently figure-less Q. */
  const partsHaveImage = (list: Part[]): boolean =>
    list.some(pt => !!pt.image_url || !!pt.image_url_after || partsHaveImage(pt.subparts || []));
  const figureMissing = (d: Detail) =>
    d.hasFigure && !(d.images || []).length && !partsHaveImage(d.parts || []);

  const detailCard = openDetail && (
    <section style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, marginBottom: 14 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 6 }}>
        <strong style={{ fontSize: 16 }}>Q{openDetail.qnum ?? '?'}</strong>
        <button onClick={() => openPaper({ school: openDetail.school!, year: openDetail.year!, level: openDetail.level, paper: openDetail.paper, examType: openDetail.examType })}
          disabled={!openDetail.school || !openDetail.year}
          style={{ fontSize: 12.5, color: C.accent, background: C.chipBg, border: 'none', borderRadius: 999, padding: '3px 10px', cursor: 'pointer' }}>
          {badge(openDetail) || 'no paper metadata'}
        </button>
        {openDetail.marks != null && <span style={{ color: C.muted, fontSize: 13 }}>{openDetail.marks} marks</span>}
        {openDetail.aiGenerated && <span style={{ fontSize: 11.5, color: C.warn }}>AI-generated</span>}
        {openDetail.watermarkStatus && openDetail.watermarkStatus !== 'clean' && openDetail.watermarkStatus !== 'no_image' && (
          <span style={{ fontSize: 11.5, color: C.warn, background: C.flagBg, borderRadius: 6, padding: '1px 6px' }}>image: {openDetail.watermarkStatus ?? 'unscanned'}</span>
        )}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => toggleBasket(openDetail)} style={{ fontSize: 12.5, border: `1px solid ${inBasket(openDetail.id) ? C.accent : C.border}`, background: inBasket(openDetail.id) ? C.chipBg : '#fff', color: inBasket(openDetail.id) ? C.accent : '#111', borderRadius: 8, padding: '3px 9px', cursor: 'pointer' }}>{inBasket(openDetail.id) ? '🧺 In basket' : '🧺 Basket'}</button>
          <button onClick={() => openAssign(openDetail)} style={{ fontSize: 12.5, border: `1px solid ${C.border}`, background: '#fff', borderRadius: 8, padding: '3px 9px', cursor: 'pointer' }}>📬 Assign</button>
          {/* Figure edits are non-destructive at the storage layer — the old
              bucket object is never deleted — so undo is just a repoint. */}
          {(openDetail.canUndo > 0 || openDetail.canRedo > 0) && (
            <>
              <button onClick={() => figureAction({ action: 'undo-figure', id: openDetail.id }, 'undo', () => 'Figure reverted')}
                disabled={!openDetail.canUndo || !!figBusy} title={`${openDetail.canUndo} figure edit${openDetail.canUndo === 1 ? '' : 's'} to undo`}
                style={{ fontSize: 12.5, border: `1px solid ${C.border}`, background: '#fff', borderRadius: 8, padding: '3px 9px', cursor: openDetail.canUndo ? 'pointer' : 'default', opacity: openDetail.canUndo && !figBusy ? 1 : 0.4 }}>
                {figBusy === 'undo' ? '…' : '↩ Undo'}
              </button>
              <button onClick={() => figureAction({ action: 'redo-figure', id: openDetail.id }, 'redo', () => 'Figure re-applied')}
                disabled={!openDetail.canRedo || !!figBusy} title={`${openDetail.canRedo} undone edit${openDetail.canRedo === 1 ? '' : 's'} to redo`}
                style={{ fontSize: 12.5, border: `1px solid ${C.border}`, background: '#fff', borderRadius: 8, padding: '3px 9px', cursor: openDetail.canRedo ? 'pointer' : 'default', opacity: openDetail.canRedo && !figBusy ? 1 : 0.4 }}>
                {figBusy === 'redo' ? '…' : '↪ Redo'}
              </button>
            </>
          )}
          <button onClick={() => copyLink(`id=${openDetail.id}`, 'Question')} style={{ fontSize: 12.5, border: `1px solid ${C.border}`, background: '#fff', borderRadius: 8, padding: '3px 9px', cursor: 'pointer' }}>🔗 Copy link</button>
          <button onClick={() => setOpenDetail(null)} style={{ fontSize: 12.5, border: `1px solid ${C.border}`, background: '#fff', borderRadius: 8, padding: '3px 9px', cursor: 'pointer' }}>✕ Close</button>
        </span>
      </div>
      {openDetail.images.map(u => {
        const flagged = openDetail.flaggedFigures.includes(u);
        const tool = (label: string, on: () => void, busy: boolean, extra: React.CSSProperties = {}) => (
          <button onClick={on} disabled={replBusy || !!figBusy}
            style={{ fontSize: 11.5, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,.94)', borderRadius: 6, padding: '2px 8px', cursor: 'pointer', opacity: replBusy || figBusy ? 0.6 : 1, ...extra }}>
            {busy ? '…' : label}
          </button>
        );
        return (
          <div key={u} style={{ position: 'relative', margin: '6px 0' }}>
            <img src={u} alt="figure" style={{ maxWidth: '100%', borderRadius: 8, display: 'block' }} />
            <span style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 5 }}>
              {/* A clean only lifts the white point — it moves no geometry, so
                  it is safe on any scan. A redraw could change what the
                  question asks, so it QUEUES for a person, never runs here. */}
              {tool('✨ Clean', () => figureAction(
                { action: 'clean-figure', id: openDetail.id, url: u }, `clean:${u}`,
                d => d.alreadyClean ? 'Already as clean as a lift can make it' : `Cleaned (white point ${d.whitePoint}) — ↩ Undo reverts it`,
              ), figBusy === `clean:${u}`)}
              {tool(flagged ? '🚩 Queued' : '🚩 Redraw', () => figureAction(
                { action: 'flag-redraw', id: openDetail.id, url: u, flag: !flagged }, `flag:${u}`,
                () => flagged ? 'Removed from the redraw queue' : 'Queued for redraw',
              ), figBusy === `flag:${u}`, flagged ? { borderColor: C.warn, color: C.warn, background: C.flagBg } : {})}
              {tool(replBusy && replaceTarget === u ? 'Uploading…' : '♻️ Replace',
                () => { setReplaceTarget(u); replaceRef.current?.click(); }, false)}
            </span>
          </div>
        );
      })}
      <input
        ref={replaceRef} type="file" accept="image/png,image/jpeg,image/webp" hidden
        onChange={e => { const f = e.target.files?.[0] ?? null; e.target.value = ''; onReplaceFigurePicked(f); }}
      />
      {figureMissing(openDetail) && (
        <div style={{ fontSize: 12.5, color: C.warn, background: C.flagBg, borderRadius: 8, padding: '4px 9px', margin: '6px 0' }}>
          🖼 figure flagged on this question but not stored in the bank
        </div>
      )}
      <div style={{ fontSize: 15, lineHeight: 1.55 }}><MathBlock text={openDetail.questionMd} /></div>
      {openDetail.parts.map(pt => partBlock(pt, 0, isSolOpen(openDetail.id)))}
      <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {solButton(openDetail)}
        {openDetail.topics.map(t => <span key={t} style={{ fontSize: 12, color: C.muted, background: C.bg, borderRadius: 999, padding: '2px 9px' }}>{t}</span>)}
      </div>
      {isSolOpen(openDetail.id) && solutionBlock(openDetail)}
    </section>
  );

  return (
    <main style={{ minHeight: '100vh', background: C.bg, padding: '14px 12px 60px', maxWidth: 760, margin: '0 auto' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>📚 Question Bank</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {(['search', 'papers'] as const).map(t => (
            <button key={t} onClick={() => { setTab(t); setPaperView(null); }}
              style={{ fontSize: 13.5, fontWeight: 600, padding: '6px 12px', borderRadius: 999, border: `1px solid ${tab === t ? C.navy : C.border}`, background: tab === t ? C.navy : '#fff', color: tab === t ? '#fff' : '#111', cursor: 'pointer' }}>
              {t === 'search' ? '🔎 Search' : '📄 Papers'}
            </button>
          ))}
        </div>
      </header>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {tab === 'search' && (
          <div style={{ flex: '1 1 100%', display: 'flex', gap: 6 }}>
            <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && search(0)}
              placeholder={mode === 'smart' ? 'Describe the question — "ladder against wall trig"…' : 'Search question text or school…'} inputMode="search"
              style={{ flex: 1, padding: '10px 12px', fontSize: 16, border: `1px solid ${C.border}`, borderRadius: 10 }} />
            <button onClick={() => cameraRef.current?.click()} disabled={ocrBusy} title="Snap a question to find it"
              style={{ padding: '0 12px', fontSize: 18, border: `1px solid ${C.border}`, background: '#fff', borderRadius: 10, cursor: 'pointer' }}>
              {ocrBusy ? '…' : '📷'}
            </button>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden
              onChange={e => onPhotoPicked(e.target.files?.[0] ?? null)} />
          </div>
        )}
        {tab === 'search' && (
          <div style={{ display: 'flex', gap: 4 }}>
            {(['text', 'smart'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)}
                style={{ fontSize: 12.5, fontWeight: 600, padding: '5px 11px', borderRadius: 999, border: `1px solid ${mode === m ? C.accent : C.border}`, background: mode === m ? C.chipBg : '#fff', color: mode === m ? C.accent : '#374151', cursor: 'pointer' }}>
                {m === 'text' ? 'Text' : '✨ Smart'}
              </button>
            ))}
          </div>
        )}
        <select value={level} onChange={e => setLevel(e.target.value)} style={{ padding: 8, fontSize: 14, border: `1px solid ${C.border}`, borderRadius: 8 }}>
          <option value="">All levels</option>
          {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <input value={year} onChange={e => setYear(e.target.value)} placeholder="Year" inputMode="numeric"
          style={{ width: 76, padding: 8, fontSize: 14, border: `1px solid ${C.border}`, borderRadius: 8 }} />
        <input value={school} onChange={e => setSchool(e.target.value)} placeholder="School"
          style={{ flex: 1, minWidth: 110, padding: 8, fontSize: 14, border: `1px solid ${C.border}`, borderRadius: 8 }} />
        {/* A new search must also CLOSE any open paper — the result lists are
            gated behind !paperView, so without this Go fetched into a hidden
            list and looked dead (Adrian, 2026-08-29). */}
        <button onClick={() => { setPaperView(null); if (tab === 'search') search(0); else loadPapers(); }} disabled={loading}
          style={{ padding: '8px 16px', fontSize: 14, fontWeight: 600, color: '#fff', background: C.accent, border: 'none', borderRadius: 8, cursor: 'pointer' }}>
          {loading ? '…' : 'Go'}
        </button>
      </div>

      {apiError && <div style={{ color: '#b91c1c', fontSize: 13.5, marginBottom: 8 }}>{apiError}</div>}
      {toast && <div style={{ position: 'fixed', bottom: 18, left: '50%', transform: 'translateX(-50%)', background: '#111', color: '#fff', fontSize: 13.5, borderRadius: 999, padding: '8px 16px', zIndex: 50 }}>{toast}</div>}

      {detailCard}

      {paperView && (
        <section style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <h2 style={{ fontSize: 16.5, fontWeight: 700 }}>
              {paperView.meta.school} · {paperView.meta.year}
              {paperView.meta.level ? ` · ${paperView.meta.level}` : ''}{paperView.meta.paper ? ` · P${String(paperView.meta.paper).replace(/^P/i, '')}` : ''}
              {paperView.meta.examType ? ` · ${paperView.meta.examType}` : ''}
            </h2>
            <span style={{ color: C.muted, fontSize: 13 }}>
              {paperView.questions.length} questions{paperCoverage ? ` · ${paperCoverage.marks} marks` : ''}
            </span>
            {paperCoverage && paperCoverage.assessed.status !== 'complete' && paperCoverage.assessed.label && (
              <span style={{ color: C.warn, background: C.flagBg, fontSize: 12, borderRadius: 6, padding: '1px 7px' }}>
                ⚠ {paperCoverage.assessed.label}
              </span>
            )}
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button onClick={() => copyLink(`school=${encodeURIComponent(paperView.meta.school)}&year=${paperView.meta.year}${paperView.meta.level ? `&level=${paperView.meta.level}` : ''}${paperView.meta.paper ? `&paper=${paperView.meta.paper}` : ''}`, 'Paper')}
                style={{ fontSize: 12.5, border: `1px solid ${C.border}`, background: '#fff', borderRadius: 8, padding: '3px 9px', cursor: 'pointer' }}>🔗 Copy link</button>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: C.muted, cursor: 'pointer' }}>
                <input type="checkbox" checked={solWithQuestions} onChange={e => setSolWithQuestions(e.target.checked)} />
                with questions
              </label>
              <button
                onClick={() => generateSolutions(
                  paperView.questions.map(q => q.id),
                  `${paperView.meta.school} ${paperView.meta.year}${paperView.meta.paper ? ` P${String(paperView.meta.paper).replace(/^P/i, '')}` : ''}`,
                )}
                disabled={solBusy}
                style={{ fontSize: 12.5, border: `1px solid ${C.border}`, background: '#fff', borderRadius: 8, padding: '3px 9px', cursor: 'pointer', opacity: solBusy ? 0.6 : 1 }}>
                {solBusy ? 'Building…' : '📄 Solutions PDF'}
              </button>
              <button onClick={() => {
                const open = paperView.questions.every(q => solOpen[q.id]);
                setSolOpen(m => {
                  const next = { ...m };
                  for (const q of paperView.questions) next[q.id] = !open;
                  return next;
                });
              }} style={{ fontSize: 12.5, border: `1px solid ${C.border}`, background: '#fff', borderRadius: 8, padding: '3px 9px', cursor: 'pointer' }}>
                {paperView.questions.length > 0 && paperView.questions.every(q => solOpen[q.id]) ? '🙈 Hide solutions' : '✅ All solutions'}
              </button>
              {/* "Close paper" is also the way BACK to whatever list you came
                  from — the result lists are gated behind !paperView — so it
                  says so (Adrian, 31 Aug). */}
              <button onClick={() => setPaperView(null)} style={{ fontSize: 12.5, border: `1px solid ${C.border}`, background: '#fff', borderRadius: 8, padding: '3px 9px', cursor: 'pointer' }}>
                {tab === 'papers' ? '← Back to papers' : results.length ? '← Back to results' : '✕ Close paper'}
              </button>
            </span>
          </div>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '8px 10px', marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>
              🖨 Print this paper
              <span style={{ fontWeight: 400, color: C.muted, marginLeft: 6 }}>the full paper as a sit-able PDF — questions in order, with figures</span>
            </div>
            <input
              type="text" value={pdfTitle} onChange={e => setPdfTitle(e.target.value)}
              placeholder={[
                `${paperView.meta.school} ${paperView.meta.year}`, paperView.meta.level,
                paperView.meta.paper ? `Paper ${String(paperView.meta.paper).replace(/^P/i, '')}` : null, paperView.meta.examType,
              ].filter(Boolean).join(' · ')}
              style={{ width: '100%', marginTop: 6, fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 8, padding: '5px 9px' }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
              {([
                ['working space', pdfSpace, setPdfSpace],
                ['original numbering', pdfOrigNum, setPdfOrigNum],
                ['answers at the end', pdfAnswerKey, setPdfAnswerKey],
                ['full solutions at the end', pdfSolutions, setPdfSolutions],
              ] as const).map(([label, val, set]) => (
                <label key={label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12.5, color: '#374151', cursor: 'pointer' }}>
                  <input type="checkbox" checked={val} onChange={e => set(e.target.checked)} />
                  {label}
                </label>
              ))}
              <button onClick={generatePaperPdf} disabled={pdfBusy}
                style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 600, color: '#fff', background: C.navy, border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', opacity: pdfBusy ? 0.6 : 1 }}>
                {pdfBusy ? 'Building…' : '⬇️ Paper PDF'}
              </button>
            </div>
            {pdfResult && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '6px 10px', fontSize: 13 }}>
                <span>✅ Paper ready — {pdfResult.count} questions · {pdfResult.marksTotal} marks{pdfResult.cached ? ' · instant (cached)' : ''} · link copied</span>
                <a href={pdfResult.url} target="_blank" rel="noopener noreferrer"
                  style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 600, color: '#fff', background: '#15803d', borderRadius: 8, padding: '4px 12px', textDecoration: 'none' }}>
                  Open PDF ↗
                </a>
              </div>
            )}
            {solResult && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '6px 10px', fontSize: 13 }}>
                <span>✅ Solutions ready — {solResult.count} question{solResult.count === 1 ? '' : 's'} · link copied</span>
                <a href={solResult.url} target="_blank" rel="noopener noreferrer"
                  style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 600, color: '#fff', background: '#15803d', borderRadius: 8, padding: '4px 12px', textDecoration: 'none' }}>
                  Open PDF ↗
                </a>
              </div>
            )}
          </div>
          {/* The whole question, figures and all — this is the sit-able paper on
              screen, not an index of it. Everything here is already in memory
              from the details=1 open, so it costs no network (Adrian, 31 Aug). */}
          {paperView.questions.map(c => (
            <section key={c.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px', marginBottom: 10 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 4 }}>
                <strong style={{ fontSize: 15.5 }}>Q{c.qnum ?? '?'}</strong>
                {c.marks != null && <span style={{ color: C.muted, fontSize: 12.5 }}>[{c.marks}]</span>}
                {c.topics.map(t => (
                  <span key={t} style={{ fontSize: 11.5, color: C.muted, background: C.bg, borderRadius: 999, padding: '1px 8px' }}>{t}</span>
                ))}
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                  <button onClick={() => toggleBasket(c)}
                    style={{ fontSize: 12, border: 'none', background: 'none', color: inBasket(c.id) ? C.accent : C.muted, cursor: 'pointer' }}>
                    {inBasket(c.id) ? '🧺 ✓' : '🧺 +'}
                  </button>
                  <button onClick={() => openQuestion(c.id)} title="Open on its own — assign, replace figure, copy link"
                    style={{ fontSize: 12, border: `1px solid ${C.border}`, background: '#fff', borderRadius: 8, padding: '2px 8px', cursor: 'pointer' }}>⤢ Open</button>
                </span>
              </div>
              {figureMissing(c) && (
                <div style={{ fontSize: 12.5, color: C.warn, background: C.flagBg, borderRadius: 8, padding: '4px 9px', margin: '6px 0' }}>
                  🖼 figure flagged on this question but not stored in the bank
                </div>
              )}
              {(c.images || []).map(u => (
                <img key={u} src={u} alt="figure" loading="lazy" style={{ maxWidth: '100%', borderRadius: 8, margin: '6px 0', display: 'block' }} />
              ))}
              {c.questionMd && <div style={{ fontSize: 14.5, lineHeight: 1.55 }}><MathBlock text={c.questionMd} /></div>}
              {(c.parts || []).map(pt => partBlock(pt, 0, isSolOpen(c.id)))}
              <div style={{ marginTop: 10 }}>{solButton(c)}</div>
              {isSolOpen(c.id) && solutionBlock(c)}
            </section>
          ))}
        </section>
      )}

      {!paperView && tab === 'search' && (
        <section>
          {results.map(c => (
            <div key={c.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 12px', marginBottom: 8 }}>
              <button onClick={() => openQuestion(c.id)}
                onPointerEnter={() => prefetchQuestion(c.id)}
                onTouchStart={() => prefetchQuestion(c.id)}
                style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
                <div style={{ fontSize: 14.5, color: '#111' }}><MathText text={c.excerpt} /></div>
                {/* The API has always sent a thumb; nothing ever drew it. */}
                {c.thumb && (
                  <img src={c.thumb} alt="" loading="lazy"
                    style={{ maxHeight: 110, maxWidth: '100%', borderRadius: 8, marginTop: 6, display: 'block' }} />
                )}
              </button>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
                <button onClick={() => c.school && c.year && openPaper({ school: c.school, year: c.year, level: c.level, paper: c.paper, examType: c.examType })}
                  style={{ fontSize: 12, color: C.accent, background: C.chipBg, border: 'none', borderRadius: 999, padding: '2px 9px', cursor: 'pointer' }}>
                  {badge(c) || (c.aiGenerated ? 'AI-generated (bank)' : 'no paper')}
                </button>
                {c.qnum && <span style={{ fontSize: 12, color: C.muted }}>Q{c.qnum}</span>}
                {c.marks != null && <span style={{ fontSize: 12, color: C.muted }}>[{c.marks}]</span>}
                {c.hasFigure && <span style={{ fontSize: 12 }}>🖼</span>}
                <button onClick={() => toggleBasket(c)}
                  style={{ marginLeft: 'auto', fontSize: 12, border: 'none', background: 'none', color: inBasket(c.id) ? C.accent : C.muted, cursor: 'pointer' }}>
                  {inBasket(c.id) ? '🧺 ✓' : '🧺 +'}
                </button>
              </div>
            </div>
          ))}
          {results.length === 0 && !loading && <div style={{ color: C.muted, fontSize: 14, padding: 20, textAlign: 'center' }}>No matches — try fewer words, or switch to ✨ Smart (searches by meaning, not exact words).</div>}
          {moreOffset != null && (
            <button onClick={() => search(moreOffset)} disabled={loading}
              style={{ width: '100%', padding: 10, fontSize: 14, border: `1px dashed ${C.border}`, background: '#fff', borderRadius: 10, cursor: 'pointer' }}>
              {loading ? '…' : 'Load 30 more'}
            </button>
          )}
        </section>
      )}

      {!paperView && tab === 'papers' && (
        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
            <span style={{ color: C.muted, fontSize: 13 }}>{papersTotal} papers reconstructed from the bank{papersTotal > 400 ? ' (showing 400 — filter to narrow)' : ''}</span>
            {papers.length > 0 && (
              <button onClick={() => setPicked(cur => cur.size === papers.length ? new Set() : new Set(papers.map(paperKey)))}
                style={{ marginLeft: 'auto', fontSize: 12.5, border: `1px solid ${C.border}`, background: '#fff', borderRadius: 8, padding: '3px 10px', cursor: 'pointer' }}>
                {picked.size === papers.length ? 'Select none' : `Select all ${papers.length}`}
              </button>
            )}
          </div>

          {/* Batch print bar — appears once anything is ticked. */}
          {picked.size > 0 && (
            <div style={{ background: C.card, border: `1px solid ${C.accent}`, borderRadius: 12, padding: '10px 12px', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 14.5 }}>{picked.size} paper{picked.size === 1 ? '' : 's'} selected</strong>
                <span style={{ color: C.muted, fontSize: 12.5 }}>one PDF each — they are not merged</span>
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                  <button onClick={() => setPicked(new Set())} disabled={batch?.running}
                    style={{ fontSize: 12.5, border: `1px solid ${C.border}`, background: '#fff', borderRadius: 8, padding: '4px 10px', cursor: 'pointer' }}>Clear</button>
                  <button onClick={() => runBatch('solutions')} disabled={!!batch?.running}
                    style={{ fontSize: 13.5, fontWeight: 600, border: `1px solid ${C.border}`, background: '#fff', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', opacity: batch?.running ? 0.6 : 1 }}>
                    {batch?.running && batch.kind === 'solutions' ? `Building ${batch.done + 1}/${batch.total}…` : `📄 Solutions only`}
                  </button>
                  <button onClick={() => runBatch('paper')} disabled={!!batch?.running}
                    style={{ fontSize: 13.5, fontWeight: 600, color: '#fff', background: C.navy, border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', opacity: batch?.running ? 0.6 : 1 }}>
                    {batch?.running && batch.kind === 'paper' ? `Building ${batch.done + 1}/${batch.total}…` : `🖨 Build ${picked.size} paper${picked.size === 1 ? '' : 's'}`}
                  </button>
                </span>
              </div>
              <div style={{ marginTop: 10, fontSize: 12.5, color: '#374151' }}>
                <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ color: C.muted, width: 132 }}>At the end of each:</span>
                  {([['answers', pdfAnswerKey, setPdfAnswerKey],
                     ['full solutions', pdfSolutions, setPdfSolutions]] as const).map(([lbl, val, set]) => (
                    <label key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                      <input type="checkbox" checked={val} onChange={e => set(e.target.checked)} disabled={batch?.running} />{lbl}
                    </label>
                  ))}
                  <span style={{ color: C.muted, fontSize: 12 }}>
                    {pdfAnswerKey && pdfSolutions ? '→ paper, then answers, then solutions'
                      : pdfSolutions ? '→ paper, then solutions'
                      : pdfAnswerKey ? '→ paper, then an answer key'
                      : '→ questions only'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', marginTop: 5 }}>
                  <span style={{ color: C.muted, width: 132 }}>Paper layout:</span>
                  {([['working space', pdfSpace, setPdfSpace],
                     ['original numbering', pdfOrigNum, setPdfOrigNum]] as const).map(([lbl, val, set]) => (
                    <label key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                      <input type="checkbox" checked={val} onChange={e => set(e.target.checked)} disabled={batch?.running} />{lbl}
                    </label>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', marginTop: 5 }}>
                  <span style={{ color: C.muted, width: 132 }}>Solutions-only doc:</span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                    <input type="checkbox" checked={solWithQuestions} onChange={e => setSolWithQuestions(e.target.checked)} disabled={batch?.running} />repeat each question above its solution
                  </label>
                </div>
              </div>
              {batch?.running && (
                <div style={{ marginTop: 8, fontSize: 12.5, color: C.muted }}>
                  {batch.current} — a fresh render takes ~20s; one already built comes back instantly.
                </div>
              )}
            </div>
          )}

          {/* Results — one row per paper, each its own PDF. */}
          {batch && batch.results.length > 0 && (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: '10px 12px', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                <strong style={{ fontSize: 14 }}>
                  {batch.running
                    ? `Built ${batch.results.length} of ${batch.total}`
                    : `Done — ${batch.results.filter(r => r.url).length} of ${batch.total} ${batch.kind === 'paper' ? 'paper' : 'solutions'} PDFs`}
                </strong>
                {!batch.running && batch.results.some(r => r.url) && (
                  <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                    <button onClick={() => {
                      navigator.clipboard?.writeText(batch.results.filter(r => r.url).map(r => `${r.label}\n${r.url}`).join('\n\n'))
                        .then(() => flash('Links copied — paste them into a message or a doc')).catch(() => flash('Copy failed'));
                    }} title="Copies the web links as text. Nothing is downloaded."
                      style={{ fontSize: 12.5, border: `1px solid ${C.border}`, background: '#fff', borderRadius: 8, padding: '3px 10px', cursor: 'pointer' }}>🔗 Copy links</button>
                    <button onClick={saveAllBuilt} disabled={zipBusy}
                      title="Downloads every PDF as one zip, each named after its paper"
                      style={{ fontSize: 12.5, fontWeight: 600, color: '#fff', background: '#15803d', border: 'none', borderRadius: 8, padding: '3px 12px', cursor: 'pointer', opacity: zipBusy ? 0.6 : 1 }}>
                      {zipBusy ? 'Zipping…' : '⬇ Save all'}
                    </button>
                  </span>
                )}
              </div>
              {batch.results.map((r, i) => (
                <div key={`${r.label}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '3px 0', flexWrap: 'wrap' }}>
                  <span style={{ color: r.error ? '#b91c1c' : '#111' }}>{r.error ? '✗' : '✓'} {r.label}</span>
                  {r.error
                    ? <span style={{ color: '#b91c1c', fontSize: 12.5 }}>{r.error}</span>
                    : <span style={{ color: C.muted, fontSize: 12.5 }}>
                        {r.count} q{r.marksTotal != null ? ` · ${r.marksTotal} marks` : ''}
                        {r.missingSolutions ? ` · ${r.missingSolutions} without a worked solution` : ''}
                        {r.cached ? ' · instant (already built)' : ''}
                      </span>}
                  {r.url && (
                    <a href={r.url} target="_blank" rel="noopener noreferrer"
                      style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 600, color: '#fff', background: '#15803d', borderRadius: 8, padding: '3px 10px', textDecoration: 'none' }}>Open PDF ↗</a>
                  )}
                </div>
              ))}
            </div>
          )}

          {papers.map(pp => (
            <div key={paperKey(pp)}
              style={{ display: 'flex', gap: 10, alignItems: 'center', background: C.card, border: `1px solid ${picked.has(paperKey(pp)) ? C.accent : C.border}`, borderRadius: 12, padding: '10px 12px', marginBottom: 8 }}>
            <input type="checkbox" checked={picked.has(paperKey(pp))} onChange={() => togglePick(pp)}
              aria-label={`select ${paperLabel(pp)}`} style={{ width: 17, height: 17, cursor: 'pointer', flexShrink: 0 }} />
            <button onClick={() => openPaper(pp)}
              style={{ display: 'flex', gap: 10, alignItems: 'baseline', flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
              <strong style={{ fontSize: 14.5 }}>{pp.school}</strong>
              <span style={{ color: C.muted, fontSize: 13 }}>{pp.year} · {pp.level}{pp.paper ? ` · P${String(pp.paper).replace(/^P/i, '')}` : ''}{pp.examType ? ` · ${pp.examType}` : ''}</span>
              <span style={{ marginLeft: 'auto', textAlign: 'right' }}>
                <span style={{ color: C.muted, fontSize: 12.5 }}>
                  {pp.count} q{pp.marksTotal != null && pp.marksTotal > 0 ? ` · ${pp.marksTotal} marks` : ''}
                </span>
                {pp.coverage && (pp.coverage.status === 'partial' || pp.coverage.status === 'overfull') && (
                  <span style={{ display: 'block', color: C.warn, fontSize: 11.5 }}>
                    ⚠ {pp.coverage.status === 'partial' ? `partial — ${pp.coverage.missingMarks} marks missing` : `${pp.coverage.missingMarks} marks over-full`}
                  </span>
                )}
              </span>
            </button>
            </div>
          ))}
        </section>
      )}
      {basket.length > 0 && !basketOpen && (
        <button onClick={() => setBasketOpen(true)}
          style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 40, display: 'flex', gap: 8, alignItems: 'center', background: C.navy, color: '#fff', border: 'none', borderRadius: 999, padding: '10px 18px', fontSize: 14.5, fontWeight: 600, boxShadow: '0 4px 14px rgba(0,0,0,.25)', cursor: 'pointer' }}>
          🧺 {basket.length} · View basket
        </button>
      )}

      {basketOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 45, background: 'rgba(15,23,42,.45)' }} onClick={() => setBasketOpen(false)}>
          <div onClick={e => e.stopPropagation()}
            style={{ position: 'absolute', bottom: 0, left: 0, right: 0, maxHeight: '80vh', overflowY: 'auto', background: C.bg, borderRadius: '16px 16px 0 0', padding: '14px 14px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <strong style={{ fontSize: 16 }}>🧺 Worksheet basket · {basket.length}</strong>
              <button onClick={() => saveBasket([])} style={{ fontSize: 12.5, color: '#b91c1c', border: 'none', background: 'none', cursor: 'pointer' }}>Clear</button>
              <button onClick={() => setBasketOpen(false)} style={{ marginLeft: 'auto', fontSize: 13, border: `1px solid ${C.border}`, background: '#fff', borderRadius: 8, padding: '4px 10px', cursor: 'pointer' }}>✕</button>
            </div>
            {basket.map((qid, i) => {
              const c = cardCache[qid];
              return (
                <div key={qid} style={{ display: 'flex', gap: 8, alignItems: 'center', background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '8px 10px', marginBottom: 6 }}>
                  <span style={{ color: C.muted, fontSize: 13, width: 18 }}>{i + 1}.</span>
                  <button onClick={() => { setBasketOpen(false); openQuestion(qid); }}
                    style={{ flex: 1, textAlign: 'left', border: 'none', background: 'none', fontSize: 13.5, cursor: 'pointer', padding: 0 }}>
                    {c ? <MathText text={c.excerpt.slice(0, 90)} /> : `${qid.slice(0, 8)}…`}
                  </button>
                  {c && <button onClick={() => openAssign(c)} style={{ fontSize: 13, border: 'none', background: 'none', cursor: 'pointer' }}>📬</button>}
                  <button onClick={() => moveInBasket(qid, -1)} disabled={i === 0} style={{ fontSize: 12, border: 'none', background: 'none', cursor: 'pointer', opacity: i === 0 ? 0.3 : 1 }}>▲</button>
                  <button onClick={() => moveInBasket(qid, 1)} disabled={i === basket.length - 1} style={{ fontSize: 12, border: 'none', background: 'none', cursor: 'pointer', opacity: i === basket.length - 1 ? 0.3 : 1 }}>▼</button>
                  <button onClick={() => saveBasket(basket.filter(x => x !== qid))} style={{ fontSize: 12, color: '#b91c1c', border: 'none', background: 'none', cursor: 'pointer' }}>✕</button>
                </div>
              );
            })}
            <div style={{ margin: '12px 0', padding: 10, border: `1px solid ${C.border}`, borderRadius: 10, background: '#fafaf8' }}>
              <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 6 }}>🤖 AI-pick a worksheet</div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                <select value={aiLevel} onChange={e => { setAiLevel(e.target.value); setAiTopic(''); }}
                  style={{ padding: 6, fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 8 }}>
                  {Object.keys(AI_TOPIC_LISTS).map(l => <option key={l} value={l}>{l}</option>)}
                </select>
                <select value={aiTopic} onChange={e => setAiTopic(e.target.value)}
                  style={{ flex: 1, minWidth: 0, padding: 6, fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 8 }}>
                  <option value="">Topic…</option>
                  {(AI_TOPIC_LISTS[aiLevel] || []).map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <input type="number" min={1} max={15} value={aiCount}
                  onChange={e => setAiCount(Math.min(15, Math.max(1, parseInt(e.target.value, 10) || 10)))}
                  style={{ width: 52, padding: 6, fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 8 }} />
              </div>
              <input value={aiInstruction} onChange={e => setAiInstruction(e.target.value)}
                placeholder="Optional instruction — e.g. ramp easy to hard, no vectors mixed in"
                style={{ width: '100%', boxSizing: 'border-box', padding: 6, fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 6 }} />
              <button onClick={aiPick} disabled={aiBusy || !aiTopic}
                style={{ width: '100%', padding: 9, fontSize: 13.5, fontWeight: 700, color: '#fff', background: aiBusy || !aiTopic ? '#94a3b8' : '#4338ca', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
                {aiBusy ? 'Curating…' : 'AI-pick into basket (replaces current)'}
              </button>
              {aiPicks.length > 0 && (
                <ol style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12, color: '#475569' }}>
                  {aiPicks.map((p, i) => <li key={p.id} style={{ marginBottom: 2 }}>{p.reason || `pick ${i + 1}`}</li>)}
                </ol>
              )}
            </div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, margin: '10px 0 4px' }}>
              <input type="checkbox" checked={wsAnswers} onChange={e => setWsAnswers(e.target.checked)} />
              Include the answers page
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, margin: '0 0 10px' }}>
              <input type="checkbox" checked={wsSpace} onChange={e => setWsSpace(e.target.checked)} />
              Working space under each question (untick = compact list)
            </label>
            <button onClick={generateWorksheet} disabled={wsBusy || !basket.length}
              style={{ width: '100%', padding: 12, fontSize: 15, fontWeight: 700, color: '#fff', background: C.good, border: 'none', borderRadius: 10, cursor: 'pointer' }}>
              {wsBusy ? 'Building PDF…' : '📄 Generate worksheet PDF'}
            </button>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, margin: '10px 0 0' }}>
              <input type="checkbox" checked={solWithQuestions} onChange={e => setSolWithQuestions(e.target.checked)} />
              Solutions PDF: include the question text
            </label>
            <button onClick={() => generateSolutions(basket, 'Selected questions')} disabled={solBusy || !basket.length}
              style={{ width: '100%', marginTop: 8, padding: 10, fontSize: 14, fontWeight: 600, color: '#111', background: '#fff', border: `1px solid ${C.border}`, borderRadius: 10, cursor: 'pointer', opacity: solBusy ? 0.6 : 1 }}>
              {solBusy ? 'Building…' : '📄 Solutions PDF (worked solutions)'}
            </button>
          </div>
        </div>
      )}

      {assignFor && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 48, background: 'rgba(15,23,42,.45)' }} onClick={() => setAssignFor(null)}>
          <div onClick={e => e.stopPropagation()}
            style={{ position: 'absolute', bottom: 0, left: 0, right: 0, maxHeight: '70vh', overflowY: 'auto', background: C.bg, borderRadius: '16px 16px 0 0', padding: '14px 14px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <strong style={{ fontSize: 15.5 }}>📬 Assign to…</strong>
              <button onClick={() => setAssignFor(null)} style={{ marginLeft: 'auto', fontSize: 13, border: `1px solid ${C.border}`, background: '#fff', borderRadius: 8, padding: '4px 10px', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 8 }}><MathText text={assignFor.excerpt.slice(0, 100)} /></div>
            <input value={assignFilter} onChange={e => setAssignFilter(e.target.value)} placeholder="Filter students…"
              style={{ width: '100%', padding: '9px 11px', fontSize: 15, border: `1px solid ${C.border}`, borderRadius: 9, marginBottom: 8 }} />
            {visibleStudents.map(st => (
              <button key={st.id} onClick={() => doAssign(st.id, st.name)} disabled={!!assignBusy}
                style={{ display: 'flex', gap: 10, width: '100%', textAlign: 'left', alignItems: 'baseline', background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', marginBottom: 6, cursor: 'pointer' }}>
                <strong style={{ fontSize: 14.5 }}>{assignBusy === st.id ? '…' : st.name}</strong>
                <span style={{ color: C.muted, fontSize: 12.5 }}>{st.level}</span>
              </button>
            ))}
            {!students.length && <div style={{ color: C.muted, fontSize: 13.5, padding: 12 }}>Loading students…</div>}
          </div>
        </div>
      )}
    </main>
  );
}
