'use client';
// /app/learn/map — the constellation "Star Map": a "where am I in this subject?"
// explore view. Each TOPIC is a layered star node whose progress RING (gold arc
// on a navy track) = done units / total (from the localStorage done-map). Topics
// cluster into strands, snake down the canvas, and thread together with soft
// curved Bézier connections. The recommended/next topic (from /today) pulses to
// pull the eye. Tap a star → the topic in /app/learn. Pure client render over the
// existing overview + today APIs — no new endpoints.
import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { getDoneMap } from '@/lib/learn-progress';
import type { LearnTopic } from '@/lib/learn-types';

type SubjectOpt = { key: string; label: string };
type TodayCard = { topic: string; subject: string; reason: string; chip: string };

// ── Palette ───────────────────────────────────────────────────────────────
const NAVY = '#1c3a5e';
const GOLD = '#E7A417';
const CREAM = 'hsl(45, 100%, 98%)';
const TRACK = 'rgba(28,58,94,0.16)'; // navy @ low opacity — progress-ring track

// ── Strand clustering ───────────────────────────────────────────────────────
type StrandKey = 'Algebra' | 'Calculus' | 'Trigonometry' | 'Geometry' | 'Other';

const STRAND_ORDER: StrandKey[] = ['Algebra', 'Calculus', 'Trigonometry', 'Geometry', 'Other'];

const STRAND_TESTS: { key: StrandKey; re: RegExp }[] = [
  { key: 'Algebra', re: /Quadratic|Polynomial|Equation|Inequal|Indices|Logarithm|Surd|Partial|Roots/i },
  { key: 'Calculus', re: /Different|Integrat|Kinematics/i },
  { key: 'Trigonometry', re: /Trigono|R-Formula/i },
  { key: 'Geometry', re: /Geometry|Circle|Plane|Coordinate|Linear Law/i },
];

// Soft, desaturated accent tint per strand — used for halos, connections + the
// strand-label underline. Restrained (no neon); reads premium against cream.
const STRAND_TINT: Record<StrandKey, string> = {
  Algebra: '#7C6BB0',
  Calculus: '#3F9C8F',
  Trigonometry: '#C77B93',
  Geometry: '#6FA06B',
  Other: '#7C8AA0',
};

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

// Deterministic PRNG for the background star field (stable across renders).
function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

// ── Layout ──────────────────────────────────────────────────────────────────
const W = 360;           // viewBox width (px units)
const R = 19;            // progress-ring radius
const RD = R - 5;        // inner-disc radius
const COLS = 3;          // nodes per row within a strand band
const CELL = W / COLS;   // 120
const ROW_H = 102;       // vertical spacing between node rows
const BAND_PAD_TOP = 52; // label + first row
const BAND_PAD_BOT = 26;
const BAND_GAP = 14;     // extra breathing room between strand bands

interface Node {
  key: string;
  topic: string;
  subject: string;
  cx: number;
  cy: number;
  frac: number;
  done: number;
  total: number;
  recommended: boolean;
}
interface Band {
  key: StrandKey;
  labelY: number;
  nodes: Node[];
  paths: string[];
}

// Gentle quadratic arc between two consecutive nodes — control point offset
// perpendicular to the midpoint, alternating side by index for organic waviness.
function curvePath(a: Node, b: Node, i: number): string {
  const mx = (a.cx + b.cx) / 2;
  const my = (a.cy + b.cy) / 2;
  const dx = b.cx - a.cx;
  const dy = b.cy - a.cy;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  const amp = Math.min(26, len * 0.2) * (i % 2 === 0 ? 1 : -1);
  const ccx = mx + px * amp;
  const ccy = my + py * amp;
  return `M ${a.cx} ${a.cy} Q ${ccx} ${ccy} ${b.cx} ${b.cy}`;
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

    // Spine order within a strand → drives the connecting-path order.
    list.sort((a, b) => a.spine_order - b.spine_order || a.topic.localeCompare(b.topic));

    const rows = Math.ceil(list.length / COLS);
    const bandTop = y;
    const labelY = bandTop + 20;

    const nodes: Node[] = list.map((t, i) => {
      const row = Math.floor(i / COLS);
      const rowCount = Math.min(COLS, list.length - row * COLS);
      let col = i % COLS;
      if (row % 2 === 1) col = rowCount - 1 - col; // boustrophedon snake → short links
      // Centre rows that hold fewer than COLS nodes.
      const rowWidth = rowCount * CELL;
      const startX = (W - rowWidth) / 2;
      const baseX = startX + col * CELL + CELL / 2;
      const baseY = bandTop + BAND_PAD_TOP + row * ROW_H;
      const h = hashStr(t.topic);
      const dx = (h % 11) - 5;                 // −5..5
      const dy = (Math.floor(h / 11) % 9) - 4; // −4..4
      const total = t.units.length || 1;
      const doneCount = t.units.filter(u => done[u.id]).length;
      return {
        key: `${t.subject}|${t.topic}`,
        topic: t.topic,
        subject: t.subject,
        cx: Math.max(R + 8, Math.min(W - R - 8, baseX + dx)),
        cy: baseY + dy,
        frac: Math.max(0, Math.min(1, doneCount / total)),
        done: doneCount,
        total,
        recommended: recommended.has(`${t.subject}|${norm(t.topic)}`),
      };
    });

    const paths = nodes.slice(1).map((n, i) => curvePath(nodes[i], n, i));

    bands.push({ key, labelY, nodes, paths });
    y = bandTop + BAND_PAD_TOP + rows * ROW_H + BAND_PAD_BOT + BAND_GAP;
  }

  return { bands, height: Math.max(y, 140) };
}

