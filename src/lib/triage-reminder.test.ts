import { describe, it, expect } from 'vitest';
import { triageReminderMessage, type WaitingRun } from './triage-reminder';

const NOW = new Date('2026-08-29T00:00:00Z');

function run(over: Partial<WaitingRun> = {}): WaitingRun {
  return {
    paperName: 'Xinmin 2021 Prelim P2',
    studentName: 'Jia Ying',
    flaggedCount: 0,
    createdAt: '2026-08-28T10:00:00Z',
    ...over,
  };
}

describe('triageReminderMessage', () => {
  it('returns null when nothing is waiting — a quiet triage sends nothing', () => {
    expect(triageReminderMessage([], NOW)).toBeNull();
  });

  it('one ready script: singular header, ready line, triage link', () => {
    const msg = triageReminderMessage([run()], NOW)!;
    expect(msg).toContain('1 marked paper waiting in triage');
    expect(msg).not.toContain('papers waiting');
    expect(msg).toContain('1 ready to release');
    expect(msg).toContain('• Xinmin 2021 Prelim P2 — Jia Ying · ready · today');
    expect(msg).toContain('/admin/mark/triage');
  });

  it('counts flagged questions across runs and lists oldest first', () => {
    const msg = triageReminderMessage(
      [
        run({ paperName: 'Newer', flaggedCount: 2, createdAt: '2026-08-28T00:00:00Z' }),
        run({ paperName: 'Older', flaggedCount: 1, createdAt: '2026-08-25T00:00:00Z' }),
      ],
      NOW
    )!;
    expect(msg).toContain('2 marked papers waiting in triage</b> — 3 questions to check');
    expect(msg.indexOf('Older')).toBeLessThan(msg.indexOf('Newer'));
    expect(msg).toContain('Older — Jia Ying · 1 to check · 4d');
  });

  it('untagged runs say so instead of showing a blank name', () => {
    const msg = triageReminderMessage([run({ studentName: null, flaggedCount: 3 })], NOW)!;
    expect(msg).toContain('— untagged · 3 to check');
  });

  it('escapes HTML in paper and student names (Telegram parse_mode is HTML)', () => {
    const msg = triageReminderMessage(
      [run({ paperName: 'A<B & C', studentName: 'Tan <script>' })],
      NOW
    )!;
    expect(msg).toContain('A&lt;B &amp; C');
    expect(msg).toContain('Tan &lt;script&gt;');
    expect(msg).not.toContain('<script>');
  });

  it('caps the list at 8 lines and counts the rest', () => {
    const many = Array.from({ length: 11 }, (_, i) =>
      run({ paperName: `Paper ${i}`, createdAt: `2026-08-${String(10 + i).padStart(2, '0')}T00:00:00Z` })
    );
    const msg = triageReminderMessage(many, NOW)!;
    expect(msg).toContain('11 marked papers');
    expect(msg).toContain('…and 3 more');
    expect(msg).not.toContain('Paper 8'); // 9th oldest — beyond the cap
  });

  it('held student hand-ins get 📱 and jump the queue, even when newer', () => {
    const msg = triageReminderMessage(
      [
        run({ paperName: 'Adrians old upload', createdAt: '2026-08-20T00:00:00Z' }),
        run({ paperName: 'Held hand-in', fromStudent: true, createdAt: '2026-08-28T00:00:00Z' }),
      ],
      NOW
    )!;
    expect(msg).toContain('• 📱 Held hand-in');
    expect(msg.indexOf('Held hand-in')).toBeLessThan(msg.indexOf('Adrians old upload'));
    expect(msg).not.toContain('📱 Adrians');
  });

  it('mixed header names both the checks and the releases', () => {
    const msg = triageReminderMessage(
      [run({ flaggedCount: 1 }), run({ paperName: 'Clean one' })],
      NOW
    )!;
    expect(msg).toContain('— 1 question to check, 1 ready to release');
  });
});
