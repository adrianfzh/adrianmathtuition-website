#!/usr/bin/env python3
"""Rename Revision/AM onto the Notes numbering, tagging the year explicitly.

  3 REV AM <Topic>        -> NN <Topic> Revision (S3)      Adrian's Sec 3 series
  O REV NN <Topic>        -> NN <Topic> Revision (S4)      his O-Level series

Numbers come from Notes/AM. The (S3)/(S4) tag is what the kiosk filter reads:
the topic number says WHERE in the syllabus a sheet sits, and cannot say which
YEAR it is for -- `O REV 03 Surds` is topic 07, early, but is a Sec 4 sheet.

TWO FILES ARE DELIBERATELY NOT RENAMED. `REV AM Binomial Theorem (Worked
Examples)` and `REV S4_AM Binomial Theorem (Notes)` are the revision-worksheet
skill's OWN output. revision_lib's GENERATED_RE matches exactly that shape so a
later run doesn't clone its own output and compound the practice section.
Renaming them would break that guard.
"""
from pathlib import Path
import argparse, shutil, sys

AM = Path.home()/"Library/CloudStorage/Dropbox/Apps/AdrianMathNotes/Revision/AM"

# old stem -> new stem.  Written out in full rather than derived: this is a
# one-off rename of Adrian's real teaching files and it should be reviewable.
MAP = {
    # ---- Sec 3 series -------------------------------------------------------
    "3 REV AM Quadratic Functions (With Worked Examples)": "01 Quadratic Functions Revision (S3)",
    "3 REV AM Nature of Roots (With Worked Examples)":     "04 Nature of Roots Revision (S3)",
    "3 REV AM Polynomials (With Worked Examples)":         "05 Polynomials Revision (S3)",
    "3 REV AM Polynomials (With Worked Examples) 2":       "05 Polynomials Revision 2 (S3)",
    "3 REV AM Polynomials (With Worked Examples) 2 copy":  "05 Polynomials Revision 2 copy (S3)",
    "3 REV AM Partial Fractions (With Worked Examples)":   "06 Partial Fractions Revision (S3)",
    "3 REV AM Surds (With Worked Examples)":               "07 Surds Revision (S3)",
    "3 REV AM Indices (With Worked Examples)":             "08 Indices Revision (S3)",
    "3 REV AM Indices (With Worked Examples) (Without Graphs)":
        "08 Indices Revision (Without Graphs) (S3)",
    "3 REV AM Logarithms (With Worked Examples)":          "09 Logarithms Revision (S3)",
    "3 REV AM Indices and Logarithmic Graphs (With Worked Examples)":
        "10 Indices and Logarithmic Graphs Revision (S3)",
    "3 REV AM Indices and Logarithms Applications (Wtih Worked Examples)":
        "10 Indices and Logarithms Applications Revision (S3)",
    "3 REV AM Indices and Logarithms Graphs and Applications (Wtih Worked Examples) 2":
        "10 Indices and Logarithms Graphs and Applications Revision 2 (S3)",
    "3 REV AM Indices and Logarithms Graphs and Applications (Wtih Worked Examples) 3":
        "10 Indices and Logarithms Graphs and Applications Revision 3 (S3)",
    "3 REV AM Coordinate Geometry (With Worked Examples)": "11 Coordinate Geometry Revision (S3)",
    "3 REV AM Circles (With Worked Examples)":             "12 Circles Revision (S3)",
    "3 REV AM Binomial Theorem (With Worked Examples)":    "13 Binomial Theorem Revision (S3)",
    "3 REV AM Linear Law":                                 "14 Linear Law Revision (S3)",
    # Whole-syllabus sheets: no single topic, so no number. topicNumber() returns
    # null and they fail open, which is right -- the year tag still applies.
    "3 REV AM ALL TOPICS (With Worked Examples)":          "ALL TOPICS Revision (S3)",
    "3 REV AM OVERALL REVISION":                           "OVERALL Revision (S3)",
    "3 REV AM OVERALL REVISION (Just Examples)":           "OVERALL Revision (Just Examples) (S3)",

    # ---- O-Level (Sec 4) series --------------------------------------------
    # First topic wins where a sheet spans several Notes topics; the full title
    # still says what is inside.  01+03, and 05+06.
    "O REV 01 Quadratic Functions and Inequalities (With Worked Examples)":
        "01 Quadratic Functions and Inequalities Revision (S4)",
    "O REV 02 Polynomials and Partial Fractions (With Worked Examples)":
        "05 Polynomials and Partial Fractions Revision (S4)",
    "O REV 03 Surds (With Worked Examples)":               "07 Surds Revision (S4)",
    "O REV 04 Indices (With Worked Examples)":             "08 Indices Revision (S4)",
    "O REV 05 Logarithms (With Worked Examples)":          "09 Logarithms Revision (S4)",
    "O REV 06 Coordinate Geometry (With Worked Examples)": "11 Coordinate Geometry Revision (S4)",
    "O REV 07 Circles (With Worked Examples)":             "12 Circles Revision (S4)",
    "O REV 08 Binomial Theorem (With Worked Examples)":    "13 Binomial Theorem Revision (S4)",
    "O REV 09 Linear Law (With Worked Examples)":          "14 Linear Law Revision (S4)",
    # The four trig sheets are a SEQUENCE Adrian authored (1->2->3->4). Giving
    # them their true topic numbers (17, 15, 16, 19) would sort them 2,3,1,4 and
    # break that order, so the whole block takes the first trig topic, 15, and
    # keeps its own numbering in the title.
    "O REV 10 Trigonometry 1 Identities (With Worked Examples)":
        "15 Trigonometry 1 Identities Revision (S4)",
    "O REV 10 Trigonometry 2 Equations (With Worked Examples)":
        "15 Trigonometry 2 Equations Revision (S4)",
    "O REV 10 Trigonometry 3 Graphs and Applications (With Worked Examples)":
        "15 Trigonometry 3 Graphs and Applications Revision (S4)",
    "O REV 10 Trigonometry 4 R-Formula (With Worked Examples)":
        "15 Trigonometry 4 R-Formula Revision (S4)",
}