// Split a long topic name onto (at most) two lines near the middle space.
function wrapLabel(s: string): string[] {
  if (s.length <= 14) return [s];
  const mid = Math.floor(s.length / 2);
  let split = -1;
  for (let d = 0; d < mid; d++) {
    if (s[mid - d] === ' ') { split = mid - d; break; }
    if (s[mid + d] === ' ') { split = mid + d; break; }
  }
  if (split < 0) return [s];
  return [s.slice(0, split), s.slice(split + 1)];
}

// ── Node component ──────────────────────────────────────────────────────────
function StarNode({
  n, tint, showTag, onOpen,
}: { n: Node; tint: string; showTag: boolean; onOpen: (n: Node) => void }) {
  const done = n.frac >= 1;
  const started = n.frac > 0 && !done;
  const lines = wrapLabel(n.topic);
  const CH = 5.35;                 // approx char width @ fontSize 10
  const maxLen = Math.max(...lines.map(l => l.length));
  const pillW = Math.min(W - 8, Math.max(34, maxLen * CH + 16));
  const lineH = 12;
  const pillH = lines.length * lineH + 8;
  const pillTop = n.cy + R + 8;
  const C = 2 * Math.PI * R;       // ring circumference (pathLength=100 below)

  // Tag ("Start ↗") floats above the node; keep it inside the viewBox.
  const tagW = 52;
  const tagX = Math.max(tagW / 2 + 2, Math.min(W - tagW / 2 - 2, n.cx));
  const tagY = Math.max(12, n.cy - R - 16);

  return (
    <g
      className="sm-node"
      onClick={() => onOpen(n)}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(n); } }}
    >
      <title>
        {`${n.topic} — ${n.done}/${n.total} done${n.recommended ? ' · recommended next' : ''}`}
      </title>

      {/* interactive star cluster (hover-scales as a unit) */}
      <g className="sm-star">
        {/* soft strand-tinted halo (two layers → gentle glow, no hard gradient) */}
        <circle className="sm-halo" cx={n.cx} cy={n.cy} r={R + 11} fill={tint} opacity={0.08} />
        <circle className="sm-halo" cx={n.cx} cy={n.cy} r={R + 5} fill={tint} opacity={0.13} />

        {/* recommended → expanding pulse ring (frozen under reduced-motion) */}
        {n.recommended && (
          <circle className="sm-pulse" cx={n.cx} cy={n.cy} r={R + 2} fill="none" stroke={GOLD} strokeWidth={2} />
        )}

        {/* progress ring: navy track + gold arc (top-start, clockwise) */}
        <circle cx={n.cx} cy={n.cy} r={R} fill="none" stroke={TRACK} strokeWidth={3.2} />
        {n.frac > 0 && (
          <circle
            cx={n.cx}
            cy={n.cy}
            r={R}
            fill="none"
            stroke={GOLD}
            strokeWidth={3.2}
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={`${n.frac * 100} 100`}
            transform={`rotate(-90 ${n.cx} ${n.cy})`}
          />
        )}

        {/* inner disc — subtle two-tone via a soft top-left sheen */}
        <circle cx={n.cx} cy={n.cy} r={RD} fill={done ? GOLD : '#ffffff'} stroke={done ? GOLD : 'rgba(28,58,94,0.14)'} strokeWidth={1} />
        <ellipse cx={n.cx - RD * 0.3} cy={n.cy - RD * 0.34} rx={RD * 0.58} ry={RD * 0.42} fill="#ffffff" opacity={done ? 0.28 : 0.9} />

        {/* state mark: ✓ (done) · navy dot (in progress) · empty (untouched) */}
        {done && (
          <path
            d={`M ${n.cx - 4.6} ${n.cy + 0.4} L ${n.cx - 1.3} ${n.cy + 3.6} L ${n.cx + 4.8} ${n.cy - 3.4}`}
            fill="none" stroke="#fff" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round"
          />
        )}
        {started && <circle cx={n.cx} cy={n.cy} r={3} fill={NAVY} opacity={0.55} />}
      </g>

      {/* label pill (unscaled — stays legible beneath the star) */}
      <g className="sm-label">
        <rect
          x={n.cx - pillW / 2}
          y={pillTop}
          width={pillW}
          height={pillH}
          rx={pillH / 2}
          fill="#ffffff"
          stroke={n.recommended ? GOLD : 'rgba(28,58,94,0.10)'}
          strokeWidth={n.recommended ? 1.4 : 1}
        />
        {lines.map((ln, i) => (
          <text
            key={i}
            x={n.cx}
            y={pillTop + 4 + lineH * (i + 0.72)}
            textAnchor="middle"
            fontSize={10}
            fontWeight={600}
            fill={NAVY}
          >
            {ln}
          </text>
        ))}
      </g>

      {/* floating "Start" tag on the single lead recommendation */}
      {showTag && (
        <g className="sm-tag" pointerEvents="none">
          <rect x={tagX - tagW / 2} y={tagY - 9} width={tagW} height={18} rx={9} fill={NAVY} />
          <text x={tagX} y={tagY + 3.5} textAnchor="middle" fontSize={9.5} fontWeight={700} fill={CREAM} letterSpacing="0.02em">
            Start ↗
          </text>
        </g>
      )}
    </g>
  );
}

