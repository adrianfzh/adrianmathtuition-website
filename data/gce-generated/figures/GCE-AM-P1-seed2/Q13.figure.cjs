// Set 2 P1 Q13 — drawn NOT to scale (A(9,1), B(0,8), C(-3,-4) on the page; true A(10,2), B(0,7), C(-4,-5), H(1,5) are only in the labels/question) so H sits clear of B.
// — triangle ABC, AH ⟂ BC and BH ⟂ AC meet at H. C's coordinates are the answer: letter only.
module.exports = ({ Construction, el }) => {
  const c = new Construction()
    .point('A', 9, 1).point('B', 0, 8).point('C', -3, -4).point('H', 2.209302, 2.697674)
    .point('O', 0, 0).point('X0', -6, 0).point('X1', 12.5, 0).point('Y0', 0, -6.5).point('Y1', 0, 9.5)
    .foot('D', 'A', ['B', 'C'])
    .foot('E', 'B', ['A', 'C'])
    .assertCollinear('A, H, D collinear', ['A', 'H', 'D'])
    .assertCollinear('B, H, E collinear', ['B', 'H', 'E'])
    .assertPerpendicular('AD perp BC', ['A', 'D'], ['B', 'C'])
    .assertPerpendicular('BE perp AC', ['B', 'E'], ['A', 'C'])
    .assertBetween('D on side BC', 'B', 'D', 'C')
    .assertBetween('E on side AC', 'A', 'E', 'C')
    .assertBetween('H inside AD', 'A', 'H', 'D')
    .assertBetween('H inside BE', 'B', 'H', 'E');
  return {
    cons: c, width: 330, height: 250, margin: 40,
    base: [
      el.arrow('X0', 'X1', { w: 1.1 }), el.arrow('Y0', 'Y1', { w: 1.1 }),
      el.label('X1', null, 4, 12, { tex: 'x' }), el.label('Y1', null, 12, 2, { tex: 'y' }), el.label('O', null, -12, 12, { tex: 'O' }),
      el.seg('A', 'B'), el.seg('B', 'C'), el.seg('C', 'A'),
      el.seg('A', 'D', { dash: true }), el.seg('B', 'E', { dash: true }),
      el.right('B', 'D', 'A', 8), el.right('A', 'E', 'B', 8),
      el.dot('A'), el.dot('B'), el.dot('C'), el.dot('H'),
      el.label('A', null, 34, 0, { tex: 'A(10,\\ 2)' }),
      el.label('B', null, 0, -14, { tex: 'B(0,\\ 7)' }),
      el.label('C', null, -10, 10, { tex: 'C' }),
      el.label('H', null, 14, 16, { tex: 'H' }),
    ],
    layers: [[]],
  };
};
