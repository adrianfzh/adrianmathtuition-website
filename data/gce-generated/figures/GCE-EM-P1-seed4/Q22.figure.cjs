// E Math P1 Q22 — solid cylinder (height 15 cm) with a conical hollow cut from its top face:
// hollow depth 8 cm, slant height 10 cm; radius (6 cm) is NOT printed.
module.exports = ({ Construction, el }) => {
  const r = 6, H = 15, depth = 8, k = 0.32, ry = r * k;   // cabinet-style ellipse aspect, as mensuration-3d
  const c = new Construction()
    .point('B0', 0, 0).point('BL', -r, 0).point('BR', r, 0)
    .point('T0', 0, H).point('TL', -r, H).point('TR', r, H)
    .point('V', 0, H - depth);
  const d = (a, b) => Math.hypot(c.P(a).x - c.P(b).x, c.P(a).y - c.P(b).y);
  c.assertNum('cylinder height 15', d('BR', 'TR'), 15)
    .assertNum('hollow depth 8', d('T0', 'V'), 8)
    .assertNum('hollow slant 10', d('TR', 'V'), 10)
    .assertNum('slant 10 on the left too', d('TL', 'V'), 10)
    .assertPerpendicular('depth is along the axis', ['T0', 'V'], ['TL', 'TR'])
    .assertBetween('apex inside the solid', 'T0', 'V', 'B0');
  return {
    cons: c, width: 340, height: 340, tall: true, margin: 30,
    base: [
      // cylinder outline
      el.seg('BL', 'TL'), el.seg('BR', 'TR'),
      el.ellipseArc('B0', r, ry, 180, 360),                 // front of the base: visible
      el.ellipseArc('B0', r, ry, 0, 180, { dash: true }),   // back of the base: hidden
      el.ellipse('T0', r, ry),                              // top rim: the hollow is open, so the whole rim is seen
      // conical hollow (inside the solid): dashed
      el.seg('TL', 'V', { dash: true }), el.seg('TR', 'V', { dash: true }),
      el.seg('T0', 'V', { dash: true }),
      el.label({ x: 1.6, y: 11.4 }, '8 cm', 0, 0, { fs: 13 }),      // inside the hollow, beside the depth line
      el.label({ x: 3.75, y: 9.0 }, '10 cm', 0, 0, { fs: 13 }),      // beside the right slant edge
      // height of the cylinder, on the right
      el.dim('BR', 'TR', 20, '15 cm', { labelDx: 14 }),
      el.caption('Not drawn to scale'),
    ],
    layers: [[]],
  };
};
