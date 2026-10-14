import { describe, it, expect } from 'vitest';
import { surfaceForHref } from './portal-theme';

// Science bottom menu (Adrian, 14 Oct 2026: option "B") — a flask only on Home.
describe('science menu icons', () => {
  it('Home keeps the flask; Practise, Hand in, Papers and My Notebook wear their maths icons', () => {
    expect(surfaceForHref('/app/science').icon).toBe('flask');
    expect(surfaceForHref('/app/science/practice').icon).toBe(surfaceForHref('/app/practice').icon);
    expect(surfaceForHref('/app/science/submit').icon).toBe('camera');
    expect(surfaceForHref('/app/science/papers').icon).toBe('file-check');
    expect(surfaceForHref('/app/science/my-notes').icon).toBe('notebook');
  });
});
