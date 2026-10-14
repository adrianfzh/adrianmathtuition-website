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

describe('the BANK tail line (the solver\'s verdict against the paper\'s answer key, 10 Sep 2026)', () => {
  it('is held back while streaming, alone or stacked after CONFIDENCE', () => {
    expect(trimUnclosedMath('The median is 46.\nCONFIDENCE:HIGH\nBANK:AGREE')).toBe('The median is 46.');
    expect(trimUnclosedMath('The median is 46.\nBANK:DISAGREE')).toBe('The median is 46.');
    expect(trimUnclosedMath('The median is 46.\nBAN')).toBe('The median is 46.'); // a partially streamed keyword
  });
  it('is stripped from the final render', () => {
    expect(formatMessage('The median is 46.\nCONFIDENCE:HIGH\nBANK:AGREE')).not.toMatch(/BANK|CONFIDENCE/);
    expect(formatMessage('Answer: 46\nbank: unsure')).not.toMatch(/bank/i);
    // prose that merely mentions a bank is not a marker
    expect(formatMessage('The bank: agree with me')).toContain('The bank: agree with me');
  });
});

// 14 Oct 2026: the solver now answers comparisons with a short table. A live
// answer drew it; the same answer restored after a reload showed raw "| a | b |".
describe('formatMessage — a restored answer draws its table', () => {
  const ans = 'Compare them:\n\n| | Range | IQR |\n|---|---|---|\n| Uses | max − min | $Q_3 - Q_1$ |\n| Outliers | changes a lot | $P(A|B)$ stays |\n\nDone.';
  it('turns the pipe table into an HTML table', () => {
    const html = formatMessage(ans);
    expect(html).toContain('<table');
    expect(html).toContain('<th style');
    expect(html.match(/<tr>/g)?.length).toBe(3); // header + two rows
    expect(html).not.toMatch(/\|---/);
  });
  it('keeps a pipe inside maths in its cell', () => {
    const html = formatMessage(ans);
    expect(html).toContain('$P(A|B)$ stays');
  });
  it('leaves a modulus line alone', () => {
    expect(formatMessage('|x − 3| = 5')).toBe('|x − 3| = 5');
  });
});

describe('the PHOTO:MARK tail line (circle a part of the student\'s own photo, 14 Oct 2026)', () => {
  const ans = 'Angle CDX = θ because DC ∥ the ground.\nCONFIDENCE:HIGH\nPHOTO:MARK {"marks":[{"target":"angle CDX","label":"∠CDX = θ"}]}';
  it('is held back while streaming', () => {
    expect(trimUnclosedMath(ans)).toBe('Angle CDX = θ because DC ∥ the ground.');
    expect(trimUnclosedMath('Answer.\nCONFIDENCE:HIGH\nPHOT')).toBe('Answer.');
  });
  it('is stripped from the final render', () => {
    expect(formatMessage(ans)).not.toMatch(/PHOTO|marks|CONFIDENCE/);
  });
});
