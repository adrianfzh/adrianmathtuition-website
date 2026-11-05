# AI video playbook — characters, teaching extras, promo clips (5 Nov 2026)

Adrian, 5 Nov 2026: *"i want all we can learn from these youtube videos, cause we may need them to generate clips for teaching and promotional materials later, perhaps even more. especially see how to write comics/anime/cute style characters … i want a pipeline, and how to generate (or where to get) assets"*.

This is the one place for **making pictures and video with AI models**: characters, video extras around the board, promo clips, stickers and stills. Read it before any of that work.

What this playbook does not cover:
- **The maths board** and one-concept clips → `docs/LESSONS.md` and `SPEC-CLIP-PIPELINE.md`. These are drawn by code, never by a video model.
- **The drama side project** → `~/Desktop/ai-video-pipeline` (its `RULES.md` holds the 19 shot rules).

Sources:
- **Eight tutorials watched in full** on 5 Nov 2026, listed in §8. Tags like **[V4]** below name the video.
- **Our own earlier work,** tagged **[ours]**.
- **A web check of tools, prices and licences on 5 Nov 2026,** tagged **[web]**. Prices change monthly, so re-check before a paid run.

---

## 0. Red lines (every clip, every picture)

1. **Video models never draw the maths.** They draw pictures of symbols (wrong digits, nothing editable), so equations stay on the code-drawn board. Agreed 13 Oct 2026. Models make only the extras around it.
2. **No model names and no "Adrian" on anything a student sees** (CLAUDE.md). Promo for parents may carry the brand; the student app says "your tutor".
3. **No real children's photos go into any model.** Characters are invented. A student's face is never uploaded.
4. **Our own stories and characters only.** Do not adapt someone else's novel, comic or character. The Chinese tutorials skip copyright [V3]. Our characters' briefs say "an original character, not any existing brand, toy, game or cartoon character" [ours].
5. **Check every asset's licence before it goes in an ad** (§4). Label AI content where the platform asks (§4.6).
6. **Readability rule:** check the finished clip at phone size before showing Adrian (CLAUDE.md §Readability).

---

## 1. What we already have

| Thing | Where | State |
|---|---|---|
| Maths clips drawn by code (board, voice, word timing) | `docs/LESSONS.md`, `SPEC-CLIP-PIPELINE.md`, `scripts/clips/` | Live; quality bar is `expand-two-brackets-s2`. These clips have **no character and no stickers**. |
| Ideas already taken from these same tutorials for the maths clips | `SPEC-CLIP-PIPELINE.md` §2b (15 Oct) | A bible per topic, a board plan before words, "expensive is cheap" |
| The tutor picture: 6 poses as cut-out pictures | `public/lessons/characters/tutor/` | Live in the explain clip. A re-cut with the white hair and shirt kept waits for Adrian's yes (`docs/LESSONS.md` §Video extras). |
| Tutor video extras: hello, cheer, and a ball-throw opener | `public/lessons/…/clips/`, made by the side project | Admin and preview student only (`LESSON_VIDEO_EXTRAS_OPEN_TO_STUDENTS = false`). About US$0.20 per 5-second clip. |
| Five drawn characters (teacher, blob, kid, cat, robot) | `app/lesson/[slug]/characters/` | None picked. Adrian: "not interest/cute/fun". |
| 22 stickers (inline drawings) | `app/lesson/[slug]/lesson-stickers.tsx`, gallery `/app/lesson/stickers` | Live in explain clips |
| **The cute look Adrian wants** — 萌系 Q版 (cute chibi) | `docs/characters/2026-10-07-modern-scholar/PROMPT.md` and `contact-sheet.jpg` | 8 level-up sheets kept (7 Oct). He rejected flat animal and object mascots. |
| Drama and extras pipeline: story file → character → still → video → voice → music → join | `~/Desktop/ai-video-pipeline` (fal.ai from code) | Works; paused. Rules and free prompt check added 5 Nov. |
| Voices | MiniMax (`English_FriendlyPerson` lesson voice); three designed boy voices (side project README) | Live |
| Image models we can reach | fal (Nano Banana 2, Seedream 4.5 edit), OpenRouter (Seedream 5 Pro, Qwen-Image 3 Pro, Recraft, Hunyuan), OpenAI (GPT Image 2), Google (Gemini 3 Pro Image) | Keys held |

**So what is missing** is not tools. It is three things:
- one **character bible** per recurring character
- a **style lock** that every picture repeats
- one **production line** that turns a short brief into a teaching extra, a promo clip or a sticker, with Adrian's yes at the right points (§3)

---

## 2. Everything the eight videos teach, by stage

### 2.1 Story and script

