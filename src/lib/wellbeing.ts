// The wellbeing word check for things a student SAYS on the website (5 Nov 2026) — first user:
// the English oral speaking partner (SPEC-ENGLISH-ORAL-LISTENING.md §Speaking partner), where a
// student talks freely and may say something worrying.
//
// A COPY of the bot's rules: bot repo lib/wellbeing.js (RULES, screen, seriousReply) and
// config/help-lines.js (official numbers only, checked 5 Nov 2026). Spec: bot docs/SOLVER.md
// §Wellbeing safety rules. Change them together. Only the serious levels are copied: everyday
// stress ("I'm so stressed about exams") is a fair thing to say in an oral answer and is left alone.
//
//   strong — unmistakable first-person words: serious at once, no model call.
//   check  — usually serious but also said in passing or about other people ("students getting
//            bullied online"): a small model call decides; if it fails, the rule's `fallback` is used.

export type WellbeingKind = 'self_harm' | 'abuse' | 'danger' | 'bullying';
export type Screen = { level: 'none' } | { level: 'serious'; kind: WellbeingKind } | { level: 'check'; kind: WellbeingKind; fallback: 'serious' | 'none' };

export const HELP_LINES = {
  mindline: { name: 'mindline', call: '1771', whatsapp: '6669 1771', hours: '24 hours' },
  navh: { name: 'National Anti-Violence and Sexual Harassment Helpline', call: '1800 777 0000', hours: '24 hours' },
  police: { name: 'Police', call: '999' },
  ambulance: { name: 'Ambulance', call: '995' },
} as const;

const SELF = String.raw`(?:my ?self|meself)`;
const ADULT_OR_PEER = String.raw`(?:dad|daddy|father|papa|mum|mummy|mom|mommy|mother|mama|parents?|step-?(?:dad|father|mum|mom|mother)|uncle|aunt(?:ie|y)?|grand(?:pa|ma|father|mother)|brother|sister|bro|sis|cousin|tutor|teacher|coach|maid|helper|boyfriend|girlfriend|bf|gf|classmates?|seniors?)`;
const DOES_HARM = String.raw`(?:hits?|hitting|beats?|beat me up|beating|slap(?:s|ped|ping)?|kick(?:s|ed|ing)?|punch(?:es|ed|ing)?|chok(?:es|ed|ing)|strangl(?:es|ed|ing)|burn(?:s|ed|t)|touch(?:es|ed|ing)|grop(?:es|ed|ing)|threaten(?:s|ed|ing)?|lock(?:s|ed)|starv(?:es|ed)|hurts?|hurting|abus(?:es|ed|ing))`;

