# SPEC — the student app (unlisted App Store app)

> **23 Sep 2026: [`SPEC-COMPANY.md`](SPEC-COMPANY.md) proposes the public version** — both stores, in-app purchase, self-serve sign-up (§4, §10 step 6). The unlisted iOS app below is its first step, unchanged.

Agreed 18 Sep 2026 (Adrian: "let's do unlisted app store app"). **31 Oct 2026: v1 of the native note-taking app is built — §0b.** The web-shell plan in §1–§4 is not built.
Why: writing on a marked paper only feels like GoodNotes in a **native** app — Apple's
PencilKit reads the Pencil ~240 times a second, predicts the stroke, rejects the palm in
hardware, and none of that is available to a web page. The web version (18 Sep,
`docs/MARKING.md` §The paper opens on its pages) stays for everyone without the app.

## 0. Direction, 31 Oct 2026 — a learning app with notes that get marked

Adrian, 31 Oct 2026: *"We need a mobile app … well designed app that students can use. For starters
we can put marking capabilities in it first, and also note taking"* … *"Just write on our app
(interface like notability and goodnotes) and get it marked immediately"* … *"Their interface should
be like most Apple apps - sleek and modern."* Also: a monthly subscription plus some free services.

- **The idea:** "GoodNotes that marks your maths". Students write notes and working with the Pencil in
  OUR app; **Check this page** marks that page straight away (red pen, what went wrong, the checked
  picture), and every mistake goes into a spaced review ("today's review").
- **Look:** sleek and modern, like Apple's own apps — plain white/grey grounds, one accent colour,
  large clear type, rounded cards. Mock-up (iPad home, writing page, checked page, iPhone today,
  iPhone marked paper): https://claude.ai/artifact/Rd39fpZqFs2QK6f2NEyafJ
- **First version:** hand in + marked papers, notes with Check this page, a push when a paper is
  marked. iPad + iPhone first.
- **Free vs paid (a proposal, not decided):** free = notes, ready-made topic notes, a few Asks a day,
  1 marked paper a month; paid monthly = marked papers + page checks, Practice Again, review, parent
  view. Price and credits follow `SPEC-COMPANY.md` §7 / §7.1.
- **Check before building on it:** every Singapore secondary student gets a school device (the PLD),
  but schools choose iPads OR Chromebooks, and the Apple Pencil is in some schools' bundles, not all.
  School devices are managed by the school and may not allow our app — students may use it on their
  own phone or iPad. Android/Chromebook matters for that reason.

## 0b. Version 1 BUILT, 31 Oct 2026 — the note-taking app (blank canvas first)

Adrian, 31 Oct 2026: *"Let's build the app like notability first. Blank canvas primarily"* and
*"Build for Apple Store"*. So v1 is a **native** iPad + iPhone note-taking app — no web shell,
no login, no marking yet. Everything stays on the device.

**What v1 does (tested in the iPad Pro 11" and iPhone 17 Pro simulators):**
- **Library** — a grid of notebooks (cover colour, title, page count, "edited 2 minutes ago");
  "+" to make one (title, cover colour, paper); long-press to rename, change cover/paper, move
  to a subject, or delete (asks first). Sort by last edited, title or date created. Optional
  **subjects** (e.g. "A Math", "Physics") as chips across the top.
- **Writing** — Apple's own PencilKit: pen, pencil, marker, eraser, lasso, ruler, colours (the
  system tool bar), undo/redo, pinch zoom. Pages run top to bottom like Notability; a new page
  appears by itself when you write near the end of the last one, or "Add Page" in the ⋯ menu.
  Paper: Blank (default), Lined, Grid, Dotted — A4-shaped, always white (ink keeps its true
  colours in dark mode). On iPad only the Pencil draws and a finger scrolls; ⋯ → "Draw with
  Finger" changes that (on iPhone the finger draws by default). Tap the title to rename.
- **Pages** — the grid button (iPhone: ⋯ → Pages) shows every page small: tap to jump, drag
  to reorder, long-press to insert, move or delete.
- **Saving** — automatic, a moment after each stroke and when the app is left. Each notebook is
  a folder: `notebook.json` + one ink file per page. Survives closing the app (checked).
- **Export** — ⋯ → "Export This Page / Notebook as PDF" → the share sheet (AirDrop, Files, Mail…).

