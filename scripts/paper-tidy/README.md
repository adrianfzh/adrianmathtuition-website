# Paper tidy-up — strip the source, add the answers

For a school paper PDF that goes to students: take off the header and footer and every
trace of the school, and put one answer page after each paper. Any model can run it;
Haiku 4.5 at low effort is enough (`docs/FANOUT.md` §9). Adrian, 3 Oct 2026: "make it a
script so any model can run it".

## Steps

1. **Copy the source to the scratchpad.** Never write over the original.
2. **Pull the answers from the bank:**
   ```
   node scripts/paper-tidy/tidy.mjs answers --school "Nan Hua" --year 2025 --level AM --out key.json
   ```
   Add `--exam Prelim` if the school has two papers that year. It prints which school it matched.
3. **Read `key.json` and tidy it** (this is the only judgement step):
   - one line per part: `["3(c)", "$C$ is obtuse"]`; maths inside `$…$`.
   - the FINAL answer only — no working, no mark codes. A proof is `"Shown"`.
   - fill every `TODO`; the build refuses while one is left.
   - a graph-reading answer says so: `"Gradient ≈ 0.46 (values from your graph)"`.
4. **Build:**
   ```
   node scripts/paper-tidy/tidy.mjs build --src in.pdf --answers key.json \
     --title "Sec 4 A Math Prelims Practice Set 5" --ban "Nan Hua,Kiasu" --out out/Set5.pdf
   ```
   - `--title` goes on the answer pages and in the file info. Never a school name.
   - `--ban` = the school name and any site name seen on the paper (comma-separated).
     Web addresses are always removed.
   - `--split 22` = last page of Paper 1, only if it cannot find "Paper 2" by itself.
   - `--white "35:517,533,556,543"` = extra white boxes (source page : x0,y0,x1,y1 in
     PDF points, 72 to the inch, from the top left) for a mark that is not text.
5. **Look at the previews** it writes beside the output (`out/Set5.preview/`): both answer
   pages, page 1, and every page it lists under "stray bits". A dash or mark left over
   from covered working → add a `--white` box and build again.
6. **Exit code 2 = the school name is still in the file.** Do not send it.
7. Save to `~/Dropbox/AdrianMath Work/worksheets/<name> (with answers).pdf` and hand it over.

## What it does

- Every page becomes a 220 dpi picture (32 colours, ~2 MB for 40 pages), so text hidden
  under white boxes — school name, footer, worked solutions — is gone, not covered.
- Header/footer = lines in the top or bottom 9% that repeat on ≥30% of pages, page
  numbers, "Turn over", plus any line anywhere with a `--ban` word or a web address.
- A line mostly hidden under white boxes is covered working; its visible bits are whited.
- Answer pages: KaTeX in local Chrome, shrinks from 11 pt to 9 pt to fit one page.
- File info (title, author, producer) is reset to AdrianMath.
