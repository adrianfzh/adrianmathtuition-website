import { describe, it, expect } from 'vitest';
import { adminOptoutBy } from './holiday-optout';

describe('adminOptoutBy', () => {
  it('a browser is Adrian; a script is a Claude session', () => {
    expect(adminOptoutBy('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe('adrian');
    expect(adminOptoutBy('node')).toBe('session');
    expect(adminOptoutBy('curl/8.7.1')).toBe('session');
    expect(adminOptoutBy(null)).toBe('session');
  });
});
