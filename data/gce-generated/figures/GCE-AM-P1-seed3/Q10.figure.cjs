// P1 Q10 — straight shoreline NL (100 m), fish farm S 40 m out to sea with SN ⟂ shore,
// cable S→P under the sea then P→L along the shore; NP = x m (drawn at 45% of NL, not at the answer 30).
module.exports = ({ Construction, el }) => {
  const c = new Construction()
    .point('N', 0, 0).point('L', 100, 0).point('S', 0, 40)
    .point('P', 45, 0)
    .point('W', -22, 0).point('E', 122, 0)          // ends of the shoreline
    .point('P2', 45, 1.6).point('L2', 100, 1.6)     // the shore leg of the cable, just above the line
    .point('Top', -22, 52).point('Bot', -22, -24)   // frame: sea above, land below
    .assertPerpendicular('SN ⟂ shoreline', ['S', 'N'], ['N', 'L'])
    .assertCollinear('N, P, L on the shore', ['N', 'P', 'L'])
    .assertBetween('P between N and L', 'N', 'P', 'L')
    .assertParallel('shore leg runs along the shore', ['P2', 'L2'], ['N', 'L'])
    .assertNum('SN = 40', Math.hypot(0, 40), 40)
    .assertNum('NL = 100', 100, 100);
  return {
    cons: c, width: 320, height: 210, margin: 22,
    base: [
      el.seg('W', 'E'),
      el.seg('S', 'N'),
      el.right('S', 'N', 'L', 8),
      el.seg('S', 'P', { dash: true }),
      el.seg('P2', 'L2', { dash: true }),
      el.dot('S'), el.dot('N'), el.dot('P'), el.dot('L'),
      el.label('S', 'S', 0, -10, { italic: true }),
      el.label('N', 'N', -13, 12, { italic: true }),
      el.label('P', 'P', 0, -10, { italic: true }),
      el.label('L', 'L', 0, -10, { italic: true }),
      el.label({ x: 0, y: 20 }, '40 m', -22, 4, { fs: 13 }),
      el.dim('N', 'P', 14, 'x m', { labelTex: "x\\ \\mathrm{m}" }),
      el.dim('N', 'L', 38, '100 m'),
      el.label({ x: -16, y: 46 }, 'sea', 0, 0, { italic: true, fs: 12 }),
      el.label({ x: -16, y: -19 }, 'land', 0, 0, { italic: true, fs: 12 }),
    ],
    layers: [[]],
  };
};
