<!-- Copied from ~/.adrianmath_learn/proposals/video-digest.md so the nightly builder can read it. Approved by Adrian in Telegram (✅ Apply), 2026-11-02. -->

# video-digest — one place to drop videos, books and posts for a summary

Kind: chore → automation · drafted 2026-11-02 · status: approved 2026-11-02 (Adrian, Telegram ✅) — queued in IDEAS.md 🌙 Nightly builder (no branch — an automation is
built by a session once Adrian says yes)

## What he said (his words, SGT)

30 Oct, one afternoon, 5 chats (~30 YouTube links):
- 16:12 (d7d1fac2) *"i want you to analyze/summarize a few youtube clips. you can delegate to other
  sessions"* — he already wanted one place that farms them out
- 16:16 (63517e37) *"analyze these videos, and tell me what you think"*
- 16:17 (1252fe1b) *"analyze these videos, give me a summary, and tell me what you think"*
- 16:17 (341f1aee) *"does this help me?"*
- 16:22 (35804777) *"analyze this video, summarize it and tell me what you think"*

1 Nov, 6 chats (four opened in the same minute, one per pile of books in Downloads):
- 11:11 (8bef978e, 91e53c6e) and 11:12 (49d2f8a6) *"give me a summary of these pdfs (it's in
  downloads folder)"*
- 11:12 (921e78cd) *"give me a summary of these books and does it help in trading?"*
- 17:20 (341f1aee) *"nothing i can get from these videos?"*
- 17:33 (91e53c6e) *"anything i can get out of these? or are some information outdated"*
- 21:42–21:45 (921e78cd, an X post) *"Tell me what you think"* · *"I want to see what we can take
  away from this"*

Two days, 11 chats, the same ask each time: summarise it, and say what we can take from it.

## What exists

- Nothing that takes a pile of links or files and writes the summaries. Grepped both repos
  (CLAUDE.md, docs/, lib/, handlers/, IDEAS.md) and trading-signals for "youtube", "digest",
  "reading list", "yt-dlp": no tool, page or job.
- trading-signals has its own loop for trading books: `docs/book-findings.md` (what each batch
  taught, what was tested, what was built; six batches since 28 Oct). A digest should hand
  trading books to that loop, not replace it.

## The proposal, in plain words

One place to drop things to read or watch — videos, book files, posts. A helper writes one short
summary each, always in the same four parts: what it says, what is useful for us, what we already
do (see `reuse-what-we-have`), what to skip. He then opens a chat only for the ones worth talking
about, instead of opening one chat per pile.

## The automation (one line)

A 📚 Reading drop: links or files sent to one Telegram topic (or put in one Mac folder for big
book files) → a worker on plan usage writes the four-part summary back under each, and passes
trading books to trading-signals' book-findings list.

(Building notes for the session that builds it: Telegram bots cannot fetch files over 20 MB, and
most of the 1 Nov books are bigger — so the Mac folder is the way in for books; links and small
files can go through Telegram. Cost: plan usage, one Sonnet-sized summary per item; say this before
building.)
