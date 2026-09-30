// Sonnet 5.5 — one setting, the three switched website sites, and reading replies
// that start with a thinking block (30 Sep 2026).
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { SONNET_55, anthropicText } from './claude-models';

const SRC = path.join(__dirname, '..');
const ROOT = path.join(SRC, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function files(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) files(p, out);
    else if (/\.(ts|tsx|js|mjs|cjs)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p);
  }
  return out;
}
const rel = (p: string) => path.relative(ROOT, p).split(path.sep).join('/');

// The website's share of the 17 approved sites; every other Sonnet call stays put.
const SWITCHED: Record<string, RegExp> = {
  'src/lib/practice-hint.ts': /HINT_MODEL = process\.env\.PRACTICE_HINT_MODEL \|\| SONNET_55;/,
  'src/lib/paper-book-split-io.ts': /COVER_MODEL = process\.env\.BOOK_COVER_MODEL \|\| SONNET_55;/,
  'src/app/api/admin-schedule/extract-exam-topics/route.ts': /const EXTRACTION_MODEL = SONNET_55;/,
};

describe('Sonnet 5.5 setting', () => {
  it('defaults to claude-sonnet-5-5', () => {
    if (!process.env.SONNET_55_MODEL) expect(SONNET_55).toBe('claude-sonnet-5-5');
  });

  it('no sonnet-5-5 id is hard-coded outside src/lib/claude-models.ts', () => {
    const offenders = files(SRC).map(rel)
      .filter(f => f !== 'src/lib/claude-models.ts')
      .filter(f => /['"`]claude-sonnet-5-5/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('exactly the approved website sites use it', () => {
    for (const [f, re] of Object.entries(SWITCHED)) expect(read(f), f).toMatch(re);
    const users = files(SRC).map(rel)
      .filter(f => f !== 'src/lib/claude-models.ts')
      .filter(f => /\bSONNET_55\b/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
    expect(users.sort()).toEqual(Object.keys(SWITCHED).sort());
  });

  it('no switched request sends a shape Sonnet 5.5 refuses', () => {
    // the request literal around each switched model
    const sites: Array<[string, RegExp]> = [
      ['src/app/api/portal/practice/hint/route.ts', /model: HINT_MODEL,[\s\S]*?messages:/],
      ['src/lib/paper-book-split-io.ts', /messages\.create\(\{\s*model,[\s\S]*?messages:/],
      ['src/app/api/admin-schedule/extract-exam-topics/route.ts', /model: EXTRACTION_MODEL,[\s\S]*?messages:/],
    ];
    for (const [f, re] of sites) {
      const m = read(f).match(re);
      expect(m, f).not.toBeNull();
      expect(m![0], f).not.toMatch(/temperature|top_p|top_k|budget_tokens|tool_choice|thinking/);
    }
  });
});

describe('anthropicText', () => {
  it('skips a thinking block that comes first', () => {
    expect(anthropicText({ content: [{ type: 'thinking' }, { type: 'text', text: 'ok' }] })).toBe('ok');
  });
  it('takes the first text block, and is empty without one', () => {
    expect(anthropicText({ content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] })).toBe('a');
    expect(anthropicText({ content: [{ type: 'thinking' }] })).toBe('');
    expect(anthropicText(null)).toBe('');
    expect(anthropicText({} as never)).toBe('');
  });

  it('no Claude reply in src/ is read as content[0]', () => {
    const offenders = files(SRC).map(rel).filter(f => {
      const code = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n')
        .filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');
      return /\.content(\?\.)?\[0\](\?\.)?\.(text|type)\b/.test(code);
    });
    expect(offenders).toEqual([]);
  });
});
