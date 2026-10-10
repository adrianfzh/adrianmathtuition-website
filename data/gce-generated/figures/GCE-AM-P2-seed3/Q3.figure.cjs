// P2 Q3 — y = e^{2x}; tangent at P meets the x-axis at T, normal at P meets it at N.
// P is the answer point p = -½ ln 2 (y = ½), so TM = MN = ½; nothing numeric is printed.
module.exports = ({ Construction, el, plotFn }) => {
  const f = (x) => Math.exp(2 * x);
  const p = -0.5 * Math.log(2);
  const yP = f(p);
  const m = 2 * f(p);                       // gradient of the tangent at P
  const c = new Construction()
    .point('O', 0, 0)
    .point('P', p, yP)
    .point('M', p, 0)
    .point('T', p - yP / m, 0)              // tangent meets y = 0
    .point('N', p + yP * m, 0)              // normal meets y = 0
    .point('Ta', p - yP / m - 0.07, -0.07 * m)        // tangent runs a little past T
    .point('Tb', p + 0.55, yP + 0.55 * m)             // and on past P
    .point('Na', p - 0.42, yP + 0.42 / m)             // normal above P
    .point('Nb', p + yP * m + 0.07, -0.07 / m)        // a little past N
    .point('X0', -1.55, 0).point('X1', 0.85, 0)
    .point('Y0', 0, -0.28).point('Y1', 0, 1.95);
  c.assertNum('P on y = e^{2x}', c.P('P').y, f(c.P('P').x), 1e-12)
    .assertNum('PT has the curve gradient at P', (c.P('P').y - c.P('T').y) / (c.P('P').x - c.P('T').x), m, 1e-9)
    .assertPerpendicular('normal PN is perpendicular to tangent PT', ['P', 'T'], ['P', 'N'])
    .assertCollinear('tangent line Ta T P Tb', ['Ta', 'T', 'P', 'Tb'])
    .assertCollinear('normal line Na P N Nb', ['Na', 'P', 'N', 'Nb'])
    .assertNum('T on the x-axis', c.P('T').y, 0)
    .assertNum('N on the x-axis', c.P('N').y, 0)
    .assertBetween('T left of the foot M, N right of it', 'T', 'M', 'N')
    .assertLess('P in x < 0', c.P('P').x, 0)
    .assertNum('TN = 1 (the given condition)', c.P('N').x - c.P('T').x, 1, 1e-12);
  const lab = { italic: true, fs: 16 };
  return {
    cons: c, width: 290, height: 260, margin: 22,
    base: [
      el.arrow('X0', 'X1'),
      el.arrow('Y0', 'Y1'),
      el.pline(plotFn(f, -1.45, 0.33), { smooth: 'monotone' }),
      el.seg('Ta', 'Tb'),
      el.seg('Na', 'Nb'),
      el.dot('P'), el.dot('T'), el.dot('N'),
      el.label('P', 'P', 0, -20, lab),
      el.label('T', 'T', -9, 15, lab),
      el.label('N', 'N', 12, 15, lab),
      el.label('O', 'O', -10, 15, lab),
      el.label('X1', 'x', 10, 4, lab),
      el.label('Y1', 'y', 10, 2, lab),
    ],
    layers: [[]],
  };
};
