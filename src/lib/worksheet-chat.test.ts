import { describe, expect, it } from 'vitest';
import { buildChatPrompt, parseChatReply, plainChatAsk } from './worksheet-chat';

const courses: { subject: 'EM' | 'AM'; topics: string[]; skills: Record<string, string[]> }[] = [
  { subject: 'EM' as const, topics: ['Trigonometry', 'Vectors', 'Circle Properties'], skills: { Trigonometry: ['Sine Rule', 'Cosine Rule', 'Bearings on level ground'] } },
  { subject: 'AM' as const, topics: ['Logarithms', 'Trigonometry (Identities)'], skills: {} },
];

describe('worksheet chat', () => {
  it('the prompt lists the real topics and sub-skills', () => {
    const p = buildChatPrompt('10 on sine rule, harder', { name: 'Eva', level: 'Sec 3' }, courses);
    expect(p).toContain('- Trigonometry (sub-skills: Sine Rule; Cosine Rule; Bearings on level ground)');
    expect(p).toContain('10 on sine rule, harder');
  });
  it('a good reply is checked against the lists', () => {
    const r = parseChatReply('```json\n{"subject":"EM","topics":["trigonometry"],"skills":["sine rule","Made up"],"count":30,"band":"advanced","title":"Sine rule, harder"}\n```', courses);
    expect(r).toEqual({ subject: 'EM', topics: ['Trigonometry'], skills: ['Sine Rule'], count: 15, band: 'advanced', title: 'Sine rule, harder' });
  });
  it('a made-up topic is refused, an error passes through', () => {
    expect(parseChatReply('{"subject":"EM","topics":["Calculus"]}', courses)).toEqual({ error: "None of those topics is in EM's list." });
    expect(parseChatReply('{"error":"Not a maths topic."}', courses)).toEqual({ error: 'Not a maths topic.' });
    expect(parseChatReply('no json', courses)).toEqual({ error: 'Could not read that request.' });
  });
  it('skills only narrow a single topic', () => {
    const r = parseChatReply('{"subject":"EM","topics":["Trigonometry","Vectors"],"skills":["Sine Rule"]}', courses) as { skills: string[]; count: number };
    expect(r.skills).toEqual([]);
    expect(r.count).toBe(8);
  });
  it('the plain fallback', () => {
    expect(plainChatAsk('12 harder logarithms questions', courses)).toMatchObject({ subject: 'AM', topics: ['Logarithms'], count: 12, band: 'advanced' });
    expect(plainChatAsk('something nice', courses)).toHaveProperty('error');
  });
});
