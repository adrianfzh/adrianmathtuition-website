// P1 Q12 — basketball path y = 3.8 - 0.2(x - 3)^2: released at (0, 2), highest at (3, 3.8),
// falling through the hoop centre (5, 3). Sketch, not to scale; only the given heights/distance printed.
module.exports = ({ Construction, el }) => {
  const f = (x) => 3.8 - 0.2 * (x - 3) * (x - 3);
  const xEnd = 5.5;   // the path stops just past the hoop, short of the post
  const pts = [];
  for (let i = 0; i <= 110; i++) { const x = i / 20; pts.push({ x, y: f(x) }); }   // x = 0, 3, 5 are exact samples
  const c = new Construction()
    .point('O', 0, 0)
    .point('R', 0, f(0))            // release point
    .point('V', 3, f(3))            // highest point
    .point('H', 5, f(5))            // centre of the hoop
    .point('Hf', 5, 0)              // floor below the hoop centre
    .point('Xe', 7.1, 0).point('Ye', 0, 4.5)
    .point('RL', 4.62, 3).point('RR', 5.38, 3)      // the ring seen edge-on
    .point('PT', 5.85, 3.55).point('PB', 5.85, 0)   // the post
    .assertNum('release height 2', f(0), 2)
    .assertNum('greatest height 3.8', f(3), 3.8)
    .assertNum('hoop centre height 3', f(5), 3)
    .assertLess('highest point before the hoop', 3, 5)
    .assertLess('ball falling at the hoop (gradient < 0)', -0.4 * (5 - 3), 0)
    .assertBetween('H is the centre of the ring', 'RL', 'H', 'RR')
    .assertLess('path ends before the post', xEnd, 5.85);
  return {
    cons: c, width: 320, height: 240, margin: 40,
    base: [
      el.arrow('O', 'Xe'), el.arrow('O', 'Ye'),
      el.label('Xe', 'x', 4, 14, { italic: true }),
      el.label('Ye', 'y', -10, 2, { italic: true }),
      el.label('O', 'O', -10, 12, { italic: true }),
      el.pline(pts, { smooth: true }),
      el.seg('RL', 'RR', { w: 3 }),
      el.seg('RR', { x: 5.85, y: 3 }),
      el.seg('PB', 'PT'),
      el.dot('R'), el.dot('V'), el.dot('H'),
      el.darrow('O', 'R', '2 m', { offset: 16, labelDx: 6 }),
      el.darrow('Hf', 'H', '3 m', { offset: -12, labelDx: -4 }),
      el.dim('O', 'Hf', 18, '5 m'),
    ],
    layers: [[]],
  };
};
