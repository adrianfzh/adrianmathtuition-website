// P2 Q5 — circle centre O, cyclic quadrilateral ABCD with diagonal AC bisecting angle BAD,
// tangent at C meets AD produced at E. Given: angle ABD = 40°, angle BDC = 34°.
// Unit circle; positions A 83°, B 227°, C 295°, D 3°. No radii, no lengths, no other angles.
module.exports = ({ Construction, el }) => {
  const d = (a) => (a * Math.PI) / 180;
  const on = (a) => ({ x: Math.cos(d(a)), y: Math.sin(d(a)) });
  const A = on(83), B = on(227), C = on(295), D = on(3);
  // tangent at C runs along 25° / 205°; its free end is 0.3 beyond C on the lower-left side
  const T = { x: C.x + 0.3 * Math.cos(d(205)), y: C.y + 0.3 * Math.sin(d(205)) };
  const U = { x: C.x + Math.cos(d(25)), y: C.y + Math.sin(d(25)) };
  const c = new Construction()
    .circle('k', 0, 0, 1)
    .point('O', 0, 0)
    .point('A', A.x, A.y).point('B', B.x, B.y).point('C', C.x, C.y).point('D', D.x, D.y)
    .point('T', T.x, T.y).point('U', U.x, U.y)
    .intersectLines('E', ['A', 'D'], ['T', 'U'])
    .assertOnCircle('A on circle', 'A', 'k').assertOnCircle('B on circle', 'B', 'k')
    .assertOnCircle('C on circle', 'C', 'k').assertOnCircle('D on circle', 'D', 'k')
    .assertTangentAt('TE touches the circle at C', ['T', 'E'], 'k', 'C')
    .assertCollinear('E on AD produced', ['A', 'D', 'E'])
    .assertBetween('D between A and E', 'A', 'D', 'E')
    .assertBetween('C between T and E', 'T', 'C', 'E')
    .assertAngle('angle ABD = 40', ['A', 'B', 'D'], 40)
    .assertAngle('angle BDC = 34', ['B', 'D', 'C'], 34)
    .assertEqualAngles('AC bisects angle BAD', ['B', 'A', 'C'], ['C', 'A', 'D']);
  c.assertNum('E.x as described (1.447)', c.P('E').x, 1.447, 0.002)
    .assertNum('E.y as described (-0.429)', c.P('E').y, -0.429, 0.002)
    .assertParallel('tangent at C parallel to BD', ['T', 'E'], ['B', 'D']);
  return {
    cons: c, width: 360, height: 300, tall: true, margin: 26,
    base: [
      el.circle('k'),
      el.ring('O', { r: 1.2, w: 2.6 }),   // the centre as a small filled dot (a dot off every stroke fails verifyDrawing)
      el.seg('A', 'B'), el.seg('B', 'C'), el.seg('C', 'D'), el.seg('A', 'D'),
      el.seg('A', 'C'), el.seg('B', 'D'),
      el.seg('D', 'E'),
      el.seg('T', 'E'),
      el.arc('A', 'B', 'D', { r: 36 }),
      el.label('B', '40°', 36.8, -36.8, { fs: 12 }),   // inside angle ABD, on its bisector just beyond the arc
      el.arc('B', 'D', 'C', { r: 38 }),
      el.label('D', '34°', -41.2, 36.4, { fs: 12 }),   // inside angle BDC, on its bisector just beyond the arc
      el.label('O', 'O', -9, -7, { italic: true }),
      el.label('A', 'A', 2, -10, { italic: true }),
      el.label('B', 'B', -11, 9, { italic: true }),
      el.label('C', 'C', 5, 15, { italic: true }),
      el.label('D', 'D', 10, -7, { italic: true }),
      el.label('E', 'E', 11, 4, { italic: true }),
    ],
    layers: [[]],
  };
};
