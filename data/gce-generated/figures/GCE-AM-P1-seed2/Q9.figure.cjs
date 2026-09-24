// P1 Q9 — side view of a vertical screen BT on a wall; F at the foot of the wall at eye
// level, FB = 2 m, FT = 8 m; the eye E is x m from F with EF horizontal (right angle at F).
// Drawn NOT at the answer: EF = 7 units against FT = 8 (the greatest angle is at x = 4).
// Printed: F, B, T, E, theta at E, "2 m", "8 m", "x m" and the right angle at F.
// Not printed: BT, EB, ET, angles FEB / FET, any axes or grid.
module.exports = ({ Construction, el }) => {
  const X = 7;                                  // drawn EF (deliberately not 4)
  const c = new Construction()
    .point('F', 0, 0).point('B', 0, 2).point('T', 0, 8)
    .point('E', X, 0)
    .point('Wt', 0, 8.8)                        // top of the drawn wall, a little above T
    // dimension arrows on the LEFT of the wall, both from the level of F
    .point('G1', -1.4, 0).point('G2', -1.4, 2)  // FB, close to the wall
    .point('H1', -3.1, 0).point('H2', -3.1, 8)  // FT, further out
    // extension lines (a small gap off the wall)
    .point('eF0', -0.15, 0).point('eF1', -3.3, 0)
    .point('eB0', -0.15, 2).point('eB1', -1.6, 2)
    .point('eT0', -0.15, 8).point('eT1', -3.3, 8);
  const d = (a, b) => Math.hypot(c.P(a).x - c.P(b).x, c.P(a).y - c.P(b).y);
  const theta = c.measureAngle('B', 'E', 'T') * Math.PI / 180;
  c
    .assertCollinear('F, B, T on the vertical wall', ['F', 'B', 'T', 'Wt'])
    .assertBetween('B between F and T', 'F', 'B', 'T')
    .assertBetween('T below the top of the drawn wall', 'F', 'T', 'Wt')
    .assertPerpendicular('EF perpendicular to the wall', ['E', 'F'], ['F', 'T'])
    .assertNum('FB = 2', d('F', 'B'), 2)
    .assertNum('FT = 8', d('F', 'T'), 8)
    .assertNum('EF = x (drawn 7)', d('E', 'F'), X)
    ._assert('drawn x is not the answer x = 4', Math.abs(X - 4) > 1)
    // the relation of part (a), checked here at the drawn x — never printed
    .assertNum('tan(theta) = 6x/(x^2 + 16) at the drawn x', Math.tan(theta), 6 * X / (X * X + 16), 1e-9)
    .assertParallel('FB arrow parallel to the wall', ['G1', 'G2'], ['F', 'B'])
    .assertParallel('FT arrow parallel to the wall', ['H1', 'H2'], ['F', 'T'])
    .assertEqualLength('FB arrow spans FB', ['G1', 'G2'], ['F', 'B'])
    .assertEqualLength('FT arrow spans FT', ['H1', 'H2'], ['F', 'T']);
  return {
    cons: c, width: 320, height: 290, tall: true, margin: 22,
    base: [
      el.seg('F', 'Wt'),                        // the wall
      el.seg('B', 'T', { w: 4.5 }),             // the screen
      el.seg('E', 'F'),
      el.seg('E', 'B'), el.seg('E', 'T'),
      el.right('E', 'F', 'T', 10),
      el.arc('B', 'E', 'T', { r: 42, labelTex: '\\theta' }),
      el.dot('E'),
      // dimensions
      el.seg('eF0', 'eF1', { w: 1 }), el.seg('eB0', 'eB1', { w: 1 }), el.seg('eT0', 'eT1', { w: 1 }),
      el.darrow('G1', 'G2', null, { w: 1.3 }),
      el.label({ x: -2.25, y: 1 }, '2 m', 0, 0),
      el.darrow('H1', 'H2', null, { w: 1.3 }),
      el.label({ x: -3.95, y: 4 }, '8 m', 0, 0),
      el.label({ x: X / 2, y: 0 }, null, 0, 14, { tex: 'x\\ \\mathrm{m}' }),
      // points
      el.label('F', 'F', -15, 14, { italic: true }),
      el.label('B', 'B', -16, -13, { italic: true }),
      el.label('T', 'T', -16, 14, { italic: true }),
      el.label('E', 'E', 12, 0, { italic: true }),
    ],
    layers: [[]],
  };
};
