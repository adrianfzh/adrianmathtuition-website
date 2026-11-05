# Animal sidekick options for the Shorts (5 Nov 2026)

Adrian, 5 Nov 2026, after the second Shorts watch: *"character can be more involved > plus an animal
would perhaps be good"*, then *"Yes, show options"*. (For lessons he chose little humans over animal
mascots on 7 Oct — `docs/VIDEO-PLAYBOOK.md`; this is for the Shorts.)

Four options, drawn in the approved scholars' style (Seedream 4.5 edit with
`../scholars/approved/final-set.png` as the style reference, the scholars' style lock, chroma green;
`gen.mjs`, run from the side project `~/Desktop/ai-video-pipeline`). Two tries each; the best kept.
One cat try copied the reference sheet's caption into the picture — dropped.

| # | File | Look |
|---|---|---|
| 1 | `otter.png` | smooth-coated otter (Singapore's own), holding a pencil |
| 2 | `owl.png` | grey owl, round glasses, red bow tie, a little book |
| 3 | `cat.png` | ginger cat, blue scarf, a pencil |
| 4 | `red-panda.png` | red panda, a calculator |

`options-on-purple.jpg` = the four cut out on the purple Shorts look. Cost: 8 pictures, about US$0.32.

**Adrian, 5 Nov 2026: "all 4, we can switch around"** — all four are in use, one per Short (`animal` in each `data/shorts/*.json`, rotating otter → owl → cat → red panda).

**Six-pose sets** (`poses/<animal>/{idle,point,think,oops,nod,cheer}.png`, transparent, 512², bottom-aligned): made by EDITING each picture (`poses.mjs`), cut out with `scripts/shorts/cutout.py` (flood-fill from the edges — a plain colour key ate the animals' own colours). 5 of the 20 first tries were zoomed in with feet or tails cut off; the prompt now asks for a clear green margin and they were redrawn. `all-poses-on-purple.jpg` = all 24. Cost ≈ US$1.00 for the 25 pose pictures + US$0.32 for the options.

Was: waiting for Adrian to pick one. Then: a six-pose set by EDITING the picked picture (idle, point,
think, oops, nod, cheer — `../scholars/BIBLE.md` §How to make a new picture), its own bible, and a part
in the Shorts story (e.g. it reacts to the wrong answer and holds up the trap rule at the end).
