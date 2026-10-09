// P2 Q10 — cross-section of a cone TAB (axis TO) with a ball of radius 3 touching the base at O and TB at N.
module.exports = ({ Construction, el }) => {
  const h = 11, r = Math.sqrt((9 * h) / (h - 6));   // the similar-triangles relation the question derives
  const c = new Construction()
    .point('T', 0, h).point('A', -r, 0).point('B', r, 0).point('O', 0, 0).point('C', 0, 3)
    .circle('k', 0, 3, 3)
    .foot('N', 'C', ['T', 'B'])
    .assertOnCircle('N on the ball', 'N', 'k')
    .assertOnCircle('O on the ball', 'O', 'k')
    .assertTangentAt('TB touches the ball at N', ['T', 'B'], 'k', 'N')
    .assertPerpendicular('CN ⟂ TB', ['C', 'N'], ['T', 'B'])
    .assertBetween('C on TO', 'T', 'C', 'O')
    .assertBetween('N on TB', 'T', 'N', 'B');
  return {
    cons: c, width: 260, height: 300, tall: true, margin: 28,
    base: [
      el.seg('T', 'A'), el.seg('T', 'B'), el.seg('A', 'B'),
      el.seg('T', 'O', { dash: true }),
      el.circle('k'),
      el.seg('C', 'N'),
      el.right('C', 'N', 'T', 8),
      el.dot('C'), el.dot('O'), el.dot('N'),
      el.label('T', 'T', 0, -9, { italic: true }),
      el.label('A', 'A', -10, 12, { italic: true }),
      el.label('B', 'B', 10, 12, { italic: true }),
      el.label('O', 'O', 0, 14, { italic: true }),
      el.label('C', 'C', -10, 4, { italic: true }),
      el.label('N', 'N', 10, -4, { italic: true }),
      el.label({ x: 0, y: h * 0.72 }, 'h cm', -20, 0, { italic: true, fs: 13 }),
      el.label({ x: r / 2, y: 0 }, 'r cm', 0, 15, { italic: true, fs: 13 }),
      el.label({ x: r * 0.42, y: 3 + 1.1 }, '3 cm', 0, -2, { italic: true, fs: 13 }),
    ],
    layers: [[]],
  };
};
