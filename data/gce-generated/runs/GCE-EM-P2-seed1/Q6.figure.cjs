// P2 Q6(d) — triangle OPQ, R on PQ with PR:RQ = 1:2, S on OQ with OS:SQ = 1:2,
// SR drawn; OP and OQ carry single arrowheads labelled p and q. NOT TO SCALE.
module.exports = ({ Construction, el }) => {
  const c = new Construction()
    .point('O', 0, 0)
    .point('P', 3, 0)
    .point('Q', 0.75, 2.2)
    .lerp('R', 'P', 'Q', 1 / 3)          // PR : RQ = 1 : 2
    .lerp('S', 'O', 'Q', 1 / 3)          // OS : SQ = 1 : 2
    .lerp('Ap', 'O', 'P', 0.58)          // arrowhead tip on OP
    .lerp('Aq', 'O', 'Q', 0.58)          // arrowhead tip on OQ
    .lerp('Mp', 'O', 'P', 0.5)           // p label anchor
    .lerp('Mq', 'O', 'Q', 0.5)           // q label anchor
    .assertCollinear('R on PQ', ['P', 'R', 'Q'])
    .assertBetween('R inside PQ', 'P', 'R', 'Q')
    .assertLengthRatio('PR : RQ = 1 : 2', ['P', 'R'], ['R', 'Q'], 0.5)
    .assertCollinear('S on OQ', ['O', 'S', 'Q'])
    .assertBetween('S inside OQ', 'O', 'S', 'Q')
    .assertLengthRatio('OS : SQ = 1 : 2', ['O', 'S'], ['S', 'Q'], 0.5);
  return {
    cons: c,
    width: 290,
    height: 235,
    margin: 30,
    base: [
      el.seg('O', 'P'),
      el.seg('O', 'Q'),
      el.seg('P', 'Q'),
      el.seg('S', 'R'),
      el.arrow('O', 'Ap'),
      el.arrow('O', 'Aq'),
      el.label('O', 'O', -10, 10, { italic: true }),
      el.label('P', 'P', 10, 10, { italic: true }),
      el.label('Q', 'Q', 0, -12, { italic: true }),
      el.label('R', 'R', 11, -4, { italic: true }),
      el.label('S', 'S', -11, -2, { italic: true }),
      el.label('Mp', 'p', 0, -15, { bold: true }),
      el.label('Mq', 'q', -13, 0, { bold: true }),
      el.caption('NOT TO SCALE'),
    ],
    layers: [[]],
  };
};
