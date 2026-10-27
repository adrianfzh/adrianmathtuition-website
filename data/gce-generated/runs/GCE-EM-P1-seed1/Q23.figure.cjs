// P1 Q23 — triangular plot LMN on horizontal ground; MN lies along a straight road.
// Given: LM = 120 m, LN = 85 m, angle MLN = 104°.  MN, angle LMN and the
// perpendicular from L to MN are what the candidate must find — none are drawn.
module.exports = ({ Construction, el }) => {
  const d = (a) => (a * Math.PI) / 180;
  const LM = 120, LN = 85, ANG_L = 104;

  // Solve the triangle, then place it with MN horizontal (M left, N right, L on top).
  const MN = Math.sqrt(LM * LM + LN * LN - 2 * LM * LN * Math.cos(d(ANG_L)));
  const angM = Math.asin((LN * Math.sin(d(ANG_L))) / MN);   // acute: opposite the shorter given side
  const M = { x: 0, y: 0 };
  const N = { x: MN, y: 0 };
  const L = { x: LM * Math.cos(angM), y: LM * Math.sin(angM) };

  const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);

  const c = new Construction()
    .point('M', M.x, M.y)
    .point('N', N.x, N.y)
    .point('L', L.x, L.y)
    .extend('R1', 'N', 'M', 26)        // road runs a little past M …
    .extend('R2', 'M', 'N', 26)        // … and a little past N
    .lerp('W', 'M', 'N', 0.68)         // anchor for the word "road"
    .midpoint('S1', 'L', 'M')          // anchor for "120 m"
    .midpoint('S2', 'L', 'N')          // anchor for "85 m"
    .assertNum('LM = 120 m', dist(L, M), LM, 1e-9)
    .assertNum('LN = 85 m', dist(L, N), LN, 1e-9)
    .assertAngle('angle MLN = 104°', ['M', 'L', 'N'], ANG_L, 1e-9)
    .assertCollinear('road through M and N', ['R1', 'M', 'N', 'R2'])
    .assertBetween('M between R1 and N', 'R1', 'M', 'N')
    .assertBetween('N between M and R2', 'M', 'N', 'R2')
    .check();

  return {
    cons: c,
    width: 300, height: 172, margin: 30,
    base: [
      el.seg('R1', 'R2', { w: 3.2 }),                        // the road (thicker), along MN produced
      el.seg('M', 'L'), el.seg('L', 'N'),
      el.arc('M', 'L', 'N', { r: 19, label: '104°', labelDx: 0, labelDy: 14 }),
      el.label('S1', '120 m', -18, -28),
      el.label('S2', '85 m', 24, -20),
      el.label('L', 'L', 0, -13, { italic: true }),
      el.label('M', 'M', -13, 15, { italic: true }),
      el.label('N', 'N', 13, 15, { italic: true }),
      el.label('W', 'road', 0, 28),
    ],
    layers: [[]],
  };
};
