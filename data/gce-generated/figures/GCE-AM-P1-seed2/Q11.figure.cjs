// P1 Q11 — two circles meet at P and Q; centres E (left of PQ) and F (right of PQ);
// diameters PA (circle E) and PB (circle F); the line through P parallel to EF meets
// circle E again at S and circle F again at T. A, Q, B are NOT joined; no right angles,
// ticks or parallel arrows are drawn (every one of them is something the candidate proves).
module.exports = ({ Construction, el }) => {
  const c = new Construction()
    .circle('kE', -3, 2, Math.sqrt(13))
    .circle('kF', 2, 2, Math.sqrt(8))
    .point('P', 0, 4).point('Q', 0, 0)
    .point('E', -3, 2).point('F', 2, 2)
    // the diameters: from P through the centre to the far side of each circle
    .intersectLineCircle('A', ['P', 'E'], 'kE', 'far')
    .intersectLineCircle('B', ['P', 'F'], 'kF', 'far')
    // the line through P parallel to EF, to each circle again
    .rayCircle('S', 'P', { x: -5, y: 0 }, 'kE')
    .rayCircle('T', 'P', { x: 5, y: 0 }, 'kF');
  const pE = c.P('E'), pF = c.P('F'), pS = c.P('S'), pT = c.P('T');
  const pA = c.P('A'), pB = c.P('B');
  c
    .assertOnCircle('P on circle E', 'P', 'kE').assertOnCircle('Q on circle E', 'Q', 'kE')
    .assertOnCircle('P on circle F', 'P', 'kF').assertOnCircle('Q on circle F', 'Q', 'kF')
    .assertOnCircle('A on circle E', 'A', 'kE').assertOnCircle('S on circle E', 'S', 'kE')
    .assertOnCircle('B on circle F', 'B', 'kF').assertOnCircle('T on circle F', 'T', 'kF')
    .assertBetween('E is the midpoint side of diameter PA', 'P', 'E', 'A')
    .assertEqualLength('PE = EA', ['P', 'E'], ['E', 'A'])
    .assertBetween('F on diameter PB', 'P', 'F', 'B')
    .assertEqualLength('PF = FB', ['P', 'F'], ['F', 'B'])
    .assertParallel('ST parallel to EF', ['S', 'T'], ['E', 'F'])
    .assertBetween('P between S and T', 'S', 'P', 'T')
    ._assert('E and F on opposite sides of PQ', pE.x < 0 && pF.x > 0)
    ._assert('A = (-6, 0)', Math.abs(pA.x + 6) < 1e-9 && Math.abs(pA.y) < 1e-9)
    ._assert('B = (4, 0)', Math.abs(pB.x - 4) < 1e-9 && Math.abs(pB.y) < 1e-9)
    ._assert('S = (-6, 4)', Math.abs(pS.x + 6) < 1e-9 && Math.abs(pS.y - 4) < 1e-9)
    ._assert('T = (4, 4)', Math.abs(pT.x - 4) < 1e-9 && Math.abs(pT.y - 4) < 1e-9)
    // the facts the candidate proves — checked here, never drawn
    .assertCollinear('A, Q, B collinear (part (a))', ['A', 'Q', 'B'])
    .assertLengthRatio('AB = 2EF (part (b))', ['A', 'B'], ['E', 'F'], 2)
    .assertLengthRatio('ST = 2EF (part (c))', ['S', 'T'], ['E', 'F'], 2);
  return {
    cons: c, width: 330, height: 236, margin: 24,
    base: [
      el.circle('kE'), el.circle('kF'),
      el.seg('P', 'Q'),
      el.seg('P', 'A'), el.seg('P', 'B'),
      el.seg('E', 'F'),
      el.seg('S', 'T'),
      el.dot('E'), el.dot('F'),
      el.label('P', 'P', 0, -11, { italic: true }),
      el.label('Q', 'Q', 3, 22, { italic: true }),
      el.label('A', 'A', -11, 11, { italic: true }),
      el.label('B', 'B', 11, 11, { italic: true }),
      el.label('S', 'S', -11, -7, { italic: true }),
      el.label('T', 'T', 11, -7, { italic: true }),
      el.label('E', 'E', -9, -9, { italic: true }),
      el.label('F', 'F', 9, -9, { italic: true }),
    ],
    layers: [[]],
  };
};
