// P1 Q16 — circle centre O, BD a diameter, AB produced and DC produced meet at E outside the circle; angle BEC = 34°.
module.exports = ({ Construction, el }) => {
  const d = (a) => (a * Math.PI) / 180;
  const on = (a) => ({ x: Math.cos(d(a)), y: Math.sin(d(a)) });
  const A = on(120), B = on(180), C = on(232), D = on(0);
  const c = new Construction()
    .circle('k', 0, 0, 1)
    .point('O', 0, 0)
    .point('A', A.x, A.y).point('B', B.x, B.y).point('C', C.x, C.y).point('D', D.x, D.y)
    .intersectLines('E', ['A', 'B'], ['D', 'C'])
    .assertOnCircle('A on circle', 'A', 'k').assertOnCircle('B on circle', 'B', 'k')
    .assertOnCircle('C on circle', 'C', 'k').assertOnCircle('D on circle', 'D', 'k')
    .assertCollinear('BD through O (diameter)', ['B', 'O', 'D'])
    .assertBetween('O is the midpoint side of BD', 'B', 'O', 'D')
    .assertCollinear('E on AB produced', ['A', 'B', 'E'])
    .assertBetween('B between A and E', 'A', 'B', 'E')
    .assertCollinear('E on DC produced', ['D', 'C', 'E'])
    .assertBetween('C between D and E', 'D', 'C', 'E')
    .assertAngle('angle BEC = 34', ['B', 'E', 'C'], 34);
  return {
    cons: c, width: 300, height: 260, margin: 26,
    base: [
      el.circle('k'),
      el.seg('B', 'D'),
      el.seg('A', 'E'), el.seg('D', 'E'),
      el.seg('B', 'C'), el.seg('D', 'A'),
      el.ring('O', { r: 1.5, w: 2 }),
      el.dot('A'), el.dot('B'), el.dot('C'), el.dot('D'), el.dot('E'),
      el.arc('B', 'E', 'C', { r: 42, label: '34°', labelR: 66 }),
      el.label('A', 'A', -8, -10, { italic: true }),
      el.label('B', 'B', -13, -4, { italic: true }),
      el.label('C', 'C', 2, 15, { italic: true }),
      el.label('D', 'D', 11, 4, { italic: true }),
      el.label('E', 'E', -10, 10, { italic: true }),
      el.label('O', 'O', 2, 14, { italic: true }),
    ],
    layers: [[]],
  };
};
