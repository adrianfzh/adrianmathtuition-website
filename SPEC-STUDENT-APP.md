# SPEC — the student app (unlisted App Store app)

> **23 Sep 2026: [`SPEC-COMPANY.md`](SPEC-COMPANY.md) proposes the public version** — both stores, in-app purchase, self-serve sign-up (§4, §10 step 6). The unlisted iOS app below is its first step, unchanged.

Agreed 18 Sep 2026 (Adrian: "let's do unlisted app store app"). Nothing built yet.
Why: writing on a marked paper only feels like GoodNotes in a **native** app — Apple's
PencilKit reads the Pencil ~240 times a second, predicts the stroke, rejects the palm in
hardware, and none of that is available to a web page. The web version (18 Sep,
`docs/MARKING.md` §The paper opens on its pages) stays for everyone without the app.

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
