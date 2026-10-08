import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { plausibleSpeech, audioExt, bandShown, buildOralPrompt, clock, enoughSaid, maxSeconds, oralProblems, parseOralReply, promptAudio, promptsFor, publicOral, wasSaid, withoutPronunciation, type OralSet } from './english-oral';
import { ORAL_SETS, oralById } from './english-speaking-data';
import { ENGLISH_LISTENING_OPEN_TO_STUDENTS, ENGLISH_ORAL_INTERACTION_OPEN_TO_STUDENTS, ENGLISH_ORAL_OPEN_TO_STUDENTS, speakingAllowedFor, ENGLISH_SPEAKING_PREVIEW_IDENTITIES } from './portal-beta';
import { isValidKey, oralKey, ownerOf, contentTypeFor } from './student-files-url';
import { ERASE_BY_IDENTITY, ERASE_FILE_PREFIXES } from './erasure';

const set = (): OralSet => oralById('or01')!;
const SAID = ['Yes I would take part because the beach is very dirty. Yesterday we go to East Coast and I see many plastic bottle. It is very good for the environment and it is fun with friends.'];

describe('our own oral sets', () => {
  it('every set passes the checks and has its picture and spoken prompts', () => {
    expect(ORAL_SETS.length).toBeGreaterThanOrEqual(3);
    for (const s of ORAL_SETS) {
      expect(oralProblems(s), s.id).toEqual([]);
      expect(fs.existsSync(path.join(process.cwd(), 'public', s.picture)), s.picture).toBe(true);
      s.interaction.forEach((_, i) => expect(fs.existsSync(path.join(process.cwd(), 'public', promptAudio(s.id, i + 1)))).toBe(true));
    }
  });
  it('a prompt may not ask what people in the picture say', () => {
    const s = { ...set(), interaction: ['What do you think the people in the picture are saying to each other?', 'Why do people volunteer?'] };
    expect(oralProblems(s).join(' ')).toContain('must not ask what people in the picture say');
  });
  it('the page is not given how the picture was made', () => {
    expect(JSON.stringify(publicOral(set()))).not.toContain('photograph');
  });
  it('Part 1 is one prompt of up to 2 minutes; Part 2 is three of 1:30', () => {
    expect(promptsFor(set(), 'planned')).toHaveLength(1);
    expect(promptsFor(set(), 'interaction')).toHaveLength(3);
    expect(clock(maxSeconds('planned'))).toBe('2:00');
    expect(clock(maxSeconds('interaction'))).toBe('1:30');
  });
});

describe('the band shown', () => {
  it('Part 1 shows the Response band with its marks out of 10', () => {
    expect(bandShown('planned', 4)).toEqual({ line: 'Response: Band 4 · 7–8 of 10', descriptors: ['A thoughtful response which is generally well-developed and organised', 'Uses a range of largely appropriate vocabulary and structures'] });
  });
  it('Part 2 shows the band with no marks and no word on pronunciation', () => {
    const b = bandShown('interaction', 3)!;
    expect(b.line).toBe('Band 3');
    expect(b.descriptors.join(' ')).not.toMatch(/pronunciation|\d/);
    expect(withoutPronunciation('Uses a range of largely appropriate vocabulary and structures; generally clear pronunciation')).toBe('Uses a range of largely appropriate vocabulary and structures');
  });
  it('band 0 has no descriptor to read', () => {
    expect(bandShown('planned', 0)).toEqual({ line: 'Nothing to mark yet', descriptors: [] });
  });
});

describe('the prompt for the reader', () => {
  const p = buildOralPrompt(set(), 'planned', SAID);
  it('carries the picture in words, the prompt, the words said and the band table', () => {
    expect(p).toContain(set().scene);
    expect(p).toContain(set().planned);
    expect(p).toContain('Yesterday we go to East Coast');
    expect(p).toContain('Band 5: A well-considered response');
  });
  it('tells the reader it cannot hear, and the table it is given says nothing of pronunciation', () => {
    expect(p).toContain('Say NOTHING about pronunciation');
    const table = buildOralPrompt(set(), 'interaction', ['a', 'b', 'c']).split('THE BAND TABLE')[1].split('RULES')[0];
    expect(table).not.toMatch(/pronunciation/i);
  });
  it('Part 2 numbers the prompts and asks for a line on each', () => {
    const q = buildOralPrompt(set(), 'interaction', ['one', 'two', '']);
    expect(q).toContain('PROMPT 3');
    expect(q).toContain('(nothing)');
    expect(q).toContain('"prompts"');
  });
});

