// P1 Q6 — the graph of y = f'(x) on [0, 6]: zeros at 1 and 4, three regions of areas 2, 8, 9.
module.exports = ({ Construction, el }) => {
  const fp = (x) => (1285 * x ** 4 - 13680 * x ** 3 + 31743 * x ** 2 + 19340 * x - 38688) / 10800;
  const pts = [];
  for (let i = 0; i <= 240; i++) { const x = (6 * i) / 240; pts.push({ x, y: fp(x) }); }
  const c = new Construction()
    .point('O', 0, 0).point('X1', 1, 0).point('X4', 4, 0).point('X6', 6, 0)
    .point('Xend', 6.8, 0).point('Xneg', -0.5, 0).point('Ytop', 0, 5).point('Yneg', 0, -7.5)
    .point('E', 6, fp(6));
  const tick = (x) => el.seg({ x, y: -0.15 }, { x, y: 0.15 });
  return {
    cons: c, width: 300, height: 260, margin: 24,
    base: [
      el.arrow('Xneg', 'Xend'), el.arrow('Yneg', 'Ytop'),
      el.label('Xend', 'x', 8, 4, { italic: true }), el.label('Ytop', 'y', -8, -4, { italic: true }),
      el.label('O', 'O', -8, 11, { italic: true }),
      tick(1), tick(4), tick(6),
      el.label('X1', '1', 0, 14), el.label('X4', '4', 0, 14), el.label('X6', '6', 6, 14),
      el.pline(pts, { smooth: true }),
      el.seg('X6', 'E'),
      el.label({ x: 3.6, y: 4.4 }, "y = f ′(x)", 14, 0, { italic: true }),
      el.label({ x: 0.5, y: -1.6 }, '2', 0, 4), el.label({ x: 2.5, y: 1.7 }, '8', 0, 4), el.label({ x: 5.15, y: -2.6 }, '9', 0, 4),
    ],
    layers: [[]],
  };
};
