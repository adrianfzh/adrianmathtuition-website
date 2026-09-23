// P2 Q7 — tunnel cross-section: semicircle, centre O, diameter AB = 20 m on the floor.
// Frame: struts AD and BC and a horizontal beam DC, D and C on the roof, D nearer A.
// Drawing value only (never printed): angle DAB = 55 deg, so angle DOB = 110 deg and
// D = (10cos110, 10sin110) ~ (-3.42, 9.40), C = (3.42, 9.40). Deliberately NOT 60 deg
// (the part (c) answer) and inside the part (b) range, so the sketch suggests neither.
module.exports = ({ Construction, el }) => {
  const R = 10;
  const theta = 55;                                   // drawing value only
  const d = (a) => (a * Math.PI) / 180;
  const on = (a) => ({ x: R * Math.cos(d(a)), y: R * Math.sin(d(a)) });
  const Dp = on(2 * theta), Cp = on(180 - 2 * theta);   // angle DOB = 2 x angle DAB (drawing only)

  const c = new Construction()
    .circle('k', 0, 0, R)
    .point('O', 0, 0)
    .point('A', -R, 0)
    .point('B', R, 0)
    .point('D', Dp.x, Dp.y)
    .point('C', Cp.x, Cp.y)
    .assertOnCircle('D on the roof', 'D', 'k')
    .assertOnCircle('C on the roof', 'C', 'k')
    .assertOnCircle('A on the circle', 'A', 'k')
    .assertOnCircle('B on the circle', 'B', 'k')
    .assertBetween('O lies on AB', 'A', 'O', 'B')
    .assertEqualLength('OA = OB (O the centre)', ['O', 'A'], ['O', 'B'])
    .assertNum('AB = 20', 2 * R, 20)
    .assertParallel('beam DC horizontal (parallel to AB)', ['D', 'C'], ['A', 'B'])
    .assertAngle('angle DAB = theta (drawing value)', ['B', 'A', 'D'], theta)
    .assertLess('D is nearer to A than C is (D left of C)', Dp.x, Cp.x)
    .assertLess('D and C above the floor', 0, Dp.y)
    .assertLess('not the 60 deg configuration of part (c)', theta, 58)
    .assertLess('beam at least 8 m above the floor (inside the part (b) range)', 8, Dp.y);

  return {
    cons: c, width: 320, height: 230, margin: 24,
    base: [
      el.circleArc('k', 0, 180, { w: 1.6 }),          // the roof
      el.seg('A', 'B', { w: 1.6 }),                   // the floor
      el.seg('A', 'D', { w: 3, cap: 'round' }),                   // strut AD
      el.seg('D', 'C', { w: 3, cap: 'round' }),                   // beam DC
      el.seg('C', 'B', { w: 3, cap: 'round' }),                   // strut BC
      el.dot('O'),
      el.arc('B', 'A', 'D', { r: 26, labelTex: '\\theta' }),
      el.dim('A', 'B', 30, null),                     // the dimension span for AB …
      el.label({ x: 0, y: -3.4 }, '20 m', 0, 0),     // … its label centred below the span, clear of O
      el.label('A', 'A', -11, 4, { italic: true }),
      el.label('B', 'B', 11, 4, { italic: true }),
      el.label('D', 'D', -8, -10, { italic: true }),
      el.label('C', 'C', 8, -10, { italic: true }),
      el.label('O', 'O', 0, 14, { italic: true }),
    ],
    layers: [[]],
  };
};
