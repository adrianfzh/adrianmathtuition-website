'use client';
// Dependency-graph view of the strategy layer. Nodes = topics laid out in
// topological LAYERS (sources on top, dependents below) so the prerequisite DAG
// reads clearly. Directed curved edges run prerequisite → topic (arrowhead at
// the dependent). Visual encoding:
//   size   ∝ exam_weight       (mark-yield / leverage)
//   gold glow  when weight ≥ 4 (high-leverage)
//   red ring   when difficulty ≥ 4 (needs attention)
//   emphasis badge  MCQ / STRUCT / BOTH
// Tap a node → focus its row in the editor. Aesthetic mirrors /app/learn/map:
// cream field, soft halos, curved Bézier links.
import { useMemo } from 'react';
import type { TopicMeta } from '@/lib/topic-meta';
import { EMPHASIS_BADGE } from '@/lib/topic-meta';

const NAVY = '#1c3a5e';
const GOLD = '#E7A417';
const CREAM = 'hsl(45, 100%, 98%)';
const RED = '#d1495b';

const W = 940;
const PAD_X = 70;
const PAD_TOP = 54;
const LAYER_GAP = 158;

interface GNode {
  topic: string;
  weight: number;
  difficulty: number;
  emphasis: TopicMeta['emphasis'];
  layer: number;
  x: number;
  y: number;
  r: number;
}

// Longest-path layering: layer(n) = 1 + max(layer(prereq)) over existing prereqs;
// sources → 0. Memoised with a recursion guard so a stray cycle can't hang.
function computeLayers(rows: TopicMeta[]): Map<string, number> {
  const byTopic = new Map(rows.map(r => [r.topic, r]));
  const layer = new Map<string, number>();
  const active = new Set<string>();
  const visit = (topic: string): number => {
    if (layer.has(topic)) return layer.get(topic)!;
    if (active.has(topic)) return 0; // cycle guard → break the back-edge
    active.add(topic);
    const row = byTopic.get(topic);
    const prereqs = (row?.prerequisites ?? []).filter(p => byTopic.has(p) && p !== topic);
    let l = 0;
    for (const p of prereqs) l = Math.max(l, visit(p) + 1);
    active.delete(topic);
    layer.set(topic, l);
    return l;
  };
  for (const r of rows) visit(r.topic);
  return layer;
}

function nodeRadius(weight: number): number {
  return 13 + Math.max(1, Math.min(5, weight)) * 3.1; // w1≈16 … w5≈29
}

// Curve from a source node (below implies… actually prereq sits ABOVE) to its
// dependent below: gentle vertical cubic Bézier.
function edgePath(a: GNode, b: GNode): string {
  const ax = a.x, ay = a.y + a.r;      // leave from bottom of prereq
  const bx = b.x, by = b.y - b.r - 6;  // arrive at top of dependent (before arrow)
  const midY = (ay + by) / 2;
  return `M ${ax} ${ay} C ${ax} ${midY} ${bx} ${midY} ${bx} ${by}`;
}

function shorten(topic: string): string {
  return topic
    .replace(/ and /gi, ' & ')
    .replace(/Organisms & Environment \(Ecology\)/i, 'Ecology')
    .replace(/Molecular Genetics & Inheritance/i, 'Genetics')
    .replace(/ in Humans/i, ' (Human)')
    .replace(/Structure & Organisation/i, 'Structure');
}
function wrap(s: string): string[] {
  if (s.length <= 16) return [s];
  const mid = Math.floor(s.length / 2);
  for (let d = 0; d < mid; d++) {
    if (s[mid - d] === ' ') return [s.slice(0, mid - d), s.slice(mid - d + 1)];
    if (s[mid + d] === ' ') return [s.slice(0, mid + d), s.slice(mid + d + 1)];
  }
  return [s];
}

