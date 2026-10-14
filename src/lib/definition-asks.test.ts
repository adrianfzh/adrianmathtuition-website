import { describe, expect, it } from 'vitest';
import { DEFINITIONS, PHYSICS_OFTEN } from './science-definitions';
import { BIOLOGY_DEFINITIONS, BIOLOGY_OFTEN } from './biology-definitions';
import { CHEMISTRY_DEFINITIONS, CHEMISTRY_OFTEN } from './chemistry-definitions';
import { COMMAND_WORDS } from './command-words';
import {
  COMMAND_WORD_ANCHORS, askedTerms, commandWordAnchor, commandWordOf, definePhrases, definitionForPhrase,
  lostPartHelp, lostPartLinks, normLabel, partText,
} from './definition-asks';

const lists = { physics: DEFINITIONS, biology: BIOLOGY_DEFINITIONS, chemistry: CHEMISTRY_DEFINITIONS };
const term = (text: string, list = DEFINITIONS) => askedTerms(text, list).map(d => d.term);

describe('⭐ often asked', () => {
  it('every starred id is on its list, at most 20 a subject, and the flag is set', () => {
    for (const [ids, list] of [[PHYSICS_OFTEN, DEFINITIONS], [BIOLOGY_OFTEN, BIOLOGY_DEFINITIONS], [CHEMISTRY_OFTEN, CHEMISTRY_DEFINITIONS]] as const) {
      expect(ids.length).toBeGreaterThan(0);
      expect(ids.length).toBeLessThanOrEqual(20);
      for (const id of ids) expect(list.find(d => d.id === id)?.often, id).toBe(true);
      expect(list.filter(d => d.often).length).toBe(ids.length);
    }
  });
});

describe('which definition a question asks for', () => {
  it('reads the usual leads', () => {
    expect(term('(a) Define the focal length of a converging lens. [1]')).toEqual(['Focal length']);
    expect(term('State what is meant by efficiency. [1]')).toEqual(['Efficiency']);
    expect(term("What is meant by the term 'wavefront'?")).toEqual(['Wavefront']);
    expect(term('State the meaning of specific heat capacity of water.')).toEqual(['Specific heat capacity']);
    expect(term('Explain what is meant by the term **allotropes**.', CHEMISTRY_DEFINITIONS)).toEqual(['Allotropes']);
  });

  it('knows a term by its bracket and by the start of its name', () => {
    expect(term('State what is meant by the e.m.f. of a cell.')).toEqual(['Electromotive force (e.m.f.)']);
    expect(term('Define electromotive force.')).toEqual(['Electromotive force (e.m.f.)']);
    expect(term('Define work.')).toEqual(['Work done']);
    expect(term('What is meant by an exothermic reaction?', CHEMISTRY_DEFINITIONS)).toEqual(['Exothermic reaction']);
  });

  it('does not guess', () => {
    expect(term('Define temperature scales.')).toEqual([]);           // not "Temperature and particles"
    expect(term('Calculate the speed of the car.')).toEqual([]);      // no define-type lead
    expect(term('What is meant by a random decay?')).toEqual([]);     // not on the list
    expect(definitionForPhrase('temperature', DEFINITIONS)).toBeNull();
  });

  it('a question asking two terms gives both, once each', () => {
    expect(term('(a) Define speed. (b) Define acceleration. (c) Define speed again.')).toEqual(['Speed', 'Acceleration']);
    expect(definePhrases('Define speed.')).toEqual(['speed']);
  });
});

describe('command words', () => {
  it('finds the word the part starts with, skipping a lead-in', () => {
    expect(commandWordOf('Explain why the rate falls.')).toBe('explain');
    expect(commandWordOf('Fig. 3.1 shows a graph. Describe how the rate changes.')).toBe('describe');
    expect(commandWordOf('(b)(ii) suggest a reason')).toBe('suggest');
    expect(commandWordOf('The rate of reaction')).toBeNull();
  });

  it('every anchor is a row on the command-words page', () => {
    const rows = new Set(COMMAND_WORDS.map(c => commandWordAnchor(c.word)));
    for (const a of Object.values(COMMAND_WORD_ANCHORS)) expect(rows.has(a), a).toBe(true);
  });
});

