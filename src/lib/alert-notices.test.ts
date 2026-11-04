import { describe, it, expect } from 'vitest';
import { clearPlan, deleteOutcome, needsAgainLine, repeatDue, DELETE_WINDOW_MS } from './alert-notices';

// An alert that fixes itself is DELETED when it is fixed (Adrian, 4 Nov 2026: "Yes, as a rule").
const NOW = Date.parse('2026-11-04T10:00:00Z');
const ago = (h: number) => new Date(NOW - h * 3600e3).toISOString();

describe('clearPlan — delete what Telegram still lets us delete', () => {
  it('every message under 47 h old with its id is deleted, repeats included', () => {
    const p = clearPlan([1, 3, 5].map((h, i) => ({ id: i, chat_id: '-100', message_id: 10 + i, sent_at: ago(h) })), NOW);
    expect(p.remove).toHaveLength(3);
    expect(p.stale).toHaveLength(0);
  });
  it('older than 47 h, or no id kept → too old (one "again" line instead)', () => {
    const p = clearPlan([
      { id: 1, chat_id: '1', message_id: 2, sent_at: ago(47.5) },
      { id: 2, chat_id: null, message_id: null, sent_at: ago(1) },
    ], NOW);
    expect(p.remove).toHaveLength(0);
    expect(p.stale).toHaveLength(2);
    expect(DELETE_WINDOW_MS).toBe(47 * 3600e3);
  });
});

describe('deleteOutcome / needsAgainLine', () => {
  it('a message already deleted by hand counts as gone; a refusal does not', () => {
    expect(deleteOutcome({ ok: true })).toBe(true);
    expect(deleteOutcome({ ok: false, description: 'Bad Request: message to delete not found' })).toBe(true);
    expect(deleteOutcome({ ok: false, description: "Bad Request: message can't be deleted" })).toBe(false);
    expect(deleteOutcome(null)).toBe(false);
  });
  it('the "again" line only when something could not be deleted and there is a line', () => {
    expect(needsAgainLine(0, 0, '✅ again')).toBe(false);
    expect(needsAgainLine(1, 0, '✅ again')).toBe(true);
    expect(needsAgainLine(0, 2, '✅ again')).toBe(true);
    expect(needsAgainLine(3, 0, null)).toBe(false);
  });
});

describe('repeatDue — the repeat timing kept in the table, not in memory', () => {
  it('none open → send; newest open younger than the gap → wait; older → send', () => {
    expect(repeatDue([], NOW, 15 * 60e3)).toBe(true);
    expect(repeatDue(null, NOW, 15 * 60e3)).toBe(true);
    const rows = [{ id: 1, chat_id: '1', message_id: 1, sent_at: ago(1) }, { id: 2, chat_id: '1', message_id: 2, sent_at: ago(0.1) }];
    expect(repeatDue(rows, NOW, 15 * 60e3)).toBe(false);
    expect(repeatDue(rows, NOW, 5 * 60e3)).toBe(true);
  });
});
