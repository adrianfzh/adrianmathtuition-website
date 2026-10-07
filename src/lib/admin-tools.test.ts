import { describe, it, expect } from 'vitest';
import { ALL_ADMIN_TOOLS, DEFAULT_TOOLS, PINNED_TOOLS, TAPS_DECAY_AT, bumpTap, mergeTaps, parseTaps, toolForPath, topTools } from './admin-tools';

// 6 Oct 2026, Adrian: "easy access to commonly use tools > do you know which ones?" → "learn from my taps".
describe('the dashboard tools row learns from what is opened', () => {
  it('before any opens it is the two pinned tools, then the default seven, in order', () => {
    expect(topTools({}).map((t) => t.href)).toEqual([...PINNED_TOOLS, ...DEFAULT_TOOLS]);
  });
  // 8 Oct 2026, Adrian: "can you put bot analytics and switch on the admin hub?"
  it('Bot analytics and Switches are always there, first, and never twice', () => {
    let c = {};
    for (let i = 0; i < 9; i++) c = bumpTap(c, '/admin/switches');
    for (let i = 0; i < 50; i++) c = bumpTap(c, '/admin/costs');
    const row = topTools(c).map((t) => t.href);
    expect(row.slice(0, 3)).toEqual(['/admin/bot-analytics', '/admin/switches', '/admin/costs']);
    expect(new Set(row).size).toBe(row.length);
    expect(row).toHaveLength(9);
    expect(ALL_ADMIN_TOOLS.find((t) => t.href === '/admin/bot-analytics')?.label).toBe('Bot analytics');
    expect(toolForPath('/admin/bot-analytics')).toBe('/admin/bot-analytics');   // not /admin/bot
  });
  // 8 Oct 2026, Adrian: "why is the tiles for phone and web different?" — one shared tally.
  it('a device\'s old tally is added into the shared one; unknown pages are dropped', () => {
    expect(mergeTaps({ '/admin/schedule': 3 }, { '/admin/schedule': 2, '/admin/log': 4, '/nowhere': 9 })).toEqual({ '/admin/schedule': 5, '/admin/log': 4 });
    const shared = { '/admin/costs': 1 };
    expect(mergeTaps(shared, {})).toBe(shared);
  });
  it('the most opened page moves to the front; ties keep the default order', () => {
    let c = {};
    for (let i = 0; i < 5; i++) c = bumpTap(c, '/admin/costs');
    for (let i = 0; i < 2; i++) c = bumpTap(c, '/admin/notes');
    const row = topTools(c).map((t) => t.href).slice(PINNED_TOOLS.length);
    expect(row.slice(0, 2)).toEqual(['/admin/costs', '/admin/notes']);
    expect(row.slice(2, 5)).toEqual(['/admin/schedule', '/admin/log', '/admin/students']);
    expect(row).toHaveLength(7);
  });
  it('a page under a tool counts for that tool; the dashboard and the old hub count for nothing', () => {
    expect(toolForPath('/admin/students/rec123/next')).toBe('/admin/students');
    expect(toolForPath('/admin/mark-paper')).toBe('/admin/mark-paper');
    expect(toolForPath('/admin/figures-bank')).toBe('/admin/figures-bank');   // not /admin/figures
    expect(toolForPath('/admin')).toBeNull();
    expect(toolForPath('/admin/classic')).toBeNull();
    expect(toolForPath('/admin/nowhere')).toBeNull();
  });
  it('an unknown href is ignored, and a full tally is halved so old habits fade', () => {
    expect(bumpTap({}, '/somewhere/else')).toEqual({});
    const full = { '/admin/schedule': TAPS_DECAY_AT - 1, '/admin/log': 1 };
    expect(bumpTap(full, '/admin/costs')).toEqual({ '/admin/schedule': Math.floor((TAPS_DECAY_AT - 1) / 2), '/admin/costs': 1 });
  });
  it('a damaged saved tally reads as empty, never a throw', () => {
    expect(parseTaps('not json')).toEqual({});
    expect(parseTaps('[1,2]')).toEqual({});
    expect(parseTaps(JSON.stringify({ '/admin/log': 3, '/evil': 9, '/admin/ops': 'x' }))).toEqual({ '/admin/log': 3 });
  });
  it('every tool has a different address', () => {
    expect(new Set(ALL_ADMIN_TOOLS.map((t) => t.href)).size).toBe(ALL_ADMIN_TOOLS.length);
  });
});
