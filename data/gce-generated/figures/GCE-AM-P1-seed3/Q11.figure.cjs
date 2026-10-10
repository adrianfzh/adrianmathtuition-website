// P1 Q11 — rod OA (length k, angle theta = 50 deg drawn) leaning away from a sun whose parallel rays make 30 deg with the ground; the ray through A meets the ground at S.
module.exports = ({ Construction, el }) => {
  const rad = (a) => (a * Math.PI) / 180;
  const th = 50, k = 1;
  const A = { x: k * Math.cos(rad(th)), y: k * Math.sin(rad(th)) };
  const d = { x: Math.cos(rad(30)), y: -Math.sin(rad(30)) };     // ray direction (down-right)
  const n = { x: Math.sin(rad(30)), y: Math.cos(rad(30)) };      // normal to the rays (up-left)
  const S = { x: A.x + d.x * (A.y / -d.y), y: 0 };
  const on = (c, t) => ({ x: A.x + c * n.x + t * d.x, y: A.y + c * n.y + t * d.y });
  const R0 = on(0, -1.05);
  const R1s = on(0.33, -1.0), R1e = on(0.33, -0.2);
  const R2s = on(-0.33, -1.2), R2e = on(-0.33, -0.34);
  const R3s = on(-0.66, -1.25), R3e = on(-0.66, -0.44);
  const c = new Construction()
    .point('O', 0, 0).point('A', A.x, A.y).point('S', S.x, S.y)
    .point('GL', -1.0, 0).point('GR', 2.3, 0)
    .point('R0', R0.x, R0.y)
    .point('R1s', R1s.x, R1s.y).point('R1e', R1e.x, R1e.y)
    .point('R2s', R2s.x, R2s.y).point('R2e', R2e.x, R2e.y)
    .point('R3s', R3s.x, R3s.y).point('R3e', R3e.x, R3e.y)
    .assertCollinear('S on the ground', ['GL', 'O', 'S'])
    .assertCollinear('the ray through A ends at S', ['R0', 'A', 'S'])
    .assertBetween('S right of O', 'O', 'S', 'GR')
    .assertAngle('rays at 30 deg to the ground', ['A', 'S', 'O'], 30)
    .assertAngle('rod at theta', ['A', 'O', 'S'], th)
    .assertParallel('ray 1 parallel', ['R1s', 'R1e'], ['R0', 'S'])
    .assertParallel('ray 2 parallel', ['R2s', 'R2e'], ['R0', 'S'])
    .assertParallel('ray 3 parallel', ['R3s', 'R3e'], ['R0', 'S']);
  const mid = { x: A.x / 2, y: A.y / 2 };
  const kAt = { x: mid.x - 0.2 * Math.sin(rad(th)), y: mid.y + 0.2 * Math.cos(rad(th)) };
  return {
    cons: c, width: 320, height: 200, margin: 26,
    base: [
      el.seg('GL', 'GR'),
      el.seg('O', 'S', { w: 3 }),
      el.seg('O', 'A', { w: 3.2 }),
      el.arrow('R0', 'S', { w: 1 }),
      el.arrow('R1s', 'R1e', { w: 1 }),
      el.arrow('R2s', 'R2e', { w: 1 }),
      el.arrow('R3s', 'R3e', { w: 1 }),
      el.arc('A', 'O', 'S', { r: 26, label: 'θ', labelR: 40 }),
      el.arc('A', 'S', 'O', { r: 48, label: '30°', labelR: 72 }),
      el.label('O', 'O', 0, 15, { italic: true }),
      el.label('A', 'A', 2, -10, { italic: true }),
      el.label('S', 'S', 0, 15, { italic: true }),
      el.label(kAt, 'k cm', -6, 0, { italic: true, fs: 13 }),
    ],
    layers: [[]],
  };
};
