// EM P2 Q3 — plan view: P with a north line, Q on 070° at 60 m, R on 190° at 100 m, triangle PQR.
// World units = metres, +y = north. Not to scale in the paper's sense, but drawn to scale here.
module.exports = ({ Construction, el }) => {
  const d = (a) => (a * Math.PI) / 180;
  const at = (brg, r) => ({ x: r * Math.sin(d(brg)), y: r * Math.cos(d(brg)) });
  const Q = at(70, 60), R = at(190, 100);
  const c = new Construction()
    .point('P', 0, 0).point('Q', Q.x, Q.y).point('R', R.x, R.y)
    .assertBearing('Q from P is 070', ['P', 'Q'], 70)
    .assertBearing('R from P is 190', ['P', 'R'], 190)
    .assertAngle('angle QPR = 120', ['Q', 'P', 'R'], 120);
  const dist = (A, B) => Math.hypot(A.x - B.x, A.y - B.y);
  c.assertNum('PQ = 60', dist({ x: 0, y: 0 }, Q), 60)
   .assertNum('PR = 100', dist({ x: 0, y: 0 }, R), 100)
   .assertNum('QR = 140', dist(Q, R), 140, 1e-6);
  // label anchors (world)
  const pol = (mathDeg, r) => ({ x: r * Math.cos(d(mathDeg)), y: r * Math.sin(d(mathDeg)) });
  return {
    cons: c, width: 260, height: 330, tall: true, margin: 28,
    base: [
      el.seg('P', 'Q'), el.seg('P', 'R'), el.seg('Q', 'R'),
      el.arrow('P', { x: 0, y: 46 }),
      el.label({ x: 0, y: 46 }, 'N', 0, -10),
      // bearing of Q: clockwise from north (math 90°) to PQ (math 20°)
      el.arcAt('P', 12, 20, 90, { arrow: 'start' }),
      // bearing of R: clockwise from north round to PR (math 260°) — a 190° sweep
      el.arcAt('P', 34, 260, 90, { arrow: 'start' }),
      el.label(pol(52, 19.5), '70°', 0, 0),
      el.label(pol(-42, 19), '190°', 0, 0),
      el.label({ x: 46, y: 26 }, '60 m', 0, 0),
      el.label({ x: -22, y: -50 }, '100 m', 0, 0),
      el.label('P', 'P', -12, 4, { italic: true }),
      el.label('Q', 'Q', 10, -4, { italic: true }),
      el.label('R', 'R', -4, 14, { italic: true }),
    ],
    layers: [[]],
  };
};
