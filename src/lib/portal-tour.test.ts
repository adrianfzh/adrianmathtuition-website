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
  it('beta: welcome → practise → submit → marked → settings', () => {
    expect(buildTourSteps(BETA).map(s => s.key)).toEqual([
      'welcome', 'practice', 'submit', 'marking', 'settings',
    ]);
  });

  it('never points a student at a surface the beta closed', () => {
    // Regression guard for the whole reason this lib exists: a tour step
    // landing on /app/notes during the beta bounces the student to /app.
    const keys = buildTourSteps(BETA).map(s => s.key);
    expect(keys).not.toContain('notes');
    expect(buildTourSteps(BETA_NO_PRACTICE).map(s => s.key)).not.toContain('practice');
  });

  it('stays at five steps or fewer on every configuration', () => {
    for (const s of [BETA, BETA_NO_PRACTICE, FULL]) {
      expect(buildTourSteps(s).length).toBeLessThanOrEqual(5);
      expect(buildTourSteps(s).length).toBeGreaterThanOrEqual(4);
    }
  });

  it('full portal folds notes into the last step and rings the Learn tab', () => {
    const last = buildTourSteps(FULL).at(-1)!;
    expect(last.key).toBe('notes');
    // Notes has no nav item; Learn is the one the student can see.
    expect(last.target).toBe('learn');
  });

  it('falls back to Settings when the notes reader is live but Learn is not', () => {
    const last = buildTourSteps({ practice: true, learn: false, notes: true }).at(-1)!;
    expect(last.key).toBe('notes');
    expect(last.target).toBe('settings');
  });

  it('gives every step a title and body, and unique keys', () => {
    const steps = buildTourSteps(FULL);
    expect(new Set(steps.map(s => s.key)).size).toBe(steps.length);
    for (const s of steps) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.body.length).toBeGreaterThan(0);
      expect(s.body.includes('!')).toBe(false); // no exclamation spam
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
