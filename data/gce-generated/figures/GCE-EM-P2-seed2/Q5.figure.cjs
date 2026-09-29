// E Math Set 1 P2 Q5 — incircle of triangle ABC, AB = 11, BC = 20, CA = 13 (to scale, 1 unit = 1 cm).
// Redrawn 29 Sep 2026 (Adrian: "20 is for BC, but diagram looks like it's for QC … likewise for
// 11 cm and 13 cm, seems misleading"): the lengths are left OUT of the diagram — the question
// states AB, BC and CA — because a length printed beside a side that a contact point splits
// reads as one of the tangent pieces (BQ, QC, BP …). Dimension lines were tried and crowd the apex.
module.exports = ({ Construction, el }) => {
  const c = new Construction()
    .point('B', 0, 0).point('C', 20, 0).point('A', 8.8, 6.6)
    .point('O', 9, 3).circle('k', 9, 3, 3)
    .foot('P', 'O', ['A', 'B']).foot('Q', 'O', ['B', 'C']).foot('R', 'O', ['C', 'A'])
    .assertNum('AB = 11', Math.hypot(8.8, 6.6), 11)
    .assertNum('CA = 13', Math.hypot(11.2, 6.6), 13)
    .assertOnCircle('P on circle', 'P', 'k').assertOnCircle('Q on circle', 'Q', 'k').assertOnCircle('R on circle', 'R', 'k')
    .assertTangentAt('AB tangent at P', ['A', 'B'], 'k', 'P')
    .assertTangentAt('BC tangent at Q', ['B', 'C'], 'k', 'Q')
    .assertTangentAt('CA tangent at R', ['C', 'A'], 'k', 'R')
    .assertBetween('P on AB', 'A', 'P', 'B').assertBetween('Q on BC', 'B', 'Q', 'C').assertBetween('R on CA', 'C', 'R', 'A');
  return {
    cons: c, width: 420, height: 200, margin: 40,
    base: [
      el.seg('A', 'B'), el.seg('B', 'C'), el.seg('C', 'A'),
      el.circle('k'),
      el.ring('O', { r: 2.5 }),
      el.label('O', null, 11, 4, { tex: 'O' }),
      el.label({ x: 8.8, y: 7.5 }, null, 0, 0, { tex: 'A' }),
      el.label('B', null, -12, 8, { tex: 'B' }),
      el.label('C', null, 12, 8, { tex: 'C' }),
      el.label({ x: 6.3, y: 6.4 }, null, 0, 0, { tex: 'P' }),
      el.label({ x: 11.3, y: 6.6 }, null, 0, 0, { tex: 'R' }),
      el.label('Q', null, 0, 14, { tex: 'Q' }),
    ],
    layers: [[]],
  };
};
