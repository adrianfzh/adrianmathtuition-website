// Set 2 P1 Q4 — open trough, isosceles-trapezium cross-section (bottom 30, top 90, depth 40),
// length 200 receding (oblique, NOT to scale), water at depth h shown along the whole length (front face, right side face, far end; hidden left side dashed).
module.exports = ({ Construction, el }) => {
  const dx = 55, dy = 32;          // receding vector (not to scale)
  const hw = 16;                   // drawn water depth
  const c = new Construction()
    .point('BL', -15, 0).point('BR', 15, 0)
    .point('TL', -45, 40).point('TR', 45, 40)
    .point('BL2', -15 + dx, dy).point('BR2', 15 + dx, dy)
    .point('TL2', -45 + dx, 40 + dy).point('TR2', 45 + dx, 40 + dy)
    .point('E0', -84, 0).point('E1', -40, 16).point('E2', -84, 40)   // ends of the thin extension lines
    .point('D0', -80, 0).point('D1', -80, 40)                       // 40 cm dimension
    .point('F0', -36, 0).point('F1', -36, 16)                       // h cm dimension
    .lerp('WL', 'BL', 'TL', hw / 40).lerp('WR', 'BR', 'TR', hw / 40)
    .lerp('WL2', 'BL2', 'TL2', hw / 40).lerp('WR2', 'BR2', 'TR2', hw / 40)
    .intersectLines('K', ['BL2', 'TL2'], ['TL', 'TR'])   // where the far-left edge rises above the front rim
    .assertParallel('top // base', ['TL', 'TR'], ['BL', 'BR'])
    .assertEqualLength('isosceles', ['BL', 'TL'], ['BR', 'TR'])
    .assertLengthRatio('top = 3 x base (90:30)', ['TL', 'TR'], ['BL', 'BR'], 3)
    .assertParallel('water surface horizontal', ['WL', 'WR'], ['BL', 'BR'])
    .assertCollinear('WL on left side', ['BL', 'WL', 'TL'])
    .assertCollinear('WR on right side', ['BR', 'WR', 'TR'])
    .assertParallel('receding BL', ['BL', 'BL2'], ['TR', 'TR2'])
    .assertParallel('receding BR', ['BR', 'BR2'], ['TL', 'TL2'])
    .assertEqualLength('uniform length', ['BL', 'BL2'], ['TR', 'TR2'])
    .assertBetween('K on far-left edge', 'BL2', 'K', 'TL2')
    .assertBetween('K on front rim', 'TL', 'K', 'TR')
    .assertParallel('water surface runs the length', ['WR', 'WR2'], ['BR', 'BR2'])
    .assertParallel('far water line level', ['WL2', 'WR2'], ['BL', 'BR'])
    .assertParallel('water level extension horizontal', ['WL', 'E1'], ['BL', 'BR']);
  return {
    cons: c, width: 420, height: 230, margin: 52,
    base: [
      el.region([c.P('BL'), c.P('BR'), c.P('WR'), c.P('WL')], { spacing: 6 }),
      // the water runs the whole length: its level on the right side face (visible, shaded),
      // on the far end, and along the hidden left side (dashed)
      el.region([c.P('BR'), c.P('BR2'), c.P('WR2'), c.P('WR')], { spacing: 6 }),
      // the water's top surface, hatched lighter and level so it reads as a surface, not a wall
      el.region([c.P('WL'), c.P('WR'), c.P('WR2'), c.P('WL2')], { spacing: 8, hatchAngle: 0, noEdge: true, op: 0.55 }),
      el.seg('WR', 'WR2', { w: 1.1 }), el.seg('WL2', 'WR2', { w: 1.1 }), el.seg('WL', 'WL2', { w: 1.1, dash: true }),
      // front face
      el.seg('BL', 'BR'), el.seg('BR', 'TR'), el.seg('TR', 'TL'), el.seg('TL', 'BL'),
      // visible receding edges and the far rim
      el.seg('TL', 'TL2'), el.seg('TR', 'TR2'), el.seg('BR', 'BR2'),
      el.seg('TL2', 'TR2'), el.seg('BR2', 'TR2'), el.seg('K', 'TL2'),
      // hidden edges
      el.seg('BL', 'BL2', { dash: true }), el.seg('BL2', 'BR2', { dash: true }), el.seg('BL2', 'K', { dash: true }),
      // dimensions
      el.label({ x: 0, y: 0 }, '30 cm', 0, 14),
      el.label({ x: 0, y: 40 }, '90 cm', -16, -9),
      el.seg('BL', 'E0', { w: 0.8 }), el.seg('WL', 'E1', { w: 0.8 }), el.seg('TL', 'E2', { w: 0.8 }),
      el.darrow('D0', 'D1', null, { w: 1.1 }),
      el.darrow('F0', 'F1', null, { w: 1.1 }),
      el.label({ x: -80, y: 20 }, '40 cm', -30, 4),
      el.label({ x: -54, y: 8 }, null, 0, 0, { tex: 'h\\text{ cm}' }),
      el.label({ x: 45, y: 14 }, '200 cm', 16, 8),
    ],
    layers: [[]],
  };
};
