# Character bible — the scholar boy and girl (chibi family)

Read this before drawing, editing or animating either character. The method is in `docs/VIDEO-PLAYBOOK.md` §2.4 and §3d.

**Status (5 Nov 2026):** written from the level-up sheets Adrian kept on 7 Oct 2026 ("keep all the modern scholar character suites"). The **Seedream** pair is proposed as THE faces, because Seedream drew this look best. **Waiting for Adrian to confirm the faces.** Until then, nothing student-facing uses them.

| | Boy | Girl |
|---|---|---|
| Reference (level 1, from the 7 Oct sheet) | `boy-reference.png` | `girl-reference.png` |
| Full level-up sheet | `../2026-10-07-modern-scholar/modern-scholar-boy-seedream.png` | `../2026-10-07-modern-scholar/modern-scholar-girl-seedream.png` |

## Style lock (paste into EVERY prompt, word for word)

```
Style: modern Chinese cute animation and sticker-pack art (萌系Q版，国产动画表情包风格) — a chibi little character about two heads tall, with a very big round head, a tiny chubby body, stubby arms and legs, huge sparkling eyes, a tiny mouth, blushing cheeks, soft thick outline, bright soft colours with gentle gradient shading, lively and a little silly. Irresistibly cute.
```

This is the same paragraph as `../2026-10-07-modern-scholar/PROMPT.md`. Change it only with Adrian's yes, and change it in both files.

## Fixed look — the boy (paste the block)

```
The boy: a little modern-day Singapore schoolboy, about 8–10 years old in chibi form. Messy short CHESTNUT-BROWN hair with a soft fringe and a small tuft sticking up at the crown. Huge round DEEP-BLUE eyes with white star sparkles (his blue eyes are his identifying mark — never brown). Round face, rosy round cheeks, tiny open smile, small button nose. Light warm skin.
```

## Fixed look — the girl (paste the block)

```
The girl: a little modern-day Singapore schoolgirl, about 8–10 years old in chibi form. DARK-BROWN hair in two short low pigtails tied with small YELLOW hair ties (the yellow ties are her identifying mark), a side-swept fringe and one small tuft at the crown. Huge round warm-BROWN eyes with white sparkles. Round face, rosy round cheeks, tiny open smile. Light warm skin.
```

## States (outfits) — the script names one

| State | Boy | Girl |
|---|---|---|
| `pupil` (level 1, the default) | White short-sleeved school shirt with a blue pocket stripe, royal-blue shorts, white socks, blue-and-white sneakers; royal-blue backpack with a small brown teddy-bear keychain | White short-sleeved school blouse with a navy bow, navy pleated skirt, white socks, navy Mary-Jane shoes; navy backpack with a small white cat keychain |
| `keen` (level 2) | Round black glasses, brown sweater vest over the white shirt, **navy shorts** (the 7 Oct sheet wrongly gave him a grey skirt — never copy that), a stack of books | Round black glasses, the pupil uniform, a stack of books |
| `top` (level 3) | Navy blazer and tie, a gold medal on a red ribbon | Navy blazer with a gold star pin, a gold medal |
| `graduate` (level 4) | Black cap and gown with a blue hood, holding a rolled scroll with a red ribbon | Black cap and gown, holding a rolled scroll |
| `legend` (level 5) | Gold laurel crown, navy-and-gold academic robe with stars, a glowing open book | Gold laurel crown, purple-and-gold robe with stars, a glowing open book |

The face, hair, eyes, skin and identifying mark **never change** between states. Only the outfit and props change.

## Poses / expressions (the board's six, same names as `CHARACTER_POSES`)

| Pose | What it looks like |
|---|---|
| `idle` | Standing relaxed, arms at the sides, a small friendly smile, looking at the viewer |
| `point` | One arm raised, pointing up and to the side with the index finger (at the working on the board), mouth open as if explaining |
| `think` | One hand on the chin, eyes looking up, a small "?" floating by the head |
| `oops` | A gentle "hmm, careful": one eyebrow raised, one hand up palm-out, a small pursed mouth. NOT a wince, NOT a sweat drop |
| `nod` | Eyes softly closed in a happy curve, a warm smile, head tilted slightly forward |
| `cheer` | A thumbs-up beside the face, a big smile, two small sparkles. NOT both arms flung up |

## Voice

Not chosen yet. The candidates are the three designed boy voices in the side project README (MiniMax voice design, 13 Oct 2026). No girl voice has been designed yet. Ask Adrian before choosing.

## Never

- Text, letters, numbers, captions, logos or watermarks in the picture.
- Any existing brand, toy, game or cartoon character. These are original characters.
- Realistic proportions. They stay about two heads tall.
- Brown eyes on the boy. Missing yellow ties on the girl.
- White backgrounds when the picture will be cut out. Generate on flat chroma-key green (#00FF00) and key it out (the white-shirt trap: `docs/VIDEO-PLAYBOOK.md` §2.4).
- A real student's face as a reference.

## How to make a new picture of them

1. Upload the reference picture (and the full level sheet when a later state is needed).
2. Write the prompt in this order: "**Same character as the reference**", then the fixed-look block, then the state, then the pose, then the style lock, then the background and the "never" list.
3. Edit, don't regenerate. For a new pose or outfit, edit the approved picture: "change only …, keep everything else" (`docs/VIDEO-PLAYBOOK.md` §2.4).
4. Check the result against the identifying mark and the fixed look before showing Adrian.

## Six-pose sheets — made 5 Nov 2026 (playbook §5 step 2)

Files are in `poses-2026-11-05/`:
- `compare.png`: all six poses of each, on the slate, plus a 150 px phone-corner view.
- The four sheets.
- `gen.mjs`, `key.py` and `compare.py`, which made them. They are run from `~/Desktop/ai-video-pipeline`, and the cut-outs are in its `out/chibi-poses/cut/`.

The cost was about US$1: Seedream 4.5 edit on fal ×2, and GPT Image 2 (medium) ×2.

| | Seedream 4.5 edit | GPT Image 2 |
|---|---|---|
| Face matches the 7 Oct reference | Yes, exactly (same model family) | Close; a slightly different face shape |
| Identifying mark | Boy's blue eyes ✓ · girl's yellow ties ✓ | Blue eyes ✓ · **yellow ties nearly lost** |
| Background | A softer green than asked, and **added a white sticker border** round each figure | Exact #00FF00, no border |
| On the slate at phone size | **Border keeps every figure readable** | Dark hair and the dark "?" sink into the slate |
| `oops` pose | Reads as a wave, not "careful" | Correct palm-out with a raised brow |
| Cut-out | Clean; 0 green pixels left | Clean; 0 green pixels left |

**Recommendation:** Seedream, for both characters. If chosen, redo only `oops` by editing the idle picture ("one hand up palm-out, one eyebrow raised, small pursed mouth").

## Approved by Adrian

- 7 Oct 2026: kept the suites ("keep all the modern scholar character suites").
- The faces themselves and the sheet: **pending** (Seedream recommended, 5 Nov 2026).
