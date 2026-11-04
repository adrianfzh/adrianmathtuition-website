// 💸 The daily Supabase cost check — the pure half (4 Nov 2026, Adrian: "give me warning if
// supabase costs exceeds a certain amount, so I don't get a shock at the bill").
//
// Fetching lives in lib/supabase-cost-store.ts; the route is /api/cron/supabase-cost, called
// every morning by the bot's 5:45 fixer (bot repo .claude/skills/bot-review/SKILL.md §1g), which
// puts `lines` into the morning brief. Silence when nothing new crosses a line.
//
// It speaks ONLY when:
//   · the projected EXTRA cost this cycle passes ALERT_EXTRA_USD (and again at each further
//     multiple of it — US$25, US$50, … — never the same step twice in one cycle), or
//   · a quota is projected to go over 100 %, or has already passed 90 % (once per quota per cycle).
//
// ⚙️ THE ONE SETTING: ALERT_EXTRA_USD below (default US$25). Adrian changes it by telling any
// Claude session "set the Supabase cost warning to US$40" — or by adding SUPABASE_COST_ALERT_USD
// on Vercel (Production), which wins over the number here.

/** ⚙️ Warn when the projected EXTRA (above the usual monthly bill) passes this many US$. */
export const ALERT_EXTRA_USD = 25;

export function alertExtraUsd(): number {
  const env = Number(process.env.SUPABASE_COST_ALERT_USD);
  return Number.isFinite(env) && env > 0 ? env : ALERT_EXTRA_USD;
}

// Supabase's published Pro-plan prices, copied from supabase.com/docs/guides/platform/manage-your-usage/
// (egress, storage-size, compute) on 4 Nov 2026. Never guess: re-check the pages when changing a number.
export const PRICES = {
  planUsd: 25,
  computeCreditUsd: 10,
  egressQuotaGb: 250, egressUsdPerGb: 0.09,           // uncached
  cachedEgressQuotaGb: 250, cachedEgressUsdPerGb: 0.03,
  storageQuotaGb: 100, storageUsdPerGbMonth: 0.0213,  // billed by GB-hours: the cycle's AVERAGE size
  computeUsdPerHour: {
    nano: 0.01344, micro: 0.01344, small: 0.0206, medium: 0.0822, large: 0.1517,
    xl: 0.2877, '2xl': 0.562, '4xl': 1.32, '8xl': 2.562, '12xl': 3.836, '16xl': 5.12,
  } as Record<string, number>,
} as const;

export type Usage = {
  /** Billing cycle bounds (ms). */
  cycleStart: number;
  cycleEnd: number;
  now: number;
  /** Used so far this cycle, GB. null = could not be read. */
  egressGb: number | null;
  cachedEgressGb: number | null;
  /** Storage size, GB — the cycle average so far when Supabase gives it, else today's size. */
  storageGb: number | null;
  /** Compute size per project (e.g. { maths: 'micro' }); unknown sizes count as micro. */
  compute: Record<string, string>;
  /** true = the numbers are Supabase's own billing numbers; false = our own measurement. */
  exact: boolean;
  /** Where most of the egress comes from, in plain words (e.g. "the maths project"). Optional. */
  topEgress?: string | null;
  /** Plain-words caveat when not exact (what was and was not measured). */
  caveat?: string | null;
};

export type Projection = {
  daysElapsed: number;
  cycleDays: number;
  egressGb: number | null;
  cachedEgressGb: number | null;
  storageGb: number | null;
  baseUsd: number;
  extraUsd: number;
  extraParts: { egress: number; cachedEgress: number; storage: number };
  totalUsd: number;
};

const DAY = 86_400_000;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Usual monthly bill: the plan plus every project's servers, minus the compute credit. */
export function baseUsd(compute: Record<string, string>, hours = 730): number {
  const sizes = Object.values(compute);
  const computeUsd = sizes.reduce((s, size) => s + (PRICES.computeUsdPerHour[String(size).toLowerCase()] ?? PRICES.computeUsdPerHour.micro) * hours, 0);
  return r2(PRICES.planUsd + Math.max(0, computeUsd - PRICES.computeCreditUsd));
}

/** End-of-cycle projection at today's pace. */
export function project(u: Usage): Projection {
  const cycleDays = Math.max(1, (u.cycleEnd - u.cycleStart) / DAY);
  const daysElapsed = Math.min(cycleDays, Math.max(0.5, (u.now - u.cycleStart) / DAY));
  const pace = cycleDays / daysElapsed;
  const egressGb = u.egressGb == null ? null : u.egressGb * pace;
  const cachedEgressGb = u.cachedEgressGb == null ? null : u.cachedEgressGb * pace;
  const storageGb = u.storageGb;
  const extraParts = {
    egress: r2(Math.max(0, (egressGb ?? 0) - PRICES.egressQuotaGb) * PRICES.egressUsdPerGb),
    cachedEgress: r2(Math.max(0, (cachedEgressGb ?? 0) - PRICES.cachedEgressQuotaGb) * PRICES.cachedEgressUsdPerGb),
    storage: r2(Math.max(0, (storageGb ?? 0) - PRICES.storageQuotaGb) * PRICES.storageUsdPerGbMonth),
  };
  const extraUsd = r2(extraParts.egress + extraParts.cachedEgress + extraParts.storage);
  const base = baseUsd(u.compute);
  return { daysElapsed: r2(daysElapsed), cycleDays: r2(cycleDays), egressGb, cachedEgressGb, storageGb, baseUsd: base, extraUsd, extraParts, totalUsd: r2(base + extraUsd) };
}

