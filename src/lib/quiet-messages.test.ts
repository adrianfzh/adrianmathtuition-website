import { describe, it, expect } from 'vitest';
import { QUIET, isQuiet, unlessQuiet } from './quiet-messages';

describe('quiet messages', () => {
  it('the four families Adrian said yes to are off, each with its date', () => {
    for (const f of ['handin-queued', 'scan-line', 'find-review-empty', 'desk-reminder']) expect(isQuiet(f)).toBe(true);
    for (const d of Object.values(QUIET)) expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('anything else still sends', async () => {
    expect(isQuiet('health-check')).toBe(false);
    expect(isQuiet('')).toBe(false);
    let sent = 0;
    expect(await unlessQuiet('health-check', async () => { sent++; return true; })).toBe(true);
    expect(await unlessQuiet('desk-reminder', async () => { sent++; return true; })).toBe(false);
    expect(sent).toBe(1);
  });
});
