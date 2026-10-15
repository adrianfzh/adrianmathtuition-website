'use client';
// The three boxes of a question from school — the question, its sources, the answer — each typed or
// filled from photos by /api/portal/humanities/transcribe, then POST /api/portal/humanities/own.
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fileToJpegDataUrl } from '@/app/app/practice/image-downscale';
import { guessSkill, mentionsSources, OWN_SOURCE_SKILLS } from '@/lib/humanities-own-guess';
import type { OwnQuestion } from '@/lib/humanities-own';
import { printedMarks } from '@/lib/humanities-marks';
import type { HumanitiesSkill, HumanitiesSubject } from '@/lib/humanities-questions';

const MAX_PAGES = 4;
const SUBJECTS: { key: HumanitiesSubject; label: string }[] = [
  { key: 'social-studies', label: 'Social Studies' },
  { key: 'history', label: 'History' },
  { key: 'geography', label: 'Geography' },
];
const SOURCE_SKILLS: string[] = OWN_SOURCE_SKILLS;
const words = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

type Mode = 'question' | 'sources' | 'scheme' | 'answer';
const POINT_SKILLS = ['geo_describe', 'geo_explain'];

function PhotoButton({ label, busy, onFiles }: { label: string; busy: boolean; onFiles: (f: FileList | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={ref} type="file" accept="image/*" multiple className="hidden"
        onChange={e => { onFiles(e.target.files); e.target.value = ''; }} />
      <button type="button" onClick={() => ref.current?.click()} disabled={busy}
        className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-3 py-1 disabled:opacity-60">
        <span aria-hidden>📷</span>{busy ? 'Reading…' : label}
      </button>
    </>
  );
}

export default function OwnForm({ initialSubject, prefill, skills, labels, maxWords }: {
  initialSubject: HumanitiesSubject;
  prefill: OwnQuestion | null;
  skills: Record<HumanitiesSubject, HumanitiesSkill[]>;
  labels: Record<string, string>;
  maxWords: number;
}) {
  const router = useRouter();
  const [subject, setSubject] = useState<HumanitiesSubject>(initialSubject);
  const [question, setQuestion] = useState(prefill?.question ?? '');
  const [sources, setSources] = useState(prefill?.sources ?? '');
  const [answer, setAnswer] = useState('');
  const [scheme, setScheme] = useState(prefill?.scheme ?? '');
  const [marksTyped, setMarksTyped] = useState(prefill?.marks ? String(prefill.marks) : '');
  const [picked, setPicked] = useState<HumanitiesSkill | ''>(prefill?.skill ?? '');
  const [reading, setReading] = useState<Mode | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkNote, setCheckNote] = useState<Mode | null>(null);

  const guessed = guessSkill(subject, question);
  const skill = (picked && skills[subject].includes(picked) ? picked : guessed) ?? '';
  const pointsQ = POINT_SKILLS.includes(skill);
  const needsSources = SOURCE_SKILLS.includes(skill) || mentionsSources(question) || pointsQ;
  const marks = printedMarks(question) ?? (Number(marksTyped) > 0 ? Number(marksTyped) : null);
  const gaps = [question, sources, scheme, answer].some(t => t.includes('[?]'));
  const wc = words(answer);
  const ready = !busy && !reading && !gaps && !!skill && words(question) >= 4 && wc >= 3 && wc <= maxWords
    && (!SOURCE_SKILLS.includes(skill) || words(sources) >= 10) && (!pointsQ || !!marks);

  async function read(mode: Mode, list: FileList | null) {
    const files = Array.from(list ?? []).slice(0, MAX_PAGES);
    if (!files.length) return;
    setReading(mode); setError(null);
    try {
      const images = await Promise.all(files.map(async f => ({ data: await fileToJpegDataUrl(f), mediaType: 'image/jpeg' })));
      const r = await fetch('/api/portal/humanities/transcribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        // The school's scheme is printed or typed text too: read it as printed.
        body: JSON.stringify({ mode: mode === 'scheme' ? 'sources' : mode, questionText: question, images }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error || 'We could not read the photo.'); return; }
      if (mode === 'question') setQuestion(j.text);
      else if (mode === 'sources') setSources(prev => (prev.trim() ? `${prev.trim()}\n\n${j.text}` : j.text));
      else if (mode === 'scheme') setScheme(prev => (prev.trim() ? `${prev.trim()}\n\n${j.text}` : j.text));
      else setAnswer(j.text);
      setCheckNote(mode);
    } catch {
      setError('We could not read the photo — try again.');
    } finally {
      setReading(null);
    }
  }

  async function submit() {
    setBusy(true); setError(null);
    try {
      const r = await fetch('/api/portal/humanities/own', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, skill, question, sources: needsSources ? sources : '', answer, marks, ...(pointsQ ? { scheme } : {}) }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error || 'Something went wrong.'); setBusy(false); return; }
      router.push(`/app/humanities/${j.id}`);
    } catch {
      setError('No connection — try again.'); setBusy(false);
    }
  }

  const box = 'block bg-white rounded-3xl p-4 border border-black/5 shadow-sm';
  const area = 'mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2.5 text-[15px] leading-relaxed text-navy';
  const head = (n: number, title: string) => <span className="text-[12px] font-semibold uppercase tracking-wide text-gray-400">{n}. {title}</span>;
  const note = (m: Mode) => checkNote === m && (
    <p className="text-[12px] text-amber-900 mt-1">Check it matches the page. Type in any [?].</p>
  );

  return (
    <div className="space-y-3">
      <div role="tablist" className="flex gap-1 bg-black/5 rounded-2xl p-1">
        {SUBJECTS.map(t => (
          <button key={t.key} type="button" role="tab" aria-selected={t.key === subject} onClick={() => { setSubject(t.key); setPicked(''); }}
            className={`flex-1 text-center text-sm font-semibold rounded-xl py-1.5 transition ${t.key === subject ? 'bg-white text-navy shadow-sm' : 'text-gray-500'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className={box}>
        <div className="flex items-center justify-between gap-2">
          {head(1, 'The question')}
          <PhotoButton label="Photo" busy={reading === 'question'} onFiles={f => read('question', f)} />
        </div>
        <textarea value={question} onChange={e => setQuestion(e.target.value)} rows={3}
          placeholder="Type the question, or send a photo of it." className={area} />
        {note('question')}
        {question.trim() && (
          <label className="mt-2 flex items-center gap-2 text-[13px] text-gray-600">
            <span className="shrink-0">Question type:</span>
            <select value={skill} onChange={e => setPicked(e.target.value as HumanitiesSkill)}
              className="flex-1 min-w-0 rounded-xl border border-black/10 bg-white px-2 py-1 text-[14px] text-navy">
              {!skill && <option value="">Pick one</option>}
              {skills[subject].map(k => <option key={k} value={k}>{labels[k] ?? k}</option>)}
            </select>
          </label>
        )}
        {pointsQ && !printedMarks(question) && (
          <label className="mt-2 flex items-center gap-2 text-[13px] text-gray-600">
            <span className="shrink-0">Marks:</span>
            <input type="number" inputMode="numeric" min={1} max={30} value={marksTyped} onChange={e => setMarksTyped(e.target.value)}
              className="w-20 rounded-xl border border-black/10 bg-white px-2 py-1 text-[14px] text-navy" />
          </label>
        )}
      </div>

      {needsSources && (
        <div className={box}>
          <div className="flex items-center justify-between gap-2">
            {head(2, pointsQ ? 'The figure or table (if any)' : 'The sources')}
            <PhotoButton label="Photos" busy={reading === 'sources'} onFiles={f => read('sources', f)} />
          </div>
          <textarea value={sources} onChange={e => setSources(e.target.value)} rows={5}
            placeholder={pointsQ ? 'If the question uses a figure, map, photo or table, send a photo of it.' : 'Type the sources this question uses, or send photos of them.'} className={area} />
          {note('sources')}
        </div>
      )}

      {pointsQ && (
        <div className={box}>
          <div className="flex items-center justify-between gap-2">
            {head(3, "The school's answers (if you have them)")}
            <PhotoButton label="Photos" busy={reading === 'scheme'} onFiles={f => read('scheme', f)} />
          </div>
          <textarea value={scheme} onChange={e => setScheme(e.target.value)} rows={3}
            placeholder="If your teacher gave out the answers for this question, add them. We mark against them." className={area} />
          {note('scheme')}
        </div>
      )}

      <div className={box}>
        <div className="flex items-center justify-between gap-2">
          {head(pointsQ ? 4 : needsSources ? 3 : 2, 'Your answer')}
          <PhotoButton label="Photo" busy={reading === 'answer'} onFiles={f => read('answer', f)} />
        </div>
        <textarea value={answer} onChange={e => setAnswer(e.target.value)} rows={8}
          placeholder="Type your answer, or send a photo of what you wrote." className={area} />
        <div className="flex items-center justify-between mt-1">
          {note('answer') || <span />}
          <span className={`text-[12px] ${wc > maxWords ? 'text-rose-700 font-semibold' : 'text-gray-400'}`}>{wc} words</span>
        </div>
      </div>

      {error && <p className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-2xl px-3 py-2">{error}</p>}
      <button type="button" onClick={submit} disabled={!ready}
        className="w-full bg-amber-600 text-white rounded-3xl px-4 py-3.5 font-semibold hover:brightness-105 active:scale-[0.98] transition disabled:opacity-50">
        {busy ? 'Handing in…' : 'Get feedback'}
      </button>
      {gaps && !reading && <p className="text-[12px] text-gray-500 text-center">Type in each [?] first.</p>}
    </div>
  );
}
