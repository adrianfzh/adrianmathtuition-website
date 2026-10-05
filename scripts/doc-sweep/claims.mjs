// 🧹 The stale-doc sweeper — the PURE half (Adrian, 5 Oct 2026: "stale-doc sweeper").
//
// Pulls the claims a doc makes that a machine can check — file paths, function and
// constant names, routes, model ids, cron lines, the student switches' states — and
// judges each one against an index of the code. No I/O here: check.mjs builds the
// index (git ls-files, the code's tokens, the live table list) and hands it in.
// Tested in src/lib/doc-claims.test.ts.

/** Words near a claim that say the doc names it ON PURPOSE as gone, old or not built yet. */
export const HISTORY_WORDS =
  /\b(deleted|removed|retired|gone|was|were|renamed|dropped|no longer|history|used to|old|formerly|replaced|superseded|legacy|deprecated|pulled|parked|cut|will|would|planned|proposed|not built|nothing built|to build|unbuilt|future|later|someday|if wanted back|never existed|before that|until then|stub)\b/i;

/**
 * Does the doc name `claim` on purpose as gone, old or not built yet? Looks from the start of
 * the claim's sentence (at most 400 characters back) to 60 characters after it.
 */
export function nearHistory(line, claim, after = 100) {
  let i = line.indexOf(claim);
  if (i < 0) return HISTORY_WORDS.test(line);
  while (i >= 0) {
    if (/~~[^~]*$/.test(line.slice(0, i)) && line.slice(i).includes('~~')) return true; // struck through
    const back = line.slice(Math.max(0, i - 400), i);
    const cut = Math.max(back.lastIndexOf('. '), back.lastIndexOf(' — '), back.lastIndexOf('; '));
    const w = (cut >= 0 ? back.slice(cut) : back) + ' ' + line.slice(i + claim.length, i + claim.length + after);
    if (HISTORY_WORDS.test(w)) return true;
    i = line.indexOf(claim, i + 1);
  }
  return false;
}

/** The two repos left ~/Desktop on 4 Sep 2026 (~/.claude/CLAUDE.md). */
export const DESKTOP_REPO_RE = /~\/Desktop\/(adrianmathtuition-website|adrianmath-telegram-math-bot)\b/g;

