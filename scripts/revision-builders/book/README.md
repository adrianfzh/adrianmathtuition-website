# Stitching a revision set into one book

Seven stages, run in order, each writing into the next one's input folder. Built for the
S3 E Math set (15 Sep 2026); the AM book was built the same way. Run every stage under an
interpreter that has `python-docx`, `docxcompose` and `pypdf`.

| stage | script | what it does |
|---|---|---|
| 1a prep | `em_prep.py` + `plib.py` | copies the source sheets into `prepped/`, normalises section setup, bakes the per-paragraph tab ladders |
| 1b cut | `em_cut.py` + `clib.py` | removes the practice blocks — worked examples only |
| 1c sect | `em_sect.py` | gives every sheet a title block (some sheets carry their topic name only in the running head) |
| 1d bake | `em_bake.py` | **lifts each sheet's own `Normal` out as `SheetNormalWS`** — see below |
| 2 merge | `em_merge.py` | `docxcompose` in Adrian's topic order, first sheet as master |
| 3 finish | `em_finish.py` | contents cover with live hyperlinks, `Heading 1` + bookmark per section, trailing paragraph |
| 4 outline | `em_outline.py` | copies the Word-exported PDF and writes the bookmark sidebar over it |

Between 3 and 4, export the DOCX to PDF **through Word**, from Word's own container
folder (`~/Library/Containers/com.microsoft.Word/Data/Documents/adrianmath-export/`) —
never `rw.to_pdf` at a Dropbox path, and never over an existing file.

## Why stage 1d exists

`docxcompose` keeps the MASTER's `styles.xml`, so anything a sheet leaves to `Normal` is
silently re-resolved against the master's `Normal` once it is inside the book. The sheets
`worksheet_lib` writes declare `Normal` as Times New Roman 9.5 pt at 1.5 line spacing with
no space before or after; the sheets Adrian typed leave `Normal` bare. In the first E Math
build the four `worksheet_lib` sections lost theirs and grew +1, +2, +2 and +2 pages — his
page breaks, moved — while the other ten matched their solo exports exactly. Stage 1d
copies that `Normal` out as a style of its own, puts `pStyle` on every plain paragraph of
those sheets, and re-bases the styles that were `basedOn` Normal. Direct paragraph
formatting still wins, so nothing else moves.

Confirmed by a controlled A/B on 15 Sep 2026, after a contaminated export briefly made it
look unnecessary: the same merged book, copied to two fresh unique filenames, opened
separately and each given time to settle before `save as … format PDF` — **un-baked 97
pages, baked 90**, no blank page in either. The un-baked file still paginates to 97 after a
fifteen-minute settle, so this is the styles, not Word repaginating late. The 90-page
"un-baked" export that raised the doubt turned out to be page-for-page identical to the
baked book's: Word had exported the wrong open document (ADRIAN-STYLE §6).

## The check that must pass

Export every sheet on its own as well, and measure each section of the book against its
own solo export, live page for live page (a page is live if `pdftotext` yields ≥ 3
non-whitespace characters or `pdfimages -list` lists an image; a solo export usually ends
on one trailing blank page — discount it). Every section must match, and no page of the
book may be blank. Full rule: `.claude/skills/create-worksheet/ADRIAN-STYLE.md` §7.
