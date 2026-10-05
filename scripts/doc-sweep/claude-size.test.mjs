// CLAUDE.md is the LEAN INDEX (Adrian, 6 Oct 2026: "yes" to slimming it). Every session and
// every subagent loads it on start, so each KB here is paid by every agent. Run by `npm test`
// (pre-push gated); the Sunday doc-sweep reports the same cap for both repos.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { claudeMdOverCap, CLAUDE_MD_CAP_BYTES } from './claims.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');

describe('CLAUDE.md stays the lean index', () => {
  it(`is at most ${CLAUDE_MD_CAP_BYTES / 1024} KB`, () => {
    const bytes = fs.statSync(path.join(root, 'CLAUDE.md')).size;
    expect(claudeMdOverCap(bytes), `CLAUDE.md is ${Math.round(bytes / 1024)} KB — move detail into docs/ — CLAUDE.md is the lean index`).toBeNull();
  });
  it('every doc the routing table links to exists', () => {
    const md = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8');
    const targets = [...new Set([...md.matchAll(/\]\(((?:docs\/)?[A-Za-z0-9-]+\.md)\)/g)].map((m) => m[1]))];
    expect(targets.length).toBeGreaterThan(10);
    for (const t of targets) expect(fs.existsSync(path.join(root, t)), `CLAUDE.md links to ${t}, which does not exist`).toBe(true);
  });
  it('the cap rule', () => {
    expect(claudeMdOverCap(40 * 1024)).toBeNull();
    expect(claudeMdOverCap(40 * 1024 + 1)).toMatch(/move detail into docs\//);
  });
});
