# Student data map — where everything about a student lives (5 Nov 2026)

> INTERNAL, for sessions only. Not for students, parents or any public page.
> Why it exists: Adrian (5 Nov 2026, "everything about a student in one place") — the coming student assistant
> and the data goal both need ONE record per student, whether the student uses Telegram or the app.
> Read-only survey. Counts are live reads of 5 Nov 2026 (math Supabase `adrianmathtuition`, Airtable base). The
> science Supabase project (`adrianscience`) was NOT surveyed — its student-keyed tables are a gap in this map.
> Re-run the counts before relying on them; they move daily.

## 1. Identities — how one person is named in each place

| Identity | Where it lives | What it looks like |
|---|---|---|
| **Airtable student record** | Airtable `Students` | `recXXXX`. 66 records: 35 Active, 1 Trial, 24 Graduated, 6 Inactive. The only record that has level, subjects, status, parent contact, enrolment. |
| **Telegram student chat** | Airtable `Student Telegram ID`; bot `lib/student-profile-cache.js` (60 min in memory), `lib/identity-cache.js` (10 min hit / 1 min miss) | number. Only **13** of 66 students (5 of 36 Active/Trial) have one filled in. |
| **Telegram parent chat** | Airtable `Parent Telegram ID` | number. 4 records. Bot treats the chat as role `parent` (read-only, no student settings). |
| **App (portal) account** | `portal_accounts` | uuid `id`, `airtable_student_id` (never null, 21/21), `email`, `telegram_chat_id` (9/21), `prefs` jsonb (12/21), `subjects`, `level`, `is_ip`. |
| **Portal identity string** | `portalIdentity(account)` in `src/lib/portal-auth.ts` | = `airtable_student_id` if set, else `acct:<uuid>`. Most app tables key on this. |
| **Web chat visitor** | `chat_conversations.chat_key` | `tg-<chatid>` (Telegram), `web-<hash>` (anonymous website visitor), `portal` (app), plus `replay`/`staging` test keys. 283 keys. |
| **Stranger** | nothing | Telegram chat with no Airtable match. Only a row in `conversation_history`. Not a person we can name. |
| **Tutor-portal student** | `tutor_accounts` (1 tutor), `tutor_papers.tutor_student_id`, marking runs with `student_id = 'tutor:<uuid>'` | Separate namespace on purpose (invite-only, hidden). Never matches Airtable. |
| **Admin** | key `admin:<chatId>` in a few bot tables | So Adrian can test student-only settings. |

**The Airtable id is the spine.** Almost everything durable is keyed by it. The Telegram chat id and the app account id are
two doors that each point at it.

### How they link (and where they don't)
- **App → Airtable:** always linked (`portal_accounts.airtable_student_id`, 21/21).
- **App ↔ Telegram:** by the in-app deep link (`src/lib/telegram-link.ts`, `/api/portal/telegram-link`, bot `lib/portal-link.js`). It writes `portal_accounts.telegram_chat_id` and fills Airtable `Student Telegram ID` only when that is empty. 9 accounts linked.
- **The bot never reads `portal_accounts`.** It identifies a student only through Airtable (chat id → record). So a student who lives in the app and never linked Telegram is invisible to the bot, and anything the app stores in `portal_accounts.prefs` is invisible to the bot.
- **Telegram → Airtable:** manual (`/register`, Adrian filling the field, or the hand-in identity confirm). Only 5 of 36 Active/Trial students have it.

### Live state (5 Nov 2026)
| State | Count |
|---|---|
| Airtable students Active+Trial | 36 |
| …of those with an app account | **2** |
| App accounts in total | 21 (so **19 accounts belong to Graduated/Inactive records or test/staff records** — check before treating as "users") |
| App accounts linked to Telegram | 9 |
| Active/Trial with Telegram ID in Airtable but **no app account** | 4 |
| Account's Telegram ID ≠ Airtable's Student Telegram ID | 1 (a person with two different chats) |
| Distinct Telegram chats ever in `conversation_history` | 35: 11 are a student, 1 a parent, **23 not in Airtable at all** (strangers, or students never registered) |
| Marked-run student ids | 40; 39 in Airtable, 1 tutor-portal student; **83 of 612 runs have no student id at all** |
| Notebook students | 33, all in Airtable |
| Parent links (`parent_links`) | 0 rows |

**Same person twice, unlinked:** (a) a student on Telegram with no Airtable Telegram ID → they are a "stranger" to the bot, and their chat and any hand-ins are not tied to their record; (b) a student with a Telegram chat and an app account whose two Telegram ids differ (1 found); (c) 23 history chats with no record; (d) web chats `web-<hash>` from the website are never tied to anyone; (e) 83 marked runs with no student id.

## 2. Every piece of student data

Key legend: **AT** = Airtable record id · **TG** = Telegram chat id · **ACCT** = portal account uuid / `portalIdentity`.
"Bot reads / App reads" = does the code read it today. "Restart" = survives a restart.

