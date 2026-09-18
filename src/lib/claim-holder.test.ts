import { describe, it, expect } from 'vitest';
import { claimHolder, claimHolderLabel } from './claim-holder';

describe('claimHolder', () => {
  it('the Fly worker: a 14-hex machine id as the host, the account after the first @', () => {
    expect(claimHolder('mac-plan-286d921a104298-21645@ablnon@gmail.com'))
      .toEqual({ where: 'the cloud worker', icon: '☁️', account: 'ablnon@gmail.com' });
  });
  it('a Mac by its own name; the Air is named', () => {
    expect(claimHolder('mac-plan-Adrians-MacBook-Pro.local-5123@adrianmathtuition@gmail.com').where).toBe('your Mac');
    expect(claimHolder('mac-plan-Adrians-MacBook-Air.local-77@ablnon@hotmail.com').where).toBe('the MacBook Air');
  });
  it('an old claim id with no account, or nothing at all, still reads as the Mac', () => {
    expect(claimHolder('mac-plan-Adrians-MacBook-Pro.local-5123')).toEqual({ where: 'your Mac', icon: '💻', account: null });
    expect(claimHolderLabel(null)).toBe('💻 your Mac');
  });
  it('label', () => {
    expect(claimHolderLabel('mac-plan-286d921a104298-1@adrianmathtuition@gmail.com'))
      .toBe('☁️ the cloud worker (adrianmathtuition@gmail.com)');
  });
});