- **Ask first, then make.** The director (Claude) asks only what the brief leaves out: purpose, platform, length, style, budget, quality. Then it writes a requirements note and needs no one until the first full cut. [V4]
- **Three documents before any prompt** [V4]:
  - **A final script.** The dialogue is never changed; only how each line is shown.
  - **A segment table.** Each segment is one generation of up to 15 seconds, and it doubles as the progress sheet.
  - **A continuity table.** It fixes in advance:
    - identifying marks
    - where each prop is
    - who stands where, facing which way
    - every piece of on-screen writing
    - time and weather
- **Join shots that are stages of one moment into one clip** of up to 15 seconds, for example "appears, stands, speaks" or "wakes, confused, recognises, asks". Split only when one clip would carry two separate important jobs. [V2]
- **Short-video structure** [V5, V6, V7]:
  - a hook in the first seconds
  - a twist or cliffhanger about every 60 seconds
  - in paid dramas the paywall sits right after "someone is wronged and is about to be revealed"
- **Pick the audience first.** Chinese platforms split "male channel" and "female channel" stories [V7].
- **Genres that sell in China** [V7]:
  - underdog revenge, which is easiest to grow an account
  - sweet romance
  - family drama
  - suspense twist
- **For our promo,** the transferable shape is: a student is stuck or doubted, there is a turning point, then the payoff.
- **A chatbot writes better with a role, the requirements and an output format** [V3]. Ask for the whole outline first, then one episode at a time. Asking for three versions and picking one works well. [V3, V1 ch.5]
- **A "bible" or skill file** that the agent reads every time: style, prompt structure, pacing rules. It means prompts are never rewritten by hand, and a good agent even pushes back when the bible misses something. [V5, V4]

### 2.2 Plan before you spend on video

- **Storyboard first.** For a 100-second episode, use **four 3×3 grids**, with **the dialogue written on each frame**. Approve them before any video credit is spent. [V5]
- **Shot sheet with fixed boxes** for every shot [V2]:
  - shot size
  - camera move
  - angle
  - what we see
  - light
  - dialogue
  - sound
- **A cheap preview video, then the final.** [V2]
- **Five-part video prompt** [V4]:
  1. the shots
  2. the second each starts
  3. the acting
  4. the background sound
  5. **what must not appear**
- **Eight-part prompt** for Seedance 2.0 [V1 ch.3]:
  1. subject
  2. clothes
  3. place and light
  4. mood (two words)
  5. music style
  6. colours (three to five)
  7. what happens second by second
  8. one film or director to copy
- **Draft at 720p, then render the chosen take at 1080p or 4K.** A 15-second 1080p clip costs about four times the 720p one. [V1]

### 2.3 Characters (any style)

- **Front, side and close-up in ONE picture,** then cut into three. One generation looks more like one person than three. [V4; V3 does the same as "三视图"]
- Some tools also show the back, using four views [V2].
- **One identifying mark per character** (a mole, a patch, a hair clip) to check faces shot by shot. [V4]
- **A new age or outfit is made from the existing picture,** changing only that. If it drifts, say what is wrong in plain words ("small boy, not a teen, big head, baby fat, keep the mole"). [V4]
- **A character card** [V2]: a description prompt, then several named **states** ("normal", "ball gown", "holding old dress"), then a **voice picked for it**. The script line decides which state a scene uses.
- **Reference pictures from several angles,** with one job per picture. Faces blend when two pictures answer the same question. [V1]
  - Seedance 2.5 starts blending at about 25 references; keep to 15–20.
  - Seedance 2.0 starts at about 6 pictures; five is the sweet spot.
  - Google Omni takes 5 photos, which should have different head angles. With only front views, the model avoids turning the head.
- **Generate places empty, with no people.** A different time of day is made from the same picture with only the light changed, and a reverse shot from the first side. [V4]
- **Real-looking people:** every picture prompt starts with "matte skin, visible pores, no smoothing, no shine". [V4]

### 2.4 Cute / anime / cartoon characters — what the videos say

The videos are mostly about real-looking drama. These are the parts about stylised characters.

1. **Pick the style from pictures, not words.** Render the same scene in two or three styles and choose. [V4]
   - V4's three: live action, **3D Chinese animation (国漫 3D)** and 2D stylised.
   - Claude **recommended 3D Chinese animation** for a series: effects look more natural in 3D, and **characters stay consistent across dozens of episodes**. Our cute chibi look is a 2D or soft-3D version of this.
2. **A style menu.** Ask the chatbot "which art styles exist for AI comic dramas" and it returns about ten, each with a copyable prompt [V3]:
   - Japanese cel anime
   - Chinese ink (水墨)
   - Disney-style
   - 3D
   - pixel art
   - and others
3. **Style lock by reverse prompt** [V3]:
   1. Find one picture whose look you love.
   2. Ask an image chatbot to describe its style as a prompt.
   3. **Delete every word about the person or subject.**
   4. Keep only the style words (colour, line, shading, texture, composition).

   That paragraph is the style lock, pasted unchanged into **every** later picture prompt. V3's style-analysis checklist:
   - colour: main, secondary, contrast, saturation
   - composition: shot size, angle, layout
   - technique: brush stroke, light and shadow, texture