const CODE_EXT = '(?:ts|tsx|js|mjs|cjs|sh|py|sql|json|toml|ya?ml|md|txt|html|css|plist|swift)';
const PATH_RE = new RegExp(`^(?:\\./)?[\\w@.\\[\\]-]+(?:/[\\w@.\\[\\]()-]+)*\\.${CODE_EXT}$`);
const DIR_RE = /^(?:\.\/)?(?:src|lib|scripts|worker|docs|ai|handlers|data|supabase|migrations|test|prompts|config|cron|public|\.claude|\.githooks|\.github|ios-shell|sql)\/[\w@.\[\]\/-]*\/$/;
const ROUTE_RE = /(?:^|[\s(`'"])((?:\/api|\/admin|\/app)\/[\w\-\/\[\]\.]*[\w\]])/g;
const MODEL_RE = /\b(claude-(?:opus|sonnet|haiku|fable)-[0-9][\w.-]*[0-9a-z]|gemini-[0-9][\w.-]*[0-9a-z]|gpt-[0-9][\w.-]*[0-9a-z])\b/g;
const CRON_RE = /`((?:[\d*\/,-]+\s+){4}[\d*\/,-]+)`/g;

/** Builtin slash commands that are not skills. */
const BUILTIN_SLASH = new Set(['help', 'clear', 'loop', 'start', 'ws', 'handin', 'compact', 'init', 'review', 'model', 'config', 'login', 'logout', 'cost', 'memory', 'agents', 'mcp', 'resume', 'status', 'doctor', 'artifacts', 'schedule', 'plugin', 'skills', 'exit', 'tmp', 'data', 'app']);

/** Backtick spans on a line (single backticks; ``…`` and fenced blocks are handled by the caller). */
export function backtickSpans(line) {
  const out = [];
  const re = /`([^`\n]+)`/g;
  let m;
  while ((m = re.exec(line))) out.push(m[1].trim());
  return out;
}

/** Markdown link targets that look like repo paths: [x](docs/OPS.md#anchor) → docs/OPS.md */
export function linkTargets(line) {
  const out = [];
  const re = /\]\(([^)\s]+)\)/g;
  let m;
  while ((m = re.exec(line))) {
    const t = m[1].replace(/#.*$/, '');
    if (!t || /^(https?:|mailto:|#)/.test(t)) continue;
    out.push(t);
  }
  return out;
}

/** Normalise a path-looking span: strip ./, :line, #anchor, trailing punctuation. null when it is not a repo path. */
export function asPath(span) {
  const home = span.trim().match(/^~\/dev\/(adrianmathtuition-website|adrianmath-telegram-math-bot)(?:-2)?\/(.+)$/);
  if (home) { const inner = asPath(home[2]); return inner ? `@${home[1].startsWith('adrianmathtuition') ? 'web' : 'bot'}:${inner}` : null; }
  let s = span.trim().replace(/^\.\//, '').replace(/[#?].*$/, '').replace(/:\d+(?:-\d+)?$/, '').replace(/[.,;:]+$/, '');
  if (!s || /\s/.test(s) || /^(https?:|~|\/|\$|<|\{)/.test(s)) return null;
  if (/[*<>{}…$]/.test(s) || s.includes('..')) return null;
  if (s.split('/').some(p => p === '')) return DIR_RE.test(s) ? s : null;
  return PATH_RE.test(s) ? s : null;
}

/** An identifier-shaped span worth checking: camelCase / PascalCase with a hump, UPPER_SNAKE, or lower_snake. */
export function identifierKind(tok) {
  if (tok.length < 6) return null;
  if (/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/.test(tok)) return 'constant';
  if (/^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/.test(tok)) return 'snake';
  if (/^[a-z]+[a-z0-9]*[A-Z][A-Za-z0-9]*$/.test(tok)) return 'function';
  return null;
}

/**
 * The identifiers a span claims exist. `foo(x)`, `lib/x.ts foo`, `A.b.c`, `NAME=1`, `NAME = true` are all
 * read; prose spans (more than 3 words) are skipped.
 */
export function identifiersIn(span) {
  if (span.split(/\s+/).length > 3) return [];
  if (/^(https?:|\/|~)/.test(span) || /["']/.test(span)) return [];
  const head = span.replace(/\s*(?:={1,3}|:)\s*.*$/, m => (m.includes('=') || m.includes(':') ? '' : m)).replace(/\(.*$/, '');
  return head.split(/[^A-Za-z0-9_]+/).filter(t => identifierKind(t) && !/^\d/.test(t));
}

/** A `NAME = value` / `NAME=value` state claim in a span. */
export function assignmentIn(span) {
  const m = span.match(/^([A-Z][A-Z0-9_]+)\s*={1,3}\s*([\w.'"-]+)$/);
  return m ? { name: m[1], value: m[2].replace(/['"]/g, '') } : null;
}

/** Route strings on a line. */
export function routesIn(line) {
  const out = new Set();
  let m;
  ROUTE_RE.lastIndex = 0;
  while ((m = ROUTE_RE.exec(line))) {
    let r = m[1].replace(/\.$/, '').replace(/\/$/, '');
    r = r.replace(/\/(route|page)\.(ts|tsx|js)$/, '');
    if (/\.\w{1,4}$/.test(r)) continue; // a file under /app on the Fly image, not a route
    if (r.split('/').length < 3) continue;
    out.add(r);
  }
  return [...out];
}

export function modelIdsIn(line) {
  return [...new Set([...line.matchAll(MODEL_RE)].map(m => m[1]))];
}

export function cronsIn(line) {
  return [...line.matchAll(CRON_RE)].map(m => m[1].trim().replace(/\s+/g, ' '));
}

/** Does `route` resolve against the app dir? `dirs` = Set of every directory under src/app that holds a page/route. */
export function routeResolves(route, appEntries) {
  const segs = route.replace(/^\//, '').split('/').filter(Boolean);
  // each entry: array of segments, e.g. ['api','admin','papers'] or ['app','marking','[id]']
  outer: for (const entry of appEntries) {
    let i = 0, j = 0;
    while (i < segs.length && j < entry.length) {
      const e = entry[j];
      if (/^\(.*\)$/.test(e)) { j++; continue; } // route group
      if (/^\[\[?\.\.\./.test(e)) return true;   // catch-all
      if (e === segs[i] || /^\[.+\]$/.test(e) || /^\[.+\]$/.test(segs[i]) || /^<.*>$/.test(segs[i])) { i++; j++; continue; }
      continue outer;
    }
    while (j < entry.length && /^\(.*\)$/.test(entry[j])) j++;
    if (i === segs.length && j === entry.length) return true;
  }
  return false;
}

/** The switch table (docs/SWITCHES.md; CLAUDE.md before 6 Oct 2026): rows naming `*_OPEN_TO_STUDENTS` with an open/closed word. */
export function switchTableClaims(lines) {
  const out = [];
  lines.forEach((line, i) => {
    if (!line.startsWith('|') || !line.includes('_OPEN_TO_STUDENTS')) return;
    const cells = line.split('|').map(c => c.trim());
    const names = [...(cells[1] || '').matchAll(/`([A-Z_]+_OPEN_TO_STUDENTS)`/g)].map(m => m[1]);
    const state = (cells[2] || '').toLowerCase();
    let open = null;
    if (/\bopen\b/.test(state) && !/\bclosed\b/.test(state.replace(/opened and closed/, ''))) open = true;
    if (/^\**closed/.test(state) || /\bclosed\b/.test(state.replace(/opened and closed again/, 'closed'))) open = open === true ? null : false;
    if (/closed in code/.test(state)) open = false;
    for (const n of names) out.push({ line: i + 1, name: n, open });
  });
  return out;
}

/** `export const X_OPEN_TO_STUDENTS = true|false` lines → map. */
export function switchStates(src) {
  const map = {};
  for (const m of src.matchAll(/export const ([A-Z_]+_OPEN_TO_STUDENTS)\s*(?::\s*boolean\s*)?=\s*(true|false)/g)) map[m[1]] = m[2] === 'true';
  return map;
}

/** jobs.sh / learn.sh times: `"name|HH:MM|wd"` specs and `due_epoch HH:MM` lines near a job name. */
export function workerTimes(jobsSh, extraSh = []) {
  const times = {};
  for (const m of jobsSh.matchAll(/"([a-z0-9-]+)\|(\d\d:\d\d)\|(\d?)"/g)) (times[m[1]] ||= new Set()).add(m[2]);
  for (const src of extraSh) {
    for (const m of src.matchAll(/due=\$\(due_epoch (\d\d:\d\d)(?: (\d))?\)[^\n]*\n[^\n]*?\$SCHED\/([a-z0-9-]+)\.last/g)) (times[m[3]] ||= new Set()).add(m[1]);
  }
  return Object.fromEntries(Object.entries(times).map(([k, v]) => [k, [...v].sort()]));
}

/** HH:MM times stated in a free-text "when" (e.g. "04:15 and 16:15", "daily 5:45am"). */
export function statedTimes(text) {
  const out = new Set();
  for (const m of text.matchAll(/\b(\d{1,2})[:.](\d\d)\s*(am|pm)?\b/gi)) {
    let h = +m[1];
    const ap = (m[3] || '').toLowerCase();
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    if (h > 23) continue;
    out.add(`${String(h).padStart(2, '0')}:${m[2]}`);
  }
  for (const m of text.matchAll(/(?<![:.\d])(\d{1,2})\s*(am|pm)\b/gi)) {
    let h = +m[1];
    if (m[2].toLowerCase() === 'pm' && h < 12) h += 12;
    if (m[2].toLowerCase() === 'am' && h === 12) h = 0;
    out.add(`${String(h).padStart(2, '0')}:00`);
  }
  return [...out].sort();
}

/** MEMORY.md index links → file names. */
export function memoryIndexLinks(indexText) {
  return [...indexText.matchAll(/\]\(([^)]+\.md)\)/g)].map(m => m[1]);
}

/**
 * Judge one doc. `ctx` carries the index:
 *   repo: 'web'|'bot'|'memory'|'global'
 *   pathExists(p, repo) → string|null   (the resolved path)
 *   pathHistory(p) → {kind:'deleted'|'renamed', to?, date, sha}|null
 *   hasToken(t) → bool                  (anywhere in either repo's code, md excluded)
 *   isTable(t) → bool|null              (null = live list unknown)
 *   routeExists(r) → bool
 *   skillExists(name) → bool
 *   modelKnown(id) → bool
 *   crons: [{path, schedule}]
 * Returns findings {line, kind, claim, actual, fix?, history?}.
 */
export function judgeDoc(text, ctx) {
  const findings = [];
  const seen = new Set();
  const lines = text.split('\n');
  let fenced = false;
  const add = (f) => { const k = `${f.line}|${f.kind}|${f.claim}`; if (!seen.has(k)) { seen.add(k); findings.push(f); } };
  lines.forEach((raw, idx) => {
    const n = idx + 1;
    if (/^\s*```/.test(raw)) { fenced = !fenced; return; }
    if (fenced) return;
    const prev = idx > 0 && lines[idx - 1].trim() && !/^\s*(```|#|\|)/.test(lines[idx - 1]) && !/^\s*[-*] /.test(raw) ? lines[idx - 1] : '';
    const historic = (c) => nearHistory(prev ? `${prev} ${raw}` : raw, c);
    const spans = backtickSpans(raw);
    // — paths —
    for (const s of [...spans, ...linkTargets(raw)]) {
      const p = asPath(s);
      if (!p) continue;
      if (ctx.pathExists(p, ctx.repo)) continue;
      const h = ctx.pathHistory(p);
      if (historic(p)) continue; // a name the doc keeps on purpose ("was x until …") is never rewritten
      if (h && h.kind === 'renamed') add({ line: n, kind: 'path', claim: p, actual: `renamed to ${h.to} (${h.date})`, fix: { from: p, to: h.toAsWritten || h.to } });
      else if (h) add({ line: n, kind: 'path', claim: p, actual: `deleted ${h.date} (${h.sha})` });
      else add({ line: n, kind: 'path', claim: p, actual: 'no such file in either repo' });
    }
    // — names —
    for (const s of spans) {
      if (asPath(s)) continue;
      const asg = assignmentIn(s);
      if (asg && ctx.switches && asg.name.endsWith('_OPEN_TO_STUDENTS') && asg.name in ctx.switches) {
        const want = asg.value === 'true';
        if ((asg.value === 'true' || asg.value === 'false') && ctx.switches[asg.name] !== want && !historic(asg.name))
          add({ line: n, kind: 'switch', claim: `${asg.name} = ${asg.value}`, actual: `${asg.name} = ${ctx.switches[asg.name]} in src/lib/portal-beta.ts` });
      }
      for (const t of identifiersIn(s)) {
        if (ctx.hasToken(t)) continue;
        const kind = identifierKind(t);
        if (kind === 'snake') {
          const tb = ctx.isTable(t);
          if (tb) continue;
        }
        if (historic(t)) continue;
        add({ line: n, kind: 'name', claim: t, actual: 'not found anywhere in the code of either repo' });
      }
      // skills: `/name` on a line that talks about a skill, or "the `x` skill"
      const sk = s.match(/^\/([a-z][a-z0-9-]{2,})$/);
      if (sk && !BUILTIN_SLASH.has(sk[1]) && /skill/i.test(raw) && !ctx.skillExists(sk[1]) && !ctx.routeExists('/' + sk[1]) && !historic(s))
        add({ line: n, kind: 'skill', claim: `/${sk[1]}`, actual: 'no .claude/skills/<name>/SKILL.md in either repo' });
    }
    for (const m of raw.matchAll(/the `([a-z][a-z0-9-]{2,})` skill/g)) {
      if (!ctx.skillExists(m[1]) && !historic(m[1])) add({ line: n, kind: 'skill', claim: m[1], actual: 'no .claude/skills/<name>/SKILL.md in either repo' });
    }
    // — the old Desktop paths of the two repos (moved to ~/dev on 4 Sep 2026) —
    for (const m of raw.matchAll(DESKTOP_REPO_RE)) {
      if (/stale|moved|symlink|left|old|was|were|used to|iCloud/i.test(raw)) continue;
      add({ line: n, kind: 'path', claim: m[0], actual: `the repo lives at ~/dev/${m[1]} since 4 Sep 2026`, fix: { from: m[0], to: `~/dev/${m[1]}` } });
    }
    // — routes —
    for (const r of routesIn(raw)) {
      if (ctx.routeExists(r) || historic(r)) continue;
      add({ line: n, kind: 'route', claim: r, actual: 'no page or route file, and no handler string in the bot' });
    }
    // — model ids —
    for (const id of modelIdsIn(raw)) {
      if (ctx.modelKnown(id) || historic(id)) continue;
      add({ line: n, kind: 'model', claim: id, actual: 'this model id is not used anywhere in either repo\'s code' });
    }
    // — crons: a backticked cron on a line that names a cron route must be one vercel.json runs —
    const crons = cronsIn(raw);
    if (crons.length && ctx.crons) {
      const named = ctx.crons.filter(c => { const seg = c.path.split('?')[0].split('/').pop(); return new RegExp(`(^|[^\\w-])${seg.replace(/[-]/g, '\\-')}([^\\w-]|$)`).test(raw); });
      for (const c of crons) {
        if (!named.length || named.some(l => l.schedule === c) || historic(c)) continue;
        const mode = raw.match(/\?mode=(\w+)/);
        const pool = mode ? named.filter(l => l.path.includes(`mode=${mode[1]}`)) : named;
        add({ line: n, kind: 'cron', claim: `\`${c}\`${mode ? ` (?mode=${mode[1]})` : ''}`, actual: pool.length ? `vercel.json runs it at ${pool.map(l => '`' + l.schedule + '`').join(', ')}` : `no cron in vercel.json runs ${named[0].path.split('?')[0]}${mode ? `?mode=${mode[1]}` : ''} at that time (its crons: ${named.map(l => '`' + l.schedule + '`').join(', ')})` });
      }
    }
  });
  return findings;
}

/** A rough importance score — the report lists the top ones first. */
export function importance(doc, f) {
  let s = 0;
  if (/(^|\/)CLAUDE\.md$/.test(doc)) s += 50;
  else if (/\/docs\/|^docs\//.test(doc)) s += 30;
  else if (/SKILL\.md$|PROMPT\.md$/.test(doc)) s += 35;
  else if (/memory\//.test(doc)) s += 25;
  else if (/SPEC-|IDEAS/.test(doc)) s += 10;
  s += { switch: 40, cron: 35, worker_time: 35, path: 20, route: 18, skill: 18, name: 12, memory_index: 15, model: 8, table: 15 }[f.kind] || 5;
  if (f.fix) s += 5;
  return s;
}

/** CLAUDE.md is the lean index (Adrian, 6 Oct 2026): every session and agent loads it on start.
 *  Returns the finding text when a CLAUDE.md of `bytes` is over the cap, else null. */
export const CLAUDE_MD_CAP_BYTES = 40 * 1024;
export function claudeMdOverCap(bytes, cap = CLAUDE_MD_CAP_BYTES) {
  if (bytes <= cap) return null;
  return `over the ${Math.round(cap / 1024)} KB cap — move detail into docs/ — CLAUDE.md is the lean index`;
}
