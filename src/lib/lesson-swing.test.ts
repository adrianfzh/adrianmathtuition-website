// The swing figure on a clip board (Adrian, 26 Oct 2026: "animation that shows how the dot moves from
// O to A to O to B to O and how the graph draws out"): a line's `swing` and the `swing` action.
import { describe, it, expect } from 'vitest';
import { validateLessonScript } from './lesson-script';
import { boardStateAt } from './lesson-beats';
import { boardTextAfter } from './clip-said-shown';

const swing = { id: 'sw', amp: 60, period: 6, ends: ['A', 'O', 'B'] };
const script = (beats: unknown[], sw: unknown = swing) => ({
  slug: 't', title: 't', level: 'AM', topic: 'Kinematics', minutes: 1, kind: 'clip',
  scenes: [{
    type: 'equation-steps',
    steps: [{ tokens: [{ id: 'f', tex: 'x=a\\sin nt' }] }, { tokens: [{ id: 'o', tex: 'O\\to A\\to O\\to B\\to O' }], swing: sw }],
    beats,
  }],
});

describe('swing', () => {
  it('a swing line and its action validate; its parts light by id', () => {
    const v = validateLessonScript(script([
      { say: 'X equals A sine N T.', do: [{ do: 'write', step: 0 }] },
      { say: 'Watch the dot go round once.', do: [{ do: 'write', step: 1 }, { do: 'swing', step: 1, on: 'go round once' }] },
      { say: 'The highest point is sixty.', do: [{ do: 'highlight', token: 'sw-amp' }] },
    ]));
    expect(v.ok ? [] : v.errors).toEqual([]);
  });

  it('the action must point at a line with a swing, and a swing needs its ends', () => {
    const bad = validateLessonScript(script([{ say: 'Watch it.', do: [{ do: 'write', step: 0 }, { do: 'swing', step: 0, on: 'it' }] }]));
    expect(bad.ok ? '' : bad.errors.join(' ')).toMatch(/line that has a swing/);
    const noEnds = validateLessonScript(script([{ say: 'Watch it.', do: [{ do: 'write', step: 1 }] }], { id: 'sw', amp: 60, period: 6, ends: ['A'] }));
    expect(noEnds.ok ? '' : noEnds.errors.join(' ')).toMatch(/swing is \{/);
  });

  it('the board remembers it has played, and its values count as shown only then', () => {
    const s = script([
      { say: 'Watch the dot.', do: [{ do: 'write', step: 1 }] },
      { say: 'Go round once.', do: [{ do: 'swing', step: 1 }] },
    ]);
    const scene = (validateLessonScript(s) as unknown as { ok: true; script: { scenes: never[] } }).script.scenes[0];
    expect(boardStateAt(scene, 0, 9999).swung).toEqual([]);
    expect(boardStateAt(scene, 1, 9999).swung).toEqual([1]);
    expect(boardTextAfter(scene, 0)).not.toMatch(/60/);
    expect(boardTextAfter(scene, 1)).toMatch(/60/);
  });
});