4. **Character sheet in the locked style.** Describe the features exactly. V3's hair example: "long, short, buzz cut, shaved". Give age, eye colour, clothes, body, expression, one prop, the aspect ratio and "full body, front, standing". Then upload that picture and ask "**make front, side and back views from this, keep the style unchanged**". [V3]
5. **Cartoon faces drift more than real faces** in video, because a stylised face has fewer features to hold on to. [V1 ch.1, the cartoon restyle] Three fixes:
   - Attach face references even for a cartoon.
   - Keep the face big in the frame: smaller than a tenth of the frame drifts, for any style.
   - Steady the camera. Handheld shake looks wrong on a cartoon.
6. **Animated creatures need weight.** In the Higgsfield animation demo the prompt asks for "little paws clearly stepping", the camera "dollying alongside keeping pace", drifting particles and swaying grass. Praised: steps land, no floating or marching on the spot. Method: **make the perfect still first, then a director-style motion prompt** that describes only the movement. [V1 ch.4]
7. **Restyle real footage into a cartoon** (video-to-video): film yourself, keep the motion, change the look. The prompt describes only the art style. Steady the footage first, because shake is copied faithfully. [V1 ch.1] This could be useful for Adrian performing a reaction that becomes the cartoon tutor's reaction.
8. **The "AI comic drama" (AI 漫剧) workflow** is the same six steps as live action [V3, V7]:
   1. script
   2. art style
   3. characters
   4. storyboard frames
   5. picture to video
   6. voice, then edit

   The storyboard-frame prompt checklist [V3]:
   - shot size (close, medium, wide)
   - subject
   - light (main, fill, back, direction)
   - colours
   - composition (centred, diagonal, S-curve, rule of thirds)
   - angle (first person, over the shoulder, fisheye)

   **When a character speaks, use a front close-up.** Your own description beats the script's. Be plain, objective and short. [V3]
9. **Free open models** (Wan 2.2 picture-to-video) kept a face from **one still** with a movement-only prompt. [V8] They run on Windows with an NVIDIA card, not on our Mac.

**From our own work [ours], which is stronger than the videos on cute:**
- **The look Adrian approved (7 Oct)** is 萌系 Q版 (cute chibi), cute modern Chinese animation and sticker-pack style:
  - a chibi about **two heads tall**
  - a very big round head and a tiny chubby body
  - stubby arms and legs
  - **huge sparkling eyes**, a tiny mouth, **blushing cheeks**
  - a **soft thick outline**
  - bright soft colours with gentle gradient shading
  - "lively and a little silly, irresistibly cute"
  - **little HUMANS, not animal or object mascots**
- The exact brief is in `docs/characters/2026-10-07-modern-scholar/PROMPT.md` (the "Style" block = our style lock).
- **Which models drew it best:**
  - Seedream and Qwen are strongest at this look.
  - GPT Image 2 follows a brief most exactly.
  - Gemini adds unwanted captions and logos.
  - Midjourney has no API, so it is out.
- **Brief habits that worked:** "an original character (not any existing brand …)" · "the SAME character N times in a row … never changes (same face, same hair, same skin tone); only the outfit changes" · "plain white background" · "no text, no numbers, no letters, no captions, no logos, no watermark".
- **How a pose set is made (learned 1 Oct, `docs/AREAS.md` lessons row):** generate ONE picture, then make every pose and outfit by **editing that picture** ("change only …, keep everything else"). Regenerating, even with a character reference, changes the hair and the clothes. This is the same lesson as [V4]'s "make the child from the adult picture".
- **A known trap:** background removal also removed the tutor's **white hair and white shirt**. Generate on a **green screen** and key it out instead (`out/tutor-recut/gen.mjs` and `key.py` in the side project), or avoid white clothes.

### 2.5 Prompt grammar for video (tested in [V1], confirmed in [V4])

- **Pictures carry the looks; words carry only the action and the camera.** "If a detail can live in a reference, it never goes in the prompt."
- **One action per person per clip.** Link actions with "while" and "then".
- **Name real materials** ("copper pot on marble"), not vague adjectives ("fancy").
- **Real camera words** (dolly, orbit, crane, push-in). **At most three moves**, each tied to a subject. Put the move that matters first.
- **Picture to video:** leave empty space where the subject will move, keep the face big enough, and describe **only what changes**.
- **Anything you mention can appear.** "Glasses must match" put glasses on a man with none. Write "never add anything not in the reference". [V4]
- **Words that make skin wet** (cold sweat, tears) beat "no shine". Write the feeling instead. [V4]
- **Repeat the lighting words exactly** in every clip of a scene. [V1]
- **Say the time of day** in every prompt, and keep the character description in a note pasted into every prompt. [V1 ch.5]
- **Close-ups get no place picture.** It is pasted behind like a cardboard backdrop. Describe the background in words and blur it. [V4]
- **Big movements** (standing up, falling) get their own clip with enough time. Keep fragile body parts out of frame. [V4]
- **Use a sample clip for motion:** perform it yourself in front of a still camera, full body in frame, under 15 seconds. The prompt then describes only the character, never the motion. [V1 ch.1]

