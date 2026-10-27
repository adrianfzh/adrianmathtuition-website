// P1 Q25 — box-and-whisker plot of race times (80 runners).
// Five-number summary: 38, 47, 53, 62, 84 minutes.
// Engine construction rather than the box-plot family: that family numbers EVERY
// tick, so a scale fine enough to read 47 / 53 / 62 exactly (step 1) cannot be
// drawn — it needs 46 intervals and caps at 40, and step 2 misses the odd values.
// Here the grid is every 1 minute while only the multiples of 10 carry numbers.
module.exports = ({ Construction, el }) => {
  const XMIN = 30, XMAX = 90;          // world x = time in minutes
  const AXIS = 0, TOP = 10;            // grid runs from the axis up to TOP
  const CY = 5.6;                      // centre line of the single box
  const BH = 2.5;                      // box half-height
  const CH = 1.55;                     // whisker cap half-height

  // Five-number summary (the givens; nothing derived is drawn or printed).
  const MIN = 38, Q1 = 47, MED = 53, Q3 = 62, MAX = 84;

  const c = new Construction()
    .assertNum('summary is non-decreasing', 1, 1)
    .assertLess('min < lower quartile', MIN, Q1)
    .assertLess('lower quartile < median', Q1, MED)
    .assertLess('median < upper quartile', MED, Q3)
    .assertLess('upper quartile < max', Q3, MAX)
    .assertLess('axis covers the left whisker', XMIN, MIN)
    .assertLess('axis covers the right whisker', MAX, XMAX);

  const P = (x, y) => ({ x, y });
  // Three solid vertical grids, coarse over fine, each one <path>: every minute
  // faint, every 5 stronger, every 10 strongest. dy is huge so no horizontals
  // are drawn; el.grid starts at x0 + dx, so x = 30 is added by hand.
  const grid = [
    el.grid(XMIN, XMAX, AXIS, TOP, 1, 1000, { color: '#dcdcdc', dash: '' }),
    el.grid(XMIN, XMAX, AXIS, TOP, 5, 1000, { color: '#b2b2b2', dash: '' }),
    el.grid(XMIN, XMAX, AXIS, TOP, 10, 1000, { color: '#9a9a9a', dash: '' }),
    el.seg(P(XMIN, AXIS), P(XMIN, TOP), { color: '#9a9a9a', w: 0.8 }),
  ];

  const ticks = [];
  const numbers = [];
  for (let t = XMIN; t <= XMAX; t += 10) {
    ticks.push(el.seg(P(t, AXIS), P(t, -0.55), { w: 1.6 }));
    numbers.push(el.label(P(t, -1.5), String(t), 0, 0, { fs: 13 }));
  }

  return {
    cons: c, width: 620, height: 190, margin: 22,
    base: [
      ...grid,
      // axis
      el.seg(P(XMIN, AXIS), P(XMAX, AXIS), { w: 1.8 }),
      ...ticks,
      // whiskers with end caps
      el.seg(P(MIN, CY), P(Q1, CY), { w: 1.6 }),
      el.seg(P(Q3, CY), P(MAX, CY), { w: 1.6 }),
      el.seg(P(MIN, CY - CH), P(MIN, CY + CH), { w: 1.6 }),
      el.seg(P(MAX, CY - CH), P(MAX, CY + CH), { w: 1.6 }),
      // the box
      el.seg(P(Q1, CY - BH), P(Q3, CY - BH), { w: 1.6 }),
      el.seg(P(Q1, CY + BH), P(Q3, CY + BH), { w: 1.6 }),
      el.seg(P(Q1, CY - BH), P(Q1, CY + BH), { w: 1.6 }),
      el.seg(P(Q3, CY - BH), P(Q3, CY + BH), { w: 1.6 }),
      // the median, heavier than the box walls
      el.seg(P(MED, CY - BH), P(MED, CY + BH), { w: 3 }),
      ...numbers,
      el.label(P(60, -4.0), 'Time (minutes)', 0, 0, { fs: 14 }),
    ],
    layers: [[]],
  };
};
