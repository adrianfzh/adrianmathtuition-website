import { describe, it, expect } from 'vitest';
import { botLevelForAccount, trimUnclosedMath, formatMessage } from './chat-solver';

describe('botLevelForAccount', () => {
  it('maps JC levels to JC', () => {
    expect(botLevelForAccount('JC1', null)).toBe('JC');
    expect(botLevelForAccount('JC2', ['H2 Math'])).toBe('JC');
  });

  it('maps lower secondary to S1/S2 regardless of subjects', () => {
    expect(botLevelForAccount('Sec 1', ['Math'])).toBe('S1');
    expect(botLevelForAccount('Sec 2', null)).toBe('S2');
  });

  it('upper secondary follows the subject mix', () => {
    expect(botLevelForAccount('Sec 4', ['A Math'])).toBe('AM');
    expect(botLevelForAccount('Sec 3', ['E Math'])).toBe('EM');
    expect(botLevelForAccount('Sec 5', ['Math'])).toBe('EM');
  });

  it('dual EM+AM students get null — the bot routes per question', () => {
    expect(botLevelForAccount('Sec 4', ['E Math', 'A Math'])).toBeNull();
  });

  it('ambiguous cases get null (IP Math, no subjects, no level)', () => {
    expect(botLevelForAccount('Sec 3', ['IP Math'])).toBeNull();
    expect(botLevelForAccount('Sec 4', null)).toBeNull();
    expect(botLevelForAccount(null, ['A Math'])).toBeNull();
    expect(botLevelForAccount('Adhoc', null)).toBeNull();
  });
});

describe('trimUnclosedMath', () => {
  it('holds back an unclosed inline $ span', () => {
    expect(trimUnclosedMath('the value $x = 2$ and $y =')).toBe('the value $x = 2$ and ');
  });

  it('holds back an unclosed $$ display span', () => {
    expect(trimUnclosedMath('so:\n$$x^2 + 1')).toBe('so:\n');
  });

  it('leaves balanced math untouched', () => {
    expect(trimUnclosedMath('done: $x=1$ ok')).toBe('done: $x=1$ ok');
  });

  it('holds back trailing machine markers while streaming', () => {
    expect(trimUnclosedMath('Answer is 4.\nCONFIDENCE: HIGH')).toBe('Answer is 4.');
    expect(trimUnclosedMath('Answer is 4.\nCONFID')).toBe('Answer is 4.');
  });
});

describe('formatMessage', () => {
  it('strips confidence markers and converts newlines', () => {
    expect(formatMessage('line1\nCONFIDENCE: HIGH')).toBe('line1');
    expect(formatMessage('a\nb')).toBe('a<br>b');
  });

  it('bolds ** spans', () => {
    expect(formatMessage('**hi**')).toBe('<strong>hi</strong>');
  });
});