type Quota = { key: 'egress' | 'cached-egress' | 'storage'; label: string; used: number | null; projected: number | null; quota: number };

function quotas(u: Usage, p: Projection): Quota[] {
  return [
    { key: 'egress', label: 'data sent out', used: u.egressGb, projected: p.egressGb, quota: PRICES.egressQuotaGb },
    { key: 'cached-egress', label: 'cached data sent out', used: u.cachedEgressGb, projected: p.cachedEgressGb, quota: PRICES.cachedEgressQuotaGb },
    { key: 'storage', label: 'file storage', used: u.storageGb, projected: p.storageGb, quota: PRICES.storageQuotaGb },
  ];
}

export type Warning = { key: string; line: string };

const usd = (n: number) => `US$${n >= 10 ? Math.round(n) : n.toFixed(2).replace(/\.00$/, '')}`;
const gb = (n: number) => `${Math.round(n)} GB`;

/** Every warning today's numbers justify (before removing the ones already sent this cycle). */
export function warnings(u: Usage, p: Projection, threshold = alertExtraUsd()): Warning[] {
  const out: Warning[] = [];
  const est = u.exact ? '' : ' (our own estimate)';
  if (p.extraUsd >= threshold) {
    const step = Math.floor(p.extraUsd / threshold);
    const main = p.extraParts.egress >= p.extraParts.storage ? 'extra data' : 'extra file storage';
    out.push({
      key: `cost:${step}`,
      line: `💸 Supabase: on course for about ${usd(p.totalUsd)} this month (${usd(p.baseUsd)} usual + ~${usd(p.extraUsd)} ${main})${est}.`
        + (u.topEgress ? ` Mostly ${u.topEgress}.` : '')
        + ' Nothing to do unless you want me to cut it.',
    });
  }
  for (const q of quotas(u, p)) {
    if (q.used == null || q.projected == null) continue;
    const usedPct = Math.round((q.used / q.quota) * 100);
    if (q.projected > q.quota) {
      out.push({ key: `${q.key}:over`, line: `📈 Supabase ${q.label}: ${gb(q.used)} of the ${gb(q.quota)} included so far (${usedPct}%), on course for about ${gb(q.projected)} by the end of the month${est}.` });
    }
    if (usedPct >= 90) {
      out.push({ key: `${q.key}:90`, line: `⚠️ Supabase ${q.label} has passed 90% of what the plan includes: ${gb(q.used)} of ${gb(q.quota)}${est}.` });
    }
  }
  return out;
}

/** The warnings not yet sent this cycle. `sent` = keys already sent, `sentCycle` = the cycle they belong to. */
export function newWarnings(all: Warning[], sent: string[] | null, sentCycle: number | null, cycleStart: number): Warning[] {
  const already = new Set(sentCycle === cycleStart ? sent || [] : []);
  return all.filter((w) => !already.has(w.key));
}

/** Lines for the morning brief: the new warnings, plus one caveat line when the numbers are ours. */
export function briefLines(fresh: Warning[], u: Usage): string[] {
  if (!fresh.length) return [];
  return [...fresh.map((w) => w.line), ...(u.exact || !u.caveat ? [] : [`(${u.caveat})`])];
}

/** One plain line for the job_runs stamp and /admin/ops. */
export function costSummary(u: Usage, p: Projection): string {
  const part = (label: string, used: number | null, proj: number | null, quota: number) =>
    used == null ? `${label} unknown` : `${label} ${gb(used)}${proj != null && proj !== used ? ` → ~${gb(proj)}` : ''}/${gb(quota)}`;
  return [
    `day ${Math.round(p.daysElapsed)} of ${Math.round(p.cycleDays)}`,
    part('egress', u.egressGb, p.egressGb, PRICES.egressQuotaGb),
    part('storage', u.storageGb, null, PRICES.storageQuotaGb),
    `bill ~${usd(p.totalUsd)} (${usd(p.baseUsd)} usual + ${usd(p.extraUsd)} extra)`,
    u.exact ? 'Supabase billing numbers' : 'our estimate',
  ].join(' · ');
}

/** Billing cycle containing `now` for a monthly anchor day (Adrian's org: the 27th). UTC. */
export function cycleFor(now: number, anchorDay = 27): { start: number; end: number } {
  const d = new Date(now);
  const y = d.getUTCFullYear();
  let m = d.getUTCMonth();
  if (d.getUTCDate() < anchorDay) m -= 1;
  const start = Date.UTC(y, m, anchorDay);
  const end = Date.UTC(y, m + 1, anchorDay);
  return { start, end };
}
