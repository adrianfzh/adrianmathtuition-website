import { describe, it, expect } from 'vitest';
import { parseAutoReleaseSetting } from './auto-release-setting';

describe('parseAutoReleaseSetting', () => {
  it('reads the flag, defaults to NOT paused, and treats junk as not paused', () => {
    expect(parseAutoReleaseSetting('{"paused":true,"by":"adrian","at":"2026-09-08T00:00:00Z"}')).toEqual({ paused: true, by: 'adrian', at: '2026-09-08T00:00:00Z', note: null });
    expect(parseAutoReleaseSetting('{"paused":false}').paused).toBe(false);
    expect(parseAutoReleaseSetting(undefined).paused).toBe(false);
    expect(parseAutoReleaseSetting('not json').paused).toBe(false);
  });
});
