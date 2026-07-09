'use client';
// /app/learn/map — the constellation map: a "where am I in this subject?" explore
// view. Each TOPIC is a star node whose fill fraction = done units / total (from
// the localStorage done-map). Topics cluster into strands by name heuristic and
// scatter organically (deterministic from a topic-name hash → stable positions).
// Gold-ringed stars are recommended by /today. Tap a star → the topic in /app/learn.
// Pure client render over the existing overview + today APIs — no new endpoints.
import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { getDoneMap } from '@/lib/learn-progress';
import type { LearnTopic } from '@/lib/learn-types';

type SubjectOpt = { key: string; label: string };
type TodayCard = { topic: string; subject: string; reason: string; chip: string };

const NAVY = 'hsl(220, 60%, 20%)';
const GOLD = '#E7A417';
const CREAM = 'hsl(45, 100%, 98%)';

// ── Strand clustering ───────────────────────────────────────────────────────
type StrandKey = 'Algebra' | 'Calculus' | 'Trigonometry' | 'Geometry' | 'Other';

const STRAND_ORDER: StrandKey[] = ['Algebra', 'Calculus', 'Trigonometry', 'Geometry', 'Other'];

const STRAND_TESTS: { key: StrandKey; re: RegExp }[] = [
  { key: 'Algebra', re: /Quadratic|Polynomial|Equation|Inequal|Indices|Logarithm|Surd|Partial|Roots/i },
  { key: 'Calculus', re: /Different|Integrat|Kinematics/i },
  { key: 'Trigonometry', re: /Trigono|R-Formula/i },
  { key: 'Geometry', re: /Geometry|Circle|Plane|Coordinate|Linear Law/i },
];

function strandOf(topic: string): StrandKey {
  for (const t of STRAND_TESTS) if (t.re.test(topic)) return t.key;
  return 'Other';
}

// Deterministic FNV-1a hash → stable per-topic jitter.
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

// ── Layout ──────────────────────────────────────────────────────────────────
const W = 360;          // viewBox width (px units)
const R = 16;           // node radius
const COLS = 3;         // nodes per row within a strand band
const CELL = W / COLS;  // 120
const ROW_H = 96;       // vertical spacing between node rows
const BAND_PAD_TOP = 40;
const BAND_PAD_BOT = 30;

interface Node {
  key: string;
  topic: string;
  subject: string;
  cx: number;
  cy: number;
  frac: number;
  recommended: boolean;
}
interface Band {
  key: StrandKey;
  labelY: number;
  nodes: Node[];
  lines: { x1: number; y1: number; x2: number; y2: number }[];
}

function buildLayout(
  topics: LearnTopic[],
  done: Record<string, boolean>,
  recommended: Set<string>,
): { bands: Band[]; height: number } {
  // Bucket into strands.
  const buckets = new Map<StrandKey, LearnTopic[]>();
  for (const t of topics) {
    const k = strandOf(t.topic);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(t);
  }

  const bands: Band[] = [];
  let y = 0;

  for (const key of STRAND_ORDER) {
    const list = buckets.get(key);
    if (!list || list.length === 0) continue;

    // Spine order within a strand → drives the connecting line order.
    list.sort((a, b) => a.spine_order - b.spine_order || a.topic.localeCompare(b.topic));

    const rows = Math.ceil(list.length / COLS);
    const bandTop = y;
    const labelY = bandTop + 20;

    const nodes: Node[] = list.map((t, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const baseX = CELL * col + CELL / 2;
      const baseY = bandTop + BAND_PAD_TOP + row * ROW_H;
      const h = hashStr(t.topic);
      const dx = (h % 27) - 13;              // −13..13
      const dy = (Math.floor(h / 27) % 19) - 9; // −9..9
      const total = t.units.length || 1;
      const doneCount = t.units.filter(u => done[u.id]).length;
      return {
        key: `${t.subject}|${t.topic}`,
        topic: t.topic,
        subject: t.subject,
        cx: Math.max(R + 6, Math.min(W - R - 6, baseX + dx)),
        cy: baseY + dy,
        frac: Math.max(0, Math.min(1, doneCount / total)),
        recommended: recommended.has(`${t.subject}|${norm(t.topic)}`),
      };
    });

    const lines = nodes.slice(1).map((n, i) => ({
      x1: nodes[i].cx, y1: nodes[i].cy, x2: n.cx, y2: n.cy,
    }));

    bands.push({ key, labelY, nodes, lines });
    y = bandTop + BAND_PAD_TOP + rows * ROW_H + BAND_PAD_BOT;
  }

  return { bands, height: Math.max(y, 120) };
}

