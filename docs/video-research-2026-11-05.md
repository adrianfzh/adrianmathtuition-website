# Research: assets, licences and cute-character consistency (seen 5 Nov 2026)

Method: web search + page fetches on 5 Nov 2026. Search returned mostly vendor and affiliate blogs. Anything marked UNVERIFIED was not confirmed on a primary page. No model id or price below is invented; where I could not see an id, it says so. Prices are USD unless stated.

Biggest caveat up front: almost no source in this round compared anime/chibi/cartoon quality between models. Fal's own comparison pages say nothing about cartoon style. Stylised-character claims below are therefore mostly "reported by vendor blogs" and must be tested on your own character.

---

## A. Cute / anime / chibi / cartoon characters

### A1. Image models for stylised characters (and fal availability)
- Seedream (ByteDance) is repeatedly called strong for stylised/anime scenes and multi-character prompts by affiliate guides. Confidence: low (vendor blogs). Source: https://morphic.com/resources/list/best-ai-models-for-anime (seen 5 Nov 2026).
- Seedream 4.5 Edit exists with an id of `bytedance/seedream-v4.5/edit` on WaveSpeed, with a sequential variant `.../edit-sequential` for "same character and style across a batch". Fal's full id was NOT confirmed in my search (a ComfyUI page shows a truncated `fal-ai/bytedance/...` pattern). Adrian already calls Seedream 4.5 edit from code, so he has the real fal id. Source: https://tropical.wavespeed.ai/models/bytedance/seedream-v4.5/edit (WaveSpeed id, seen 5 Nov 2026).
- Nano Banana naming: original = Gemini 2.5 Flash Image; Nano Banana 2 = Gemini 3.1 Flash Image; Nano Banana Pro = Gemini 3 Pro Image. Fal id for Nano Banana 2 edit: not confirmed. Source: https://budgetpixel.com/blog/nano-banana-2-vs-seedream-50-lite-two-new-school-image-models-with-very-different-superpowers (seen 5 Nov 2026; vendor blog). A Seedream 5.0 Lite is mentioned there; I did not verify it exists on fal.
- Chibi/sticker specifically: Recraft V4 is recommended for clean chibi line art and sticker-like flat edges; NovelAI and Midjourney Niji are the anime-specialist options (neither is on fal as far as I could see; NOT verified). Flux 2 Pro is recommended for ink-line character detail. Confidence: low (affiliate lists). Source: https://morphic.com/resources/list/best-ai-models-for-anime and https://www.magnific.com/blog/ai-anime-generator/ (seen 5 Nov 2026).
- Same source warns that a model tuned for one anime sub-style rarely handles others; test on your own brief. Pixar-like 3D and Chinese guoman 3D: I found NO source that addresses them. UNVERIFIED.

