'use client';
// The grammar map's boxes (see page.tsx). Green strong · amber shaky · red weak · grey not tried yet.
import { useState } from 'react';
import Link from 'next/link';
import { GRAMMAR, GRAMMAR_PATHS, type KindRecord, type KindStanding } from '@/lib/english-grammar';
import { EDIT_KIND_WEIGHT, type EditKind } from '@/lib/english-own';
import GrammarSheet from '../grammar-sheet';

const LOOK: Record<KindStanding, { box: string; word: string }> = {
  strong: { box: 'bg-emerald-50 border-emerald-400', word: 'Strong' },
  shaky: { box: 'bg-amber-50 border-amber-400', word: 'Shaky' },
  weak: { box: 'bg-red-50 border-red-400', word: 'Needs work' },
  untried: { box: 'bg-gray-50 border-gray-300', word: 'Not tried yet' },
};
const DOT: Record<KindStanding, string> = { strong: 'bg-emerald-500', shaky: 'bg-amber-400', weak: 'bg-red-500', untried: 'bg-gray-300' };
const LEVEL = ['', 'Easier', 'Middle', 'Harder'];

export default function GrammarMap({ record, open }: { record: Record<EditKind, KindRecord> | null; open: EditKind | null }) {
  const [learn, setLearn] = useState<EditKind | null>(open);
  const anyTried = !!record && Object.values(record).some(r => r.tries > 0);
  return (
    <div className="space-y-4 pb-28 sm:pb-6">
      <div className="pt-1">
        <Link href="/app/languages/practice?t=editing" className="text-xs text-gray-500">‹ Editing</Link>
        <h1 className="text-xl font-bold text-navy mt-1">Grammar map</h1>
        <p className="text-[13px] text-gray-500">The 16 kinds of mistake in editing. Each path goes from easier at the top to harder at the foot.</p>
        <p className="text-[13px] text-gray-500">Tap a box for a one-minute lesson and three lines to try.</p>
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-gray-600" aria-label="Colours">
        {(['strong', 'shaky', 'weak', 'untried'] as KindStanding[]).map(s => (
          <span key={s} className="inline-flex items-center gap-1"><span aria-hidden className={`w-2.5 h-2.5 rounded-full ${DOT[s]}`} />{LOOK[s].word}</span>
        ))}
      </div>
      {!record && <p className="text-[13px] text-gray-500">Your record could not be read just now. The lessons still work.</p>}
      {record && !anyTried && <p className="text-[13px] text-gray-500">Do an editing passage and the boxes fill in with your colours.</p>}

      <div className="grid grid-cols-2 gap-3 items-start">
        {GRAMMAR_PATHS.map(p => (
          <section key={p.name} className="rounded-3xl bg-white border border-black/5 shadow-sm px-2.5 py-3" aria-label={p.name}>
            <h2 className="text-[13px] font-bold text-navy px-1 mb-2">{p.name}</h2>
            <ol>
              {p.kinds.map((k, i) => {
                const r = record?.[k];
                const st: KindStanding = r?.standing ?? 'untried';
                return (
                  <li key={k}>
                    {i > 0 && <div aria-hidden className="mx-auto h-3 w-0.5 bg-violet-300" />}
                    <button type="button" onClick={() => setLearn(k)}
                      className={`w-full text-left rounded-2xl border-2 px-2.5 py-2 ${LOOK[st].box}`}>
                      <span className="block text-[14px] font-semibold text-navy leading-tight">{GRAMMAR[k].name}</span>
                      <span className="block text-[11px] text-gray-500 leading-tight mt-0.5">{GRAMMAR[k].tag}</span>
                      <span className="flex items-center gap-1 mt-1 text-[11px] text-gray-600">
                        <span aria-hidden className={`w-2 h-2 rounded-full ${DOT[st]}`} />
                        {r && r.tries > 0 ? `${r.right} of ${r.tries} right` : LOOK[st].word}
                        <span className="ml-auto text-gray-400">{LEVEL[EDIT_KIND_WEIGHT[k]]}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>

      {learn && <GrammarSheet key={learn} kind={learn} onClose={() => setLearn(null)} mapHref={null} />}
    </div>
  );
}
