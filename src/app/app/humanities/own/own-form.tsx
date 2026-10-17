'use client';
// The three boxes of a question from school — the question, its sources, the answer — each typed or
// filled from photos by /api/portal/humanities/transcribe, then POST /api/portal/humanities/own.
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import PaperBox from './paper-box';
import { fileToJpegDataUrl } from '@/app/app/practice/image-downscale';
import { guessSkill, mentionsSources, OWN_SOURCE_SKILLS } from '@/lib/humanities-own-guess';
import type { OwnQuestion } from '@/lib/humanities-own';
import { printedMarks } from '@/lib/humanities-marks';
import type { HumanitiesSkill, HumanitiesSubject } from '@/lib/humanities-questions';
import { HUMANITIES_CHOICES, HUMANITIES_CHOICE_LABEL, humanitiesChoiceError, type HumanitiesChoice } from '@/lib/portal-prefs';

const MAX_PAGES = 6;
// The student's Humanities subjects (17 Oct 2026, Adrian: "what about students taking pure geography and pure
// history?" → "yes"): Social Studies always; ticked once — Geography / History Elective (one at most) and Pure
// Geography / Pure History — saved in the student's settings (lib/portal-prefs humanities_subjects).
const tabKey = (subject: HumanitiesSubject, pure: boolean) => (subject === 'social-studies' ? 'ss' : `${subject}_${pure ? 'p' : 'e'}`);
const SOURCE_SKILLS: string[] = OWN_SOURCE_SKILLS;
const words = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

type Mode = 'question' | 'answer';

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