### A2. Keeping one character identical
- Recommended workflow in guides: lock ONE canonical reference, make a character sheet from it, and have every later shot reference the sheet, never the previous shot; separate constant traits from per-shot action/camera text. Confidence: medium-low (guide blogs). Sources: https://martini.art/en/blog/how-to-build-consistent-ai-character and https://fluxnote.io/guides/how-to-get-consistent-characters-in-ai-video (seen 5 Nov 2026).
- Kling 3.0 Pro "elements" on fal: upload a frontal image plus optional extra reference images, tag as @Element1, @Element2 in the prompt; multi-character coreference is claimed to keep 3+ characters distinct. Priced higher: $0.224/s audio off, $0.336/s audio on (vs $0.112/$0.168 without elements). Confidence: high on prices (fal's own page), low on how well it holds cartoon faces. Source: https://fal.ai/learn/tools/seedance-2-0-vs-kling-3-0 (seen 5 Nov 2026).
- Seedance 2.0 reference-to-video on fal: up to 9 images, 3 videos, 3 audio clips, tagged [Image1], [Video1], [Audio1]. No in-prompt persistent "element" system like Kling's. Same source as above.
- LoRA: fal's `turbo-flux-trainer` page lists $2.40 per 1,000 steps (so 2,000 steps = $4.80) and a third-party guide says it wants at least ~10 images of a consistent subject. The `fal-ai/flux-lora-fast-training` price was only seen on third-party pages (about $2 per job; UNVERIFIED). Sources: https://fal.ai/models/fal-ai/turbo-flux-trainer ; https://tech-insider.org/train-custom-ai-image-lora-2026/ (seen 5 Nov 2026).
- Caveat on LoRA: it fixes the still image, not the video. A LoRA'd Flux still can then feed image-to-video, but the video model can still drift the face. One guide says Midjourney --cref works for stills only. Source: https://dev.to/genra_ai/ai-video-character-consistency-keep-the-same-face-across-every-scene-5fb7 (seen 5 Nov 2026; vendor blog).
- Judgement (mine, not sourced): for flat/chibi characters with a simple silhouette, a multi-reference edit model (Seedream/Nano Banana) fed a turnaround sheet is the cheap first step; LoRA is the fallback if drift shows after 20+ images. One guide itself says simple distinctive silhouettes survive best. Source: https://www.atlascloud.ai/vi/blog/tips/kling-4-character-consistency (seen 5 Nov 2026; note it is vendor and its "Kling 4" naming is questioned by the page itself).
- Vidu reference-to-video: only `fal-ai/vidu/q3/text-to-video` was seen as a fal id; no fal id for Vidu reference-to-video confirmed. Source: https://www.gradually.ai/videomodelle-vergleich/vidu-q3-pro-vs-hailuo-2-3/ (seen 5 Nov 2026).

### A3. Video models: fal price per second, length, weaknesses
Prices from fal's own pages (high confidence) unless noted:
- Kling v3 Pro image-to-video: `fal-ai/kling-video/v3/pro/image-to-video`, $0.112/s audio off, $0.168/s audio on, $0.196/s voice control, up to 15 s. Source: https://fal.ai/learn/tools/best-image-to-video-apis-2026 (seen 5 Nov 2026).
- Kling V3 Standard (what Adrian uses): $0.084/s audio off, $0.126/s audio on. Source: https://fal.ai/learn/tools/seedance-2-0-vs-kling-3-0.
- Kling O3 Pro image-to-video: `fal-ai/kling-video/o3/pro/image-to-video`, $0.112/s off, $0.14/s on, 15 s. Kling 2.6 Pro: `fal-ai/kling-video/v2.6/pro/image-to-video`, $0.07/s off, $0.14/s on, 10 s. Source: best-image-to-video-apis-2026 page above.
- Seedance 2.0 image-to-video: `bytedance/seedance-2.0/image-to-video`, about $0.3034/s at 720p, $0.682/s at 1080p, 4-15 s, audio included. Fast tier $0.2419/s at 720p (id pattern `bytedance/seedance-2.0/fast/...`). Reference-to-video with video inputs is 0.6x base. Source: same two fal pages.
- Happy Horse 1.0 (`alibaba/happy-horse/image-to-video`): $0.14/s 720p, $0.28/s 1080p, 15 s. Grok Imagine Video (`xai/grok-imagine-video/image-to-video`): $0.05/s 480p, $0.07/s 720p. Veo 3.1 Fast: $0.10/s no audio. Source: best-image-to-video-apis-2026 page.
- Hailuo 2.3 Pro $0.49 per 1080p video; Standard $0.28 for 6 s 768p. Source: https://fal.ai/learn/tools/kling-v3-pro-vs-hailuo-2-3-pro (seen 5 Nov 2026, via search snippet only).
- Vidu Q3: figures conflict ($0.035/s at 360p-540p with 2.2x at 720p; elsewhere about $0.08/s). No fal image-to-video table seen. UNVERIFIED. Source: search results above (https://wavespeed.ai/blog/posts/vidu-q3-review-comparison-sora-2-veo-3-seedance-wan-grok-2026).
- Wan 2.x on fal: no fal id or price found. UNVERIFIED.
- Weaknesses for cartoon (face drift, line boiling, extra fingers): NO source in this round measured these. Fal's own comparison explicitly covers only photoreal test prompts. Treat as untested; the practical test is one 5 s clip per model on the real character sheet.

### A4. Prompt wording for cute styles
- No authoritative primary source found. The AI-anime lists above only say to match prompt to sub-style. Sources: https://morphic.com/resources/list/best-ai-models-for-anime ; https://dreamina.capcut.com/ai-image/best-ai-image-generator-anime-characters-2026 (seen 5 Nov 2026).
- Practical wording (my suggestion, UNSOURCED, to be tested): "chibi, 2.5-head-tall, big head small body, large round eyes, thick clean outline, flat cel shading, limited palette, plain background" for a character sheet; ask explicitly for "front, three-quarter, side and back turnaround plus 6 expressions on one sheet"; negative list: "no realistic proportions, no gradients, no extra fingers, no text, no outline variation".
- Per the consistency guides: describe constant traits once in a fixed block and reuse it word for word. Source: https://fluxnote.io/guides/how-to-get-consistent-characters-in-ai-video.

### A5. Lip-sync / talking cartoon faces
- Kling Lip Sync (video + audio in, not still image): Kling's own guide says it works for human characters (real, 3D and 2D) but not animal characters. Reported fal billing $0.014 per 5-second block (third-party; UNVERIFIED). Sources: https://kling.ai/quickstart/ai-lip-sync-guide ; https://gaga.art/blog/lip-sync-ai/ (seen 5 Nov 2026).
- LatentSync on fal: `fal-ai/latentsync`, page says it supports real and anime characters; one aggregator says $0.05 per generation (UNVERIFIED). Source: https://fal.ai/models/fal-ai/latentsync (seen 5 Nov 2026).
- OmniHuman 1.5 (ByteDance) is marketed for cartoon and anime still-to-talking-video; one competitor benchmark lists $0.16/s at 720p. Confidence: low (competitor). Source: https://www.veed.io/learn/best-lipsync-api (seen 5 Nov 2026). Whether OmniHuman is on fal: not confirmed.
- Hedra: roughly half the price of the OmniHuman comparison point per the same VEED page; not verified, not confirmed on fal.
- Note: Kling v3 itself has a "voice control" mode and audio-on mode on fal ($0.168-0.196/s Pro), which may remove the need for a separate lip-sync step for short lines. Source: fal pages above.

### A6. Non-generative 2D animation (perfect consistency)
- Rive vs Lottie: Lottie is playback of fixed animations; Rive has state machines and interactivity and suits mascots that react. Confidence: medium (Rive-leaning vendors). Sources: https://lottiefiles.com/blog/lottie-animations/lottiefiles-or-rive.md ; https://www.pkgpulse.com/guides/lottie-vs-rive-vs-css-animations-web-animation-formats-2026 (seen 5 Nov 2026).
- Rive vs Spine: both support bones, meshes, weights, IK; Spine is the stronger game-engine fit (page is Rive-authored). Source: https://rive.app/rive-vs-spine.
- AI that produces rig-ready layered art or auto-rigs a single image to .riv/Spine: NOTHING found. UNVERIFIED. Live2D, Character Animator not researched in this round.
- Pros/cons (my judgement, unsourced): rigged art gives pixel-identical character every time and zero per-second cost, but needs layered parts (head, mouth shapes, eyes, arms) built once; generative video gives rich motion but drifts. For a recurring mascot reacting beside a code-drawn board, rigged is the lower-risk choice for reactions; generative for hero/promo shots.

---

## B. Assets and licences

### B1. Music
- ElevenLabs Music, by plan (blog summary of the licence, published 26 Feb 2026): Free non-commercial with attribution; Creator adds organic social; Pro adds unsponsored media but excludes advertising and sponsored content; Scale is the FIRST tier covering online advertising and influencer campaigns; Enterprise for film/TV. So a paid ad for the tuition on Meta/TikTok needs Scale. Confidence: medium (third-party summary of vendor terms; check ElevenLabs' own table). Source: https://licenseorg.com/blog/ai-music-licensing-suno-elevenlabs.
- Suno: Pro ($10/mo) and Premier ($30/mo) grant commercial rights; Free is non-commercial; rights reportedly persist for songs made while subscribed; the same summary does not address advertising use specifically. One source reports download caps (Pro 20/mo, Premier 60/mo) from a 2026 change. Confidence: low-medium. Sources: https://dynamoi.com/learn/ai-music-distribution/suno-commercial-rights-explained ; https://diyai.io/ai-tools/audio-generation/suno-pricing/ (seen 5 Nov 2026).
- Udio: after late-2025 settlements it became walled-garden, downloads/distribution not allowed. Source: licenseorg link above. Stable Audio: not researched.
- Pixabay (music and other content): free commercial use, no attribution; prohibits selling content standalone, misleading use, using as trademark; the licence summary does NOT mention ads or Content ID. Source: https://pixabay.com/service/license-summary/ (seen 5 Nov 2026, primary). Note: ads not explicitly addressed, so say so in your records.
- Mixkit: free, no attribution per secondary sources; not verified on primary page. YouTube Audio Library: one blog says licence is YouTube-use only and some tracks need CC-BY credit, i.e. not safe for Meta/TikTok ads. Uppbeat: sources conflict (free = limited / non-commercial; paid from about $6.99/mo). Source: https://www.soundstripe.com/blogs/youtube-audio-library-alternative ; https://www.vidiq.com/blog/post/royalty-free-music-youtube-audio-library (seen 5 Nov 2026). No free library was confirmed for paid ads; none of these is a primary licence page except Pixabay.

### B2. Sound effects
- ElevenLabs SFX: free plan requires attribution; paid plans do not and can be used commercially; do not use to build competing products. Source: https://elevenlabs.io/sound-effects/commercial (seen 5 Nov 2026, vendor page). Check whether the Music-style tier limits also apply to SFX: not verified.
- Freesound: licence is per file. CC0 = no credit; CC-BY = commercial OK with credit; CC-BY-NC = no commercial use. Filter to CC0 for ads. Source: https://swarmify.com/blog/free-sound-effects-websites/ and the Newcastle guide in search results (secondary; seen 5 Nov 2026).
- Zapsplat: its own page says the free plan allows personal, commercial and broadcast projects worldwide, but its standard licence PDF says free downloads require a credit/link. Sources conflict, so credit it. Sources: https://zapsplat.com/license-type/standard-license/ ; https://www.zapsplat.com/license-agreement (seen 5 Nov 2026).
- Pixabay SFX: same Pixabay licence as above. Mixkit SFX: not verified.

### B3. Voices
- ElevenLabs: free plan not licensed for commercial use; Instant Voice Clone commercial use needs Starter or above (about $5-6/mo per third parties), Professional Voice Clone needs Creator or above. Cloning requires confirming you have the right and consent to the voice; your own voice qualifies. Voice Library voices can carry extra creator terms. Sources: https://terms.law/ai-output-rights/elevenlabs/ ; https://elevenlabs.io/docs/eleven-creative/voices/voice-cloning/instant-voice-cloning/llms.txt (seen 5 Nov 2026). Confidence: medium.
- MiniMax speech/voice clone: official commercial terms NOT found. A third-party guide says you must hold rights to any voice you submit. UNVERIFIED. Source: https://minimax-ai.chat/?p=1465.
- Free local options (Voice Studio etc.): not researched in this round.

### B4. Fonts, icons, stickers, backgrounds
- Not reached by search in this round; below from general knowledge, UNVERIFIED against pages seen today: Google Fonts are mostly SIL OFL (free commercial, may embed in video); Noto Sans SC is OFL; OpenMoji is CC BY-SA 4.0 (attribution + share-alike, awkward for ads); unDraw and Storyset have their own free licences (Storyset requires attribution on the free tier). Pexels/Pixabay media allow commercial use without credit. Verify each licence page before use. Pixabay's confirmed above.

### B5. Rights in AI output; disclosure; Singapore rules
- fal.ai Terms of Service (page seen 5 Nov 2026): you own your input; the terms do NOT clearly say who owns outputs; the licence granted is for "personal or internal business use"; fal does not warrant outputs are original; you must use outputs lawfully; you must be 18+ to use the service. Commercial rights therefore rest on each model's own licence (fal's FAQ says each model has its own licence and commercial-use badge on its page). Confidence: medium (WebFetch summary of the ToS). Sources: https://www.fal.ai/legal/terms-of-service ; https://fal.ai/docs/documentation/model-apis/faq.md.
- Implication: for Kling, Seedance, Nano Banana, Seedream, check each provider's output terms; I did not retrieve those pages. A secondary blog says some providers state the customer owns all output. UNVERIFIED. Source: https://oakgen.ai/blog/oakgen-commercial-use-licensing.
- Platforms: all three reportedly require disclosure for realistic AI content, and TikTok's rule is broadest (AI-generated content toggle in Ads Manager; unlabeled ads can be rejected). Platforms read C2PA metadata. Dates in blogs conflict (TikTok July 2026 vs April 2026). Cartoon characters are arguably not "realistic", but labelling is cheap. Confidence: low (vendor blogs). Sources: https://billo.app/blog/ai-labeling/ ; https://www.cinerads.com/blog/ai-ad-disclosure-requirements (seen 5 Nov 2026).
- Singapore: ASAS says the same standards apply whether or not AI is used; ads must be legal, decent, honest and truthful; SCAP says special care for ads directed to or depicting children and young people; no pre-approval needed; ASAS acts on complaints; a SCAP review is underway. The MCI answer did not address AI images. ASAS logged 7 Gen-AI feedback cases in 2025 and said vague AI disclosures are not useful. Sources: https://www.mddi.gov.sg/newsroom/pq-on-regulations-for-use-of-children-s-images-in-advertising/ (primary, seen 5 Nov 2026) ; https://www.marketing-interactive.com/misleading-ai-ad-complaints-on-the-rise-says-asas (secondary). Claims about a separate "ASAS Children's Code" are unconfirmed.
- Practical for ads: avoid unprovable results claims in the clips (honest/truthful), and since the audience is minors/parents, keep the product pitch directed at parents.

---

## C. End-to-end pipelines for AI animated explainers / mascot content
- Typical steps in guides: goal, script, storyboard, generate visuals, voiceover, edit. Source: https://ltx.studio/blog/how-to-make-explainer-videos-with-ai (seen 5 Nov 2026; vendor).
- A mascot walkthrough: ChatGPT-4o image for the mascot, Hedra Character-3 for talking, Kling for image-to-video, then human editing as quality control. Source: https://prolificstudio.co/blog/ai-animation-to-create-a-3d-explainer-video/ (agency blog).
- Consistency is repeatedly named as the point where series fail (video 1 vs video 14); fixes: one reference image plus reference-to-video; keep a stable mascot zone and animate one element per shot. Source: https://pixo.video/blog/seedance-explainer-video (vendor on its own product, low confidence).
- Voice step: detach the video model's audio and lay a separate ElevenLabs voice for mascot lines. Source: https://blog.tixu.ai/build-consistent-ai-characters-for-video-in-4-steps/.
- Vertical 9:16 10 s mascot clips: example only at https://www.vo3ai.com/blog/why-faceless-creator-brands-save-4000mo-with-consistent-ai-characters-roi-test-2026-06-16 (ROI claims are unverified vendor claims).
- No independent benchmark of cartoon drift or lip-sync quality was found; test the chosen stack on one short episode first.

---

## Not verified / gaps
- Cartoon-specific performance of any video model; Pixar-3D and guoman 3D model recommendations.
- fal ids: Nano Banana 2 edit, Seedream 4.5 edit (full), Vidu reference-to-video, Wan 2.x, Hailuo 2.3 image-to-video, OmniHuman, Hedra.
- Provider output-ownership terms for Kling/Seedance/Nano Banana.
- Licences for Mixkit, Uppbeat, Freesound, OpenMoji, unDraw, Storyset, Noto Sans SC on primary pages.
- AI auto-rigging to Rive/Spine/Live2D.
