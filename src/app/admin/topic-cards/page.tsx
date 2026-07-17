'use client';

// Topic Cards editor — the "Notes" section printed on kiosk Type A revision
// worksheets. List → edit markdown with a live print-style preview → save,
// and flip draft → approved (drafts print with a DRAFT watermark line).
import { useCallback, useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import 'katex/dist/katex.min.css';

const REMARK = [remarkMath, remarkGfm, remarkBreaks];
const REHYPE = [rehypeRaw, rehypeKatex];

// Same budget the authoring spec uses (~1 printed page at 9pt).
const BUDGET_MIN = 1200;
const BUDGET_MAX = 2000;

type Card = {
  id: string; level: string; topic: string; title: string;
  content_md: string; status: 'draft' | 'approved'; author: string | null; updated_at: string;
};

export default function TopicCardsPage() {
  const [cards, setCards] = useState<Card[] | null>(null);
  const [err, setErr] = useState('');
  const [sel, setSel] = useState<Card | null>(null);

  // Editor state
  const [md, setMd] = useState('');
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState('');

  const load = useCallback(() => {
    fetch('/api/admin/topic-cards')
      .then((r) => r.json())
      .then((j) => (j.cards ? setCards(j.cards) : setErr(j.error || 'Load failed')))
      .catch((e) => setErr(String(e)));
  }, []);
  useEffect(load, [load]);

  function open(c: Card) {
    setSel(c); setMd(c.content_md); setTitle(c.title); setSavedAt('');
  }

  async function save(status?: 'draft' | 'approved') {
    if (!sel) return;
    setSaving(true); setErr('');
    try {
      const r = await fetch('/api/admin/topic-cards', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sel.id, title, content_md: md, ...(status ? { status } : {}) }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Save failed');
      setSel(j.card); setSavedAt(new Date().toLocaleTimeString('en-SG'));
      setCards((cs) => (cs ?? []).map((c) => (c.id === j.card.id ? j.card : c)));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const dirty = sel ? md !== sel.content_md || title !== sel.title : false;
  const chars = md.length;
  const charsOk = chars >= BUDGET_MIN && chars <= BUDGET_MAX;

  const grouped = useMemo(() => {
    const g: Record<string, Card[]> = {};
    for (const c of cards ?? []) (g[c.level] ??= []).push(c);
    return g;
  }, [cards]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <style>{PREVIEW_CSS}</style>
      <header className="bg-[#1c3a5e] text-white px-5 py-3 flex items-center gap-3 sticky top-0 z-10">
        <a href="/admin" className="text-white/70 hover:text-white text-sm">← Hub</a>
        <h1 className="font-bold text-lg">Topic Cards</h1>
        <span className="text-white/60 text-sm">worksheet notes · edit &amp; approve</span>
        {sel && (
          <div className="ml-auto flex items-center gap-2">
            {savedAt && !dirty && <span className="text-emerald-300 text-sm">Saved {savedAt}</span>}
            <button onClick={() => save()} disabled={saving || !dirty}
              className="bg-white text-[#1c3a5e] font-semibold rounded-md px-4 py-1.5 text-sm disabled:opacity-40">
              {saving ? 'Saving…' : 'Save'}
            </button>
            {sel.status === 'draft' ? (
              <button onClick={() => save('approved')} disabled={saving}
                className="bg-emerald-500 text-white font-semibold rounded-md px-4 py-1.5 text-sm">
                Approve ✓
              </button>
            ) : (
              <button onClick={() => save('draft')} disabled={saving}
                className="bg-amber-500 text-white font-semibold rounded-md px-4 py-1.5 text-sm">
                Back to draft
              </button>
            )}
          </div>
        )}
      </header>

      {err && <div className="m-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded">{err}</div>}

      {!sel && (
        <main className="max-w-3xl mx-auto p-5">
          {!cards && !err && <p className="text-slate-500">Loading…</p>}
          {cards?.length === 0 && <p className="text-slate-500">No cards yet.</p>}
          {Object.entries(grouped).map(([level, list]) => (
            <section key={level} className="mb-6">
              <h2 className="font-bold text-slate-600 text-sm uppercase tracking-wide mb-2">{level}</h2>
              <div className="grid gap-2">
                {list.map((c) => (
                  <button key={c.id} onClick={() => open(c)}
                    className="text-left bg-white border border-slate-200 rounded-lg px-4 py-3 hover:border-[#1c3a5e] flex items-center gap-3">
                    <span className="font-semibold">{c.topic}</span>
                    <span className="text-slate-400 text-sm">{c.content_md.length} chars · {c.author || '—'}</span>
                    <span className={`ml-auto text-xs font-bold rounded-full px-2.5 py-0.5 ${
                      c.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {c.status}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </main>
      )}

      {sel && (
        <main className="p-4 grid gap-4 lg:grid-cols-2 max-w-[1500px] mx-auto">
          <section className="flex flex-col gap-2 min-h-0">
            <div className="flex items-center gap-2">
              <button onClick={() => { setSel(null); load(); }} className="text-sm text-slate-500 hover:text-slate-800">← All cards</button>
              <span className="text-sm text-slate-400">{sel.level} · {sel.topic}</span>
              <span className={`text-xs font-mono ml-auto ${charsOk ? 'text-emerald-600' : 'text-red-600'}`}>
                {chars} chars {charsOk ? '✓' : `(target ${BUDGET_MIN}–${BUDGET_MAX})`}
              </span>
            </div>
            <input value={title} onChange={(e) => setTitle(e.target.value)}
              className="border border-slate-300 rounded-md px-3 py-2 font-semibold" />
            <textarea value={md} onChange={(e) => setMd(e.target.value)} spellCheck={false}
              className="flex-1 min-h-[65vh] border border-slate-300 rounded-md p-3 font-mono text-[13px] leading-relaxed resize-y" />
            <p className="text-xs text-slate-400">
              Markdown + KaTeX ($…$ only, no $$). Blockquotes (&gt;) print as boxed formula panels.
              Each newline is a printed line break.
            </p>
          </section>

          <section className="min-h-0">
            <div className="text-sm text-slate-500 mb-2">Print preview (as it appears on the worksheet)</div>
            <div className="tc-sheet">
              <div className="tc-card">
                <div className="tc-card-title">Notes — {sel.topic}</div>
                <div className="tc-card-body">
                  <ReactMarkdown remarkPlugins={REMARK} rehypePlugins={REHYPE}>{md}</ReactMarkdown>
                </div>
                {sel.status === 'draft' && <div className="tc-draft">DRAFT — pending review</div>}
              </div>
            </div>
          </section>
        </main>
      )}
    </div>
  );
}

// Mirrors the kiosk print CSS (.ws-card) so the preview matches paper.
const PREVIEW_CSS = `
.tc-sheet { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px 28px;
  font-family: "Times New Roman", Georgia, serif; font-size: 12.7px; line-height: 1.35; color: #111; }
.tc-sheet .katex { font-size: 1em; }
.tc-card { border: 1.33px solid #1F3864; border-radius: 5px; padding: 8px 12px 7px; }
.tc-card-title { font-size: 13.3px; font-weight: 700; color: #1F3864; letter-spacing: .08em; text-transform: uppercase; margin-bottom: 4px; }
.tc-card-body h2 { font-size: 12.7px; font-weight: 700; margin: 7px 0 3px; border-bottom: 1px solid #bbb; padding-bottom: 1px; }
.tc-card-body h3 { font-size: 12px; font-weight: 700; margin: 5px 0 2px; }
.tc-card-body ul, .tc-card-body ol { margin: 3px 0 4px 0; padding-left: 17px; }
.tc-card-body li { margin-bottom: 2px; }
.tc-card-body p { margin: 3px 0; }
.tc-card-body blockquote { border: 1.2px solid #111; border-radius: 4px; padding: 4px 9px; margin: 4px 0; }
.tc-card-body blockquote p { margin: 2px 0; }
.tc-card-body table { border-collapse: collapse; margin: 4px 0; }
.tc-card-body th, .tc-card-body td { border: 1px solid #999; padding: 3px 8px; font-size: 11.3px; }
.tc-draft { margin-top: 5px; text-align: right; color: #b00; font-size: 10px; letter-spacing: .15em; font-weight: 700; }
`;
