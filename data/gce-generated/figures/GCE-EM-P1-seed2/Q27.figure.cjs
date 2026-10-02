// E Math Set 1 P1 Q27 — quadrilateral OABC with OA = a, OC = c, AB = 3a + 2c (so OB = 4a + 2c);
// diagonals OB and AC meet at X. Added 29 Sep 2026 (Adrian: "should there be an image for this?").
// Drawn from a = (1.1, -0.3), c = (0.2, 1.9); X is NOT labelled with its ratio (that is part (a)).
module.exports = ({ Construction, el }) => {
  const a = { x: 1.1, y: -0.3 }, cv = { x: 0.2, y: 1.9 };
  const c = new Construction()
    .point('O', 0, 0).point('A', a.x, a.y).point('C', cv.x, cv.y)
    .point('B', 4 * a.x + 2 * cv.x, 4 * a.y + 2 * cv.y)
    .intersectLines('X', ['O', 'B'], ['A', 'C'])
    .assertBetween('X on OB', 'O', 'X', 'B')
    .assertBetween('X on AC', 'A', 'X', 'C');
  return {
    cons: c, width: 330, height: 200, margin: 34,
    base: [
      el.seg('O', 'A'), el.seg('A', 'B'), el.seg('B', 'C'), el.seg('C', 'O'),
      el.seg('O', 'B', { w: 1.2 }), el.seg('A', 'C', { w: 1.2 }),
      el.dot('X'),
      el.label('O', null, -12, 4, { tex: 'O' }),
      el.label('A', null, 2, 14, { tex: 'A' }),
      el.label('B', null, 12, 4, { tex: 'B' }),
      el.label('C', null, -4, -12, { tex: 'C' }),
      el.label('X', null, 2, -13, { tex: 'X' }),
    ],
    layers: [[]],
  };
};