### 2.6 Video models and modes (as the videos found them, Jul–Oct 2026)

| Model | What the videos found | Where |
|---|---|---|
| **Seedance 2.5** (ByteDance) | The 2026 favourite. Up to 30 s, sound and speech in the same generation, up to 50 references, native 4K. Cuts like a director: wide, close, reverse. About 12 US cents a second on Topview. | V1, V4, V5 |
| **Seedance 2.0** | 15 s, 9 pictures + 3 videos + 3 sounds, timeline prompts. Best atmosphere and longest single takes. Cleanest on-screen text, but the dearest. | V1 |
| **Kling 3.0** | Natural faces; theatrical look (heavy rain, neon). Our side project uses Kling v3 standard (about US$0.15 per 5 s). | V1, V2 |
| **MiniMax H3** | About a third of Seedance 2.5's price per clip, but **dearer per finished second**: big motion breaks faces and bodies, so 96 clips were made for 27 used. Its reference-to-video mode locks face and voice together. | V4 |
| **Google Omni (Flash)** | Edit by chatting ("add a croissant", "make it golden hour"); breaks when the camera reframes. 10 s cap and a watermark. | V1 |
| **Veo 3.1** | The weakest faces in V1's comparison. | V1 |
| **Grok Imagine** | 6 s steps, "Extend video" up to 30 s; a beginner chain. | V1 |
| **Wan 2.2 / LTX-2** (open) | Run locally on a PC; held a face from one still. | V8 |

Modes worth knowing:
- **Reference to video** locks the face, and with some models the voice too. Use it for talking.
- **First and last frame** fixes exactly where a shot starts and ends. Use it for anything that must be precise, such as on-screen writing or a title. [V4]
- **Picture to video** animates one approved still. This is the normal production path. [V1, V3]
- **Video to video, or restyle,** keeps the motion and changes the look. [V1]
- **Last-frame chaining** makes long scenes: the **final** frame of clip N becomes the start of clip N+1, with the lighting words copied exactly. [V1]
- **A 3D "film set"** [V2]: build a rough 3D room from one picture, place dummies, re-render. The room stays the same from every angle.

### 2.7 Writing on screen

- A prompt alone produces fake characters, even on models that "can write".
- The fix [V4]:
  1. Make **two stills**, one without the writing and one with the correct writing (checked stroke by stroke).
  2. Ask the video model to fill in between.
- All six text clips came out right.
- For us, titles, subtitles and any maths stay as **overlays added in editing or by code**, never generated.

### 2.8 Sound

- **Name sounds like props:** "rain hitting metal", "pencil scratching". [V1]
- **Write the actual line** if a character speaks, so the mouth is timed to it.
- Generated sound is "a strong first draft, not a finished mix". [V1]
- **Tone comes from the acting, not the sample voice.** The video model copies the sample's flat delivery. [V4] So:
  - Write the acting before each line ("shouting while laughing, voice cracks").
  - Tell the model the sample voice sets only the voice colour.
  - Make each sample voice with that line's emotion.
- **Design voices from a description,** always ending with "like a film set, not an announcer". [V4] We do this with MiniMax voice design [ours].
- **Music:** a ~10-second instrumental sample sets the genre and tempo, and cuts land on the beat. [V1]

### 2.9 Editing and review

- **Choosing clips** [V4]:
  - Usually 3 tries per segment.
  - First the hard rules: right face, right lines, right volume, no glitches. Then the best acting.
  - **Check more frames in fast action.** Claude cannot watch video; it checks still frames.
- **If editing can fix it, do not regenerate.** Trim flash frames, cut around a stranger, zoom in past fake text. [V4]
- **Review rule:** Adrian says **what he sees**, not how to fix it. Claude finds the cause. [V4]
- **Fix by changing one thing,** such as the camera move only, not by rewriting the whole prompt. [V1]
- **Redo an off-model shot before extending it,** because one bad frame spoils a chain. [V1]
- Beginner editing: CapCut (剪映), export **1080p at 30 fps**. [V1, V3] Our pipeline joins clips with ffmpeg instead [ours].

### 2.10 Cost

- **Judge the cost of the whole film, not one clip.** [V4]
  - MiniMax H3: about 1/3 of Seedance 2.5 per clip, but dearer per finished second.
  - One episode cost **US$106**. 96 clips were made and 27 used, so 6 times the final length was generated.
