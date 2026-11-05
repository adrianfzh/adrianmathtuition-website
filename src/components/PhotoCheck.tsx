'use client';
// 📷 "This looks blurry — retake?" (SPEC-PHOTO-QUALITY.md, 5 Nov 2026, Adrian: "Yes, build it").
// One hook for every photo door: `const pc = usePhotoCheck('practice')`, then
// `const files = await pc.check(picked)` before using the picked files, and render `{pc.card}`.
// A clearly blurry / dark / tiny photo shows the card: Retake (the photo is dropped) or
// Use anyway (kept). Anything else passes at once. Never blocks: a check that fails = fine.
import { useCallback, useRef, useState } from 'react';
import { checkPhotoFile, issueLine, logPhotoCheck, type PhotoCheck } from '@/lib/photo-quality';

type Ask = { file: File; result: PhotoCheck; url: string };

export function usePhotoCheck(source: string) {
  const [ask, setAsk] = useState<Ask | null>(null);
  const answer = useRef<((keep: boolean) => void) | null>(null);

  const askOne = useCallback((a: Ask) => new Promise<boolean>((resolve) => {
    answer.current = resolve;
    setAsk(a);
  }), []);

  const check = useCallback(async (picked: File[] | FileList | null | undefined): Promise<File[]> => {
    const files = Array.from(picked ?? []);
    const kept: File[] = [];
    for (const file of files) {
      const r = await checkPhotoFile(file);
      if (r.ok) { logPhotoCheck(source, r); kept.push(file); continue; }
      const url = URL.createObjectURL(file);
      const keep = await askOne({ file, result: r, url });
      URL.revokeObjectURL(url);
      logPhotoCheck(source, r, keep);
      if (keep) kept.push(file);
    }
    return kept;
  }, [source, askOne]);

  const reply = (keep: boolean) => {
    const fn = answer.current;
    answer.current = null;
    setAsk(null);
    fn?.(keep);
  };

  const card = ask ? (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Photo check">
      <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ask.url} alt="" className="mb-3 max-h-48 w-full rounded-lg object-contain bg-gray-50" />
        <p className="text-base font-semibold text-navy">📷 {issueLine(ask.result.issues)}</p>
        <p className="mt-1 text-sm text-gray-600">Please take it again with the whole question in the frame.</p>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={() => reply(false)} className="flex-1 rounded-xl bg-navy px-3 py-2.5 text-sm font-semibold text-white">Retake</button>
          <button type="button" onClick={() => reply(true)} className="flex-1 rounded-xl border border-navy/30 px-3 py-2.5 text-sm font-semibold text-navy">Use anyway</button>
        </div>
      </div>
    </div>
  ) : null;

  return { check, card };
}
