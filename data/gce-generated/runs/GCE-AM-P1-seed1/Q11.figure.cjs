// A Math Set 1 P1 Q11 — a folding fan: ribs of length 20 cm hinged at O, the two outer ribs OA and OB
// making angle AOB = theta. Drawn partly open (theta = 100 degrees — a drawing choice, never printed);
// seven thin inner ribs drawn across the paper leaf (from its inner edge to the tips) so the pivot stays clear; AB dashed with no length. Printed: O, A, B,
// 20 cm on one rib, theta at O. Nothing the candidate is asked for (AB, the area, any rate) appears.
module.exports = ({ Construction, el }) => {
  const d = (a) => (a * Math.PI) / 180;
  const R = 20, r0 = 8;                      // rib length; inner edge of the leaf (drawing choice)
  const TH = 100;                            // theta drawn, in degrees
  const a1 = 90 - TH / 2, a2 = 90 + TH / 2;  // OA at a1, OB at a2 (fan opens upwards)
  const on = (a, r = R) => ({ x: r * Math.cos(d(a)), y: r * Math.sin(d(a)) });
  const A = on(a1), B = on(a2);
  const c = new Construction()
    .point('O', 0, 0).point('A', A.x, A.y).point('B', B.x, B.y)
    .assertEqualLength('OA = OB (equal ribs)', ['O', 'A'], ['O', 'B'])
    .assertNum('OA = 20', Math.hypot(A.x, A.y), 20, 1e-9)
    .assertNum('OB = 20', Math.hypot(B.x, B.y), 20, 1e-9)
    .assertNum('angle AOB = theta drawn', (Math.atan2(B.y, B.x) - Math.atan2(A.y, A.x)) * 180 / Math.PI, TH, 1e-9)
    .assertLess('fan partly open: theta < 180', TH, 180);
  // seven inner ribs, equally spaced between OA and OB
  const ribs = [];
  for (let k = 1; k <= 7; k++) { const a = a1 + (TH * k) / 8; ribs.push(el.seg(on(a, r0), on(a), { w: 1 })); }
  const mid = { x: (A.x) / 2, y: (A.y) / 2 };
  return {
    cons: c, width: 300, height: 235, margin: 22,
    base: [
      // the leaf: tips arc and inner edge
      el.arcAt('O', R, a1, a2, { w: 1.6 }),
      el.arcAt('O', r0, a1, a2, { w: 1 }),
      ...ribs,
      // the outer ribs
      el.seg('O', 'A'), el.seg('O', 'B'),
      // the distance AB, no length printed
      el.seg('A', 'B', { dash: true, w: 1.2 }),
      // the angle at O
      el.arc('A', 'O', 'B', { r: 20, labelTex: '\\theta' }),
      el.dot('O'), el.dot('A'), el.dot('B'),
      el.label('O', 'O', 0, 14, { italic: true }),
      el.label('A', 'A', 12, 4, { italic: true }),
      el.label('B', 'B', -12, 4, { italic: true }),
      el.label(mid, null, 22, 8, { tex: '20\\ \\mathrm{cm}' }),
    ],
    layers: [[]],
  };
};
