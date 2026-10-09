// P1 Q7 — circle ABCD, CB = CD, chords AC and BD meet at X, tangent at C meets AB produced at T.
module.exports = ({ Construction, el }) => {
  const d = (a) => (a * Math.PI) / 180;
  const on = (a) => ({ x: Math.cos(d(a)), y: Math.sin(d(a)) });
  const A = on(110), B = on(215), C = on(270), D = on(325);
  const c = new Construction()
    .circle('k', 0, 0, 1)
    .point('A', A.x, A.y).point('B', B.x, B.y).point('C', C.x, C.y).point('D', D.x, D.y)
    .point('L', -1.25, -1).point('Rt', 0.4, -1)         // the tangent at C (y = −1)
    .intersectLines('X', ['A', 'C'], ['B', 'D'])
    .intersectLines('T', ['A', 'B'], ['L', 'Rt'])
    .assertOnCircle('A on circle', 'A', 'k').assertOnCircle('B on circle', 'B', 'k')
    .assertOnCircle('C on circle', 'C', 'k').assertOnCircle('D on circle', 'D', 'k')
    .assertEqualLength('CB = CD', ['C', 'B'], ['C', 'D'])
    .assertTangentAt('LRt touches at C', ['L', 'Rt'], 'k', 'C')
    .assertCollinear('T on AB produced', ['A', 'B', 'T'])
    .assertBetween('B between A and T', 'A', 'B', 'T')
    .assertBetween('X inside BD', 'B', 'X', 'D')
    .assertBetween('X inside AC', 'A', 'X', 'C');
  return {
    cons: c, width: 300, height: 250, margin: 26,
    base: [
      el.circle('k'),
      el.seg('A', 'C'), el.seg('B', 'D'), el.seg('A', 'T'),
      el.seg('C', 'B'), el.seg('C', 'D'),
      el.ticks('C', 'B', 1), el.ticks('C', 'D', 1),
      el.seg('L', 'Rt'),
      el.dot('A'), el.dot('B'), el.dot('C'), el.dot('D'), el.dot('T'),
      el.label('A', 'A', -9, -8, { italic: true }),
      el.label('B', 'B', -11, 2, { italic: true }),
      el.label('C', 'C', 8, 13, { italic: true }),
      el.label('D', 'D', 11, 3, { italic: true }),
      el.label('X', 'X', 7, -6, { italic: true }),
      el.label('T', 'T', -10, 12, { italic: true }),
    ],
    layers: [[]],
  };
};