SKIP = {  # skill output -- see module docstring
    "REV AM Binomial Theorem (Worked Examples)",
    "REV S4_AM Binomial Theorem (Notes)",
}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()

    on_disk = {p.stem for p in AM.iterdir() if p.suffix.lower() in (".docx", ".pdf")}
    unmapped = sorted(on_disk - set(MAP) - SKIP)
    missing = sorted(set(MAP) - on_disk)

    if missing:
        print("!! mapping refers to files that do not exist:", file=sys.stderr)
        for m in missing:
            print(f"     {m}", file=sys.stderr)
        return 2
    if unmapped:
        print("!! on disk but not in the mapping (refusing to run):", file=sys.stderr)
        for u in unmapped:
            print(f"     {u}", file=sys.stderr)
        return 2

    # Collision check BEFORE moving anything.
    seen: dict[str, str] = {}
    for old, new in MAP.items():
        for ext in (".docx", ".pdf"):
            if (AM/f"{old}{ext}").exists():
                key = f"{new}{ext}"
                if key in seen:
                    print(f"!! collision: {old!r} and {seen[key]!r} both -> {key!r}", file=sys.stderr)
                    return 2
                seen[key] = old

    moved = 0
    for old in sorted(MAP):
        new = MAP[old]
        for ext in (".docx", ".pdf"):
            src = AM/f"{old}{ext}"
            if not src.exists():
                continue
            dst = AM/f"{new}{ext}"
            if dst.exists():
                print(f"  EXISTS, skipped: {dst.name}")
                continue
            print(f"  {ext[1:]:4} {old[:50]:50} -> {new}")
            if a.apply:
                shutil.move(str(src), str(dst))
            moved += 1

    print(f"\n{'RENAMED' if a.apply else 'DRY RUN'}: {moved} file(s); "
          f"{len(SKIP)} skill-generated file(s) left alone")
    if not a.apply:
        print("re-run with --apply")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
