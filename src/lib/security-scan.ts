// ─── 🔐 The weekly security-and-privacy check (4 Nov 2026) ──────────────────────
//
// Adrian, 4 Nov 2026: "do it" — to "add a weekly automatic security-and-privacy check
// to the morning fixer … tell you only when something new or serious appears".
//
// Who does what:
//   • /api/cron/security-scan (website — it holds SUPABASE_ACCESS_TOKEN) reads Supabase's
//     security advisors for BOTH projects and what an outsider (the anon key) can really
//     read, compares with the last run's list (job_runs `security-scan` meta.keys) and
//     answers with the plain lines below. lib/security-scan-store.ts does the fetching.
//   • The bot's 5:45 morning fixer (bot repo .claude/skills/bot-review/SKILL.md §1f)
//     calls it on Mondays and puts the lines in its digest — the ☀️ brief carries them.
//
// Rules (from the request): alert on a NEW warning, on ANY error (new or not), and on a
// NEW table or storage bucket outsiders can read. INFO notes ("RLS enabled, no policy")
// are ignored — a locked table with no rule is safe. Silence when nothing is new.
// This file is pure; tests in security-scan.test.ts.

export type Project = 'maths' | 'science';

export type Finding = {
  key: string;            // stable across runs: project|kind|object
  project: Project;
  level: 'ERROR' | 'WARN' | 'PRIVACY';
  kind: string;           // advisor lint name, or public_table / public_bucket
  object: string;         // table, function, bucket … ('' for project-wide)
  title: string;
};

type AdvisorLint = {
  name: string;
  title?: string;
  level: string;
  findings?: { detail?: string; metadata?: Record<string, unknown> }[];
};

/** The advisor JSON (Management API GET /v1/projects/{ref}/advisors/security) → findings. */
export function advisorFindings(project: Project, body: unknown): Finding[] {
  const lints = ((body as { lints?: AdvisorLint[] })?.lints ?? []) as AdvisorLint[];
  const out: Finding[] = [];
  for (const l of lints) {
    if (l.level !== 'ERROR' && l.level !== 'WARN') continue;   // INFO ignored
    const items = l.findings && l.findings.length ? l.findings : [{}];
    for (const f of items) {
      const m = (f.metadata ?? {}) as Record<string, unknown>;
      const name = String(m.name ?? m.entity ?? '');
      const schema = m.schema ? `${m.schema}.` : '';
      const args = m.arguments != null ? `(${m.arguments})` : '';
      const object = name ? `${schema}${name}${args}` : '';
      out.push({
        key: `${project}|${l.name}|${object}`,
        project, level: l.level as 'ERROR' | 'WARN', kind: l.name, object,
        title: l.title || l.name,
      });
    }
  }
  return out;
}

/** Tables an outsider really read rows from, and public buckets → findings. */
export function privacyFindings(project: Project, readableTables: string[], publicBuckets: string[]): Finding[] {
  return [
    ...readableTables.map((t) => ({
      key: `${project}|public_table|${t}`, project, level: 'PRIVACY' as const,
      kind: 'public_table', object: t, title: 'Table anyone can read',
    })),
    ...publicBuckets.map((b) => ({
      key: `${project}|public_bucket|${b}`, project, level: 'PRIVACY' as const,
      kind: 'public_bucket', object: b, title: 'File folder anyone can open',
    })),
  ];
}

/** What to tell Adrian: every ERROR, plus any WARN / PRIVACY not in last run's keys.
 *  No previous list (first run) → only ERRORs; the rest becomes the starting list. */
export function toReport(now: Finding[], prevKeys: string[] | null): Finding[] {
  const prev = new Set(prevKeys ?? []);
  return now.filter((f) => f.level === 'ERROR' || (prevKeys !== null && !prev.has(f.key)));
}

/** Last run's keys that are gone now (fixed) — for the stamp, never alerted. */
export function resolvedKeys(now: Finding[], prevKeys: string[] | null): string[] {
  const have = new Set(now.map((f) => f.key));
  return (prevKeys ?? []).filter((k) => !have.has(k));
}

const DB_NAME: Record<Project, string> = { maths: 'maths database', science: 'science database' };

function shortName(object: string): string {
  return object.replace(/^public\./, '').replace(/\(.*\)$/, '');
}

/** One plain line per finding: what it is, then the next step (Adrian is not a developer). */
export function plainLine(f: Finding): string {
  const where = DB_NAME[f.project];
  const what = shortName(f.object);
  const ask = (s: string) => `→ open a Claude session in the website folder and say: "${s}"`;
  switch (f.kind) {
    case 'rls_disabled_in_public':
      return `🔴 On the ${where}, anyone on the internet can read AND change the table "${what}". ${ask(`lock the ${what} table on the ${where}`)}`;
    case 'security_definer_view':
      return `🔴 On the ${where}, the view "${what}" skips the locks on the tables under it. ${ask(`fix the ${what} view on the ${where}`)}`;
    case 'anon_security_definer_function_executable':
    case 'authenticated_security_definer_function_executable':
      return `🟠 On the ${where}, outsiders can run the behind-the-scenes helper "${what}". ${ask(`lock the ${what} helper on the ${where}`)}`;
    case 'auth_leaked_password_protection':
      return `🟠 On the ${where}, the check that refuses leaked passwords is off → Supabase website → that project → Authentication → turn on "Prevent use of leaked passwords".`;
    case 'function_search_path_mutable':
      return `🟡 On the ${where}, the helper "${what}" has no fixed search setting (low risk). ${ask(`pin the search path on ${what} on the ${where}`)}`;
    case 'extension_in_public':
      return `🟡 On the ${where}, the add-on "${what}" sits in the shared area (low risk, tidy-up only).`;
    case 'public_table':
      return `🔵 New on the ${where}: anyone with the website's public key can read the table "${what}". Fine if it holds nothing private — your call. ${ask(`should ${what} on the ${where} be public?`)}`;
    case 'public_bucket':
      return `🔵 New on the ${where}: the file folder "${what}" can be opened by anyone with a link. Fine for pictures of questions; never for student work — your call.`;
    default: {
      const lvl = f.level === 'ERROR' ? '🔴' : '🟠';
      return `${lvl} On the ${where}: ${f.title}${what ? ` — "${what}"` : ''}. ${ask(`fix the new security warning "${f.title}" on the ${where}`)}`;
    }
  }
}

/** The digest block (empty array = silence). At most 6 lines; the rest summed up. */
export function reportLines(report: Finding[]): string[] {
  if (!report.length) return [];
  const order = { ERROR: 0, WARN: 1, PRIVACY: 2 } as const;
  const sorted = [...report].sort((a, b) => order[a.level] - order[b.level] || a.key.localeCompare(b.key));
  const lines = sorted.slice(0, 6).map(plainLine);
  if (sorted.length > 6) lines.push(`… and ${sorted.length - 6} more — open /admin/ops for the full list.`);
  return lines;
}

/** One-line job_runs summary. */
export function scanSummary(now: Finding[], report: Finding[], resolved: string[], firstRun: boolean): string {
  const c = (lvl: Finding['level']) => now.filter((f) => f.level === lvl).length;
  const head = `${c('ERROR')} errors · ${c('WARN')} warnings · ${c('PRIVACY')} public tables/folders`;
  if (firstRun) return `${head} — first run, starting list saved`;
  return `${head} — ${report.length ? `${report.length} to report` : 'nothing new'}${resolved.length ? ` · ${resolved.length} fixed since last week` : ''}`;
}
