# SPEC — the student assistant (plan, not built)

**Status:** PLAN, 5 Nov 2026. Nothing here is built except what the table in §6 marks as existing.
Each build step in §8 needs Adrian's own "yes" before it starts.

**Asked for:** Adrian, 5 Nov 2026: *"instead of an AI companion, it will be the AI assistant for
students - that organizes for students, take notes, checkins, keep track of what they need to do,
etc.. all by using voice, typing, all kinds of interface, telegram, just by text, like using text to
set settings etc"*, *"yes to the lines to draw"*, *"yes write the plan"*.

---

## 1. What it is, in one line

A study assistant each student can talk to, in Telegram or the app, by typing or voice. It keeps their
school life in order: what is due, what to practise tonight, their notes, their exam dates, and a
few friendly check-ins. It is like a personal secretary for studying, not a friend or a therapist.

## 2. What a student can do with it (version 1)

| The student says (typed or spoken) | The assistant does |
|---|---|
| "My A Math prelim is on 12 Aug" | Saves the exam date; counts down; plans revision around it |
| "Remind me to finish the vectors worksheet on Thursday" | Adds a to-do with a reminder; ticks it off when they say "done" |
| "Note: sine rule needs the angle opposite the side" | Saves the note to **My Notebook**, under the right topic |
| "What did I note about vectors?" | Finds and shows their own notes |
| "What should I do tonight?" | A short plan: 1 due review from **My Error Logs** + 2–3 questions on the weakest topic, sized to the time they have |
| "Remind me to practise at 8pm on weekdays" | ✅ **already built** (settings in plain words, 5 Nov 2026) |
| "Give me hints first" | ✅ **already built** (hint first) |
| A maths/science question or photo | ✅ already built — answered as today |

**Check-ins** (the assistant speaks first): **at most 3 a week**, only when there is a reason:
- an exam is 5 days away ("Want a 20-minute plan for tonight?");
- a marked paper just came back ("3 things to fix — want the first one now?");
- a topic went up ("Vectors went from 45% to 70% — nice work");
- no practice for 7 days (one gentle nudge, then silence).

The student can say "fewer check-ins" or "stop check-ins" at any time.

## 3. One friendly personality — how

One short **character sheet** (about 15 lines of principles, not a long rule list — the lesson from
Anthropic's interview) that EVERY message the assistant sends is written with: answers, reminders,
check-ins, to-do confirmations. Today each feature writes its own messages in its own voice; this
puts them under one voice.

The character, in short:
- **Like a kind senior student who is good at maths** — warm, brief, encouraging, plain words.
- **Short.** One idea per message. No walls of text in a chat.
- **Honest.** Never says "you're right" without checking (the flattery lesson).
- **About school and studying.** Friendly, but not a best friend.
- **Encourages, never guilt-trips.** No "you'll disappoint me", no streak pressure.
- **Celebrates real progress** (marks going up), not time spent in the app.

How we make sure it sticks: Adrian reads **10 sample messages** (a reminder, a check-in, a to-do, an
exam countdown, a "well done", a stressed student…) and approves the voice once, before it goes live.

## 4. Avatar (optional, recommended later)

Not needed for version 1 — the words carry the personality. Later, the **Scholar boy and girl**
(approved 5 Nov 2026, `docs/characters/scholars/BIBLE.md`) can be its face: the student picks one,
and it appears on reminders and check-ins in the app. No new art needed.

## 5. The lines it never crosses (approved by Adrian, 5 Nov 2026)

1. About school and studying. No romance, no flirting, no "I'm your best friend". Kind redirect.
2. Encourages, never guilt-trips. No streak pressure or fear of missing out.
3. Success = marks going up, not time spent chatting. No tricks to keep them in the app.
4. Parents can see it exists and can switch it off for their child.
5. **Safety first:** a student who shares distress gets a kind reply, help-line numbers and is
   encouraged to talk to a trusted adult; serious cases alert Adrian. **Being built now** (bot repo,
   "safety rules" session, 5 Nov 2026) — it goes live BEFORE any check-ins do.

## 6. What exists today vs what is missing

| Piece | Today |
|---|---|
| Answers questions (text + photo), Telegram + app Ask | ✅ |
| Remembers each student's weak topics from marked papers | ✅ (bot `lib/student-memory.js`) |
| My Error Logs (mistakes to fix, spaced review) | ✅ |
| Settings in plain words + daily practice reminder | ✅ (5 Nov 2026) |
| Hint first | ✅ (off by default) |
| Exam countdown in the notebook | ✅ (app) — but exam dates are not taken by chat |
| Safety rules | 🔨 being built |
| To-dos with reminders by chat | ❌ |
| Notes by chat ("note: …") + "what did I note about…" | ❌ (notes exist in the app, not by chat) |
| "What should I do tonight?" plan | ❌ |
| Check-ins | ❌ |
| One character sheet for every message | ❌ |
| **Students' voice notes** | ❌ — the bot only takes voice from Adrian today |

## 7. Everything about a student in one place

The Notion lesson (5 Nov 2026 video): an assistant is only as good as what it knows, kept in one
place. To-dos, notes, exam dates, settings, marked papers and error logs all live in the same
Supabase tables keyed to the student, so the assistant in Telegram and in the app sees the same
thing. This is also the data goal: every to-do, note and check-in answered is learning data
(anonymised before any reuse, as agreed).

## 8. Build steps — small, in order, each needs Adrian's yes

1. **Safety rules** — in progress.
2. **Character sheet** + Adrian approves 10 sample messages; then reminders and confirmations use it.
3. **To-dos and notes by text** in Telegram ("remind me…", "note: …", "what did I note…", "done").
4. **Exam dates by chat + "What should I do tonight?"**
5. **Check-ins** (max 3 a week, the triggers in §2), with "fewer/stop" in plain words.
6. **Students' voice notes** — spoken message → text → the same path as typing.
7. **The same in the app** (Ask tab), then a parents' on/off switch in the parent view.
8. **It works inside the student's own stuff** (the Notion lesson — Adrian, 5 Nov 2026: *"let's build
   this"*). Because everything is in one place, the student can ask it to DO things with their own
   material: "make me a one-page summary of my vectors mistakes", "turn my notes on circles into a
   cheat sheet", "make a revision timetable until my prelim on 12 Aug", "quiz me on my own notes",
   "what have I not revised yet?". It reads their error logs, notes, marked papers and exam dates and
   writes the result back into My Notebook. **Depends on the shared student record** (step 0 below).

**Step 0 (comes first, 5 Nov 2026 — Adrian: "yes build the map"):** map where every piece of a
student's data lives today (`docs/STUDENT-DATA-MAP.md`), then build ONE shared student record that the
bot and the app both read. Steps 3–8 all stand on it.

## 9. How we will know it works

- More practice: practice sessions per student per week, before vs after.
- Marks: topic scores going up for students who use it.
- Check-ins: how many are answered vs ignored or switched off (too many "stop" = too pushy).
- Not measured as success: minutes in the app.

## 10. Decisions left for Adrian (asked one at a time, when their step comes)

- Step 2: approve the 10 sample messages (the voice).
- Step 5: whether parents also get told in a serious safety case (the safety session will recommend).
- Later: whether the Scholar characters become its face, and whether it gets a name.
