// P2 Q4 — vertical cross-section of the vase: inside radius 3 + cos y for 0 ≤ y ≤ 2π, water to depth h.
module.exports = ({ Construction, el }) => {
  const r = (y) => 3 + Math.cos(y);
  const TOP = 2 * Math.PI, H = 1.2, N = 160;
  const right = [], left = [];
  for (let i = 0; i <= N; i++) { const y = (TOP * i) / N; right.push({ x: r(y), y }); left.push({ x: -r(y), y }); }
  const water = [];
  for (let i = 0; i <= 40; i++) { const y = (H * i) / 40; water.push({ x: r(y), y }); }
  for (let i = 40; i >= 0; i--) { const y = (H * i) / 40; water.push({ x: -r(y), y }); }
  const c = new Construction()
    .point('BL', -4, 0).point('BR', 4, 0).point('A0', 0, -0.35).point('A1', 0, 6.75)
    .point('S', 4.8, 0).point('S1', 4.8, H).point('T0', -5.1, 0).point('T1', -5.1, TOP)
    .point('C0', 0, 0.28).point('R0', 4, 0.28).point('Cm', 0, Math.PI).point('Rm', 2, Math.PI).point('Ct', 0, TOP).point('Rt', 4, TOP)
    .assertNum('base radius 4', r(0), 4).assertNum('waist radius 2', r(Math.PI), 2).assertNum('top radius 4', r(TOP), 4);
  return {
    cons: c, width: 320, height: 260, margin: 44,
    base: [
      el.region(water, { color: '#c8d3df', spacing: 5, hatchAngle: 0, noEdge: true }),
      el.seg({ x: -r(H), y: H }, { x: r(H), y: H }),
      el.pline(right, { smooth: true }), el.pline(left, { smooth: true }),
      el.seg('BL', 'BR'),
      el.seg('A0', 'A1', { dash: true }),
      el.arrow('S', 'S1'), el.arrow('S1', 'S'), el.label({ x: 4.8, y: 0.6 }, 'h cm', 26, 4),
      el.arrow('T0', 'T1'), el.arrow('T1', 'T0'), el.label({ x: -5.1, y: Math.PI }, '2π cm', -28, 4),
      el.arrow('C0', 'R0'), el.label({ x: 2, y: 0.28 }, '4 cm', 0, -6),
      el.arrow('Cm', 'Rm'), el.label({ x: 1, y: Math.PI }, '2 cm', 0, -6),
      el.arrow('Ct', 'Rt'), el.label({ x: 2, y: TOP }, '4 cm', 0, -6),
    ],
    layers: [[]],
  };
};
