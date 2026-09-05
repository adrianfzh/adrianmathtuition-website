import { describe, it, expect } from 'vitest';
import { uploadFailureMessage } from './submit-client';

describe('uploadFailureMessage', () => {
  it('names the page, what is kept, and what to do', () => {
    expect(uploadFailureMessage(6, 18)).toBe('Page 7 of 18 did not upload after three tries — usually a weak signal. The 6 pages before it are already with us and will not be sent twice. Check your connection and tap Send again.');
    expect(uploadFailureMessage(1, 3)).toContain('The 1 page before it is already with us');
    expect(uploadFailureMessage(0, 1)).toContain('Nothing has been sent yet.');
  });
});
