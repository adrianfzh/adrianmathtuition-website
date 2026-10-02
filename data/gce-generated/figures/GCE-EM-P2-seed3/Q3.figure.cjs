// E Math Set 2 P2 Q3 — ship on course 038° from A, 15 km to B; lighthouse L on bearing 062° from A
// and due east of B. A bare sketch: A, B, L, the course (continued past B), the north line at A.
// No angles, no lengths, no closest point. Added 2 Oct 2026 (Adrian).
module.exports = ({ Construction, el }) => {
  const r = (d) => (d * Math.PI) / 180;
  const B = { x: 15 * Math.sin(r(38)), y: 15 * Math.cos(r(38)) };
  const BL = (15 * Math.sin(r(24))) / Math.sin(r(28));
  const L = { x: B.x + BL, y: B.y };
  const T = { x: 27 * Math.sin(r(38)), y: 27 * Math.cos(r(38)) };
  const c = new Construction()
    .point('A', 0, 0).point('B', B.x, B.y).point('L', L.x, L.y).point('T', T.x, T.y)
    .assertBearing('course 038', ['A', 'B'], 38)
    .assertBearing('L from A is 062', ['A', 'L'], 62)
    .assertBearing('L due east of B', ['B', 'L'], 90)
    .assertBetween('B on the course', 'A', 'B', 'T');
  return {
    cons: c, width: 340, height: 260, margin: 34,
    base: [
      el.seg('A', 'B'), el.arrow('B', 'T'), el.seg('A', 'L'), el.seg('B', 'L'),
      el.north('A', { len: 60 }), el.dot('A'), el.dot('B'), el.dot('L'),
      el.label('A', null, -12, 8, { tex: 'A' }),
      el.label('B', null, -13, -4, { tex: 'B' }),
      el.label('L', null, 13, 2, { tex: 'L' }),
    ],
    layers: [[]],
  };
};
