import { describe, expect, it } from 'vitest';
import { SCIENCE_FEEDBACK_NOTE_MAX, sanitizeScienceFeedback, scienceFeedbackLine } from './science-feedback';

const RUN = '3c54fe8e-1028-4487-a709-ec12fea8f70a';

describe('sanitizeScienceFeedback', () => {
  it('accepts a run id, a verdict and an optional note, folding whitespace and capping the note', () => {
    expect(sanitizeScienceFeedback({ runId: RUN.toUpperCase(), useful: true, note: '  the  units\nline helped  ' }))
      .toEqual({ runId: RUN, useful: true, note: 'the units line helped' });
    expect(sanitizeScienceFeedback({ runId: RUN, useful: false })).toEqual({ runId: RUN, useful: false, note: null });
    const long = sanitizeScienceFeedback({ runId: RUN, useful: true, note: 'x'.repeat(SCIENCE_FEEDBACK_NOTE_MAX + 40) });
    expect(long?.note?.length).toBe(SCIENCE_FEEDBACK_NOTE_MAX);
  });
  it('refuses anything that is not one', () => {
    expect(sanitizeScienceFeedback(null)).toBeNull();
    expect(sanitizeScienceFeedback({ runId: 'nope', useful: true })).toBeNull();
    expect(sanitizeScienceFeedback({ runId: RUN, useful: 'yes' })).toBeNull();
    expect(sanitizeScienceFeedback([RUN])).toBeNull();
  });
});

describe('scienceFeedbackLine', () => {
  it('reads as one Telegram line', () => {
    expect(scienceFeedbackLine('Jamie', 'Physics · Prelim P2', { runId: RUN, useful: true, note: 'the units line helped' }))
      .toBe('🧪 Jamie on Physics · Prelim P2: 👍 useful — “the units line helped”');
    expect(scienceFeedbackLine(null, null, { runId: RUN, useful: false, note: null }))
      .toBe('🧪 A student on a science paper: 👎 not really');
  });
});
