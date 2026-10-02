// E Math Set 1 P2 Q9 — the three rainwater tanks, to one scale (1 unit = 1 m), dimensions marked.
// Added 2 Oct 2026 (Adrian: "q9 should we have diagrams?"). No tank is drawn on the concrete
// base: whether a tank fits the base is part (c).
module.exports = ({ Construction, el }) => {
  const c = new Construction()
    .assertNum('A diameter', 2 * 0.6, 1.2).assertNum('B diameter', 2 * 0.7, 1.4);
  const cyl = (cx, r, h) => {
    const ry = r * 0.28, B = { x: cx, y: 0 }, T = { x: cx, y: h };
    return [
      el.ellipse(T, r, ry),
      el.ellipseArc(B, r, ry, 180, 360),
      el.ellipseArc(B, r, ry, 0, 180, { dash: true }),
      el.seg({ x: cx - r, y: 0 }, { x: cx - r, y: h }), el.seg({ x: cx + r, y: 0 }, { x: cx + r, y: h }),
    ];
  };
  const ox = 0.5, oy = 0.32, x0 = 5.6, L = 1.5, H = 1.8;   // cuboid: front 1.5 × 1.8, depth 1.0 drawn oblique
  const P = (x, y) => ({ x, y });
  return {
    cons: c, width: 600, height: 260, margin: 50,
    base: [
      ...cyl(0.6, 0.6, 1.5),
      el.dim(P(0, 0), P(1.2, 0), 40, '1.2 m'),
      el.label(P(1.2, 0.75), '1.5 m', 26, 5),
      el.label(P(0.6, -1.15), 'Tank A', 0, 0, { bold: true }),
      ...cyl(3.2, 0.7, 1.6),
      el.dim(P(2.5, 0), P(3.9, 0), 40, '1.4 m'),
      el.label(P(3.9, 0.8), '1.6 m', 26, 5),
      el.label(P(3.2, -1.15), 'Tank B', 0, 0, { bold: true }),
      el.seg(P(x0, 0), P(x0 + L, 0)), el.seg(P(x0 + L, 0), P(x0 + L, H)), el.seg(P(x0 + L, H), P(x0, H)), el.seg(P(x0, H), P(x0, 0)),
      el.seg(P(x0, H), P(x0 + ox, H + oy)), el.seg(P(x0 + L, H), P(x0 + L + ox, H + oy)), el.seg(P(x0 + ox, H + oy), P(x0 + L + ox, H + oy)),
      el.seg(P(x0 + L, 0), P(x0 + L + ox, oy)), el.seg(P(x0 + L + ox, oy), P(x0 + L + ox, H + oy)),
      el.seg(P(x0, 0), P(x0 + ox, oy), { dash: true }), el.seg(P(x0 + ox, oy), P(x0 + ox, H + oy), { dash: true }), el.seg(P(x0 + ox, oy), P(x0 + L + ox, oy), { dash: true }),
      el.dim(P(x0, 0), P(x0 + L, 0), 40, '1.5 m'),
      el.label(P(x0 + L + ox / 2, oy / 2), '1.0 m', 26, 12),
      el.label(P(x0 + L + ox, oy + H / 2), '1.8 m', 28, 5),
      el.label(P(x0 + L / 2, -1.15), 'Tank C', 0, 0, { bold: true }),
    ],
    layers: [[]],
  };
};
