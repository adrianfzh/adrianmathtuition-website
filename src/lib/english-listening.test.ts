import { describe, it, expect } from 'vitest';
import { checkListening, fillVerdict, listeningLine, listeningMarks, listeningProblems, norm, oneSlipApart, playsAllowed, publicListening, scriptShown, SECTION_MARKS, type ListeningSet } from './english-listening';
import { LISTENING_SETS, listeningById } from './english-speaking-data';
import { readSpeaking, mergedSpeaking } from '../../scripts/english-own/build-speaking';
import fs from 'node:fs';
import path from 'node:path';

const ls = (id: string): ListeningSet => listeningById(id)!;

describe('our own listening sets', () => {
  it('the built file is the folders, set for set (run scripts/english-own/build-speaking.ts after an edit)', () => {
    const { listening, oral, problems } = readSpeaking();
    expect(problems).toEqual([]);
    expect(fs.readFileSync(path.join(process.cwd(), 'data/english/speaking-sets.json'), 'utf8')).toBe(mergedSpeaking(listening, oral));
  });
  it('every set passes the checks', () => {
    for (const s of LISTENING_SETS) expect(listeningProblems(s), s.id).toEqual([]);
  });
  it('every set has its recording, committed', () => {
    for (const s of LISTENING_SETS) expect(fs.statSync(path.join(process.cwd(), 'public/english/listening', `${s.id}.mp3`)).size, s.id).toBeGreaterThan(100_000);
  });
  it('the pilot is one whole Paper 3: Section A 22 marks, Section B 8', () => {
    const marks = (sec: 'A' | 'B') => LISTENING_SETS.filter(s => s.section === sec).reduce((n, s) => n + listeningMarks(s), 0);
    expect(marks('A')).toBe(SECTION_MARKS.A);
    expect(marks('B')).toBe(SECTION_MARKS.B);
  });
  it('Section A is heard twice and Section B once', () => {
    expect(playsAllowed(ls('ls01'))).toBe(2);
    expect(playsAllowed(ls('ls04'))).toBe(1);
    expect(listeningLine(ls('ls04'))).toBe('Section B · heard once · 8 marks');
  });
});

describe('what the page gets before the check', () => {
  it('carries no script, no key and no reason', () => {
    for (const s of LISTENING_SETS) {
      const json = JSON.stringify(publicListening(s));
      expect(json).not.toContain('"script"');
      expect(json).not.toContain('"answer"');
      expect(json).not.toContain('"accept"');
      expect(json).not.toContain('"why"');
      expect(json).not.toContain(s.script[1]?.text.slice(0, 40) ?? s.script[0].text.slice(0, 40));
    }
  });
});

describe('a problem stops a set', () => {
  it('a fill answer that is never said in the recording', () => {
    const s: ListeningSet = JSON.parse(JSON.stringify(ls('ls03')));
    (s.questions[0] as { accept: string[] }).accept = ['sticker'];
    expect(listeningProblems(s).join(' ')).toContain('is not said in the recording');
  });
  it('a choice whose answer is not one of its letters, and a speaker with no voice', () => {
    const s: ListeningSet = JSON.parse(JSON.stringify(ls('ls01')));
    (s.questions[0] as { answer: string }).answer = 'E';
    delete s.voices;
    const p = listeningProblems(s).join(' ');
    expect(p).toContain('the answer is one of the letters');
    expect(p).toContain('voices.a');
  });
  it('two matching questions with the same letter', () => {
    const s: ListeningSet = JSON.parse(JSON.stringify(ls('ls02')));
    (s.questions[1] as { answer: string }).answer = 'B';
    expect(listeningProblems(s).join(' ')).toContain('at most one matching question');
  });
});

describe('marking by the key', () => {
  it('tidies case, punctuation and a leading article', () => {
    expect(norm('  The Living-Room. ')).toBe('living room');
    expect(fillVerdict('The Tag', ['tag'])).toBe('right');
    expect(fillVerdict('9,000', ['nine thousand', '9000'])).toBe('right');
  });
  it('forgives one letter in a long word, and says so', () => {
    expect(oneSlipApart('recipts', 'receipts')).toBe(true);
    expect(oneSlipApart('reciepts', 'receipts')).toBe(true);     // two neighbours swapped
    expect(fillVerdict('magnits', ['magnets'])).toBe('spelling');
    expect(fillVerdict('notbook', ['notebook'])).toBe('spelling');
  });
  it('never forgives a short word or a number', () => {
    expect(fillVerdict('tan', ['ten'])).toBe('wrong');
    expect(fillVerdict('30', ['40'])).toBe('wrong');
    expect(fillVerdict('bed', ['red'])).toBe('wrong');
    expect(fillVerdict('', ['red'])).toBe('wrong');
  });
  it('the key itself scores full marks on every set', () => {
    for (const s of LISTENING_SETS) {
      const answers: Record<string, string> = {};
      for (const q of s.questions) answers[q.n] = q.type === 'fill' ? q.accept[0] : q.answer;
      const out = checkListening(s, answers);
      expect(out.right, s.id).toBe(out.total);
    }
  });
  it('a blank sheet scores 0 and shows every answer', () => {
    const out = checkListening(ls('ls02'), {});
    expect(out.right).toBe(0);
    expect(out.results[0].correct).toBe('B — The class would have to be split up.');
    expect(out.results.every(r => r.why.length > 10)).toBe(true);
  });
  it('a letter is taken in either case; a wrong letter is wrong', () => {
    const out = checkListening(ls('ls01'), { '1': 'a', '2': 'C' });
    expect(out.results[0].ok).toBe(true);
    expect(out.results[1].ok).toBe(false);
    expect(out.results[1].yours).toBe('C — A plot on the roof of a car park');
  });
  it('the script is shown with names only after the check', () => {
    expect(scriptShown(ls('ls02'))[1]).toEqual({ who: 'Wei Jie', text: expect.stringContaining('kayaking') });
  });
});