// ── Scoped styles (SVG entrance / pulse / hover; respects reduced-motion) ─────
const MAP_CSS = `
.sm-node-enter{ opacity:0; animation: smIn .5s cubic-bezier(.22,1,.36,1) both; transform-box: fill-box; transform-origin: center; }
@keyframes smIn{ from{ opacity:0; transform: scale(.55) translateY(5px);} to{ opacity:1; transform: scale(1) translateY(0);} }
.sm-node{ cursor:pointer; outline:none; }
.sm-node:focus-visible .sm-star{ transform: scale(1.08); }
.sm-star{ transform-box: fill-box; transform-origin: center; transition: transform .18s cubic-bezier(.22,1,.36,1); }
.sm-node:hover .sm-star, .sm-node:active .sm-star{ transform: scale(1.08); }
.sm-halo{ transition: opacity .18s ease; }
.sm-node:hover .sm-halo{ opacity:.95 !important; }
.sm-pulse{ transform-box: fill-box; transform-origin: center; animation: smPulse 2s ease-out infinite; }
@keyframes smPulse{ 0%{ transform: scale(1); opacity:.55;} 70%{ opacity:0;} 100%{ transform: scale(2.15); opacity:0;} }
.sm-tag{ transform-box: fill-box; transform-origin: center; animation: smBob 2.4s ease-in-out infinite; }
@keyframes smBob{ 0%,100%{ transform: translateY(0);} 50%{ transform: translateY(-2.5px);} }
.sm-path{ animation: smPath .6s ease-out both; }
@keyframes smPath{ from{ opacity:0;} to{ opacity:1;} }
@media (prefers-reduced-motion: reduce){
  .sm-node-enter{ animation:none; opacity:1; }
  .sm-path{ animation:none; opacity:1; }
  .sm-star{ transition:none; }
  .sm-pulse{ animation:none; opacity:.3; }
  .sm-tag{ animation:none; }
}
`;

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
  const [showHint, setShowHint] = useState(false);

  useEffect(() => { setDone(getDoneMap()); }, []);

  // First-visit hint (shown once; flagged in localStorage).
  useEffect(() => {
    try {
      if (!window.localStorage.getItem('starmap_hint_v1')) {
        setShowHint(true);
        window.localStorage.setItem('starmap_hint_v1', '1');
      }
    } catch { /* storage disabled — skip hint */ }
  }, []);

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
      .catch(() => { /* no recommendations → no gold pulses */ });
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

  // Deterministic faint background star field (regenerated only on height change).
  const bgStars = useMemo(() => {
    const rng = mulberry32(0x51a2c3);
    const count = Math.round(height / 24) + 20;
    return Array.from({ length: count }, () => ({
      x: 4 + rng() * (W - 8),
      y: 6 + rng() * (height - 12),
      r: 0.5 + rng() * 1.1,
      o: 0.06 + rng() * 0.16,
      gold: rng() < 0.14,
    }));
  }, [height]);

  // The single lead recommendation (first in flat order) gets the "Start" tag.
  const leadKey = useMemo(() => {
    for (const b of bands) for (const n of b.nodes) if (n.recommended) return n.key;
    return null;
  }, [bands]);

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

  let enterIdx = 0; // running index → staggered entrance

  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <style>{MAP_CSS}</style>

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
          {/* Legend — mini ring samples + started stat */}
          <div className="flex items-center gap-4 text-[11px] text-gray-500 px-1">
            <span className="flex items-center gap-1.5">
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                <circle cx="8" cy="8" r="6" fill="none" stroke={TRACK} strokeWidth="2.4" />
                <circle cx="8" cy="8" r="6" fill="none" stroke={GOLD} strokeWidth="2.4" strokeLinecap="round" pathLength={100} strokeDasharray="60 100" transform="rotate(-90 8 8)" />
              </svg>
              in progress
            </span>
            <span className="flex items-center gap-1.5">
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                <circle cx="8" cy="8" r="6" fill={GOLD} />
                <path d="M5.4 8 L7.2 9.8 L10.8 6" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              done
            </span>
            <span className="flex items-center gap-1.5">
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                <circle cx="8" cy="8" r="7" fill="none" stroke={GOLD} strokeWidth="1" opacity="0.5" />
                <circle cx="8" cy="8" r="4.5" fill="none" stroke={GOLD} strokeWidth="2" />
              </svg>
              next up
            </span>
            <span className="ml-auto text-gray-400">{litStars}/{totalStars} started</span>
          </div>

          {showHint && leadKey && (
            <p className="text-[11px] text-navy/70 px-1 -mt-1">
              ✨ Tap the glowing star to pick up where you left off.
            </p>
          )}

          <div
            className={`${card} p-3 overflow-hidden`}
            style={{ background: `radial-gradient(130% 100% at 50% 0%, #ffffff 0%, ${CREAM} 70%)` }}
          >
            <svg
              viewBox={`0 0 ${W} ${height}`}
              width="100%"
              style={{ display: 'block', maxWidth: 480, margin: '0 auto', height: 'auto' }}
              role="img"
              aria-label="Constellation map of topics"
            >
              {/* faint background star field */}
              {bgStars.map((s, i) => (
                <circle key={`bg${i}`} cx={s.x} cy={s.y} r={s.r} fill={s.gold ? GOLD : NAVY} opacity={s.o} />
              ))}

              {/* connections (behind nodes) + strand labels */}
              {bands.map(band => {
                const tint = STRAND_TINT[band.key];
                const label = STRAND_LABEL[band.key].toUpperCase();
                const underlineW = Math.min(W - 24, label.length * 8.4);
                return (
                  <g key={band.key}>
                    <text
                      x={12}
                      y={band.labelY}
                      fontSize={10.5}
                      fontWeight={700}
                      letterSpacing="0.18em"
                      fill={NAVY}
                      opacity={0.55}
                    >
                      {label}
                    </text>
                    <line
                      x1={12}
                      y1={band.labelY + 6}
                      x2={12 + underlineW}
                      y2={band.labelY + 6}
                      stroke={tint}
                      strokeWidth={1.5}
                      strokeLinecap="round"
                      opacity={0.55}
                    />
                    {band.paths.map((d, i) => (
                      <path
                        key={i}
                        className="sm-path"
                        style={{ animationDelay: `${120 + i * 40}ms` }}
                        d={d}
                        fill="none"
                        stroke={tint}
                        strokeWidth={1.5}
                        strokeOpacity={0.42}
                        strokeLinecap="round"
                      />
                    ))}
                  </g>
                );
              })}

              {/* nodes (on top), staggered entrance */}
              {bands.flatMap(band =>
                band.nodes.map(n => {
                  const delay = enterIdx++ * 40;
                  return (
                    <g key={n.key} className="sm-node-enter" style={{ animationDelay: `${delay}ms` }}>
                      <StarNode
                        n={n}
                        tint={STRAND_TINT[band.key]}
                        showTag={n.key === leadKey}
                        onOpen={openTopic}
                      />
                    </g>
                  );
                }),
              )}
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
