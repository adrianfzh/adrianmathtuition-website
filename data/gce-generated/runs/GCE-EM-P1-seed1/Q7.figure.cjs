// P1 Q7 — ACCURATE SCALE DRAWING of the triangular garden ABC (1 cm to 5 m).
//
// World units ARE drawing centimetres: B at the origin, C 7.0 cm to the right,
// A 6.0 cm directly above B, so angle ABC = 90°, BC = 35 m and AB = 30 m at the
// stated scale. The candidate measures AB off this figure and constructs on it,
// so the PRINTED size must be true. The box is therefore sized deliberately:
// 36 units = 1 drawing cm and the viewBox is 381 units = 10.5833 cm = 300 pt
// tall, which is exactly the height the paper's `.pp-figure { max-height:300pt }`
// gives the image — so AB prints at 6.00 cm and BC at 7.00 cm.
// The generous white band above and to the left of the triangle is deliberate
// too: the candidate's construction arcs for the perpendicular bisector of AB
// and the bisector of angle ABC need room outside the triangle.
//
// Nothing the candidate is asked to construct or find is drawn: no T, no
// bisectors, no compass arcs, no length beside AB, no length on AC.
module.exports = ({ Construction, el }) => {
  const c = new Construction()
    .point('B', 0, 0)
    .point('C', 7, 0)
    .point('A', 0, 6);
  const len = (p, q) => Math.hypot(c.P(p).x - c.P(q).x, c.P(p).y - c.P(q).y);
  c.assertPerpendicular('angle ABC = 90°', ['B', 'A'], ['B', 'C'])
    .assertNum('BC = 7.0 cm on the drawing (35 m at 1 cm to 5 m)', len('B', 'C'), 7)
    .assertNum('AB = 6.0 cm on the drawing (30 m at 1 cm to 5 m)', len('A', 'B'), 6);
  return {
    cons: c,
    width: 306, height: 381, margin: 27, tall: true,
    base: [
      // Fine ruled lines — the candidate measures off them, so the stroke is
      // kept thin rather than the usual teaching-figure weight.
      el.seg('A', 'B', { w: 1.2 }), el.seg('B', 'C', { w: 1.2 }), el.seg('C', 'A', { w: 1.2 }),
      el.right('A', 'B', 'C', 13, { w: 1.2 }),
      el.label('A', 'A', -14, -6, { italic: true }),
      el.label('B', 'B', -14, 16, { italic: true }),
      el.label('C', 'C', 14, 16, { italic: true }),
      el.text({ x: 3.5, y: 0 }, '35 m', 0, 26),
      el.text({ x: 3.5, y: 0 }, 'Scale: 1 cm to 5 m', 0, 62, { fs: 13 }),
    ],
    layers: [[]],
  };
};
