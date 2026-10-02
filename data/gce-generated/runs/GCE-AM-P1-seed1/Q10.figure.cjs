// A Math Set 1 P1 Q10 — the line l: 2y = x + 2 with A(4, -2) and B(8, 0). Not to scale in print,
// but drawn true. The axes sit LOW in the box: C(0, 6), the reflection of A in l, lies above l,
// so the candidate needs the room above the line (Adrian, 3 Oct 2026). C and P are not drawn.
module.exports = ({ Construction, el }) => {
  const X0 = -3.2, X1 = 10, Y0 = -3.2, Y1 = 7.6;
  const ly = (x) => (x + 2) / 2;
  const c = new Construction()
    .point('O', 0, 0).point('A', 4, -2).point('B', 8, 0)
    .point('L0', X0, ly(X0)).point('L1', 9.4, ly(9.4))
    .point('C', 0, 6).point('M', 2, 2)
    .assertNum('M on l', 2 * 2, 2 + 2, 1e-9)
    .assertPerpendicular('AC ⟂ l', ['A', 'C'], ['L0', 'L1'])
    .assertEqualLength('AM = MC', ['A', 'M'], ['M', 'C'])
    .assertParallel('AB ∥ l', ['A', 'B'], ['L0', 'L1'])
    .assertLess('C fits below the top of the box', 6, Y1);
  return {
    cons: c, width: 317, height: 259, margin: 20,
    base: [
      el.arrow({ x: X0, y: 0 }, { x: X1, y: 0 }),
      el.arrow({ x: 0, y: Y0 }, { x: 0, y: Y1 }),
      el.seg('L0', 'L1'),
      // A is a free point of the plane (on no drawn line): a zero-length segment satisfies the
      // engine's 'every dot lies on drawn geometry' check without drawing anything.
      el.seg('A', 'A'),
      el.dot('A'), el.dot('B'),
      el.label({ x: X1, y: 0 }, 'x', 8, 5, { italic: true }),
      el.label({ x: 0, y: Y1 }, 'y', 9, -2, { italic: true }),
      el.label('O', 'O', -9, 12, { italic: true }),
      el.label('L1', 'l', 4, -9, { italic: true }),
      el.label('A', 'A(4, −2)', 30, -8, { italic: true }),
      el.label('B', 'B(8, 0)', 6, -11, { italic: true }),
    ],
    layers: [[]],
  };
};
