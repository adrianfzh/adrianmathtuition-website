// A whole paper, read in batches of pages (17 Oct 2026, lib/humanities-photo paperPrompt): one batch may end
// part-way through a question and the next go on with it, so the items are merged by question number — the
// question and its material from wherever they were printed, the answer joined in page order. Pure.
import type { PaperItem } from './humanities-photo';

const key = (n: string) => n.replace(/^\s*q(uestion)?\.?\s*/i, '').replace(/[^0-9a-z]/gi, '').toLowerCase();

export function mergePaperItems(batches: PaperItem[][]): PaperItem[] {
  const by = new Map<string, PaperItem>();
  const order: string[] = [];
  for (const batch of batches) for (const it of batch) {
    const k = key(it.number);
    if (!k) continue;
    const have = by.get(k);
    if (!have) { by.set(k, { ...it, number: it.number.trim() }); order.push(k); continue; }
    // The fuller printing of the question wins; material and answer are joined, without repeating a block.
    if (it.question.length > have.question.length) have.question = it.question;
    for (const block of it.material.split(/\n{2,}/).map(b => b.trim()).filter(Boolean)) {
      if (!have.material.includes(block)) have.material = have.material ? `${have.material}\n\n${block}` : block;
    }
    if (it.answer && !have.answer.includes(it.answer)) have.answer = have.answer ? `${have.answer}\n${it.answer}` : it.answer;
  }
  // In the paper's own order of numbers where they are numbers.
  return order.map(k => by.get(k)!).sort((a, b) => (parseInt(a.number, 10) || 0) - (parseInt(b.number, 10) || 0));
}

/** Ready to mark: the question was found and the student wrote something for it. */
export const markable = (it: PaperItem): boolean => !!it.question && it.answer.split(/\s+/).filter(Boolean).length >= 3;