**Where the code is:** `ios-shell/Notebook/` (inside `ios-shell/` so a push builds nothing on the
website). SwiftUI + PencilKit, Swift 6, iOS 17+, no outside libraries. The Xcode project is
generated from `project.yml`. Storage sits behind a `NotebookStore` protocol so a syncing store
can be added later without touching the screens. The future **Check this page** button exists
in code behind `FeatureFlags.checkPage = false` — users see nothing.

**Build and run (on the Mac):**
1. `cd ios-shell/Notebook && xcodegen generate`
2. Open `Notebook.xcodeproj` in Xcode → scheme **NotebookApp** → pick an iPad or iPhone
   simulator → ▶ Run. (The simulator needs no signing.)
3. Tests: `xcodebuild -project Notebook.xcodeproj -scheme NotebookApp -destination 'platform=iOS Simulator,name=iPad Pro 11-inch (M5)' test`
   — `NotebookTests` (saving, loading, page add/delete/reorder, ink split across pages) and
   `NotebookUITests` (a walkthrough that creates notebooks, draws, adds a page, switches paper,
   exports, relaunches; screenshots go to `$TEST_RUNNER_SHOTS_DIR` when set).

**The name** is not decided: the home-screen name "Notebook" is set in ONE place,
`INFOPLIST_KEY_CFBundleDisplayName` in `project.yml`. Bundle id `com.adrianmath.notebook` is a
placeholder until the name is chosen. The icon is a placeholder (white page + blue tick on blue,
`scripts/make-icon.py`).

**NOT built yet:** marking (Check this page), sync to our server, accounts/login, subscriptions or
in-app purchase, the hand-in camera scanner, push notifications, typed text / images / PDFs
inside a notebook, search, iCloud backup of notes.

**What Adrian must do for the App Store (in order):**
1. **The company enrols in the Apple Developer Program as an organisation** (US$99 a year) — needs
   the company's **D-U-N-S number** (free, takes one to two weeks). See §3.
2. Tell us the **app name** — then the bundle id and the home-screen name are set to match.
3. In Xcode, add the company's **signing team** (one setting in `project.yml`: `DEVELOPMENT_TEAM`).
4. Create the **App Store Connect listing**: name, description, category (Education), age rating,
   price (free for v1), and a **privacy page** link (v1 collects nothing; the app's privacy file
   already says no tracking, no data collected).
5. **Screenshots** for the listing (iPad 13" and iPhone 6.9") — we can produce them from the
   simulator once the name and icon are final.
6. TestFlight with 2–3 students, then submit for review.

- **Blank canvas only (31 Oct 2026, Adrian: "Just have blank canvas, like notability")** — the lined / grid / dotted choice is hidden behind `FeatureFlags.paperStyles = false` (`NotebookApp/App/AppBrand.swift`); every new page is blank. The paper code stays for later.
- **Write on a PDF (31 Oct 2026, Adrian: "Yes, PDFs next")** — BUILT, simulator-tested. Three ways in: **Import PDF** on the library (a new notebook named after the file), **⋯ → Insert PDF…** in a notebook (pages go in after the page on screen; a brand-new blank notebook is replaced), and **"Open in Notebook"** from Files / WhatsApp / Mail (`CFBundleDocumentTypes` in `project.yml`). One notebook page per PDF page; the PDF is kept once per notebook (`documents/<id>.pdf`, deleted when no page uses it) and each page points at it (`Page.background`). The PDF page is drawn under the ink only near the screen and redrawn sharp after a zoom (`PaperCanvasView.refreshPDFPictures`); export keeps it as vectors. Code: `NotebookApp/Model/PDFPages.swift`; tests `NotebookTests/PDFImportTests.swift` + UI `test5_WorksheetPDF` (`WORKSHEET_PDF=<path>`). Not yet tried on a real iPad with a Pencil.

## 0c. Check this page — BUILT 31 Oct 2026 (Adrian: "Yes, build it")

**What the student does:** writes on a page (blank, or a worksheet PDF) → taps **✓ Check This Page** →
"Checking this page…" → about a minute later red ticks and crosses sit at the end of each line of
working, a short red note beside each cross, and a sheet opens: the verdict first ("1 of 2 right"),
then per question what went wrong, what to do, and the answer. The red pen stays with the page
(saved in `notebook.json`, in thumbnails and in the PDF export); **Clear Red Pen** removes it;
checking again replaces it.

**How it works:**
- The app splits the page's pen strokes into **lines of writing** (`Check/HandwritingLines.swift`:
  strokes sharing a fifth of their height are one line; a fraction bar reaches up and down so a
  stacked fraction stays one line; a stroke taller than 150 pt is a drawing of its own) and numbers
  them top to bottom.
