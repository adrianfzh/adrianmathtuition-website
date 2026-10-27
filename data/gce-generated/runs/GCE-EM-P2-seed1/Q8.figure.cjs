// P2 Q8 — circle ABCD centre O, diameter AOC, tangent at C meets AB produced at T.
// Given: angle BAC = 32°, angle CBD = 37°.  Nothing else is printed.
module.exports = ({ Construction, el }) => {
  const d = (a) => (a * Math.PI) / 180;
  const on = (a) => ({ x: Math.cos(d(a)), y: Math.sin(d(a)) });
  const A = on(180);            // far left
  const B = on(64);             // angle BOC = 2 × 32°
  const C = on(0);              // far right
  const D = on(-74);            // angle COD = 2 × 37°
  const c = new Construction()
    .circle('k', 0, 0, 1)
    .point('O', 0, 0)
    .point('A', A.x, A.y).point('B', B.x, B.y).point('C', C.x, C.y).point('D', D.x, D.y)
    .point('L', 1, -0.38).point('U', 1, 1.48)          // the tangent at C (x = 1)
    .intersectLines('T', ['A', 'B'], ['L', 'U'])
    .assertOnCircle('A on circle', 'A', 'k').assertOnCircle('B on circle', 'B', 'k')
    .assertOnCircle('C on circle', 'C', 'k').assertOnCircle('D on circle', 'D', 'k')
    .assertCollinear('AOC is a diameter', ['A', 'O', 'C'])
    .assertBetween('O between A and C', 'A', 'O', 'C')
    .assertTangentAt('LU touches the circle at C', ['L', 'U'], 'k', 'C')
    .assertCollinear('T on AB produced', ['A', 'B', 'T'])
    .assertBetween('B between A and T', 'A', 'B', 'T')
    .assertAngle('angle BAC = 32', ['B', 'A', 'C'], 32)
    .assertAngle('angle CBD = 37', ['C', 'B', 'D'], 37);
  return {
    cons: c, width: 300, height: 300, margin: 28, tall: true,
    base: [
      el.circle('k'),
      el.seg('A', 'C'),                                  // the diameter AOC
      el.seg('A', 'T'),                                  // the chord AB produced to T
      el.seg('B', 'C'), el.seg('A', 'D'), el.seg('B', 'D'), el.seg('C', 'D'),
      el.seg('L', 'U'),                                  // the tangent at C
      el.arc('B', 'A', 'C', { label: '32°', r: 44, labelR: 62 }),
      el.arc('C', 'B', 'D', { label: '37°', r: 42 }),
      el.dot('O'), el.dot('A'), el.dot('B'), el.dot('C'), el.dot('D'), el.dot('T'),
      el.label('A', 'A', -13, 4, { italic: true }),
      el.label('B', 'B', -13, -3, { italic: true }),
      el.label('C', 'C', 10, 14, { italic: true }),
      el.label('D', 'D', 8, 15, { italic: true }),
      el.label('O', 'O', -2, 15, { italic: true }),
      el.label('T', 'T', 10, -6, { italic: true }),
      el.caption('Not drawn to scale'),
    ],
    layers: [[]],
  };
};