// ── Node component ──────────────────────────────────────────────────────────
function StarNode({ n, idx, onOpen }: { n: Node; idx: number; onOpen: (n: Node) => void }) {
  const clipId = `starclip-${idx}`;
  const fillTop = n.cy + R - 2 * R * n.frac;
  const labelLines = wrapLabel(n.topic);
  return (
    <g
      style={{ cursor: 'pointer' }}
      onClick={() => onOpen(n)}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(n); } }}
    >
      <title>{`${n.topic} — ${Math.round(n.frac * 100)}% done${n.recommended ? ' · recommended' : ''}`}</title>

      {n.recommended && (
        <circle cx={n.cx} cy={n.cy} r={R + 6} fill="none" stroke={GOLD} strokeWidth={2.5} filter="url(#goldGlow)" />
      )}

      <clipPath id={clipId}><circle cx={n.cx} cy={n.cy} r={R} /></clipPath>
      {/* track */}
      <circle cx={n.cx} cy={n.cy} r={R} fill="#fff" stroke={NAVY} strokeOpacity={0.25} strokeWidth={1} />
      {/* fill level */}
      {n.frac > 0 && (
        <rect x={n.cx - R} y={fillTop} width={2 * R} height={2 * R * n.frac} fill={NAVY} clipPath={`url(#${clipId})`} />
      )}
      {/* outline */}
      <circle cx={n.cx} cy={n.cy} r={R} fill="none" stroke={n.recommended ? GOLD : NAVY} strokeWidth={n.recommended ? 2 : 1.5} />

      {labelLines.map((ln, i) => (
        <text
          key={i}
          x={n.cx}
          y={n.cy + R + 13 + i * 12}
          textAnchor="middle"
          fontSize={11}
          fontWeight={600}
          fill={NAVY}
        >
          {ln}
        </text>
      ))}
    </g>
  );
}

// Split a long topic name onto (at most) two lines near the middle space.
function wrapLabel(s: string): string[] {
  if (s.length <= 15) return [s];
  const mid = Math.floor(s.length / 2);
  let split = -1;
  for (let d = 0; d < mid; d++) {
    if (s[mid - d] === ' ') { split = mid - d; break; }
    if (s[mid + d] === ' ') { split = mid + d; break; }
  }
  if (split < 0) return [s];
  return [s.slice(0, split), s.slice(split + 1)];
}

