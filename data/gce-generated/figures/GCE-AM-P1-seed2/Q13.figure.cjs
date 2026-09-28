// Set 2 P1 Q13 — triangle ABC, AH ⟂ BC and BH ⟂ AC meet at H. C's coordinates are the answer: letter only.
module.exports = ({ Construction, el }) => {
  const c = new Construction()
    .point('A', 10, 2).point('B', 0, 7).point('C', -4, -5).point('H', 1, 5)
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
      el.seg('A', 'B'), el.seg('B', 'C'), el.seg('C', 'A'),
      el.seg('A', 'D', { dash: true }), el.seg('B', 'E', { dash: true }),
      el.right('B', 'D', 'A', 8), el.right('A', 'E', 'B', 8),
      el.dot('A'), el.dot('B'), el.dot('C'), el.dot('H'),
      el.label('A', null, 34, 0, { tex: 'A(10,\\ 2)' }),
      el.label('B', null, 0, -14, { tex: 'B(0,\\ 7)' }),
      el.label('C', null, -10, 10, { tex: 'C' }),
      el.label('H', null, 12, 14, { tex: 'H' }),
    ],
    layers: [[]],
  };
};
