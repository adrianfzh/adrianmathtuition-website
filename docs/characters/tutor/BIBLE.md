# Character bible — the tutor

Read this before drawing, editing or animating the tutor. The method is in `docs/VIDEO-PLAYBOOK.md`. Where he is used is in `docs/LESSONS.md` §The character and §Video extras.

**Status (5 Nov 2026):**
- **Live in the explain clip:** six cut-out pictures at `public/lessons/characters/tutor/{idle,point,think,oops,nod,cheer}.png`. These carry a flaw: the background cut removed his white hair and white T-shirt, so on the slate he looks dark-haired in a dark shirt.
- **Waiting for Adrian's yes since 13 Oct:** the re-cut with the white kept. These are `~/Desktop/ai-video-pipeline/out/tutor-recut/cut/*.png`, made by `gen.mjs` (Seedream edit onto green) and `key.py` (green key). A preview is `recut-sheet-slate.png` here.
- **He is NOT in the chibi style** of the scholar boy and girl. He is a flat young-adult cartoon. Whether he stays this way or joins the chibi family is Adrian's call (see "Open question").

## Style lock (his own, word for word)

```
Same flat 2D vector cartoon style as the reference: clean simple shapes, thin soft grey outlines, flat colours with very light shading, a big readable friendly face, gentle rosy cheeks, simple dot-and-curve eyes with a white highlight. No texture, no gradients beyond light shading, no realistic detail.
```

## Fixed look (paste the block)

```
The tutor: a friendly young man in his early twenties, slim, upper body in frame. Fluffy short WHITE hair with light grey shading, swept slightly to one side. Warm light skin, rosy cheeks, round friendly face, thick dark eyebrows (his identifying mark: white hair with DARK eyebrows). Plain WHITE crew-neck T-shirt with light grey fold shading and a clear thin grey outline.
```

## Poses (the same six as `CHARACTER_POSES`)

| Pose | His version (as in the re-cut sheet) |
|---|---|
| `idle` | Facing the viewer, arms down, a small closed smile |
| `point` | One arm raised high holding a chalk stick, pointing at the board, mouth open, smiling |
| `think` | Hand on chin, other arm folded, eyes looking up, a "?" beside his head |
| `oops` | One hand up palm-out, round eyes, a small "o" mouth. Note: the current picture HAS a sweat drop, which the board rule says not to have — remove it when it is next redrawn |
| `nod` | Eyes softly curved, a warm smile, a thumbs-up at chest height |
| `cheer` | One fist raised, a big open smile, sparkles around him |

## Voice

MiniMax `English_FriendlyPerson`, calm. This is the lesson voice: `docs/LESSONS.md` §Narration and `lib/explain-voice-store.ts`. The tutor never says his name, and nothing a student sees names Adrian.

## Video clips of him

`public/lessons/characters/tutor/clips/{hello,cheer}.mp4`. These are stand-ins cut from the dark-shirt pictures. Re-make them from the re-cut pictures once Adrian says yes (`docs/LESSONS.md` §Video extras, "Still open").

## Never

- Named on screen, or named "Adrian".
- Text or logos in the picture.
- A white background when the picture will be cut out. Use green (#00FF00) and key it.
- A sweat drop or a wince on `oops`.

## Open question for Adrian

Should the tutor stay a flat young man, or be redrawn in the chibi style so the board, the stickers and the promo clips are one family? `docs/VIDEO-PLAYBOOK.md` §5 step 2 tests a chibi six-pose sheet first. If Adrian prefers it, the chibi character can replace him in the corner of the board.

## Approved by Adrian

- 1 Oct 2026: approved the generated tutor as the explain clip's character.
- 13 Oct 2026: "yes" to fixing the shirt and re-making the clips. The re-cut pictures still wait for his look.