export default function CurriculumGraph({
  rows, onFocus,
}: { rows: TopicMeta[]; onFocus: (topic: string) => void }) {
  const { nodes, edges, height } = useMemo(() => {
    if (rows.length === 0) return { nodes: [] as GNode[], edges: [] as { a: GNode; b: GNode }[], height: 200 };

    const layerOf = computeLayers(rows);
    const maxLayer = Math.max(0, ...[...layerOf.values()]);

    // Group by layer, then order within a layer by default_order for stable reads.
    const byLayer = new Map<number, TopicMeta[]>();
    for (const r of rows) {
      const l = layerOf.get(r.topic) ?? 0;
      if (!byLayer.has(l)) byLayer.set(l, []);
      byLayer.get(l)!.push(r);
    }
    for (const list of byLayer.values()) {
      list.sort((a, b) => (a.default_order ?? 1e9) - (b.default_order ?? 1e9) || a.topic.localeCompare(b.topic));
    }

    const nodeMap = new Map<string, GNode>();
    const nodes: GNode[] = [];
    for (let l = 0; l <= maxLayer; l++) {
      const list = byLayer.get(l) ?? [];
      const n = list.length;
      const span = W - PAD_X * 2;
      list.forEach((r, i) => {
        const x = n === 1 ? W / 2 : PAD_X + (span * i) / (n - 1);
        const y = PAD_TOP + l * LAYER_GAP;
        const node: GNode = {
          topic: r.topic, weight: r.exam_weight, difficulty: r.difficulty,
          emphasis: r.emphasis, layer: l, x, y, r: nodeRadius(r.exam_weight),
        };
        nodeMap.set(r.topic, node);
        nodes.push(node);
      });
    }

    const edges: { a: GNode; b: GNode }[] = [];
    for (const r of rows) {
      const b = nodeMap.get(r.topic);
      if (!b) continue;
      for (const p of r.prerequisites ?? []) {
        const a = nodeMap.get(p);
        if (a && a.topic !== b.topic) edges.push({ a, b });
      }
    }

    const height = PAD_TOP + maxLayer * LAYER_GAP + 70;
    return { nodes, edges, height };
  }, [rows]);

  if (rows.length === 0) {
    return <p className="text-sm text-gray-400 p-4">No topics yet for this subject.</p>;
  }

  return (
    <div className="cg-wrap">
      <style>{CG_CSS}</style>
      <div className="cg-legend">
        <span><i className="cg-swatch cg-gold" /> high-leverage (weight ≥ 4)</span>
        <span><i className="cg-swatch cg-red" /> hard (difficulty ≥ 4)</span>
        <span>size ∝ exam weight · arrows: prerequisite → topic</span>
      </div>
      <div className="cg-scroll">
        <svg
          viewBox={`0 0 ${W} ${height}`}
          width="100%"
          style={{ display: 'block', minWidth: 620, height: 'auto' }}
          role="img"
          aria-label="Topic dependency graph"
        >
          <defs>
            <marker id="cg-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(28,58,94,0.55)" />
            </marker>
          </defs>

          <rect x="0" y="0" width={W} height={height} fill={CREAM} rx="14" />

          {/* edges (behind nodes) */}
          {edges.map((e, i) => (
            <path
              key={i}
              d={edgePath(e.a, e.b)}
              fill="none"
              stroke="rgba(28,58,94,0.30)"
              strokeWidth={1.4}
              markerEnd="url(#cg-arrow)"
            />
          ))}

          {/* nodes */}
          {nodes.map(n => {
            const hot = n.weight >= 4;
            const hard = n.difficulty >= 4;
            const lines = wrap(shorten(n.topic));
            const labelY = n.y + n.r + 13;
            return (
              <g
                key={n.topic}
                className="cg-node"
                onClick={() => onFocus(n.topic)}
                role="button"
                tabIndex={0}
                onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onFocus(n.topic); } }}
              >
                <title>{`${n.topic} — weight ${n.weight}/5 · difficulty ${n.difficulty}/5 · ${EMPHASIS_BADGE[n.emphasis]}`}</title>
                <g className="cg-star">
                  {hot && <circle cx={n.x} cy={n.y} r={n.r + 9} fill={GOLD} opacity={0.16} />}
                  {hot && <circle cx={n.x} cy={n.y} r={n.r + 4} fill={GOLD} opacity={0.22} />}
                  <circle
                    cx={n.x} cy={n.y} r={n.r}
                    fill="#ffffff"
                    stroke={hard ? RED : 'rgba(28,58,94,0.30)'}
                    strokeWidth={hard ? 3 : 1.4}
                  />
                  <text x={n.x} y={n.y + 4.5} textAnchor="middle" fontSize={13} fontWeight={800} fill={hot ? GOLD : NAVY}>
                    {n.weight}
                  </text>
                </g>
                {/* emphasis badge */}
                <g>
                  <rect
                    x={n.x - 20} y={n.y - n.r - 15} width={40} height={13} rx={6.5}
                    fill={n.emphasis === 'both' ? 'rgba(28,58,94,0.10)' : n.emphasis === 'mcq' ? 'rgba(124,107,176,0.20)' : 'rgba(63,156,143,0.20)'}
                  />
                  <text x={n.x} y={n.y - n.r - 5.5} textAnchor="middle" fontSize={8} fontWeight={700} letterSpacing="0.04em" fill={NAVY}>
                    {EMPHASIS_BADGE[n.emphasis]}
                  </text>
                </g>
                {/* label */}
                {lines.map((ln, i) => (
                  <text key={i} x={n.x} y={labelY + i * 12} textAnchor="middle" fontSize={10.5} fontWeight={600} fill={NAVY}>
                    {ln}
                  </text>
                ))}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

const CG_CSS = `
.cg-wrap { }
.cg-legend {
  display: flex; flex-wrap: wrap; gap: 14px;
  font-size: 11px; color: #6b7280; padding: 0 2px 10px;
}
.cg-legend span { display: inline-flex; align-items: center; gap: 5px; }
.cg-swatch { width: 12px; height: 12px; border-radius: 50%; display: inline-block; }
.cg-gold { background: #E7A417; opacity: 0.5; }
.cg-red { background: #fff; border: 2.5px solid #d1495b; }
.cg-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; border-radius: 14px; }
.cg-node { cursor: pointer; outline: none; }
.cg-star { transform-box: fill-box; transform-origin: center; transition: transform .16s cubic-bezier(.22,1,.36,1); }
.cg-node:hover .cg-star, .cg-node:focus-visible .cg-star, .cg-node:active .cg-star { transform: scale(1.09); }
@media (prefers-reduced-motion: reduce) { .cg-star { transition: none; } }
`;
