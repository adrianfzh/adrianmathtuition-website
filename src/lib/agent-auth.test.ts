import { describe, it, expect } from 'vitest';
import { bearerMatchesScope } from './agent-auth';

const T = 'x'.repeat(32);
describe('bearerMatchesScope', () => {
  it('matches only the scope\'s own token, and never when unset or short', () => {
    const env = { AGENT_TOKEN_RELEASE: T, AGENT_TOKEN_SHEETS: 'short' } as unknown as NodeJS.ProcessEnv;
    expect(bearerMatchesScope(`Bearer ${T}`, 'release', env)).toBe(true);
    expect(bearerMatchesScope(`Bearer ${T}`, 'sheets', env)).toBe(false);
    expect(bearerMatchesScope('Bearer short', 'sheets', env)).toBe(false);
    expect(bearerMatchesScope(`Bearer ${T}`, 'reinstate', env)).toBe(false);
    expect(bearerMatchesScope(null, 'release', env)).toBe(false);
    expect(bearerMatchesScope(T, 'release', env)).toBe(false);
  });
});
