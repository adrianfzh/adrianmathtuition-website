// E Math P1 Q13 — AB // ED, C between the lines, angle BCD = 105 (only value printed).
// Drafted with angle ABC = 70 and angle CDE = 35 (the answer), neither printed.
module.exports = ({ Construction, el }) => {
  const d = (a) => (a * Math.PI) / 180;
  const h = 6;                         // gap between the parallels
  const B = { x: 10, y: h };
  const tBC = 3 / Math.sin(d(70));     // C sits halfway down
  const C = { x: B.x - tBC * Math.cos(d(70)), y: B.y - tBC * Math.sin(d(70)) };
  const sCD = C.y / Math.sin(d(35));
  const D = { x: C.x + sCD * Math.cos(d(35)), y: 0 };
  const c = new Construction()
    .point('A', 0, h).point('B', B.x, B.y)
    .point('E', 0, 0).point('D', D.x, D.y)
    .point('C', C.x, C.y)
    .assertParallel('AB // ED', ['A', 'B'], ['E', 'D'])
    .assertAngle('BCD = 105', ['B', 'C', 'D'], 105)
    .assertAngle('ABC = 70 (drafted, not printed)', ['A', 'B', 'C'], 70)
    .assertAngle('CDE = 35 (drafted, not printed)', ['C', 'D', 'E'], 35)
    .assertLess('C left of B', C.x, B.x)
    .assertLess('C left of D', C.x, D.x)
    .assertLess('C above ED', 0, C.y)
    .assertLess('C below AB', C.y, h);
  const K = { w: 1.5, color: '#111' };
  return {
    cons: c, width: 320, height: 210, margin: 24,
    base: [
      el.seg('A', 'B', K), el.seg('E', 'D', K),
      el.seg('B', 'C', K), el.seg('C', 'D', K),
      el.par('A', 'B', 1, 0.45), el.par('E', 'D', 1, 0.45),
      el.arc('B', 'C', 'D', { r: 16, label: '105°', labelR: 38, w: 1.3, color: '#111' }),
      el.label('A', 'A', -2, -12, { italic: true }),
      el.label('B', 'B', 4, -12, { italic: true }),
      el.label('C', 'C', -13, 4, { italic: true }),
      el.label('D', 'D', 6, 15, { italic: true }),
      el.label('E', 'E', -2, 15, { italic: true }),
      el.caption('Not drawn to scale', { color: '#111' }),
    ],
    layers: [[]],
  };
};