- **Re-rolls are the budget.** About 4 tries per 15-second clip is common. [V7 comments]
- Planning tools exist to cut re-rolls. [V2]
- Our measured costs [ours]:
  - **about US$0.20 per 5-second Kling clip**
  - **about US$0.60** for a 3-shot demo
  - **US$12–20** estimated for a 6-minute episode at Kling quality

### 2.11 The business picture (useful for promo)

- Micro-drama is about **US$20B** a year. **Over 10,000** fully AI-made dramas were published in one month. "Over 20 % of US adults online watch daily" (an unsourced, possibly out-of-date figure). [V6]
- People find shows through **Facebook and TikTok ads**, and pay over US$20 a month. [V6]
- "**AI roles, not AI actors**": a fake actor builds no fans, but an AI *character* plus **chatting with the character after the episode** keeps viewers longer. [V6] For us, this means a lesson character a student can ask questions.
- **Mixed filming:** real people on a plain background, with AI adding the expensive parts (a set, crowds, aerials). [V6] For promo this could be **Adrian filmed on a plain wall, with AI adding the classroom or the animated world around him**.
- The Chinese tutorials sell courses, and their comments say the beginner lane is crowded and hard to earn in. [V3, V7] This confirms the 26 Aug advice: **use video to market our own product**, not to become a drama studio.

---

## 3. The pipeline — one production line, three products

Same stages for all three. Only the last mile differs. ✋ marks Adrian's yes.

```
 0  BRIEF      what, who for, length, where it plays (app / TikTok / Telegram) ───────────┐
 1  QUESTIONS  Claude asks only what the brief leaves out (§2.1)                          │
 2  BIBLE      character bible + style lock + series rules  (written once, reused) ──✋ once
 3  PLAN       script → segment table → continuity list → storyboard grid / shot sheet ✋
 4  ASSETS     character sheet (3 views + mark + states) · places (empty) · props ·      │
               voices · music · sound — make or get (§4) ──────────────────────────────✋ new ones
 5  STILLS     one approved still per shot (picture model + references + style lock)     │
 6  CLIPS      picture→video (or reference→video for talking); 2–3 tries; Claude picks by│
               the hard rules, then acting (§2.9)                                         │
 7  SOUND+CUT  voices, music, sound effects, mix; join; captions/overlays by code         │
 8  CHECK      phone-size look, every word and number, licence list, red lines (§0) ─────✋ watch
 9  SHIP       teaching → public/… behind a switch · promo → Adrian posts · sticker → set │
10  LEARN      every note Adrian gives → the bible or the rules, same commit ─────────────┘
```

### 3a. Teaching extras (around the code-drawn board)

**What they are:** an opener (a real-life hook, 5–10 s), the character reacting (hello, think, oops, cheer), and the 22 stickers. They play **around** the board, never instead of it.

| Stage | How, today |
|---|---|
| Bible | **Missing:** one `character bible` for the recurring tutor/mascot (§3d). |
| Plan | One line in `src/lib/lesson-extras.ts` says which lesson gets which extras |
| Stills | Picture model on a **green screen**, keyed out (`tutor-recut`) |
| Clips | Side project, **Kling v3 Standard** (decided 5 Nov 2026), start + end picture = two approved poses, no sound, about US$0.42 per 5 s |
| Sound | MiniMax lesson voice; the model's own sound dropped |
| Ship | `public/lessons/…`, switch `LESSON_VIDEO_EXTRAS_OPEN_TO_STUDENTS` |

Rules that come from the videos:
- **Keep the face big.**
- **Keep the camera still or slow.**
- **One action per clip.**
- **Movement words only** in the video prompt.
- **A plain or keyed background**, so it sits on the slate.

### 3b. Promo clips (TikTok / Reels / Shorts, parents and students)

**What they are:** 15–60 s vertical (9:16) clips: "watch your paper get marked overnight", a chibi student who finally gets a topic, a "before/after" of a marked page, an app walkthrough.

| Stage | How |
|---|---|
| Brief | One sentence + the audience: **parents** (trust, results) or **students** (fun, speed) |
| Plan | A hook in the first 2 s; one idea; a payoff; a call to action. A 3×3 storyboard grid for Adrian to approve before any video spend [V5]. |
| Real screens | **Screen recordings of the real app and real marked pages**, never generated. A model's fake app or fake handwriting would mislead parents. |
| Characters | The approved chibi cast (§3d), the same faces as the app, so the brand is one world |
| Mixed filming | Adrian on a plain wall, with AI adding the world around him [V6], only if he wants to appear |
| Text | Every title and caption added in editing, never generated (§2.7) |
| Sound | Licensed music and voice (§4); captions on, since most people watch muted |
| Check | Licence list; AI label where required (§4.6); no student's real name, face or paper unless consented |

