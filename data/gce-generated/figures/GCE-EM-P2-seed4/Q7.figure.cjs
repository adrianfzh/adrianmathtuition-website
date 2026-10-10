// P2 Q7 — sector OAB (radius 12, angle pi/3) with a circle centre C (radius 4) touching OA at P,
// OB at Q and the arc AB at T; the curvilinear triangle O–P–(minor arc)–Q is shaded.
module.exports = ({ Construction, el }) => {
  const s3 = Math.sqrt(3);
  const c = new Construction()
    .point('O', 0, 0).point('A', 12, 0).point('B', 6, 6 * s3)
    .circle('big', 0, 0, 12)
    .point('C', 4 * s3, 4)
    .circle('k', 4 * s3, 4, 4)
    .point('P', 4 * s3, 0).point('Q', 2 * s3, 6).point('T', 6 * s3, 6)
    .assertAngle('angle AOB = pi/3', ['A', 'O', 'B'], 60)
    .assertOnCircle('A on the arc', 'A', 'big').assertOnCircle('B on the arc', 'B', 'big')
    .assertTangentAt('OA touches circle C at P', ['O', 'A'], 'k', 'P')
    .assertTangentAt('OB touches circle C at Q', ['O', 'B'], 'k', 'Q')
    .assertOnCircle('T on the arc', 'T', 'big').assertOnCircle('T on circle C', 'T', 'k')
    .assertCollinear('O, C, T collinear (circles touch at T)', ['O', 'C', 'T'])
    .assertBetween('P on OA', 'O', 'P', 'A').assertBetween('Q on OB', 'O', 'Q', 'B');
  // shaded region: O -> P, minor arc of circle C from P (270 deg) back to Q (150 deg), Q -> O
  const reg = [{ x: 0, y: 0 }];
  for (let i = 0; i <= 60; i++) {
    const a = ((270 - (120 * i) / 60) * Math.PI) / 180;
    reg.push({ x: 4 * s3 + 4 * Math.cos(a), y: 4 + 4 * Math.sin(a) });
  }
  return {
    cons: c, width: 300, height: 260, margin: 40,
    base: [
      el.region(reg, { noEdge: true, spacing: 6 }),
      el.seg('O', 'A'), el.seg('O', 'B'),
      el.circleArc('big', 0, 60),
      el.circle('k'),
      el.ring('C', { r: 1.5, w: 2 }),
      el.arc('A', 'O', 'B', { r: 20, labelTex: '\\frac{\\pi}{3}' }),
      el.dim('O', 'A', 34, '12 cm'),
      el.label('O', 'O', -10, 6, { italic: true }),
      el.label('A', 'A', 10, 6, { italic: true }),
      el.label('B', 'B', 0, -10, { italic: true }),
      el.label('C', 'C', 10, -4, { italic: true }),
      el.label('P', 'P', 0, 15, { italic: true }),
      el.label('Q', 'Q', -15, -7, { italic: true }),
      el.label('T', 'T', 10, -6, { italic: true }),
    ],
    layers: [[]],
  };
};
