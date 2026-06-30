# TODO — work list for the build-test-fix loop

How to run it:

    /loop implement the next unchecked item in TODO.md, run npm test until it passes, check it off; stop when the list is empty

Rules:
- One task per line, each starting with `- [ ]` (unchecked) — the loop ticks it `- [x]` when done.
- Keep tasks small and specific (one focused change each).
- The loop does the top unchecked item, then runs `npm test` as proof before ticking it off.
- Replace the examples below with your real tasks.

## Tasks

- [ ] (example — replace me) Add a vitest test for `getInvoiceMonth()` covering the year-rollover (December → January)
- [ ] (example — replace me) Add a vitest test for `countOccurrencesInMonth()` for a 5-Monday month
