import { describe, expect, it } from 'vitest';
import { MAC_ONLY_SETTING, parseMacOnlySetting } from './marking-settings';

describe('parseMacOnlySetting', () => {
  it('reads the stored JSON', () => {
    expect(parseMacOnlySetting('{"on":true,"by":"adrian","at":"2026-09-11T00:00:00Z","note":"cost"}'))
      .toEqual({ on: true, by: 'adrian', at: '2026-09-11T00:00:00Z', note: 'cost' });
  });
  it('is OFF (the normal split) for anything unreadable or missing', () => {
    expect(parseMacOnlySetting(undefined).on).toBe(false);
    expect(parseMacOnlySetting('').on).toBe(false);
    expect(parseMacOnlySetting('not json').on).toBe(false);
    expect(parseMacOnlySetting('{"on":"true"}').on).toBe(false);
    expect(parseMacOnlySetting('{}')).toEqual({ on: false, by: null, at: null, note: null });
  });
  it('names the row the bot reads', () => {
    expect(MAC_ONLY_SETTING).toBe('marking_mac_only');
  });
});

describe('the science release switch (11 Sep 2026)', () => {
  it('has its own row and parses like the Mac-only one', async () => {
    const { SCIENCE_OPEN_SETTING, parseMarkingSwitch } = await import('./marking-settings');
    expect(SCIENCE_OPEN_SETTING).toBe('science_marking_open');
    expect(parseMarkingSwitch('{"on":true,"by":"adrian","at":"2026-09-11T00:00:00Z","note":null}').on).toBe(true);
    expect(parseMarkingSwitch(undefined).on).toBe(false);
  });
});
