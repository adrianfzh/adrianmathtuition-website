// EM P2 Q6 — open-topped container: square top 32 cm above a square base 20 cm, height 24 cm,
// centres in one vertical line (an inverted square-pyramid frustum). Cabinet oblique, depth
// receding 30° up-right at half scale, as the mensuration-3d family draws its solids.
module.exports = ({ Construction, el }) => {
  const k = 0.5, cs = Math.cos(Math.PI / 6), sn = Math.sin(Math.PI / 6);
  const pr = (x, y, z) => ({ x: x + k * z * cs, y: y + k * z * sn });   // z < 0 = front
  const H = 24, T = 16, B = 10;                                         // height, half-top, half-base
  const p = {
    A: pr(-T, H, -T), Bt: pr(T, H, -T), C: pr(T, H, T), D: pr(-T, H, T),   // top rim
    P: pr(-B, 0, -B), Q: pr(B, 0, -B), R: pr(B, 0, B), S: pr(-B, 0, B),    // base
    M: pr(0, 0, 0), N: pr(0, H, 0),                                        // centres
  };
  const c = new Construction();
  for (const [n, v] of Object.entries(p)) c.point(n, v.x, v.y);
  c.intersectLines('V', ['A', 'P'], ['Bt', 'Q'])          // apex of the completed pyramid (not drawn)
    .intersectLines('K', ['D', 'S'], ['A', 'Bt'])         // where the back-left edge dips behind the front rim
    .assertParallel('top front ∥ base front', ['A', 'Bt'], ['P', 'Q'])
    .assertParallel('top right ∥ base right', ['Bt', 'C'], ['Q', 'R'])
    .assertParallel('top back ∥ base back', ['D', 'C'], ['S', 'R'])
    .assertLengthRatio('front edges 32 : 20', ['A', 'Bt'], ['P', 'Q'], 32 / 20)
    .assertLengthRatio('right edges 32 : 20', ['Bt', 'C'], ['Q', 'R'], 32 / 20)
    .assertCollinear('CR passes through the apex', ['C', 'R', 'V'])
    .assertCollinear('DS passes through the apex', ['D', 'S', 'V'])
    .assertCollinear('centres vertical, through the apex', ['N', 'M', 'V'])
    .assertBetween('K inside the front rim', 'A', 'K', 'Bt')
    .assertBetween('K on DS', 'D', 'K', 'S');
  return {
    cons: c, width: 300, height: 260, margin: 26,
    base: [
      // open top: all four rim edges solid
      el.seg('A', 'Bt'), el.seg('Bt', 'C'), el.seg('C', 'D'), el.seg('D', 'A'),
      // visible sloping edges and base edges
      el.seg('A', 'P'), el.seg('Bt', 'Q'), el.seg('C', 'R'),
      el.seg('P', 'Q'), el.seg('Q', 'R'),
      // back-left edge: seen inside the open top down to the front rim, hidden below it
      el.seg('D', 'K'), el.seg('K', 'S', { dash: true }),
      // hidden base edges
      el.seg('R', 'S', { dash: true }), el.seg('S', 'P', { dash: true }),
      // the vertical height, centre of base to centre of top
      el.seg('M', 'N', { dash: true }),
      el.label({ x: p.A.x + 9, y: H - k * T * sn }, '32 cm', 0, 14, { fs: 13 }),
      el.label({ x: (p.P.x + p.Q.x) / 2, y: -k * B * sn }, '20 cm', 0, 15, { fs: 13 }),
      el.label({ x: 3.9, y: H * 0.5 }, '24 cm', 0, 0, { fs: 11.5 }),
      el.caption('Not drawn to scale'),
    ],
    layers: [[]],
  };
};