type Rule = { tier: 'strong' | 'check'; kind: WellbeingKind; fallback?: 'serious' | 'stress'; re: RegExp };
// In the bot's order. `fallback: 'stress'` = not serious when the model check fails.
const RULES: Rule[] = [
  { tier: 'strong', kind: 'self_harm', re: new RegExp(String.raw`\b(?:kill|killing|hang|hanging|unalive|unaliving)\s+${SELF}\b`, 'i') },
  { tier: 'strong', kind: 'self_harm', re: /\bsuicidal\b|\b(?:commit|committing|attempt(?:ed|ing)?|thinking (?:of|about)|thoughts? of)\s+suicide\b/i },
  { tier: 'strong', kind: 'self_harm', re: /\bend(?:ing)?\s+(?:my|my own)\s+life\b|\btake\s+my\s+(?:own\s+)?life\b/i },
  { tier: 'check', kind: 'self_harm', fallback: 'serious', re: /\b(?:don'?t|do not|no longer)\s+want\s+to\s+(?:live|be alive|exist|wake up)\b/i },
  { tier: 'strong', kind: 'self_harm', re: /\bno\s+(?:reason|point)\s+(?:to|in)\s+(?:live|living|being alive)\b|\bbetter\s+off\s+(?:dead|without\s+me)\b/i },
  { tier: 'strong', kind: 'self_harm', re: new RegExp(String.raw`\bself[\s-]?harm(?:ing|ed)?\b|\bharm(?:ing)?\s+${SELF}\b`, 'i') },
  { tier: 'check', kind: 'self_harm', fallback: 'serious', re: /\b(?:i|i'm|im|i am)\s+(?:really\s+|just\s+|so\s+)?(?:want|wanna|going|gonna|wish(?:ing)?|feel like i want)\s+(?:to\s+)?(?:die|be dead|disappear(?: forever)?)\b|\bwish\s+i\s+(?:was|were)\s+(?:dead|never born)\b|\bi\s+wanna\s+die\b/i },
  { tier: 'check', kind: 'self_harm', fallback: 'serious', re: new RegExp(String.raw`\b(?:cut|cutting|hurt|hurting|burn|burning|starve|starving|punish(?:ing)?)\s+${SELF}\b`, 'i') },
  { tier: 'check', kind: 'self_harm', fallback: 'serious', re: /\bsuicide\b|\boverdos(?:e|ed|ing)\b|\bjump(?:ing)?\s+off\s+(?:the|a|my)\s+(?:building|block|roof|bridge|window|ledge)\b/i },
  { tier: 'check', kind: 'self_harm', fallback: 'stress', re: /\bcan(?:'?t| ?not)\s+(?:go on|take (?:it|this) anymore|do this anymore|cope)\b|\bhate\s+my\s+life\b|\bwhat'?s\s+the\s+point\s+of\s+(?:living|life|anything)\b/i },
  { tier: 'check', kind: 'abuse', fallback: 'serious', re: new RegExp(String.raw`\b(?:my|our)\s+${ADULT_OR_PEER}\s+(?:always\s+|keeps?\s+|often\s+|sometimes\s+|still\s+)?${DOES_HARM}\s+(?:me|us)\b`, 'i') },
  { tier: 'check', kind: 'abuse', fallback: 'serious', re: /\b(?:abus(?:ed|ing|es)\s+me|(?:he|she|they)\s+(?:is|are)\s+abusive|molest(?:ed|ing|s)?|rap(?:ed|ing)\s+me|raped\b|sexually\s+(?:abused|assaulted|harassed)|touch(?:ed|es|ing)\s+me\s+(?:there|inappropriately)|inappropriately\s+touch)/i },
  { tier: 'check', kind: 'danger', fallback: 'serious', re: /\b(?:scared|afraid|frightened)\s+(?:to\s+go|of\s+going)\s+home\b|\bnot\s+safe\s+(?:at\s+home|at\s+school|here)\b|\b(?:kicked|chased|thrown)\s+me\s+out\b|\bi'?m\s+(?:in\s+danger|not\s+safe)\b|\b(?:someone|somebody|a\s+(?:man|guy|stranger))\s+(?:is\s+)?(?:following|stalking)\s+me\b/i },
  { tier: 'check', kind: 'danger', fallback: 'stress', re: /\b(?:is|are|will|gonna|going\s+to)\s+(?:\w+\s+)?kill\s+me\b/i },
  { tier: 'check', kind: 'bullying', fallback: 'serious', re: /\bbull(?:y|ies|ied|ying)\s+me\b|\b(?:being|been|getting|got)\s+bullied\b|\bcyber-?bull/i },
  { tier: 'check', kind: 'bullying', fallback: 'stress', re: new RegExp(String.raw`\b(?:they|he|she|everyone|everybody|people|my\s+${ADULT_OR_PEER})\s+(?:all\s+)?(?:keeps?\s+|always\s+)?(?:laugh(?:s|ing)?\s+at|mak(?:e|es|ing)\s+fun\s+of|teas(?:e|es|ing)|pick(?:s|ing)?\s+on|ignor(?:e|es|ing)|exclud(?:e|es|ing)|insult(?:s|ing)?|spread(?:s|ing)?\s+rumou?rs\s+about)\s+me\b`, 'i') },
];

/** The word check. Pure and cheap. */
export function screen(text: string): Screen {
  const t = String(text ?? '').replace(/[’‘]/g, "'").slice(0, 4000);
  if (!t.trim()) return { level: 'none' };
  for (const r of RULES) if (r.tier === 'strong' && r.re.test(t)) return { level: 'serious', kind: r.kind };
  for (const r of RULES) if (r.tier === 'check' && r.re.test(t)) return { level: 'check', kind: r.kind, fallback: r.fallback === 'serious' ? 'serious' : 'none' };
  return { level: 'none' };
}

/** The small model check's question, for a `check` hit. Answer: one word. */
export function concernPrompt(words: string): string {
  return `A secondary school student in Singapore said this aloud while practising for an English oral exam:
<<<
${String(words).slice(0, 3000)}
>>>
Is the student saying that THEY THEMSELVES are at risk right now — thinking of hurting or killing themselves, being hurt or abused by someone, unsafe at home, or being bullied? Talking about the topic in general, about other people, about a story, or as a figure of speech ("my mum will kill me if I'm late") is NOT at risk.
Reply with one word only: RISK or SAFE.`;
}
/** The model's one word → serious or not; unreadable → null (use the rule's fallback). */
export function readConcern(reply: string): boolean | null {
  const t = String(reply ?? '').trim().toUpperCase();
  if (/^\W*RISK\b/.test(t)) return true;
  if (/^\W*SAFE\b/.test(t)) return false;
  return null;
}

/** What the student reads instead of the next question. Fixed words, never model-written. */
export function helpLines(kind: WellbeingKind): { lead: string; lines: string[] } {
  const L = HELP_LINES;
  const mindline = `To talk to someone now, call ${L.mindline.name} at ${L.mindline.call}, or WhatsApp ${L.mindline.whatsapp} (${L.mindline.hours}).`;
  if (kind === 'abuse' || kind === 'danger') {
    return {
      lead: 'Thank you for saying this. No one should hurt you or make you feel unsafe, and it is not your fault.',
      lines: [
        `In danger right now? Call ${L.police.call} (police). Someone hurt? Call ${L.ambulance.call} (ambulance).`,
        'Please tell a teacher, your school counsellor or another adult you trust today.',
        `${L.navh.name}: ${L.navh.call} (${L.navh.hours}).`,
        mindline,
        'Your tutor will know, so they can check in with you.',
      ],
    };
  }
  if (kind === 'bullying') {
    return {
      lead: "I'm sorry this is happening. Being bullied is not your fault.",
      lines: [
        'Please tell a teacher, your school counsellor or a parent. They can do something about it.',
        mindline,
        'Your tutor will know, so they can check in with you.',
      ],
    };
  }
  return {
    lead: "I'm really glad you said this. What you're feeling matters, and you don't have to deal with it alone.",
    lines: [
      'Please talk to someone you trust today: a parent, a teacher or your school counsellor.',
      mindline,
      `If you might hurt yourself, or you are in danger, call ${L.ambulance.call} (ambulance) or ${L.police.call} (police).`,
      'Your tutor will know, so they can check in with you.',
    ],
  };
}

const KIND_LABEL: Record<WellbeingKind, string> = { self_harm: 'self-harm or suicide', abuse: 'abuse', danger: 'danger', bullying: 'bullying' };

/** Adrian's alert (plain text, students topic). */
export function alertText({ kind, who, where, words, source }: { kind: WellbeingKind; who: string; where: string; words: string; source: 'keyword' | 'model' | 'fallback' }): string {
  return [
    `🆘 ${who || 'A student'} may need help: ${KIND_LABEL[kind]}`,
    '',
    `They said: "${String(words).replace(/\s+/g, ' ').trim().slice(0, 600)}"`,
    '',
    `Where: ${where}`,
    `The practice stopped and showed them the help lines (mindline ${HELP_LINES.mindline.call}${kind === 'abuse' || kind === 'danger' ? `, ${HELP_LINES.navh.call}, ${HELP_LINES.police.call}` : ''}) and told them to talk to a trusted adult.`,
    `Found by: ${source === 'keyword' ? 'clear words' : source === 'model' ? 'word check + small model check' : 'word check (the model check failed, so it was treated as serious)'}`,
  ].join('\n');
}
