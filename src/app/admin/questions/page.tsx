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

const C = {
  bg: '#f8fafc', card: '#ffffff', border: '#e2e8f0', muted: '#64748b',
  navy: '#1c3a5e', accent: '#1d4ed8', chipBg: '#eef2ff', good: '#15803d',
  warn: '#b45309', flagBg: '#fffbeb',
};

function MathText({ text }: { text: string }) {
  return <span dangerouslySetInnerHTML={{ __html: mathHtml(text) }} />;
}
function MathBlock({ text }: { text: string }) {
  return <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55 }} dangerouslySetInnerHTML={{ __html: mathHtml(text) }} />;
}

type Card = {
  id: string; excerpt: string; marks: number | null; school: string | null; year: number | null;
  paper: string | null; examType: string | null; qnum: string | null; level: string | null;
  topics: string[]; hasFigure: boolean; aiGenerated: boolean; thumb: string | null;
};
type Part = { label?: string; text?: string; marks?: number; answer?: string; solution?: string; image_url?: string; subparts?: Part[] };
type Detail = Card & {
  questionMd: string; parts: Part[]; solution: string | null; answer: string | null;
  difficulty: string | null; sourceFile: string | null; watermarkStatus: string | null;
  images: string[]; solutionImages: string[];
};
type PaperMeta = { school: string; year: number; level?: string | null; paper?: string | null; examType?: string | null };
type PaperRow = PaperMeta & { count: number };

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

  const [openDetail, setOpenDetail] = useState<Detail | null>(null);
  const [showSolution, setShowSolution] = useState(false);
  const [paperView, setPaperView] = useState<{ meta: PaperMeta; questions: Card[] } | null>(null);
  const [toast, setToast] = useState('');

  const [mode, setMode] = useState<'text' | 'smart'>('text');
  const [ocrBusy, setOcrBusy] = useState(false);
  const cameraRef = useRef<HTMLInputElement | null>(null);

  const [basket, setBasket] = useState<string[]>([]);
  const [basketOpen, setBasketOpen] = useState(false);
  const [wsAnswers, setWsAnswers] = useState(true);
  const [wsBusy, setWsBusy] = useState(false);
  const [solBusy, setSolBusy] = useState(false);
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
    } catch (e) { setApiError((e as Error).message); }
    finally { setLoading(false); }
  }, [level, year, school]);

  const openQuestion = useCallback(async (id: string) => {
    setShowSolution(false);
    try {
      const r = await fetch(`/api/admin/questions?id=${id}`);
      const d = await r.json();
      if (d.error) { flash(d.error); return; }
      cacheCards([d.question]);
      setOpenDetail(d.question);
    } catch (e) { flash((e as Error).message); }
  }, []);

  const openPaper = useCallback(async (meta: PaperMeta) => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ paperView: '1', school: meta.school, year: String(meta.year) });
      if (meta.level) p.set('level', meta.level);
      if (meta.paper) p.set('paper', meta.paper);
      if (meta.examType) p.set('exam_type', meta.examType);
      const r = await fetch(`/api/admin/questions?${p}`);
      const d = await r.json();
      if (d.error) { setApiError(d.error); return; }
      cacheCards(d.questions || []);
      setPaperView({ meta, questions: d.questions || [] });
      setOpenDetail(null);
      window.scrollTo({ top: 0 });
    } catch (e) { setApiError((e as Error).message); }
    finally { setLoading(false); }
  }, []);

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

  const generateWorksheet = async () => {
    if (!basket.length || wsBusy) return;
    setWsBusy(true);
    try {
      const r = await fetch('/api/admin/questions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'worksheet', ids: basket, answers: wsAnswers }),
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

  // Worked-solutions PDF — whole paper (reading order) or the basket selection.
  const generateSolutions = async (ids: string[], title: string) => {
    if (!ids.length || solBusy) return;
    setSolBusy(true);
    try {
      const r = await fetch('/api/admin/questions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'solutions-pdf', ids, title }),
      });
      const d = await r.json();
      if (d.error) { flash(d.error); return; }
      if (d.missingSolutions > 0) flash(`${d.missingSolutions} without a worked solution — [Ans:] printed instead`);
      window.open(d.url, '_blank');
      navigator.clipboard?.writeText(d.url).catch(() => {});
      flash(`Solutions ready — ${d.count} question${d.count === 1 ? '' : 's'} (link copied)`);
    } catch (e) { flash((e as Error).message); }
    finally { setSolBusy(false); }
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

  const partBlock = (pt: Part, depth = 0) => (
    <div key={`${pt.label}-${depth}-${(pt.text || '').slice(0, 12)}`} style={{ marginLeft: depth * 14, marginTop: 8 }}>
      <div style={{ fontSize: 14.5 }}>
        {pt.label && <strong>{pt.label} </strong>}
        {pt.text && <MathText text={pt.text} />}
        {pt.marks != null && <span style={{ float: 'right', color: C.muted }}>[{pt.marks}]</span>}
      </div>
      {pt.image_url && <img src={pt.image_url} alt="" style={{ maxWidth: '100%', borderRadius: 8, margin: '6px 0' }} />}
      {showSolution && pt.solution && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '6px 10px', margin: '6px 0', fontSize: 14 }}>
          <MathBlock text={pt.solution} />
        </div>
      )}
      {showSolution && pt.answer && (
        <div style={{ color: '#843C0C', fontSize: 13.5, margin: '2px 0' }}>Ans: <MathText text={pt.answer} /></div>
      )}
      {(pt.subparts || []).map(sp => partBlock(sp, depth + 1))}
    </div>
  );

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
          <button onClick={() => copyLink(`id=${openDetail.id}`, 'Question')} style={{ fontSize: 12.5, border: `1px solid ${C.border}`, background: '#fff', borderRadius: 8, padding: '3px 9px', cursor: 'pointer' }}>🔗 Copy link</button>
          <button onClick={() => setOpenDetail(null)} style={{ fontSize: 12.5, border: `1px solid ${C.border}`, background: '#fff', borderRadius: 8, padding: '3px 9px', cursor: 'pointer' }}>✕ Close</button>
        </span>
      </div>
      {openDetail.images.map(u => <img key={u} src={u} alt="figure" style={{ maxWidth: '100%', borderRadius: 8, margin: '6px 0' }} />)}
      <div style={{ fontSize: 15, lineHeight: 1.55 }}><MathBlock text={openDetail.questionMd} /></div>
      {openDetail.parts.map(pt => partBlock(pt))}
      <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => setShowSolution(s => !s)}
          style={{ fontSize: 14, fontWeight: 600, color: '#fff', background: showSolution ? C.muted : C.good, border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer' }}>
          {showSolution ? 'Hide solution' : '✅ Show solution'}
        </button>
        {openDetail.topics.map(t => <span key={t} style={{ fontSize: 12, color: C.muted, background: C.bg, borderRadius: 999, padding: '2px 9px' }}>{t}</span>)}
      </div>
      {showSolution && (
        <div style={{ marginTop: 10 }}>
          {openDetail.solution && (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: 12, fontSize: 14.5 }}>
              <MathBlock text={openDetail.solution} />
            </div>
          )}
          {openDetail.solutionImages.map(u => <img key={u} src={u} alt="solution" style={{ maxWidth: '100%', borderRadius: 8, margin: '6px 0' }} />)}
          {openDetail.answer && <div style={{ color: '#843C0C', marginTop: 8, fontSize: 14.5 }}>Ans: <MathText text={openDetail.answer} /></div>}
          {!openDetail.solution && !openDetail.parts.some(pt => pt.solution) && !openDetail.answer && (
            <div style={{ color: C.muted, fontSize: 13.5, marginTop: 6 }}>No stored solution on this question.</div>
          )}
        </div>
      )}
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
        <button onClick={() => (tab === 'search' ? search(0) : loadPapers())} disabled={loading}
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
            <span style={{ color: C.muted, fontSize: 13 }}>{paperView.questions.length} questions</span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button onClick={() => copyLink(`school=${encodeURIComponent(paperView.meta.school)}&year=${paperView.meta.year}${paperView.meta.level ? `&level=${paperView.meta.level}` : ''}${paperView.meta.paper ? `&paper=${paperView.meta.paper}` : ''}`, 'Paper')}
                style={{ fontSize: 12.5, border: `1px solid ${C.border}`, background: '#fff', borderRadius: 8, padding: '3px 9px', cursor: 'pointer' }}>🔗 Copy link</button>
              <button
                onClick={() => generateSolutions(
                  paperView.questions.map(q => q.id),
                  `${paperView.meta.school} ${paperView.meta.year}${paperView.meta.paper ? ` P${String(paperView.meta.paper).replace(/^P/i, '')}` : ''}`,
                )}
                disabled={solBusy}
                style={{ fontSize: 12.5, border: `1px solid ${C.border}`, background: '#fff', borderRadius: 8, padding: '3px 9px', cursor: 'pointer', opacity: solBusy ? 0.6 : 1 }}>
                {solBusy ? 'Building…' : '📄 Solutions PDF'}
              </button>
              <button onClick={() => setPaperView(null)} style={{ fontSize: 12.5, border: `1px solid ${C.border}`, background: '#fff', borderRadius: 8, padding: '3px 9px', cursor: 'pointer' }}>✕ Close paper</button>
            </span>
          </div>
          {paperView.questions.map(c => (
            <button key={c.id} onClick={() => openQuestion(c.id)}
              style={{ display: 'block', width: '100%', textAlign: 'left', background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 12px', marginBottom: 8, cursor: 'pointer' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                <strong>Q{c.qnum ?? '?'}</strong>
                {c.marks != null && <span style={{ color: C.muted, fontSize: 12.5 }}>[{c.marks}]</span>}
                {c.hasFigure && <span style={{ fontSize: 12 }}>🖼</span>}
              </div>
              <div style={{ fontSize: 14, color: '#1f2937', marginTop: 3 }}><MathText text={c.excerpt} /></div>
            </button>
          ))}
        </section>
      )}

      {!paperView && tab === 'search' && (
        <section>
          {results.map(c => (
            <div key={c.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 12px', marginBottom: 8 }}>
              <button onClick={() => openQuestion(c.id)} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
                <div style={{ fontSize: 14.5, color: '#111' }}><MathText text={c.excerpt} /></div>
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
          {results.length === 0 && !loading && <div style={{ color: C.muted, fontSize: 14, padding: 20, textAlign: 'center' }}>No matches — try fewer words, or the semantic search coming in v1.5.</div>}
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
          <div style={{ color: C.muted, fontSize: 13, marginBottom: 8 }}>{papersTotal} papers reconstructed from the bank{papersTotal > 400 ? ' (showing 400 — filter to narrow)' : ''}</div>
          {papers.map(pp => (
            <button key={`${pp.school}|${pp.year}|${pp.level}|${pp.paper}|${pp.examType}`}
              onClick={() => openPaper(pp)}
              style={{ display: 'flex', gap: 10, alignItems: 'baseline', width: '100%', textAlign: 'left', background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 12px', marginBottom: 8, cursor: 'pointer' }}>
              <strong style={{ fontSize: 14.5 }}>{pp.school}</strong>
              <span style={{ color: C.muted, fontSize: 13 }}>{pp.year} · {pp.level}{pp.paper ? ` · P${String(pp.paper).replace(/^P/i, '')}` : ''}{pp.examType ? ` · ${pp.examType}` : ''}</span>
              <span style={{ marginLeft: 'auto', color: C.muted, fontSize: 12.5 }}>{pp.count} q</span>
            </button>
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
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, margin: '10px 0' }}>
              <input type="checkbox" checked={wsAnswers} onChange={e => setWsAnswers(e.target.checked)} />
              Include the answers page
            </label>
            <button onClick={generateWorksheet} disabled={wsBusy || !basket.length}
              style={{ width: '100%', padding: 12, fontSize: 15, fontWeight: 700, color: '#fff', background: C.good, border: 'none', borderRadius: 10, cursor: 'pointer' }}>
              {wsBusy ? 'Building PDF…' : '📄 Generate worksheet PDF'}
            </button>
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
