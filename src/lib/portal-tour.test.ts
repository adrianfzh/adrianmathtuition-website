import { describe, it, expect } from 'vitest';
import {
  buildTourSteps, buildFlowStages, flowStripKey, PORTAL_TOUR_KEY,
  type PortalSurfaces,
} from './portal-tour';

// The shapes that actually ship: the marking-only beta (Practise open, Learn
// and Notes closed) and the full portal.
const BETA: PortalSurfaces = { practice: true, learn: false, notes: false };
const BETA_NO_PRACTICE: PortalSurfaces = { practice: false, learn: false, notes: false };
const FULL: PortalSurfaces = { practice: true, learn: true, notes: true };

describe('buildTourSteps', () => {
  it('is one screen (Adrian, 7 Sep 2026): welcome, pointing at Papers, whatever the surfaces', () => {
    for (const surfaces of [BETA, BETA_NO_PRACTICE]) {
      const steps = buildTourSteps(surfaces);
      expect(steps.map(s => s.key)).toEqual(['welcome']);
      expect(steps[0].target).toBe('marking');
      expect(steps[0].title).toMatch(/AdrianMath app/);
      expect(steps[0].body.split('. ').length).toBeLessThanOrEqual(2);
    }
  });
});

describe('buildFlowStages', () => {
  it('beta journey is practise → hand in → marked work', () => {
    expect(buildFlowStages(BETA, 'practice').map(s => s.label)).toEqual([
      'Practise', 'Hand in', 'Marked work',
    ]);
  });

  it('marks exactly one stage current', () => {
    const stages = buildFlowStages(FULL, 'marking');
    expect(stages.filter(s => s.current).map(s => s.key)).toEqual(['marking']);
  });

  it('drops stages the viewer cannot reach', () => {
    expect(buildFlowStages(BETA, 'marking').map(s => s.key)).not.toContain('notes');
    expect(buildFlowStages(BETA_NO_PRACTICE, 'marking').map(s => s.key)).toEqual(['submit', 'marking']);
  });

  it('puts Notes at the head of the journey on the full portal', () => {
    expect(buildFlowStages(FULL, 'practice').map(s => s.key)).toEqual([
      'notes', 'practice', 'submit', 'marking',
    ]);
  });

  it('gives every stage an href and a hint', () => {
    for (const s of buildFlowStages(FULL, 'submit')) {
      expect(s.href.startsWith('/app')).toBe(true);
      expect(s.hint.length).toBeGreaterThan(0);
    }
  });
});

describe('storage keys', () => {
  it('are versioned and distinct per page', () => {
    expect(PORTAL_TOUR_KEY).toBe('portal_tour_v1');
    expect(flowStripKey('practice')).toBe('portal_flow_v1_practice');
    expect(flowStripKey('marking')).toBe('portal_flow_v1_marking');
    expect(flowStripKey('practice')).not.toBe(flowStripKey('marking'));
  });
});
