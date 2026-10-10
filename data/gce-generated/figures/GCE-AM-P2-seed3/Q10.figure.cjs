// P2 Q10 — tangent PT at T, secant PAB, bisector of angle TPB meets TA at E and TB at F.
module.exports = ({ Construction, el }) => {
  const d = (a) => (a * Math.PI) / 180;
  const tA = 70;                                   // T on the upper-right of the circle
  const T = { x: Math.cos(d(tA)), y: Math.sin(d(tA)) };
  const u = { x: Math.sin(d(tA)), y: -Math.cos(d(tA)) };   // tangent direction at T (to the right, down)
  const c = new Construction()
    .circle('k', 0, 0, 1)
    .point('T', T.x, T.y)
    .point('P', T.x + 1.9 * u.x, T.y + 1.9 * u.y)
    .onCircle('B', 'k', 212)
    .intersectLineCircle('A', ['P', 'B'], 'k', 'near')
    .extend('L', 'P', 'T', 0.4);                    // the tangent runs a little past T
  const b = c.bisectorDir('P', 'T', 'B');
  const Pp = c.P('P');
  c.point('Q', Pp.x + b.x, Pp.y + b.y)
    .intersectLines('E', ['P', 'Q'], ['T', 'A'])
    .intersectLines('F', ['P', 'Q'], ['T', 'B'])
    .extend('G', 'P', 'F', 0.18)
    .assertOnCircle('T on circle', 'T', 'k')
    .assertOnCircle('A on circle', 'A', 'k')
    .assertOnCircle('B on circle', 'B', 'k')
    .assertTangentAt('PT touches at T', ['P', 'T'], 'k', 'T')
    .assertBetween('A between P and B', 'P', 'A', 'B')
    .assertEqualAngles('PF bisects angle TPB', ['T', 'P', 'F'], ['F', 'P', 'B'])
    .assertBetween('E on chord TA', 'T', 'E', 'A')
    .assertBetween('F on chord TB', 'T', 'F', 'B')
    .assertBetween('E between P and F', 'P', 'E', 'F');
  return {
    cons: c, width: 320, height: 250, margin: 24,
    base: [
      el.circle('k'),
      el.seg('L', 'P'),
      el.seg('P', 'B'),
      el.seg('T', 'A'), el.seg('T', 'B'),
      el.seg('P', 'G'),
      el.label('T', 'T', -4, -11, { italic: true }),
      el.label('P', 'P', 11, 2, { italic: true }),
      el.label('A', 'A', 4, 13, { italic: true }),
      el.label('B', 'B', -11, 8, { italic: true }),
      el.label('E', 'E', 4, -10, { italic: true }),
      el.label('F', 'F', -10, -8, { italic: true }),
    ],
    layers: [[]],
  };
};
