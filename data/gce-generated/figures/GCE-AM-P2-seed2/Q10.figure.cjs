// P2 Q10 — y = e^x meets the y-axis at A; the line x = b meets the curve at B; the line
// y = k meets the y-axis at Q, the curve at P and x = b at R. Regions AQP and PRB shaded.
// Drawing values only (never printed): b = 2, k = 4. Not to scale: the y-axis is drawn
// at 0.3 of the x-axis scale so the sketch fits the box (no numbers appear anywhere).
module.exports = ({ Construction, el }) => {
  const b = 2, k = 4;
  const SY = 0.3;                                   // vertical drawing scale
  const W = (x, y) => ({ x, y: SY * y });
  const f = (x) => Math.exp(x);
  const xP = Math.log(k);

  // the curve y = e^x on -0.4 <= x <= 2.15, sampled densely and through A, P and B exactly
  const xs = new Set([0, xP, b]);
  for (let i = 0; i <= 102; i++) xs.add(Math.round((-0.4 + i * 0.025) * 1e9) / 1e9);
  const sorted = [...xs].filter((x) => x >= -0.4 - 1e-12 && x <= 2.15 + 1e-12).sort((p, q) => p - q);
  const curve = sorted.map((x) => W(x, f(x)));
  const arc = (x0, x1) => sorted.filter((x) => x > x0 + 1e-9 && x < x1 - 1e-9).map((x) => W(x, f(x)));

  const c = new Construction()
    .point('O', 0, 0)
    .point('A', 0, SY * f(0))
    .point('Q', 0, SY * k)
    .point('P', xP, SY * k)
    .point('R', b, SY * k)
    .point('B', b, SY * f(b))
    .point('Lend', 2.32, SY * k)                    // y = k runs a little beyond x = b
    .point('Vbot', b, SY * -0.3)                    // x = b from a little below the x-axis
    .point('Vtop', b, SY * 8.25)                    // … to a little above the curve
    .assertNum('A is where e^x meets the y-axis (e^0 = 1)', f(0), 1)
    .assertNum('P on the curve: e^(x_P) = k', f(xP), k)
    .assertCollinear('Q, P, R on y = k', ['Q', 'P', 'R', 'Lend'])
    .assertBetween('P between Q and R', 'Q', 'P', 'R')
    .assertBetween('R on the drawn x = b', 'Vbot', 'R', 'Vtop')
    .assertBetween('B on the drawn x = b', 'Vbot', 'B', 'Vtop')
    .assertBetween('A below Q on the y-axis', 'O', 'A', 'Q')
    .assertPerpendicular('QR is perpendicular to x = b', ['Q', 'R'], ['Vbot', 'Vtop'])
    .assertLess('1 < k', 1, k)
    .assertLess('k < e^b', k, f(b))
    .assertLess('P is NOT midway (the answer to part (b))', 0.6, xP / b)
    .assertLess('the line x = b rises above B', f(b), 8.25);
  c.assertNum('B on the drawn curve at x = b', c.P('B').y, curve[sorted.indexOf(b)].y)
   .assertNum('A on the drawn curve', c.P('A').y, curve[sorted.indexOf(0)].y)
   .assertNum('P on the drawn curve', c.P('P').y, curve[sorted.indexOf(xP)].y);

  const A = c.P('A'), Q = c.P('Q'), P = c.P('P'), R = c.P('R'), B = c.P('B');
  const regionAQP = [A, Q, P, ...arc(0, xP).reverse()];
  const regionPRB = [P, R, B, ...arc(xP, b).reverse()];

  return {
    cons: c, width: 330, height: 300, tall: true, margin: 30,
    base: [
      el.region(regionAQP, { noEdge: true, spacing: 6 }),
      el.region(regionPRB, { noEdge: true, spacing: 6 }),
      el.arrow(W(-0.5, 0), W(2.62, 0)),                                  // x-axis
      el.arrow(W(0, -0.5), W(0, 8.9)),                                   // y-axis
      el.label(W(2.62, 0), 'x', 9, 12, { tex: 'x' }),
      el.label(W(0, 8.9), 'y', -11, 2, { tex: 'y' }),
      el.label('O', 'O', -10, 12, { tex: 'O' }),
      el.pline(curve, { smooth: 'monotone' }),
      el.seg('Q', 'Lend'),
      el.seg('Vbot', 'Vtop'),
      el.dot('A'), el.dot('Q'), el.dot('P'), el.dot('R'), el.dot('B'),
      el.label('A', 'A', -12, 2, { italic: true }),
      el.label('Q', 'Q', -12, 2, { italic: true }),
      el.label('P', 'P', -9, -11, { italic: true }),
      el.label('R', 'R', 10, 13, { italic: true }),
      el.label('B', 'B', 12, 7, { italic: true }),
      el.label(W(2.15, f(2.15)), 'y = e^x', 34, 6, { tex: 'y = \\mathrm{e}^{x}' }),
      el.label('Vtop', 'x = b', -26, -4, { tex: 'x = b' }),
      el.label('Lend', 'y = k', 26, 0, { tex: 'y = k' }),
    ],
    layers: [[]],
  };
};
