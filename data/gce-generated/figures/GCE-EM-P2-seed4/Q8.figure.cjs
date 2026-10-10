// EM P2 Q8 — triangle OAB with OA = a, OB = b; C on OA with OC : CA = 3 : 2, D the midpoint
// of AB; line O-B-E (OB produced) and line C-D-E (CD produced) meet at E, OE = 3 OB.
module.exports = ({ Construction, el }) => {
  const c = new Construction()
    .point('O', 0, 0).point('A', 10, 0).point('B', 4, 5)
    .lerp('C', 'O', 'A', 0.6)
    .midpoint('D', 'A', 'B')
    .point('E', 12, 15)
    .assertLengthRatio('OC : CA = 3 : 2', ['O', 'C'], ['C', 'A'], 1.5)
    .assertEqualLength('D midpoint of AB', ['A', 'D'], ['D', 'B'])
    .assertBetween('C on OA', 'O', 'C', 'A')
    .assertBetween('D on AB', 'A', 'D', 'B')
    .assertCollinear('E on OB produced', ['O', 'B', 'E'])
    .assertBetween('B between O and E', 'O', 'B', 'E')
    .assertCollinear('E on CD produced', ['C', 'D', 'E'])
    .assertBetween('D between C and E', 'C', 'D', 'E');
  return {
    cons: c, width: 280, height: 330, tall: true, margin: 30,
    base: [
      el.seg('O', 'A'), el.seg('A', 'B'),
      el.seg('O', 'E'), el.seg('C', 'E'),
      el.arrow({ x: 2.4, y: 0 }, { x: 3.4, y: 0 }),
      el.arrow({ x: 1.6, y: 2 }, { x: 2.24, y: 2.8 }),
      el.label({ x: 2.9, y: 0 }, 'a', 0, 16, { bold: true }),
      el.label({ x: 1.9, y: 2.4 }, 'b', -18, -2, { bold: true }),
      el.label('O', 'O', -10, 6, { italic: true }),
      el.label('A', 'A', 10, 6, { italic: true }),
      el.label('B', 'B', -11, -4, { italic: true }),
      el.label('C', 'C', 0, 15, { italic: true }),
      el.label('D', 'D', 11, 2, { italic: true }),
      el.label('E', 'E', 10, -6, { italic: true }),
    ],
    layers: [[]],
  };
};