describe('the link a lost part gets', () => {
  it('a define part on the list → the definition, landing on the term', () => {
    const l = lostPartHelp({ text: 'Define the term enzyme.' }, 'biology', lists, true);
    expect(l).toMatchObject({ kind: 'definition', term: 'Enzyme', href: '/app/science/definitions?s=biology&term=enzymes-enzyme#enzymes-enzyme' });
    expect(lostPartHelp({ text: 'define work done' }, 'physics', lists, true)?.href).toBe('/app/science/definitions?term=energy-work-done#energy-work-done');
  });

  it('a describe / explain part → what the word asks for', () => {
    expect(lostPartHelp({ text: 'Describe how the rate changes.' }, 'chemistry', lists, true))
      .toMatchObject({ kind: 'command', label: 'What ‘describe’ asks for', href: '/app/science/command-words#describe' });
    expect(lostPartHelp({ text: 'Predict the time taken.' }, 'chemistry', lists, true)?.href).toBe('/app/science/command-words#deduce-predict');
  });

  it('state only with the slip in the note; calculate and name never', () => {
    expect(lostPartHelp({ text: 'State the colour.', note: 'wrong colour' }, 'chemistry', lists, true)).toBeNull();
    expect(lostPartHelp({ text: 'State and explain which is louder.', note: 'give the reason: larger amplitude' }, 'physics', lists, true)?.href)
      .toBe('/app/science/command-words#state');
    expect(lostPartHelp({ text: 'Calculate the current.' }, 'physics', lists, true)).toBeNull();
    expect(lostPartHelp({ text: 'Name the gas.' }, 'chemistry', lists, true)).toBeNull();
  });

  it('closed lists and closed command words give nothing; never without a subject (maths)', () => {
    expect(lostPartHelp({ text: 'Define the term enzyme.' }, 'biology', {}, false)).toBeNull();
    expect(lostPartHelp({ text: 'Explain why.' }, 'physics', lists, false)).toBeNull();
    expect(lostPartHelp({ text: 'Define speed.' }, null, lists, true)).toBeNull();
  });
});

describe('a lost part out of the question', () => {
  const summary = '(a) define centre of gravity [1]; (b) rod XY 4.00 m, pivot P. (i) mass of sphere [1]; (ii) moments about P, find F [2]; (iii) force on rod by pivot [2]';

  it('labels and their words', () => {
    expect(normLabel('(b)(ii)')).toBe('b.ii');
    expect(normLabel('b ii')).toBe('b.ii');
    expect(partText(summary, '(a)')).toBe('define centre of gravity');
    expect(partText(summary, '(b)(ii)')).toBe('moments about P, find F');
    expect(partText('(a) Define speed.\n(b) Explain why.', '(c)')).toBeNull();
  });

  it('one link per lost part, from that part only, each link once', () => {
    const links = lostPartLinks({
      prompt: summary,
      lostParts: [{ label: '(a)', why: 'add the whole weight' }, { label: '(b)(ii)', why: 'take distances from P' }],
    }, 'physics', lists, true);
    expect(links).toEqual([{ label: 'Learn the definition: Centre of gravity', href: '/app/science/definitions?term=turning-effect-of-forces-centre-of-gravity#turning-effect-of-forces-centre-of-gravity', part: '(a)' }]);
    // A labelled part the prompt does not show gets nothing (never another part's term).
    expect(lostPartLinks({ prompt: 'Define an alloy. Describe the test.', lostParts: [{ label: '(b)', why: 'x' }] }, 'chemistry', lists, true)).toEqual([]);
    expect(lostPartLinks({ prompt: 'Explain why. Then explain how.', lostParts: [{ label: null, why: 'x' }, { label: null, why: 'y' }] }, 'physics', lists, true)).toHaveLength(1);
  });
});