### 3c. Characters, stickers and stills

- **The level-up sticker suites** (reward stickers on marked papers): start from the 8 kept sheets and `PROMPT.md` [ours].
- **Expression and pose sheets** for the tutor or mascot: the six poses (`idle · point · think · oops · nod · cheer`) as one sheet in the locked style, then cut out on green.
- **Stills for notes, the app and posts**: the same style lock, so everything looks like one family.

### 3d. The character bible — one file per recurring character (the missing piece)

`docs/characters/<name>/BIBLE.md`, read by every session before drawing that character:

```
Name / role:        (e.g. the tutor; the boy scholar; the girl scholar)
Style lock:         the exact style paragraph (copy of PROMPT.md "Style" for the chibi family)
Fixed look:         age · head-to-body ratio · hair (exact) · eye colour · skin tone ·
                    face shape · ONE identifying mark · default outfit (avoid pure white
                    clothes: background removal eats them)
States:             named outfits/props (uniform · blazer+medal · gown · …) — the script names one
Expressions/poses:  idle · point · think · oops · nod · cheer (+ any new one, approved)
Voice:              provider + voice id + one-line description + sample file
Never:              things that must not appear (text, logos, other brands' characters, …)
References:         the approved sheet(s) — front, side, back, face close-up — file paths
Approved by Adrian: date + his words
```

---

## 4. Assets — make or get

From the web check of 5 Nov 2026. The source links are in the session's research file, saved as [`docs/video-research-2026-11-05.md`](video-research-2026-11-05.md).
- **Most sources were vendor or affiliate blogs.** Lines marked **(check)** were not confirmed on the provider's own page.
- **Re-check every licence on the provider's page before a paid ad,** and keep a one-line record per asset (§4.7).

### 4.1 Make or get — the short table

| Asset | Make it with | Or get it from | Ads OK? |
|---|---|---|---|
| Characters (chibi family, tutor) | Seedream / Qwen-Image / GPT Image 2 with the style lock (§2.4); green screen + key | — never stock: our characters are ours | Yes, if the model's output terms allow (§4.6) |
| Places / backgrounds | Same picture models, empty of people (§2.3) | Pexels / Pixabay photos and video (commercial, no credit) | Yes (Pixabay: ads not mentioned, record it) |
| Props, icons, stickers | Our 22 inline stickers; picture models for new ones | unDraw (free licence), Storyset (credit on free tier) (check); **avoid OpenMoji in ads** (CC BY-SA: share-alike) | See each |
| Voices | MiniMax (lesson voice, designed voices) · ElevenLabs | — | ElevenLabs: paid plan; a clone needs Starter+ and consent; **Adrian's own voice is fine**. MiniMax commercial terms **not found** (check) |
| Music | ElevenLabs Music; Suno | Pixabay Music | **ElevenLabs: only the Scale tier covers online ads** (Pro excludes ads) (check). **Suno: Pro or Premier** for commercial use; ads not addressed (check). **Avoid Udio** (no downloads since late 2025) and **YouTube Audio Library** for Meta or TikTok ads. |
| Sound effects | ElevenLabs SFX (paid plans: commercial, no credit) | Freesound **CC0 only** (CC-BY needs a credit, NC is not allowed); Pixabay; Zapsplat (credit it, its pages disagree) | As noted |
| Fonts | — | Google Fonts (mostly OFL); **Noto Sans SC** for Chinese (OFL) (check) | Yes |
| Real app screens, marked pages | Screen recordings of our own app | — | Yes. Never show a real student's name, face or paper without consent. |

### 4.2 Picture models for cute characters

- **Seedream** (ByteDance) is called strongest for stylised and anime looks, and **it is what Adrian's chibi sheets liked best** [ours]. There is also a batch mode, "edit-sequential", for the same character across a set.
- **Qwen-Image 3 Pro** was also strong on the chibi look [ours].
- **GPT Image 2** follows a brief most exactly [ours].
- **Nano Banana 2** is Gemini 3.1 Flash Image; Nano Banana Pro is Gemini 3 Pro Image. Nano Banana Pro **adds captions and logos** [ours].
- **Recraft V4** draws clean chibi line art with flat sticker edges and **outputs vector SVG**. That means a sheet can feed a rig later [ours + web].
- **A model tuned for one anime sub-style rarely does others well.** Test our own brief, side by side, every time. No source compared chibi quality between models.

### 4.3 Keeping one cartoon character identical

Cheapest first:
1. **One canonical sheet** (front, side, back, face close-up, plus 6 expressions) in the style lock. Every later picture **references the sheet, never the previous shot**. Repeat the fixed-look block word for word.
2. **Multi-reference editing** (Seedream edit, Nano Banana) fed that sheet. This is what we do today with the tutor.
3. **Kling 3.0 "elements"** in video:
   - Upload a front picture plus extras and tag it **@Element1** in the prompt.
   - It is claimed to keep 3 or more characters distinct.
   - It costs about **twice** plain Kling Pro (below).
