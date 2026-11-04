import { describe, it, expect } from 'vitest';
import { advisorFindings, privacyFindings, toReport, resolvedKeys, reportLines, plainLine, scanSummary } from './security-scan';

// The shape Supabase answered with on 4 Nov 2026 (trimmed).
const ADVISORS = {
  lints: [
    { name: 'rls_enabled_no_policy', title: 'RLS Enabled No Policy', level: 'INFO', findings: [{ metadata: { name: 'job_runs', schema: 'public' } }] },
    { name: 'anon_security_definer_function_executable', title: 'Public Can Execute SECURITY DEFINER Function', level: 'WARN',
      findings: [{ metadata: { name: 'practice_topics', schema: 'public', arguments: 'p_level text' } }] },
    { name: 'auth_leaked_password_protection', title: 'Leaked Password Protection Disabled', level: 'WARN', findings: [{ metadata: { type: 'auth', entity: 'Auth' } }] },
    { name: 'rls_disabled_in_public', title: 'RLS Disabled in Public', level: 'ERROR', findings: [{ metadata: { name: 'students', schema: 'public' } }] },
  ],
};

describe('advisorFindings', () => {
  it('drops INFO, keeps WARN and ERROR with stable keys', () => {
    const f = advisorFindings('maths', ADVISORS);
    expect(f.map((x) => x.key)).toEqual([
      'maths|anon_security_definer_function_executable|public.practice_topics(p_level text)',
      'maths|auth_leaked_password_protection|Auth',
      'maths|rls_disabled_in_public|public.students',
    ]);
  });
  it('survives an empty or odd body', () => {
    expect(advisorFindings('science', {})).toEqual([]);
    expect(advisorFindings('science', null)).toEqual([]);
  });
});

describe('toReport', () => {
  const now = [...advisorFindings('maths', ADVISORS), ...privacyFindings('science', ['bank_topics'], ['question_images'])];
  it('first run: only errors, the rest becomes the starting list', () => {
    expect(toReport(now, null).map((f) => f.kind)).toEqual(['rls_disabled_in_public']);
  });
  it('same list as last week: errors still reported, nothing else', () => {
    expect(toReport(now, now.map((f) => f.key)).map((f) => f.kind)).toEqual(['rls_disabled_in_public']);
  });
  it('a new warning and a new public table are reported', () => {
    const prev = now.map((f) => f.key).filter((k) => !k.includes('practice_topics') && !k.includes('bank_topics'));
    expect(toReport(now, prev).map((f) => f.kind).sort()).toEqual(['anon_security_definer_function_executable', 'public_table', 'rls_disabled_in_public']);
  });
  it('fixed since last week is counted, never alerted', () => {
    expect(resolvedKeys(now, [...now.map((f) => f.key), 'maths|extension_in_public|public.vector'])).toEqual(['maths|extension_in_public|public.vector']);
  });
});

describe('wording', () => {
  it('no new findings = silence', () => {
    expect(reportLines([])).toEqual([]);
  });
  it('plain words with a next step, no jargon codes', () => {
    const [fn] = advisorFindings('maths', ADVISORS);
    const line = plainLine(fn);
    expect(line).toContain('practice_topics');
    expect(line).toContain('maths database');
    expect(line).toContain('→');
    expect(line).not.toMatch(/SECURITY DEFINER|anon|rpc/);
  });
  it('errors come first and the list is capped', () => {
    const many = privacyFindings('maths', Array.from({ length: 9 }, (_, i) => `t${i}`), []);
    const err = advisorFindings('maths', ADVISORS).filter((f) => f.level === 'ERROR');
    const lines = reportLines([...many, ...err]);
    expect(lines[0]).toMatch(/^🔴/);
    expect(lines).toHaveLength(7);
    expect(lines[6]).toContain('4 more');
  });
  it('summary', () => {
    const now = advisorFindings('maths', ADVISORS);
    expect(scanSummary(now, [], [], true)).toContain('first run');
    expect(scanSummary(now, [], ['x'], false)).toContain('nothing new · 1 fixed');
  });
});
