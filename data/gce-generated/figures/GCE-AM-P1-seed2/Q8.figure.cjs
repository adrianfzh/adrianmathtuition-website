// P1 Q8 — a rectangular garden 12 m by 5.8 m; a lawn in the shape of a sector OPQ,
// centre O at the bottom-left corner, OP along the bottom (12 m) wall, Q inside the garden.
// NOT to scale and deliberately in neither solution's proportions (r = 9, θ = 2/3 or
// r = 6, θ = 1.5): drawn with radius 7 on the 12-unit wall and θ = 0.85 rad.
// Only the given 12 m, 5.8 m, r m and θ are printed; the other corners are not named.
module.exports = ({ Construction, el }) => {
  const W = 12, H = 5.8;          // the garden, as given
  const R = 7, TH = 0.85;         // drawing radius and angle (not the answers)
  const deg = (TH * 180) / Math.PI;
  const c = new Construction()
    .point('O', 0, 0)
    .point('Rb', W, 0)            // bottom-right corner (not labelled)
    .point('Rt', W, H)            // top-right corner (not labelled)
    .point('Lt', 0, H)            // top-left corner (not labelled)
    .circle('k', 0, 0, R)
    .point('P', R, 0)
    .point('Q', R * Math.cos(TH), R * Math.sin(TH));
  const pQ = c.P('Q');
  c
    .assertOnCircle('P on the lawn circle', 'P', 'k')
    .assertOnCircle('Q on the lawn circle', 'Q', 'k')
    .assertEqualLength('OP = OQ = r', ['O', 'P'], ['O', 'Q'])
    .assertCollinear('P on the bottom wall', ['O', 'P', 'Rb'])
    .assertBetween('P between O and the bottom-right corner', 'O', 'P', 'Rb')
    .assertPerpendicular('the corner at O is a right angle', ['O', 'Rb'], ['O', 'Lt'])
    .assertEqualLength('opposite walls equal (long)', ['O', 'Rb'], ['Lt', 'Rt'])
    .assertEqualLength('opposite walls equal (short)', ['O', 'Lt'], ['Rb', 'Rt'])
    ._assert('Q inside the garden, below the top wall', pQ.x > 0 && pQ.x < W && pQ.y > 0 && pQ.y < H)
    ._assert('the whole lawn fits: farthest along OP is P, farthest up is Q', R < W && R * Math.sin(TH) < H)
    ._assert('angle POQ = 0.85 rad', Math.abs(Math.atan2(pQ.y, pQ.x) - TH) < 1e-12)
    // not the proportions of either solution (r/12 and theta)
    ._assert('not drawn as r = 9 or r = 6', Math.abs(R - 9) > 1 && Math.abs(R - 6) > 0.5)
    ._assert('not drawn as theta = 2/3 or 1.5', Math.abs(TH - 2 / 3) > 0.1 && Math.abs(TH - 1.5) > 0.3);

  // the sector, sampled densely for the hatching (edges drawn separately, one weight)
  const sector = [{ x: 0, y: 0 }];
  for (let i = 0; i <= 40; i++) {
    const a = (TH * i) / 40;
    sector.push({ x: R * Math.cos(a), y: R * Math.sin(a) });
  }

  return {
    cons: c, width: 340, height: 210, margin: 30,
    base: [
      // the garden walls
      el.seg('O', 'Rb'), el.seg('Rb', 'Rt'), el.seg('Rt', 'Lt'), el.seg('Lt', 'O'),
      // the lawn: hatched, with its straight edge OQ and the arc PQ
      el.region(sector, { noEdge: true, spacing: 8 }),
      el.seg('O', 'Q'),
      el.arcAt('O', R, 0, deg),
      // the angle theta at O
      el.arc('P', 'O', 'Q', { r: 30, labelTex: '\\theta' }),
      // point labels
      el.label('O', 'O', -13, 13, { italic: true }),
      el.label('P', 'P', 0, -11, { italic: true }),
      el.label('Q', 'Q', 11, -3, { italic: true }),
      // r m, just above OP near its middle, inside the sector
      el.label({ x: R / 2, y: 0.5 }, null, 0, 0, { tex: 'r\\text{ m}', halo: true }),
      // dimension arrows: 12 m below the bottom wall, 5.8 m left of the left wall
      el.dim('O', 'Rb', 14, null),
      el.dim('O', 'Lt', -14, null),
      el.label({ x: W / 2, y: -1.25 }, '12 m', 0, 0),
      el.label({ x: -2.0, y: H / 2 }, '5.8 m', 0, 0),
    ],
    layers: [[]],
  };
};