export default function OwnForm({ initialSubject, initialPure, choices: savedChoices, prefill, skills, maxWords, wholePaper = false }: {
  initialSubject: HumanitiesSubject;
  initialPure: boolean;
  choices: HumanitiesChoice[];
  prefill: OwnQuestion | null;
  skills: Record<HumanitiesSubject, HumanitiesSkill[]>;
  maxWords: number;
  /** Show the One question | Whole paper choice (closed to students — HUMANITIES_WHOLE_PAPER_OPEN_TO_STUDENTS). */
  wholePaper?: boolean;
}) {
  const router = useRouter();
  const [subject, setSubject] = useState<HumanitiesSubject>(initialSubject);
  const [pure, setPure] = useState(initialPure);
  const [choices, setChoices] = useState<HumanitiesChoice[]>(savedChoices);
  const [draft, setDraft] = useState<HumanitiesChoice[]>(savedChoices);
  const [choosing, setChoosing] = useState(savedChoices.length === 0);
  const [question, setQuestion] = useState(prefill?.question ?? '');
  // The sources, extracts or figures read from the question's photos — kept for the marker, folded away on screen.
  const [sources, setSources] = useState(prefill?.sources ?? '');
  const [answer, setAnswer] = useState('');
  const [marksTyped, setMarksTyped] = useState(prefill?.marks ? String(prefill.marks) : '');
  const [reading, setReading] = useState<Mode | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkNote, setCheckNote] = useState<Mode | null>(null);
  // One question, or a whole paper at once (17 Oct 2026).
  const [whole, setWhole] = useState(false);

  // A tick follows the school's rules: one elective at most, never a subject as both elective and pure.
  function toggle(c: HumanitiesChoice) {
    setDraft(d => {
      if (d.includes(c)) return d.filter(x => x !== c);
      const subj = c.split('_')[0];
      const next = d.filter(x => x.split('_')[0] !== subj && !(c.endsWith('_e') && x.endsWith('_e')));
      return HUMANITIES_CHOICES.filter(x => [...next, c].includes(x));
    });
  }
  async function saveChoices() {
    if (humanitiesChoiceError(draft)) return;
    setChoices(draft); setChoosing(false);
    if (subject !== 'social-studies' && !draft.includes(tabKey(subject, pure) as HumanitiesChoice)) { setSubject('social-studies'); setPure(false); }
    if (draft.length) await fetch('/api/portal/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefs: { humanities_subjects: draft } }),
    }).catch(() => {});
  }
  const tabs: { key: string; label: string; subject: HumanitiesSubject; pure: boolean }[] = [
    { key: 'ss', label: 'Social Studies', subject: 'social-studies', pure: false },
    ...choices.map(c => ({ key: c, label: HUMANITIES_CHOICE_LABEL[c], subject: c.split('_')[0] as HumanitiesSubject, pure: c.endsWith('_p') })),
  ];
  const active = tabKey(subject, pure);

  const guessed = guessSkill(subject, question);
  // A refill ("Write it again") keeps the type it was marked as.
  const skill = (prefill?.skill && prefill.subject === subject && skills[subject].includes(prefill.skill) ? prefill.skill : guessed) ?? '';
  // A Geography question with no printed marks asks for them, unless it is the 9-mark kind.
  const asksMarks = subject !== 'social-studies' && subject !== 'history' && !printedMarks(question) && skill !== 'geo_evaluate' && !!question.trim();
  const usesSources = SOURCE_SKILLS.includes(skill) || mentionsSources(question);
  const marks = printedMarks(question) ?? (Number(marksTyped) > 0 ? Number(marksTyped) : null);
  const gaps = [question, sources, answer].some(t => t.includes('[?]'));
  const wc = words(answer);
  const ready = !busy && !reading && !gaps && words(question) >= 4 && wc >= 3 && wc <= maxWords
    && (!SOURCE_SKILLS.includes(skill) || words(sources) >= 10) && (!asksMarks || !!marks);

  async function read(mode: Mode, list: FileList | null) {
    const files = Array.from(list ?? []).slice(0, MAX_PAGES);
    if (!files.length) return;
    setReading(mode); setError(null);
    try {
      const images = await Promise.all(files.map(async f => ({ data: await fileToJpegDataUrl(f), mediaType: 'image/jpeg' })));
      const r = await fetch('/api/portal/humanities/transcribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, questionText: question, images }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error || 'We could not read the photo.'); return; }
      // The whole question: its words in the box, its sources and figures kept beside it.
      if (mode === 'question') { setQuestion(j.text); setSources(j.material ?? ''); }
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
        body: JSON.stringify({ subject, pure, skill, question, sources, answer, marks }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error || 'Something went wrong.'); setBusy(false); return; }
      router.push(j.group ? `/app/humanities/group/${j.group}` : `/app/humanities/${j.id}`);
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
      <div role="tablist" className="flex flex-wrap gap-1 bg-black/5 rounded-2xl p-1">
        {tabs.map(t => (
          <button key={t.key} type="button" role="tab" aria-selected={t.key === active} onClick={() => { setSubject(t.subject); setPure(t.pure); }}
            className={`flex-1 min-w-[30%] text-center text-[13px] font-semibold rounded-xl px-2 py-1.5 transition ${t.key === active ? 'bg-white text-navy shadow-sm' : 'text-gray-500'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {choosing ? (
        <div className="bg-amber-50 border border-amber-100 rounded-3xl px-4 py-3">
          <p className="text-[14px] font-semibold text-navy">Which Humanities subjects do you take?</p>
          <p className="text-[12px] text-gray-500">Social Studies is always here. Tick the others.</p>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {HUMANITIES_CHOICES.map(c => (
              <button key={c} type="button" onClick={() => toggle(c)} aria-pressed={draft.includes(c)}
                className={`rounded-2xl border px-3 py-2 text-[14px] font-semibold text-left ${draft.includes(c) ? 'bg-white border-amber-500 text-navy' : 'bg-white/70 border-amber-200 text-amber-900'}`}>
                <span aria-hidden>{draft.includes(c) ? '☑ ' : '☐ '}</span>{HUMANITIES_CHOICE_LABEL[c]}
              </button>
            ))}
          </div>
          <button type="button" onClick={saveChoices}
            className="mt-3 w-full bg-amber-600 text-white rounded-2xl px-4 py-2 text-[14px] font-semibold">
            Done
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => { setDraft(choices); setChoosing(true); }} className="text-[12px] text-gray-500 underline underline-offset-2">Change subjects</button>
      )}

      {wholePaper && <div className="flex gap-1 bg-black/5 rounded-2xl p-1" role="tablist" aria-label="One question or a whole paper">
        {[{ k: false, l: 'One question' }, { k: true, l: 'Whole paper' }].map(o => (
          <button key={o.l} type="button" role="tab" aria-selected={whole === o.k} onClick={() => setWhole(o.k)}
            className={`flex-1 text-center text-[13px] font-semibold rounded-xl py-1.5 transition ${whole === o.k ? 'bg-white text-navy shadow-sm' : 'text-gray-500'}`}>
            {o.l}
          </button>
        ))}
      </div>}
      {whole && wholePaper ? <PaperBox subject={subject} pure={pure} /> : (<>
      <div className={box}>
        <div className="flex items-center justify-between gap-2">
          {head(1, 'The question')}
          <PhotoButton label="Photos" busy={reading === 'question'} onFiles={f => read('question', f)} />
        </div>
        <p className="text-[12px] text-gray-500 mt-1">Photograph the whole question with its sources or figures. Several photos are fine.</p>
        <textarea value={question} onChange={e => setQuestion(e.target.value)} rows={3}
          placeholder="Send photos of the question, or type it." className={area} />
        {note('question')}
        {/* The type is worked out, never shown or asked (15 Oct 2026, Adrian: "let the app just work out the type"):
            the wording rules here, and a short read on the server when they find nothing. */}
        {sources.trim() && (
          <details className="mt-2">
            <summary className="text-[13px] text-gray-600 cursor-pointer">Sources and figures read from your photos</summary>
            <textarea value={sources} onChange={e => setSources(e.target.value)} rows={6} className={area} />
          </details>
        )}
        {usesSources && !sources.trim() && question.trim() && !reading && (
          <p className="text-[12px] text-amber-900 mt-2">This question uses sources. Send photos of the question together with its sources.</p>
        )}
        {asksMarks && (
          <label className="mt-2 flex items-center gap-2 text-[13px] text-gray-600">
            <span className="shrink-0">Marks:</span>
            <input type="number" inputMode="numeric" min={1} max={30} value={marksTyped} onChange={e => setMarksTyped(e.target.value)}
              className="w-20 rounded-xl border border-black/10 bg-white px-2 py-1 text-[14px] text-navy" />
          </label>
        )}
      </div>

      <div className={box}>
        <div className="flex items-center justify-between gap-2">
          {head(2, 'Your answer')}
          <PhotoButton label="Photos" busy={reading === 'answer'} onFiles={f => read('answer', f)} />
        </div>
        <textarea value={answer} onChange={e => setAnswer(e.target.value)} rows={8}
          placeholder="Send photos of what you wrote, or type it." className={area} />
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
      </>)}
    </div>
  );
}
