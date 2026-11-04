import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { cronAuth } from './cron-auth';

const req = (h: Record<string, string>) => ({ headers: { get: (n: string) => h[n.toLowerCase()] ?? null } });

describe('cronAuth — the one door for scheduled jobs', () => {
  const saved = { cron: process.env.CRON_SECRET, admin: process.env.ADMIN_PASSWORD };
  beforeEach(() => { process.env.CRON_SECRET = 'cron-s3cret'; process.env.ADMIN_PASSWORD = 'admin-pw'; });
  afterEach(() => { process.env.CRON_SECRET = saved.cron; process.env.ADMIN_PASSWORD = saved.admin; });

  it('opens for the CRON_SECRET bearer (what Vercel sends)', () => {
    expect(cronAuth(req({ authorization: 'Bearer cron-s3cret' }))).toBe(true);
  });
  it('opens for the admin bearer', () => {
    expect(cronAuth(req({ authorization: 'Bearer admin-pw' }))).toBe(true);
  });
  it('does NOT open for the x-vercel-cron header — anyone can send it (4 Nov 2026)', () => {
    expect(cronAuth(req({ 'x-vercel-cron': '1' }))).toBe(false);
    expect(cronAuth(req({ 'x-vercel-cron': '1', authorization: 'Bearer wrong' }))).toBe(false);
  });
  it('stays shut with no header, a wrong bearer, or an unset secret', () => {
    expect(cronAuth(req({}))).toBe(false);
    expect(cronAuth(req({ authorization: 'Bearer nope' }))).toBe(false);
    delete process.env.CRON_SECRET; delete process.env.ADMIN_PASSWORD;
    expect(cronAuth(req({ authorization: 'Bearer ' }))).toBe(false);
  });
});

describe('no route trusts the scheduler header again', () => {
  it('src/ has no quoted x-vercel-cron outside this test', () => {
    const root = path.join(__dirname, '..');
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) { if (ent.name !== 'node_modules') walk(p); continue; }
        if (!/\.(ts|tsx|js|mjs)$/.test(ent.name) || p.endsWith('cron-auth.test.ts')) continue;
        if (/['"]x-vercel-cron['"]/.test(fs.readFileSync(p, 'utf8'))) hits.push(path.relative(root, p));
      }
    };
    walk(root);
    expect(hits, 'use cronAuth() from lib/cron-auth instead').toEqual([]);
  });
});
