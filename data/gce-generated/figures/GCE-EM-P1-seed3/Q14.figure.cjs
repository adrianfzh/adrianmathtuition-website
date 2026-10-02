// E Math Set 2 P1 Q14 — triangle ABC, angle B = 44°, AD bisects angle BAC, DE parallel to CA,
// angle ADE = 38° (so angle BAC = 76°, angle ACB = 60°). Drawn to the true angles; the diagram
// prints only the two given angles. Added 2 Oct 2026 (Adrian: a diagram is better here).
module.exports = ({ Construction, el }) => {
  const rad = (d) => (d * Math.PI) / 180;
  const BC = 10, AB = (BC * Math.sin(rad(60))) / Math.sin(rad(76)), AC = (BC * Math.sin(rad(44))) / Math.sin(rad(76));
  const A = { x: AB * Math.cos(rad(44)), y: AB * Math.sin(rad(44)) };
  const k = AB / (AB + AC); // BD : BC, angle-bisector theorem
  const c = new Construction()
    .point('B', 0, 0).point('C', BC, 0).point('A', A.x, A.y)
    .point('D', k * BC, 0).point('E', k * A.x, k * A.y)
    .assertAngle('angle ABC = 44', ['A', 'B', 'C'], 44)
    .assertAngle('angle ADE = 38', ['A', 'D', 'E'], 38)
    .assertEqualAngles('AD bisects angle BAC', ['B', 'A', 'D'], ['D', 'A', 'C'])
    .assertParallel('DE parallel to CA', ['D', 'E'], ['C', 'A'])
    .assertBetween('D on BC', 'B', 'D', 'C').assertBetween('E on AB', 'B', 'E', 'A');
  return {
    cons: c, width: 360, height: 240, margin: 40,
    base: [
      el.seg('A', 'B'), el.seg('B', 'C'), el.seg('C', 'A'), el.seg('A', 'D'), el.seg('D', 'E'),
      el.par('D', 'E', 1, 0.5), el.par('C', 'A', 1, 0.5),
      el.arc('C', 'B', 'A', { r: 26, labelTex: '44^\\circ', labelR: 44 }),
      el.arc('E', 'D', 'A', { r: 30, labelTex: '38^\\circ', labelR: 48 }),
      el.label('A', null, 0, -12, { tex: 'A' }),
      el.label('B', null, -12, 8, { tex: 'B' }),
      el.label('C', null, 12, 8, { tex: 'C' }),
      el.label('D', null, 0, 15, { tex: 'D' }),
      el.label('E', null, -12, -6, { tex: 'E' }),
    ],
    layers: [[]],
  };
};