- It sends ONE picture of the page (worksheet + ink + a small red circled number at the left of each
  line, `PageSnapshot`) and the list of line boxes.
- The marker answers **by line number** ("line 3: cross, should be 10 > 5x") — never by coordinates,
  which models guess badly. The app already knows where line 3 is and draws the cross at its end.
- Server: `POST /api/app/check-page` (`lib/app-check-page.ts` = request check, prompt, reading the
  reply; tested). Same marker as practice grading (`GRADING_MODEL`). Rows in `app_page_checks`
  (kept OUT of `student_attempts`: a free page has no bank question, so it must not feed weakness
  tags, the Notebook or digests). **30 pages a student a day.** Tuition students free; a stranger
  needs an active pass (`requireActiveAccess`).
- **Sign-in:** the same email + password as the website (`POST /api/app/session`, `/refresh`); the
  two keys live in the iPad keychain; requests carry `Authorization: Bearer` (`lib/portal-auth
  bearerAccount`). Sign Out is in the ⋯ menu.
- **Switch:** `APP_CHECK_PAGE_OPEN_TO_STUDENTS = false` — only the demo student until the app ships.
- Debug builds talk to the test site (adrianmath-dev), release builds to www (`AppBrand.apiBase`).
- Tests: `NotebookTests/CheckPageTests.swift`; end-to-end UI `test6_CheckThisPage` (needs
  `WORKSHEET_PDF` + `APP_SESSION`; writes test working with a deliberate slip via `-seedHandwriting`).

**Not done yet:** a real iPad + Pencil try; the company's credit wallet (§ SPEC-COMPANY 7.1 — today
it is a daily cap, not credits); a wrong check giving the credit back; "Try a similar question".

## 0d. Notebook backup — BUILT 31 Oct 2026 (Adrian: "yes, but is that the best way?" → "yes")

**Why our server, not Apple's iCloud** (agreed 31 Oct 2026): iCloud would keep the notes inside the
student's own Apple account — Adrian can't see them, the website can't use them, no Android. On our
server the same notes open on any device the student signs in on, Adrian can see them before a lesson,
Check this page / the mistakes list / search can use them, and the data belongs to the business
(`SPEC-COMPANY.md` §14.5). The website's My Notebook already has search, photos and typed notes —
the app reuses them rather than building them twice (next steps below).

**What it does:**
- Signed in (the cloud at the top left of the library), every visit to the library and every return
  to the app compares the iPad's notebooks with the server's, one by one, by when each last changed:
  newer on the server → fetched; newer here or not on the server → sent; deleted elsewhere and not
  touched here since → deleted here. Subjects (folders) the same way, as one list.
- Only changed files travel: each file's SHA-256 is compared. The notebook open in the editor is never
  replaced underneath it.
- Files go straight to the private `student-files` bucket through signed addresses (no 4.5 MB cap):
  `notebooks/<identity>/<notebook-id>/{notebook.json, pages/<id>.drawing, documents/<id>.pdf}`.
- No live two-device editing (both writing at once): the newer copy wins. Students don't do that.

**Where:** app `NotebookApp/Store/NotebookBackup.swift` (+ the cloud button in `LibraryView`); server
`src/lib/app-notebooks.ts` (+ tests), `src/app/api/app/notebooks/route.ts` (list, subjects) and
`[id]/route.ts` (prepare → commit, fetch, delete); tables `app_notebooks`, `app_notebook_folders`
(`migrations/app_notebooks.sql`). Switch `APP_NOTEBOOK_BACKUP_OPEN_TO_STUDENTS` (closed — demo
student only). Erased by Delete my account (`lib/erasure.ts`). Health check `app-notebooks` (401).

**Checked 31 Oct 2026:** UI test `test7_BackupAndRestore` — a 23-page worksheet written on, sent, the
app wiped like a new iPad, signed in → the notebook came back with its writing (3 files, 0.5 MB).
Not yet checked: deleting on one device removing it on another (built, untested), a real iPad.

**Next (not built):** show the app's notebooks inside the website's My Notebook; a storage cap per
student (today 400 MB per notebook, none per student).

## 1. What it is

One iPad + iPhone app, "AdrianMath", for enrolled students only.