4. **A small trained model of the character (a LoRA)** on fal: about **US$2.40 per 1,000 training steps** (around US$5 a character), from about 10 consistent pictures. It fixes the **still pictures**, not the video. Use it only if drift shows after 20 or more pictures.
5. **A rigged character** (Rive): the same drawing every time, at no cost per second, and it can react on cue. The parts are built once (head, mouth shapes, eyes, arms).
   - **No tool was found that turns one AI picture into a rig automatically.** A designer or Recraft's vector output is the path.
   - For a mascot that **reacts beside the board**, this is the lowest-risk choice.
   - Generative video suits **promo hero shots**.

**Cartoon drift in video has not been tested by anyone we found.** fal's comparisons use only photo-real prompts. So the first test is one 5-second clip per model, on our real sheet (§5 step 3).

### 4.4 Video models on fal — prices seen 5 Nov 2026 (US$ per second)

| Model (fal id where seen) | No sound | With sound | Max | Note |
|---|---|---|---|---|
| Kling v3 Standard (ours today) | 0.084 | 0.126 | — | ≈ US$0.42 per 5 s without sound (we measured about US$0.20 in October; prices move) |
| Kling v3 Pro `fal-ai/kling-video/v3/pro/image-to-video` | 0.112 | 0.168 (voice control 0.196) | 15 s | **With elements: 0.224 / 0.336** |
| Kling O3 Pro `fal-ai/kling-video/o3/pro/image-to-video` | 0.112 | 0.14 | 15 s | |
| Kling 2.6 Pro `fal-ai/kling-video/v2.6/pro/image-to-video` | 0.07 | 0.14 | 10 s | cheapest Kling |
| Seedance 2.0 `bytedance/seedance-2.0/image-to-video` | — | 0.30 (720p) · 0.68 (1080p) | 4–15 s | sound always on; fast tier 0.24 (720p) |
| Happy Horse 1.0 `alibaba/happy-horse/image-to-video` | 0.14 (720p) | | 15 s | |
| Grok Imagine Video `xai/grok-imagine-video/image-to-video` | 0.05 (480p) · 0.07 (720p) | | | cheapest |
| Veo 3.1 Fast | 0.10 | | | weakest faces in [V1] |
| Hailuo 2.3 | Standard US$0.28 for 6 s at 768p · Pro US$0.49 a 1080p clip | | | (check) |
| Seedance 2.5 `bytedance/seedance-2.5/image-to-video` | token-priced: US$0.0214 per 1,000 tokens (tokens = height × width × seconds × 24 / 1024) ≈ 0.46 at 960² | same price | 4–30 s | on fal since; tested 5 Nov |
| Vidu Q3, Wan 2.x | not confirmed on fal 5 Nov | | | |

### 4.5 Talking cartoon characters (lip sync)

- **Kling Lip Sync** works on human characters (real, 3D and 2D), **not animals**. That fits the little-human chibi look. About US$0.014 per 5-second block on fal (check).
- **LatentSync** (`fal-ai/latentsync`) says it supports anime characters. About US$0.05 a generation (check).
- **OmniHuman 1.5** (ByteDance) and **Hedra** turn one still plus audio into a talking clip and are marketed for cartoons. Not confirmed on fal.
- **Kling v3's own sound and voice-control modes** may make a separate lip-sync step unnecessary for short lines.
- The common pattern is to **drop the model's own audio and lay our designed voice on top** [web, and how our cheer clip works].

### 4.6 Who owns the output, labels, and Singapore rules

- **fal's terms do not say who owns outputs,** and they grant use for "personal or internal business use". Commercial rights come from **each model's own licence** (fal shows a commercial-use badge per model). **Check the model page before using a clip in an ad,** and record it.
- **Labels for AI content:** TikTok asks for an AI toggle in Ads Manager and can reject unlabelled ads. Meta and YouTube ask for labels on **realistic** AI content, and platforms read C2PA tags. Cartoons are arguably not "realistic", but **label anyway; it is cheap**.
- **Singapore (ASAS):** the same rules apply whether or not AI is used.
  - Ads must be **legal, decent, honest and truthful**.
  - **Take special care with ads aimed at or showing children and young people.**
  - Nothing needs approval in advance; ASAS acts on complaints.
  - Vague AI disclaimers are not useful.

  For us:
  - **No results claims we cannot prove.**
  - **Pitch the product to parents.**
  - Show real screens, never mock-ups.

### 4.6b Turning a character into a 3D model (noted 5 Nov 2026, Adrian asked about hi3d.ai)

