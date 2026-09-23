// P2 Q8 — belt round two pulleys: centre A radius 25, centre B radius 10, AB = 39,
// common external tangents PQ (upper) and RS (lower). Drawn to scale, 1 unit = 1 cm.
module.exports = ({ Construction, el }) => {
  const R1 = 25, R2 = 10, AB = 39;
  const th = (Math.acos((R1 - R2) / AB) * 180) / Math.PI;   // angle PAB in degrees (the construction, never printed)
  const c = new Construction()
    .point('A', 0, 0).point('B', AB, 0)
    .circle('big', 0, 0, R1)
    .circle('small', AB, 0, R2)
    .onCircle('P', 'big', th)
    .onCircle('Q', 'small', th)
    .onCircle('R', 'big', 360 - th)
    .onCircle('S', 'small', 360 - th)
    .assertOnCircle('P on the larger pulley', 'P', 'big')
    .assertOnCircle('R on the larger pulley', 'R', 'big')
    .assertOnCircle('Q on the smaller pulley', 'Q', 'small')
    .assertOnCircle('S on the smaller pulley', 'S', 'small')
    .assertTangentAt('PQ touches the larger pulley at P', ['P', 'Q'], 'big', 'P')
    .assertTangentAt('PQ touches the smaller pulley at Q', ['P', 'Q'], 'small', 'Q')
    .assertTangentAt('RS touches the larger pulley at R', ['R', 'S'], 'big', 'R')
    .assertTangentAt('RS touches the smaller pulley at S', ['R', 'S'], 'small', 'S')
    .assertParallel('AP parallel to BQ', ['A', 'P'], ['B', 'Q'])
    .assertNum('AB = 39', Math.hypot(AB, 0), 39)
    .assertLess('pulleys do not touch (25 + 10 < 39)', R1 + R2, AB);
  const belt = { w: 3.2, cap: 'round' };
  const thin = { w: 1.3 };
  return {
    cons: c, width: 320, height: 230, margin: 24,
    base: [
      // the belt: major arc of the larger pulley (away from B), minor arc of the smaller (away from A), two straight parts
      el.circleArc('big', th, 360 - th, belt),
      el.circleArc('small', 360 - th, th, belt),
      el.seg('P', 'Q', belt),
      el.seg('R', 'S', belt),
      // the rest of each pulley, thin, so both appear as complete circles
      el.circleArc('big', 360 - th, th, thin),
      el.circleArc('small', th, 360 - th, thin),
      // radii and the line of centres
      el.seg('A', 'P', thin),
      el.seg('B', 'Q', thin),
      el.seg('A', 'B', { w: 1.3, dash: true }),
      el.dot('A'), el.dot('B'),
      el.label('A', 'A', -4, 14, { italic: true }),
      el.label('B', 'B', 4, 14, { italic: true }),
      el.label('P', 'P', -2, -10, { italic: true }),
      el.label('Q', 'Q', 6, -10, { italic: true }),
      el.label('R', 'R', -2, 13, { italic: true }),
      el.label('S', 'S', 6, 13, { italic: true }),
    ],
    layers: [[]],
  };
};