| Data | Stored in | Keyed by | Bot | App | Restart | Notes / rows |
|---|---|---|---|---|---|---|
| Student profile (name, level, subjects, status, parent contact) | Airtable `Students` | AT | yes (via TG→AT) | yes (via account→AT) | yes | Source of truth. Bot copy cached 60 min in memory. |
| App account, email, level, subjects, consent | `portal_accounts` | ACCT (+AT) | **no** | yes | yes | 21 rows. |
| Marked papers / marking runs | `paper_marking_runs` (+ `paper_marking_runs_bin`, `marking_batches`, `scan_inbox`, `paper_tag_log`, `marking_corrections`) | `student_id` = AT (or `tutor:<uuid>`), also `student_name` | yes | yes (`/app/marking`) | yes | 612 runs; 83 have no student id. The one record both doors share well. |
| My Error Logs / notebook mistakes | `notebook_mistakes` | `airtable_student_id` | via runs | yes | yes | 3,924 rows, 33 students. Entries/saves/private notes in `notebook_entries` (176), `notebook_saves`, `notebook_private_notes`. |
| App notebook (typed notes, folders, page checks) | `app_notebooks`, `app_notebook_folders`, `app_page_checks` | `user_id` (auth user uuid) | no | yes | yes | Tiny (2 / 5 rows). Keyed by auth user id, **not** by AT: a different key from the rest of the app. |
| Notes shown to a student (tutor notes) | `portal_notes`, `student_materials` (299), `student_shelf`, `student_worksheets` | AT | partly | yes | yes | |
| Practice attempts (app) | `student_attempts` (31 rows, 1 student), `unit_events`, `weakness_tags`, `student_outcome_ratings` | AT and/or `user_id` | no | yes | yes | Very little data so far. |
| Practice sheets made for a student | `sheet_jobs` (106), `sheet_sections`, `sheet_section_outcomes`, `portal_generated_papers`, `portal_generation_log`, `generation_requests`, `lesson_packs` (250), `remediation_plans`, `stretch_sets` | AT or `student_name` | bot makes them | yes | yes | `sheet_sections` and `sheet_jobs` also carry `student_name` — a name, not an id. |
| Learn-step progress ("done" units, map) | **browser `localStorage`** on `/app/learn`; events to `unit_events` | browser / ACCT | no | yes | **lost with browser** | The "done-map" is local; only events reach the server. Not visible to an assistant. |
| Q&A history — Telegram | `conversation_history` | TG (string) | yes | no | yes | 5,747 rows, 35 chats. Not tied to AT except by lookup. |
| Q&A history — web/app chat | `chat_conversations` + messages | `chat_key` (`tg-…`, `web-…`, `portal`) | yes (`web-history`) | yes | yes | 283 conversations; app chat uses `portal` as key, **not the student**. App sessions also remembered in browser `localStorage` (`ask-client`) and `sessionStorage` (`RecallChat`). |
| Student memory ("losing marks in…") | **in memory only** (`lib/student-memory.js`) | AT | yes | no | **no** — rebuilt from marking runs, 6 h TTL, first turn after restart is empty | Derived data, not stored. |
| Image context in a chat | `chat_image_context` (28) | TG | yes | no | yes | |
| Settings: hint first | `answer_prefs` (0 rows) | AT (or `admin:<chat>`) | yes | **no** | yes | Bot-only switch. Strangers/parents always off. |
| Settings: practice reminder | `practice_reminders` (0 rows) | **TG** | yes | no | yes | Telegram-only: an app-only student cannot have one. |
| Settings: app prefs | `portal_accounts.prefs` jsonb | ACCT | no | yes | yes | Keys in use: `combined_science`, `sciences` (11), `push_asked` (10), `humanities_elective` (3), `ask_signal` (2), `exam_countdown` (1). |
| Settings: new settings tables | `settings_events`, `setting_suggestions`, `setting_suggestion_asks` (all 0 rows) | TG + `student_key` (AT) | yes | no | yes | Landed 5 Nov, empty. |
| Exam dates | Airtable `Exams` (linked from `Students`) + `school_exam_scans` (0) | AT | no | yes (`/app/focus`, admin progress) | yes | App also has `prefs.exam_countdown`: **a second copy of an exam date, only in the app**. |
| Assignments ("from your tutor") | `portal_assignments` (210) | AT | no | yes | yes | |
| Lessons, progress notes, schedule | Airtable `Lessons`, `student_progress_notes` (300) | AT | admin only | admin only | yes | Tutor-side. |
| Passes and plans | `portal_passes` (0 rows) | ACCT | no | yes | yes | Prototype tables. |
| Referrals | `referral_invoice_credits` (0), invite tokens `portal_invite_tokens` (30) | ACCT / AT | no | yes | yes | Airtable `Referral Reward Applied` flag is a second copy. |
| Invoices / payments | Airtable `Invoices` | AT | yes | no | yes | |
| Parent reports | `parent_digests` (60), `parent_reports` (0), `parent_links` (0), `parent_contacts`, `consent_records` | AT / parent contact id | yes | yes (`/parent/*`) | yes | Bot-made digests sit apart from the app's parent reports. |
| Safety / wellbeing events | `wellbeing_events` (0 rows) | `chat_key`, `student_key`, name | yes | no | yes | Landed, empty. |
| Answer reuse | `answer_reuse` (0), `answer_flags`, `chat_bank_answer_shadow`, `solver_grounding_log` (1,149), `qb_lookup_log` (1,959) | TG / `chat_key` | yes | no | yes | Logs about answers, keyed to a chat. |
| Photo checks | `app_page_checks` (5), `sketch_checks`, bot `photo-quality` | `user_id` / AT | yes | yes | yes | |
| Setting ideas | `setting_suggestions` | none (aggregate) | yes | no | yes | Not student data as such. |
| Trial bookings, WhatsApp | `trial_bookings`, `whatsapp_consent`, `whatsapp_outbound` | name / `student_id` | yes | no | yes | Sales side. |
| Kiosk | `kiosk_pairings`, `kiosk_prints` | `student_id` | no | no | yes | |
| Push subscriptions | `portal_push_subscriptions` | AT | no | yes | yes | |
| Humanities / essay marking | `humanities_runs` (3,053), `essay_runs` | AT + `student_name` | via worker | yes | yes | |
| Question traps | `question_traps` (427) | `students` array | yes | no | yes | |

