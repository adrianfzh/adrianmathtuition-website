// E Math P1 Q27 — trapezium ABCD, AD parallel to BC, AD = 3BC; AB = p, BC = q; E on CD with CE : ED = 1 : 2.
// Asked: AF : FB (2 : 1) and area FBCE (10 of 45) — F, FE and every length/ratio/area are checked, never drawn.
module.exports = ({ Construction, el }) => {
  const c = new Construction()
    .point('A', 0, 0).point('D', 9, 0)            // AD: the long lower side, horizontal
    .point('B', 1.5, 4.5).point('C', 4.5, 4.5)    // BC: the short upper side, one third of AD
    .lerp('E', 'C', 'D', 1 / 3)                   // CE : ED = 1 : 2
    .lerp('F', 'A', 'B', 2 / 3)                   // the answer to (a) — built to check, NOT drawn
    .assertParallel('AD parallel to BC', ['A', 'D'], ['B', 'C'])
    .assertLengthRatio('AD = 3BC', ['A', 'D'], ['B', 'C'], 3)
    .assertBetween('E on CD', 'C', 'E', 'D')
    .assertLengthRatio('CE : ED = 1 : 2', ['E', 'D'], ['C', 'E'], 2)
    .assertParallel('FE parallel to BC when AF : FB = 2 : 1 (answer a)', ['F', 'E'], ['B', 'C'])
    .assertLengthRatio('FE = 5/3 BC (answer b working)', ['F', 'E'], ['B', 'C'], 5 / 3);
  const P = (n) => c.P(n);
  // AD and BC point the same way (AD = +3q, not −3q)
  const dAD = { x: P('D').x - P('A').x, y: P('D').y - P('A').y };
  const dBC = { x: P('C').x - P('B').x, y: P('C').y - P('B').y };
  c.assertLess('AD and BC in the same direction', -(dAD.x * dBC.x + dAD.y * dBC.y), 0);
  // it is a trapezium, not a parallelogram: AB and DC slope inwards
  c.assertLess('B right of A', P('A').x, P('B').x).assertLess('C left of D', P('C').x, P('D').x);
  // (b): FBCE is 4/9 of ABCD's bh-product → 10 when ABCD = 45
  const h = P('B').y, b = Math.hypot(dBC.x, dBC.y);
  const areaABCD = 0.5 * (b + 3 * b) * h;
  const areaFBCE = 0.5 * (b + (5 / 3) * b) * (h - P('F').y);
  c.assertNum('area FBCE / ABCD = 10/45 (answer b)', areaFBCE / areaABCD, 10 / 45);

  const lerp = (U, V, t) => ({ x: P(U).x + (P(V).x - P(U).x) * t, y: P(U).y + (P(V).y - P(U).y) * t });
  return {
    cons: c, width: 330, height: 220, margin: 28,
    base: [
      el.seg('A', 'B'), el.seg('B', 'C'), el.seg('C', 'D'), el.seg('D', 'A'),
      // vector arrowheads mid-side: A→B (p) and B→C (q)
      el.arrow(lerp('A', 'B', 0.42), lerp('A', 'B', 0.58)),
      el.arrow(lerp('B', 'C', 0.42), lerp('B', 'C', 0.58)),
      el.dot('E'),
      el.label('A', 'A', -9, 10, { italic: true }),
      el.label('B', 'B', -9, -8, { italic: true }),
      el.label('C', 'C', 9, -8, { italic: true }),
      el.label('D', 'D', 10, 10, { italic: true }),
      el.label('E', 'E', 11, -5, { italic: true }),
      el.label({ x: 0.75 - 0.5, y: 2.25 + 0.15 }, 'p', 0, 0, { bold: true, fs: 15 }),
      el.label({ x: 3, y: 4.5 + 0.45 }, 'q', 0, 0, { bold: true, fs: 15 }),
      el.label({ x: 7.7, y: 4.4 }, 'NOT TO SCALE', 0, 0, { fs: 11 }),
    ],
    layers: [[]],
  };
};
