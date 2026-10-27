// P1 Q26 — solid cylinder (r = 6, h = 10) with a hemispherical hollow (r = 4)
// scooped out of its top face. No registry family can subtract a solid, so this
// is an engine construction in the same cabinet-oblique look as mensuration-3d:
// circular faces are axis-aligned ellipses of aspect 0.32, hidden edges dashed grey.
module.exports = ({ Construction, el }) => {
  const R = 6, H = 10, r = 4;      // cm
  const K = 0.32;                  // ellipse aspect of a horizontal circle
  const c = new Construction()
    .point('TC', 0, H).point('TL', -R, H).point('TR', R, H)
    .point('BC', 0, 0).point('BL', -R, 0).point('BR', R, 0)
    .point('HL', -r, H).point('HR', r, H).point('HB', 0, H - r)
    .assertEqualLength('top rim: left radius = right radius', ['TC', 'TL'], ['TC', 'TR'])
    .assertEqualLength('hollow rim: left radius = right radius', ['TC', 'HL'], ['TC', 'HR'])
    .assertEqualLength('cylinder sides equal', ['TL', 'BL'], ['TR', 'BR'])
    .assertEqualLength('hemispherical hollow: depth = its radius', ['TC', 'HB'], ['TC', 'HR'])
    .assertPerpendicular('cylinder side is vertical', ['BL', 'TL'], ['TL', 'TR'])
    .assertBetween('hollow rim lies inside the top face', 'TC', 'HR', 'TR')
    .assertCollinear('both radii drawn on one diameter', ['HL', 'TC', 'TR']);
  c.assertNum('cylinder radius = 6', Math.hypot(c.P('TR').x - c.P('TC').x, c.P('TR').y - c.P('TC').y), R);
  c.assertNum('cylinder height = 10', Math.hypot(c.P('TL').x - c.P('BL').x, c.P('TL').y - c.P('BL').y), H);
  c.assertNum('hollow radius = 4', Math.hypot(c.P('HL').x - c.P('TC').x, c.P('HL').y - c.P('TC').y), r);

  const hidden = { dash: true, color: 'grey' };
  return {
    cons: c, width: 318, height: 255, margin: 30,
    base: [
      // cylinder
      el.ellipse('TC', R, R * K),                            // top rim (all visible)
      el.ellipseArc('BC', R, R * K, 180, 360),               // bottom rim, front half
      el.ellipseArc('BC', R, R * K, 0, 180, hidden),         // bottom rim, hidden half
      el.seg('TL', 'BL'), el.seg('TR', 'BR'),
      // hemispherical hollow in the top face
      el.ellipse('TC', r, r * K),                            // rim of the hollow
      el.ellipseArc('TC', r, r, 180, 360, hidden),           // bowl below the top face
      // given dimensions
      el.seg('TC', 'TR'), el.label({ x: 5.1, y: H }, '6 cm', 0, -11),
      el.seg('TC', 'HL'), el.label({ x: -2.1, y: H }, '4 cm', 0, -11),
      el.dot('TC'),
      el.dim('BR', 'TR', 18, '10 cm', { labelDx: 22 }),
    ],
    layers: [[]],
  };
};
