import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  boardTexAt, clipContext, clipQuestion, FALLBACK_ASKS, parseClipAsk, parseResumeStop, readyAsks, spokenToText,
} from './clip-ask';
import type { LessonScript, PlayScene } from './lesson-script';

const growth = JSON.parse(readFileSync(join(process.cwd(), 'data/lessons/growth-and-decay-am.json'), 'utf8')) as LessonScript;
const scene = growth.scenes[0] as PlayScene;

describe('clip-ask', () => {
  it('the "take ln" beat of Growth and decay: board so far + its ready questions', () => {
    // beat 5 = "E is involved, so take L N of both sides." — writes line 3.
    expect(boardTexAt(scene, 5)).toEqual(['t=0: P_0=100', '200 =100e^{7.5k}', 'e^{7.5k}=2', '\\ln e^{7.5k}=\\ln 2']);
    expect(readyAsks(scene, 5)[0]).toBe('Why is ln used when e is involved?');
  });

  it('only what is written: the first beat has an empty board', () => {
    expect(boardTexAt(scene, 0)).toEqual([]);
  });

  it('a beat without asks gets the two plain questions', () => {
    const bare = { ...scene, beats: (scene as { beats: object[] }).beats.map(b => ({ ...b, asks: undefined })) } as PlayScene;
    expect(readyAsks(bare, 2)).toEqual([...FALLBACK_ASKS]);
  });

  it('every one of the 7 Logarithms clips has ready questions on every beat', () => {
    for (const slug of ['growth-and-decay-am', 'laws-of-logarithms-am', 'linear-form-with-logs-am', 'log-scales-am',
      'sketching-log-graphs-am', 'solving-exponential-equations-am', 'solving-log-equations-am']) {
      const s = JSON.parse(readFileSync(join(process.cwd(), `data/lessons/${slug}.json`), 'utf8')) as LessonScript;
      for (const sc of s.scenes) for (const b of (sc as { beats?: { asks?: string[] }[] }).beats ?? []) {
        expect(b.asks?.length, slug).toBeGreaterThan(0);
        expect(b.asks!.length, slug).toBeLessThanOrEqual(3);
      }
    }
  });

  it('the message: context, then the question; the voice spelling of ln is undone', () => {
    expect(spokenToText('E is involved, so take L N of both sides.')).toBe('E is involved, so take ln of both sides.');
    const ctx = clipContext({ title: 'Growth and decay', topic: 'Logarithms', intro: 'Find $k$.', lines: ['e^{7.5k}=2'], say: 'take L N' });
    expect(ctx).toContain('"Growth and decay" (Logarithms)');
    expect(ctx).toContain('$e^{7.5k}=2$');
    expect(clipQuestion(ctx, ' Why ln? ')).toMatch(/\n\nMy question: Why ln\?$/);
  });

  it('the hand-over: fresh, from a clip, read once', () => {
    const ok = JSON.stringify({ context: 'c', label: 'l', question: ' Why? ', backHref: '/app/lesson/x?at=5', at: 1000 });
    expect(parseClipAsk(ok, 2000)).toEqual({ context: 'c', label: 'l', question: 'Why?', backHref: '/app/lesson/x?at=5', at: 1000 });
    expect(parseClipAsk(ok, 1000 + 11 * 60_000)).toBeNull();
    expect(parseClipAsk(JSON.stringify({ context: 'c', backHref: 'https://evil.example', at: 1000 }), 2000)).toBeNull();
    expect(parseClipAsk('not json', 2000)).toBeNull();
  });

  it('?at= resume stop', () => {
    expect(parseResumeStop('5')).toBe(5);
    expect(parseResumeStop(undefined)).toBe(0);
    expect(parseResumeStop('-2')).toBe(0);
    expect(parseResumeStop('x')).toBe(0);
  });
});
