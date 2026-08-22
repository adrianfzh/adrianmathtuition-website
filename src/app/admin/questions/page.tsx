'use client';
// /admin/questions — the Question Bank browser (22 Aug 2026).
// Adrian's phone-first replacement for opening Dropbox PDFs: search the bank,
// read any question with its worked solution, or open a whole paper in order.
// Deep links: ?id=<uuid> opens a question, ?school=&year=(&level=&paper=) opens
// a paper — so triage notes, the bleed table and chats can link straight in.

import { useState, useEffect, useCallback } from 'react';
import 'katex/dist/katex.min.css';
import { ensureAdminSession, loginAdminSession } from '@/lib/admin-client';
import { mathHtml } from '@/lib/math-inline';

const C = {
  bg: '#f8fafc', card: '#ffffff', border: '#e2e8f0', muted: '#64748b',
  navy: '#1c3a5e', accent: '#1d4ed8', chipBg: '#eef2ff', good: '#15803d',
  warn: '#b45309', flagBg: '#fffbeb',
};

function Math({ text }: { text: string }) {
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
      const r = await fetch(`/api/admin/questions?${p}`);
      const d = await r.json();
      if (d.error) { setApiError(d.error); return; }
      setResults(prev => (offset ? [...prev, ...(d.results || [])] : (d.results || [])));
      setMoreOffset((d.results || []).length === 30 ? offset + 30 : null);
    } catch (e) { setApiError((e as Error).message); }
    finally { setLoading(false); }
  }, [query, level, year, school]);

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
        {pt.text && <Math text={pt.text} />}
        {pt.marks != null && <span style={{ float: 'right', color: C.muted }}>[{pt.marks}]</span>}
      </div>
      {pt.image_url && <img src={pt.image_url} alt="" style={{ maxWidth: '100%', borderRadius: 8, margin: '6px 0' }} />}
      {showSolution && pt.solution && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '6px 10px', margin: '6px 0', fontSize: 14 }}>
          <MathBlock text={pt.solution} />
        </div>
      )}
      {showSolution && pt.answer && (
        <div style={{ color: '#843C0C', fontSize: 13.5, margin: '2px 0' }}>Ans: <Math text={pt.answer} /></div>
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
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
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
          {openDetail.answer && <div style={{ color: '#843C0C', marginTop: 8, fontSize: 14.5 }}>Ans: <Math text={openDetail.answer} /></div>}
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
          <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && search(0)}
            placeholder="Search question text or school…" inputMode="search"
            style={{ flex: '1 1 100%', padding: '10px 12px', fontSize: 16, border: `1px solid ${C.border}`, borderRadius: 10 }} />
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
              <div style={{ fontSize: 14, color: '#1f2937', marginTop: 3 }}><Math text={c.excerpt} /></div>
            </button>
          ))}
        </section>
      )}

      {!paperView && tab === 'search' && (
        <section>
          {results.map(c => (
            <div key={c.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 12px', marginBottom: 8 }}>
              <button onClick={() => openQuestion(c.id)} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
                <div style={{ fontSize: 14.5, color: '#111' }}><Math text={c.excerpt} /></div>
              </button>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
                <button onClick={() => c.school && c.year && openPaper({ school: c.school, year: c.year, level: c.level, paper: c.paper, examType: c.examType })}
                  style={{ fontSize: 12, color: C.accent, background: C.chipBg, border: 'none', borderRadius: 999, padding: '2px 9px', cursor: 'pointer' }}>
                  {badge(c) || (c.aiGenerated ? 'AI-generated (bank)' : 'no paper')}
                </button>
                {c.qnum && <span style={{ fontSize: 12, color: C.muted }}>Q{c.qnum}</span>}
                {c.marks != null && <span style={{ fontSize: 12, color: C.muted }}>[{c.marks}]</span>}
                {c.hasFigure && <span style={{ fontSize: 12 }}>🖼</span>}
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
    </main>
  );
}