describe('the reply, through the belt', () => {
  const reply = (extra: Record<string, unknown> = {}) => JSON.stringify({
    band: 3, answered: 'You answered the question and gave two reasons.',
    ideas: [{ idea: 'The beach is dirty', developed: true, note: 'you gave East Coast as your example' }, { idea: 'It is fun with friends', developed: false, note: 'add a reason' }],
    organisation: 'Your reasons come one after another with no links.',
    habits: [{ name: 'tense', count: 2, said: 'Yesterday we go to East Coast', fix: 'Yesterday we went to East Coast' }, { name: 'made up', count: 1, said: 'I has never been there before', fix: 'I have never been there' }],
    upgrades: [{ said: 'It is very good for the environment', better: 'It keeps plastic out of the sea', why: 'names the benefit' }],
    next: 'Give each reason one example from your own life.', ...extra });
  it('keeps what the student really said and drops a quote they never said', () => {
    const r = parseOralReply('Here you go:\n' + reply(), 'planned', SAID)!;
    expect(r.band).toBe(3);
    expect(r.ideas).toHaveLength(2);
    expect(r.habits.map(h => h.name)).toEqual(['tense']);
    expect(r.dropped).toBe(1);
    expect(r.upgrades).toHaveLength(1);
    expect(r.prompts).toEqual([]);
  });
  it('a quote is matched whatever the punctuation or capitals', () => {
    expect(wasSaid('yesterday, we go to east coast', SAID)).toBe(true);
    expect(wasSaid('we went to East Coast', SAID)).toBe(false);
  });
  it('a line about pronunciation or fluency never reaches the page', () => {
    const r = parseOralReply(reply({ next: 'Work on your pronunciation and speak more fluently.', organisation: 'You hesitated a lot.' }), 'planned', SAID)!;
    expect(r.next).toBe('');
    expect(r.organisation).toBe('');
  });
  it('refuses a reply with no band, a band out of range, or nothing behind the band', () => {
    expect(parseOralReply('not json', 'planned', SAID)).toBeNull();
    expect(parseOralReply(reply({ band: 7 }), 'planned', SAID)).toBeNull();
    expect(parseOralReply(JSON.stringify({ band: 4 }), 'planned', SAID)).toBeNull();
  });
  it('Part 2 keeps one line a prompt, only for prompts that exist', () => {
    const r = parseOralReply(reply({ prompts: [{ n: 1, line: 'One reason, no example.' }, { n: 5, line: 'x' }] }), 'interaction', [SAID[0], 'b', 'c'])!;
    expect(r.prompts).toEqual([{ n: 1, line: 'One reason, no example.' }]);
  });
  it('caps the lists at 5 ideas, 3 habits, 3 upgrades', () => {
    const many = Array.from({ length: 9 }, () => ({ idea: 'An idea', developed: false, note: '' }));
    expect(parseOralReply(reply({ ideas: many }), 'planned', SAID)!.ideas).toHaveLength(5);
  });
});

describe('silence must never become words', () => {
  it('an ordinary answer passes', () => {
    expect(plausibleSpeech(SAID[0], 20)).toBe(true);
    expect(plausibleSpeech('Yes I would.', 2)).toBe(true);
  });
  it('more words than anyone can say in the time is nothing heard (47 silent seconds once came back as 560 words)', () => {
    const invented = Array.from({ length: 560 }, (_, i) => `word${i}`).join(' ');
    expect(plausibleSpeech(invented, 47)).toBe(false);
  });
  it('a speech that loops is nothing heard', () => {
    const loop = Array.from({ length: 5 }, (_, i) => `And I think that it is also important to be patient${i}`).join(' because ');
    expect(plausibleSpeech(loop, 120)).toBe(false);
  });
  it('no words is nothing heard', () => {
    expect(plausibleSpeech('', 30)).toBe(false);
    expect(plausibleSpeech(' … ', 30)).toBe(false);
  });
});

describe('small rules', () => {
  it('a recording with almost no words is not read', () => {
    expect(enoughSaid(['yes', ''])).toBe(false);
    expect(enoughSaid(SAID)).toBe(true);
  });
  it('only sound files a phone makes are stored', () => {
    expect(audioExt('audio/webm;codecs=opus')).toBe('webm');
    expect(audioExt('audio/mp4')).toBe('m4a');
    expect(audioExt('image/png')).toBeNull();
    expect(audioExt('')).toBeNull();
  });
});

describe('the recording is the student\'s own private file', () => {
  it('lives under oral/<identity>/ and belongs to that student', () => {
    const key = oralKey('recABC', '3f0c1a52-0000-4000-8000-000000000001', 1, 'webm');
    expect(isValidKey(key)).toBe(true);
    expect(ownerOf(key)).toEqual({ kind: 'student', identity: 'recABC' });
    expect(contentTypeFor(key)).toBe('audio/webm');
  });
  it('is erased with the account, with the words and the report', () => {
    expect(ERASE_FILE_PREFIXES).toContain('oral');
    const tables = ERASE_BY_IDENTITY.map(t => t.table);
    for (const t of ['english_oral_attempts', 'english_practice_attempts', 'plan_reads']) expect(tables).toContain(t);
  });
});

describe('the three switches', () => {
  it('are closed', () => {
    expect(ENGLISH_LISTENING_OPEN_TO_STUDENTS).toBe(false);
    expect(ENGLISH_ORAL_OPEN_TO_STUDENTS).toBe(false);
    expect(ENGLISH_ORAL_INTERACTION_OPEN_TO_STUDENTS).toBe(false);
  });
  it('a closed switch lets the preview student in and nobody else', () => {
    expect(speakingAllowedFor(false, ENGLISH_SPEAKING_PREVIEW_IDENTITIES[0])).toBe(true);
    expect(speakingAllowedFor(false, 'recSomeoneElse')).toBe(false);
    expect(speakingAllowedFor(false, null)).toBe(false);
    expect(speakingAllowedFor(true, 'recSomeoneElse')).toBe(true);
  });
});