- **The shell**: a full-screen `WKWebView` on `https://www.adrianmathtuition.com/app` — the
  same app students use in Safari, same login (magic link), cookies kept. Text interaction
  off (`isTextInteractionEnabled = false`), so Live Text never eats a stroke. This is
  `ios-shell/AdrianMarker` generalised; that project becomes the second target of the same
  Xcode workspace (Adrian's marking shell), so one paid account signs both for a year.
- **The native part (what App Review needs, and what students feel):**
  1. **Write on my paper** — a native screen: the marked pages in a `UIScrollView`, a
     `PKCanvasView` over each page, the system tool picker (pen, highlighter, eraser,
     ruler, lasso, undo), pinch zoom, Pencil double-tap and squeeze. Opened by the web
     page through a bridge message (`window.webkit.messageHandlers.paper.postMessage({runId})`);
     the web "My paper" tab shows a **Write with Pencil** button only inside the app.
  2. **Hand in with the camera** — VisionKit's document scanner (`VNDocumentCameraViewController`):
     edge detection, de-skew, multi-page → the existing hand-in upload. Better scans = better marking.
  3. **Push notifications** (APNs) — "your paper is marked", Practice Again reminders; the
     web push the site already sends becomes a native token per device.
- **Not in v1**: offline mode, in-app purchases (the pass is sold on the web; the app never
  mentions buying — App Store rule 3.1.1), a parents' view, Android.

## 2. The ink contract (no second format)

The app reads and writes the SAME layer the web does: `GET/POST /api/portal/marking/ink`
(`student_ink`, strokes in page-image pixels — `lib/student-ink.ts`). Conversion lives in
the app: `PKStroke` path points (location, force) → `{tool, color, width, points[{x,y,p}]}`
scaled by page-image width ÷ view width; and back for display. A stroke the web drew opens
in the app and the other way round; "Adrian's notes" arrive read-only as an image layer.
Auth for those two calls: the WKWebView's cookie jar is shared with `URLSession` through
`WKHTTPCookieStore` — no new token type. The PKDrawing's native data is ALSO kept per page
(`student_ink.native`, a new nullable column, base64) so re-opening in the app is lossless
(PencilKit inks have texture our polyline cannot hold); the polyline stays the truth for
the web, the notes PDF and Adrian's view.

## 3. Distribution: unlisted

1. The **company** enrols in the **Apple Developer Program** (US$99/yr) **as an organisation**,
   with its D-U-N-S number (free, a week or two). *Changed 23 Sep 2026* — this line said
   "individual, the seller name shown is his own"; an individual account puts Adrian's name
   on the listing and makes the app his personal asset, which a buyer would make him move
   first (`SPEC-COMPANY.md` §14.2). The unlisted app can start on an individual account only
   if the company is not yet formed — then transfer it when it is.
2. The app goes through ordinary **App Review** as if public: demo login for the reviewer
   (the demo student, a marked paper with pages already on it), privacy labels (account
   e-mail, user content = hand-ins + ink, no tracking, no ads), age rating 4+, account
   deletion reachable in-app (Settings → Delete my account — exists on the web).
   Rule 4.2 (not just a website) is met by the three native parts in §1.
3. Once approved-ready, request **unlisted distribution** (Apple's form): the app gets a
   normal App Store link, is not searchable, no expiry, updates like any app. Students get
   the link from Adrian; without an account from him the app is a login screen.
4. TestFlight carries the beta (Adrian + two or three students) before review.

## 4. Build order

| Step | What | Needs Adrian |
|---|---|---|
| 0 | Enrol in the Developer Program; add the team to Xcode | yes — Apple ID, payment |
| 1 | Workspace: `AdrianMath` target (shell + bridge), `AdrianMarker` re-homed; bundle ids, icons (the app icon set), launch screen | no |
| 2 | Native paper screen + ink contract + `student_ink.native` migration + web "Write with Pencil" button (in-app only) | try it on the iPad |
| 3 | Document-scanner hand-in | try it |
| 4 | APNs: device-token route, the bot/site send path, the opt-in prompt | APNs key (one click in the developer portal) |
| 5 | TestFlight beta with 2–3 students, one week | pick the students |
| 6 | App Review submission + the unlisted request | screenshots approval, the form |

Steps 1–3 run in the simulator and on Adrian's iPad with the free account, so they can
start before the enrolment clears. Definition of done for v1: a student installs from the
link, signs in once, taps a marked paper, writes with PencilKit feel, and the ink is on the
website a second later.

## 5. Open questions for Adrian

- The app's name on the home screen: "AdrianMath"? And the icon — the site's mark on navy?
- iPhone too in v1 (camera hand-in is the phone's best feature), or iPad only first?
- Should Adrian's own marking shell move into the same app behind his login, or stay separate?