// ── Page ────────────────────────────────────────────────────────────────────
function MapInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const deepLinkSubject = searchParams.get('subject');

  const [subjects, setSubjects] = useState<SubjectOpt[]>([]);
  const [topics, setTopics] = useState<LearnTopic[]>([]);
  const [activeSubject, setActiveSubject] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [recommended, setRecommended] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'locked'>('loading');

  useEffect(() => { setDone(getDoneMap()); }, []);

  useEffect(() => {
    fetch('/api/portal/learn/overview')
      .then(async r => {
        if (r.status === 401) { setStatus('locked'); return null; }
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then(d => {
        if (!d) return;
        setSubjects(d.subjects || []);
        setTopics(d.topics || []);
        const keys: string[] = (d.subjects || []).map((s: SubjectOpt) => s.key);
        setActiveSubject(
          deepLinkSubject && keys.includes(deepLinkSubject) ? deepLinkSubject : (d.subjects?.[0]?.key ?? null),
        );
        setStatus('ready');
      })
      .catch(() => setStatus('error'));
  }, [deepLinkSubject]);

  // Recommended topics from the Today stack (best-effort; never blocks the map).
  useEffect(() => {
    fetch('/api/portal/learn/today')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!d) return;
        const set = new Set<string>();
        for (const c of (d.cards || []) as TodayCard[]) set.add(`${c.subject}|${norm(c.topic)}`);
        setRecommended(set);
      })
      .catch(() => { /* no recommendations → no gold rings */ });
  }, []);

  const visibleTopics = useMemo(() => {
    if (!activeSubject) return topics;
    const scoped = topics.filter(t => t.subject === activeSubject);
    return scoped.length ? scoped : topics;
  }, [topics, activeSubject]);

  const { bands, height } = useMemo(
    () => buildLayout(visibleTopics, done, recommended),
    [visibleTopics, done, recommended],
  );

  const openTopic = (n: Node) =>
    router.push(`/app/learn?topic=${encodeURIComponent(n.topic)}&subject=${encodeURIComponent(n.subject)}`);

  const card = 'bg-white rounded-2xl border border-black/5 shadow-sm';

  if (status === 'locked') {
    return <div className={`${card} p-5`}><p className="text-sm text-gray-500">Please sign in to view your map.</p></div>;
  }

  const totalStars = visibleTopics.length;
  const litStars = visibleTopics.filter(t => t.units.some(u => done[u.id])).length;

  const STRAND_LABEL: Record<StrandKey, string> = {
    Algebra: 'Algebra', Calculus: 'Calculus', Trigonometry: 'Trigonometry', Geometry: 'Geometry', Other: 'Other',
  };

  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <div className="pt-1 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-navy">Star Map</h1>
          <p className="text-xs text-gray-400 mt-0.5">Where you are in each subject</p>
        </div>
        <Link
          href="/app/learn"
          className="text-sm rounded-full px-4 py-1.5 font-semibold bg-white text-gray-600 border border-gray-200 hover:border-navy/40 transition-colors shrink-0"
        >
          ☰ List
        </Link>
      </div>

      {subjects.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {subjects.map(s => (
            <button
              key={s.key}
              onClick={() => setActiveSubject(s.key)}
              className={`text-sm rounded-full px-4 py-1.5 font-semibold transition-colors ${
                s.key === activeSubject
                  ? 'bg-navy text-[hsl(45,100%,96%)]'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-navy/40'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {status === 'loading' && (
        <div className={`${card} p-5`}><p className="text-sm text-gray-400">Charting the stars…</p></div>
      )}
      {status === 'error' && (
        <div className={`${card} p-5`}><p className="text-sm text-red-500">Couldn’t load the map. Please retry.</p></div>
      )}

      {status === 'ready' && totalStars === 0 && (
        <div className={`${card} p-5`}><p className="text-sm text-gray-500">No topics to map yet — check back once lessons are added.</p></div>
      )}

      {status === 'ready' && totalStars > 0 && (
        <>
          <div className="flex items-center gap-4 text-[11px] text-gray-500 px-1">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-full" style={{ background: NAVY }} /> filled = done
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-full border-2" style={{ borderColor: GOLD }} /> recommended
            </span>
            <span className="ml-auto text-gray-400">{litStars}/{totalStars} started</span>
          </div>

          <div
            className={`${card} p-3 overflow-hidden`}
            style={{ background: `radial-gradient(120% 120% at 50% 0%, #fff 0%, ${CREAM} 100%)` }}
          >
            <svg
              viewBox={`0 0 ${W} ${height}`}
              width="100%"
              style={{ display: 'block', maxWidth: 480, margin: '0 auto', height: 'auto' }}
              role="img"
              aria-label="Constellation map of topics"
            >
              <defs>
                <filter id="goldGlow" x="-60%" y="-60%" width="220%" height="220%">
                  <feGaussianBlur stdDeviation="2.4" result="b" />
                  <feMerge>
                    <feMergeNode in="b" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {bands.map(band => (
                <g key={band.key}>
                  <text x={10} y={band.labelY} fontSize={11} fontWeight={700} letterSpacing="0.12em" fill={NAVY} opacity={0.5}>
                    {STRAND_LABEL[band.key].toUpperCase()}
                  </text>
                  {band.lines.map((l, i) => (
                    <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={NAVY} strokeOpacity={0.14} strokeWidth={1} />
                  ))}
                </g>
              ))}

              {bands.flatMap(band => band.nodes).map((n, i) => (
                <StarNode key={n.key} n={n} idx={i} onOpen={openTopic} />
              ))}
            </svg>
          </div>
        </>
      )}
    </div>
  );
}

export default function MapPage() {
  return (
    <Suspense fallback={<div className="p-5 text-sm text-gray-400">Charting the stars…</div>}>
      <MapInner />
    </Suspense>
  );
}