## 3. Gaps — what a student assistant could not see today

1. **Two front doors, two keys.** The bot sees Airtable + Telegram chat; the app sees `portal_accounts` + `portalIdentity`. Only 9 accounts bridge them, and the bot never reads `portal_accounts`. An assistant started from the app would not see a student's Telegram history unless they linked; started from Telegram it would not see `prefs`, assignments or exam countdown.
2. **Only 5 of 36 Active/Trial students have a Telegram ID in Airtable, and only 2 have an app account.** Most active students are reachable by neither door as a *recognised* person. Neither door can build a record for them.
3. **Chat history is not tied to a student.** Telegram history is by chat id; web history by `chat_key`; app chat uses a literal `portal` key. 23 of 35 Telegram chats have no student record.
4. **Settings are split by door.** Hint first and the practice reminder are bot-only (reminder is keyed by Telegram chat); `prefs` is app-only. A student cannot set the same thing in both.
5. **Only in memory:** student memory ("losing marks in…"), identity and profile caches, hint-first cache.
6. **Only in the browser:** Learn "done" map (`localStorage`), app chat session id, chat history in `sessionStorage`, exam-paper sit answers (`localStorage`).
7. **Duplicated:** exam date (Airtable `Exams` vs `prefs.exam_countdown`); Telegram id (Airtable vs `portal_accounts`, 1 mismatch); referral flag (Airtable vs credits table); student **name** copied into `sheet_jobs`, `sheet_sections`, `humanities_runs`, `essay_runs`, `wellbeing_events` etc. (rename/merge hazard); parent digests (bot) vs parent reports (app).
8. **Unattached rows:** 83 marked runs without a student id.
9. **Not surveyed:** the science Supabase project, bot-side files/Fly volumes, Dropbox filing, Airtable tables other than `Students`.

## 4. Recommendation — one shared "student record" reader

**Idea.** One small function, `getStudentRecord(identity)`, that takes ANY door's identity (Telegram chat id, portal account, Airtable id, or `web-…` key) and returns the same shape:
`{ airtableId, name, level, subjects, links: {telegramChatId, accountId, parentChatIds}, settings, examDate, ... }` — or `null` for a stranger. It reads; it does not move any data. Both repos call it (the bot over a signed internal route, as with ask-token / telegram-link, or a copy of the same query).

**Smallest first step (no table moves):**
1. Write ONE resolver: `resolveStudent({chatId | accountId | airtableId | chatKey}) → airtableId`. It uses Airtable `Student Telegram ID`, then `portal_accounts.telegram_chat_id`, so the 4 active students with a Telegram ID but no app account, and the 1 mismatch, resolve to the same person.
2. Return only the **spine**: Airtable id, name, level, subjects, both door links, role (student / parent / stranger). Put it in the website (`src/lib/student-record.ts`) with a test, and expose it to the bot behind `BOT_INTERNAL_SECRET`.
3. Switch ONE reader on each side to it: the bot's `identity-cache` lookup, and the app's chat history key (so `portal` chats get the student id).
4. Report the leftovers it finds (strangers, mismatched ids, runs with no student) as a weekly list for Adrian.

**Then, in this order:** put chat history under the AT key; move the practice-reminder key from TG to AT; make `prefs.exam_countdown` read from Airtable `Exams`; add a `student_record` view that unions the tables in §2 by AT. Data goes to one place gradually; the resolver comes first because every later step needs "who is this?" answered the same way in both doors.

**Do not** merge the tutor-portal namespace (`tutor:<uuid>`) into this; it stays separate by design (SPEC-TUTOR-TOOLS §7).

Privacy: any new reader or view is internal; PDPA applies; don't expose this map's contents to students or in any public page.