- **What hi3d.ai is:** one picture becomes a **3D model** (a solid figure you can turn round). It is built for **3D-printed figurines**: it splits a model into parts, picks colours for a multi-colour printer, and will print and post the figure if you have no printer.
  - Free plan: 100+ credits, with attribution required.
  - **Paid plans allow commercial use, and you own the models.**
  - It has an API.
  - It says uploads are not used for training.
- **The same job is on fal, with the key we already hold** (checked 5 Nov 2026): `fal-ai/hunyuan3d-v3/image-to-3d`, `fal-ai/trellis` and `tripo3d/tripo/v2.5/image-to-3d`. There is no new account to make.
- **What it is NOT:** a video maker. It does not help the clips directly.
- **Where it could help us later:**
  1. **Printed figurines of the scholar boy and girl** as prizes for students, or as props in promo videos. Hi3D's print-and-post service would do this.
  2. **A 3D version of a character, posed and turned by code**, gives perfect consistency from any angle, as in the 3D Chinese animation route in [V4]. It needs rigging work (Blender or Mixamo), so it is a bigger project.
- Our characters are flat cartoons, so a 3D model must invent their side and back. **Test with the approved front, side and back views,** not one picture.

### 4.7 The asset record (keep it with every promo clip)

One line per asset in `promo/<clip>/ASSETS.md` when promo work starts:
- what it is
- where it came from (model and plan, or library and URL)
- its licence in one line
- whether ads are allowed
- the date checked

---

## 5. Build order (recommendation)

Each step is usable on its own and cheap. Adrian's yes is needed only where ✋ is marked.

1. ✅ **Done 5 Nov 2026:** `docs/characters/scholars/BIBLE.md` and `docs/characters/tutor/BIBLE.md`.
   Originally: **character bible for the chibi family + the tutor** (§3d). Write it from the kept sheets and the tutor picture. Free. ✋ He confirms the faces.
2. ✅ **Approved 5 Nov 2026** (Adrian: "Option A"). The Seedream boy and girl are approved, with `oops` redrawn. They are in `docs/characters/scholars/approved/`. The method for fixing a wrong pose is in the bible.
   Originally: **six-pose sheet of ONE chibi character in the locked style,** on a green screen, from 2 models side by side (Seedream and GPT Image), about US$1. ✋ He picks. This replaces flat drawn looks he rejected.
3. ✅ **Made 5 Nov 2026** for about US$3.85. The results are in `docs/characters/scholars/BIBLE.md` §First moving clip. **Decided (Adrian, 5 Nov 2026: "kling standard"): Kling v3 Standard for board reactions**; Seedance 2.5 for promo.
   Originally: **one 5-second clip of that character** (cheer), from the picked still, on three models side by side: Kling v3 Standard, Kling v3 Pro with elements, and Seedance 2.0 (2.5 if it is on fal by then). About US$3–5. ✋ He picks. No one has tested cartoon drift, so this test settles it, and "expensive is cheap" too.
4. **One 20-second promo test,** storyboard grid first ✋, then clips, with real app screen recordings, licensed music and captions. About US$5.
5. Only then: wire the winners in (lesson extras, reward stickers, a promo folder) and add `JOB_RHYTHMS` lines if anything runs on a schedule.

---

## 6. Where each lesson came from

| Tag | Video | What it is good for |
|---|---|---|
| V1 | AI Master, "Full AI Filmmaking Course" (84 min, 20 Sep 2026) | Prompt grammar, reference limits, chaining, model comparison (ch.1 is the best 23 minutes) |
| V2 | Xuan Studio, "超强一致性，无需反复抽卡" (13 min, 14 Jul 2026) — a LuxReal demo | Shot-sheet boxes, preview before final, "join stages of one moment" rule, 3D film set |
| V3 | "豆包 + 即夢 + 剪映 AI 漫劇完整製作流程" (39 min, 24 Aug 2026) | Style lock by reverse prompt, anime character sheet in the same style, storyboard checklist |
| V4 | feicaiclub, "我让 Opus 5.5 当导演" (29 min, 13 Oct 2026) | **The reference design**: 16 tips, US$106 an episode, 3D Chinese animation for series consistency |
| V5 | CyberJungle, "Build Your Own Short Drama Series with AI" (10 min, 7 Jul 2026) | 3×3 storyboard grid with dialogue before video; a bible file |
| V6 | VP Land × Plot Party (11 min, 5 Aug 2026) | The business; mixed filming; "AI roles, not AI actors" |
| V7 | "AI 漫劇製作保姆級教程" (14 min, 3 Aug 2026) | Genres that sell, six-step outline (thin) |
| V8 | 零度解说, LocModel (31 Oct 2026) | Free local models on Windows (not usable here); do not install |

Full analysis: `~/Desktop/ai-video-pipeline/docs/ai-drama-videos-detailed-5-nov-2026.md`. Raw per-video notes are next to it in `docs/video-notes-2026-11-05/`.
