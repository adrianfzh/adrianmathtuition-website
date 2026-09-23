// E Math P1 Q13 — circle centre O, tangent at A meets CB produced at T.
// Given: angle ATB = 28°, angle ACB = 35°. Asked: angle OAC (27°), angle ABC (63°) — never printed.
module.exports = ({ Construction, el }) => {
  const d = (a) => (a * Math.PI) / 180;
  const on = (a) => ({ x: Math.cos(d(a)), y: Math.sin(d(a)) });
  const A = on(270), B = on(200), C = on(36);
  const c = new Construction()
    .circle('k', 0, 0, 1)
    .point('O', 0, 0)
    .point('A', A.x, A.y).point('B', B.x, B.y).point('C', C.x, C.y)
    .point('L', -3, -1).point('R', 0.5, -1)              // the tangent at A (y = −1)
    .intersectLines('T', ['C', 'B'], ['L', 'R'])
    .assertOnCircle('A on circle', 'A', 'k')
    .assertOnCircle('B on circle', 'B', 'k')
    .assertOnCircle('C on circle', 'C', 'k')
    .assertTangentAt('LR touches the circle at A', ['L', 'R'], 'k', 'A')
    .assertCollinear('T, B, C collinear', ['T', 'B', 'C'])
    .assertBetween('B between T and C', 'T', 'B', 'C')
    .assertBetween('A between T and the tangent end', 'T', 'A', 'R')
    .assertAngle('angle ATB = 28', ['A', 'T', 'B'], 28)
    .assertAngle('angle ACB = 35', ['A', 'C', 'B'], 35)
    // the answers, checked but never drawn
    .assertAngle('angle OAC = 27 (answer a)', ['O', 'A', 'C'], 27)
    .assertAngle('angle ABC = 63 (answer b)', ['A', 'B', 'C'], 63);
  // Angle values are free labels at fs 13. The radius OC is not drawn (session, 23 Sep 2026): with it
  // the 35° label sat in the 27° wedge OCA and read as angle OCA. Positions in px along
  // each angle's interior: 1 unit = 104 px at this box size.
  const PX = 104;
  const along = (V, degDir, px) => {
    const v = c.P(V);
    return { x: v.x + (px / PX) * Math.cos(d(degDir)), y: v.y + (px / PX) * Math.sin(d(degDir)) };
  };
  const at28 = along('T', 14, 76);        // bisector of angle ATB (0° to 28°)
  const at35 = along('C', 225.5, 74);     // bisector of angle ACB (CB at 208°, CA at 243°)
  return {
    cons: c, width: 400, height: 260, margin: 26,
    base: [
      el.circle('k'),
      el.seg('T', 'R'),                 // tangent at A, from T to half a radius right of A
      el.seg('T', 'C'),                 // T, B, C collinear
      el.seg('A', 'C'), el.seg('A', 'B'),
      el.seg('O', 'A'),                 // OC is NOT drawn: the 35° mark must read as angle ACB only
      el.dot('O'),
      el.arc('A', 'T', 'B', { r: 58 }),
      el.arc('A', 'C', 'B', { r: 58 }),
      el.label(at28, '28°', 0, 0, { fs: 13 }),
      el.label(at35, '35°', 0, 0, { fs: 13 }),
      el.label('O', 'O', -14, 7, { italic: true }),
      el.label('A', 'A', 0, 15, { italic: true }),
      el.label('B', 'B', -11, 4, { italic: true }),
      el.label('C', 'C', 9, -8, { italic: true }),
      el.label('T', 'T', -8, 13, { italic: true }),
    ],
    layers: [[]],
  };
};
