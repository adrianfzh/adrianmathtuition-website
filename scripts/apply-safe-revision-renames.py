#!/usr/bin/env python3
"""Apply ONLY the unambiguous Revision -> Notes renames for EM, JC, S2, S1.

Adrian, 2026-08-13: "for those that are safe just do it first. do for all
levels, except G2."

SAFE means both of:
  * the match was `exact` or `contains` -- not `fuzzy`, which he has not reviewed
  * the proposed name is claimed by exactly ONE file

The second condition is doing real work. A collision is not safe even when both
matches are individually confident: EM carries the same two-series structure as
AM (`O REV Algebra 2a Quadratic Equations` against `REV 3 Quadratic Equations`)
and both reduce to `01 Quadratic Equations Revision`. Those need the (S3)/(S4)
decision, so they are left exactly as they are.

No year tags are written here. Tagging EM is a separate call and would do
nothing until SEC3_LAST_TOPIC gains an `em` entry anyway -- inScope() returns
early for a level with no boundary.
"""
import argparse, shutil, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import re  # noqa: E402
from propose_naming import match, D, PREFIX  # noqa: E402

LEVELS = ["EM", "JC", "S2", "S1"]          # G2 excluded, per Adrian
SAFE_HOWS = {"exact", "contains"}

# Boilerplate that sits on nearly every file and carries no information.
BOILER = re.compile(r"\s*\(w[it]{2}h\s+worked\s+examples?\)", re.I)


def new_name(stem: str, num: int) -> str:
    """`NN ` + Adrian's own title, minus the series prefix.

    The matcher reduces a name to a bare topic so it can be compared against
    Notes; that reduced form must NOT become the filename. Doing so turned
    `REV 1 Numbers Practice (Prime Factorization HCF and LCM)` into
    `02 Numbers Revision` -- the filename IS the kiosk's display title, so that
    is information deleted from a student's screen. It also produced
    `11 Congruency and Similarity Revision Revision` and stranded a trailing
    "copy" mid-name.

    So: keep the title, swap the series prefix for the Notes number.
    """
    rest = BOILER.sub("", PREFIX.sub("", stem)).strip()
    rest = re.sub(r"\s+", " ", rest)
    return f"{num:02d} {rest}"


def plan(level: str):
    rows = match(level)
    # Collide on the ACTUAL new filename, not on the reduced topic form: two
    # sheets can share a topic and still keep distinct titles.
    counts: dict[str, int] = {}
    for stem, topic, num, how, proposed in rows:
        if proposed and how in SAFE_HOWS:
            n = new_name(stem, num)
            counts[n] = counts.get(n, 0) + 1

    keep, skipped = [], []
    for stem, topic, num, how, proposed in rows:
        if not proposed or how not in SAFE_HOWS:
            skipped.append((stem, how or "no match"))
            continue
        n = new_name(stem, num)
        if counts[n] > 1:
            skipped.append((stem, f"collides -> {n}"))
        else:
            keep.append((stem, n))
    return keep, skipped


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()

    grand = 0
    for level in LEVELS:
        folder = D/"Revision"/level
        keep, skipped = plan(level)

        # Never write over something already on disk.
        clashes = [(o, n) for o, n in keep
                   for ext in (".docx", ".pdf")
                   if (folder/f"{o}{ext}").exists() and (folder/f"{n}{ext}").exists()]
        if clashes:
            print(f"!! {level}: target already exists, refusing: {clashes}", file=sys.stderr)
            return 2

        print(f"\n=== {level} — renaming {len(keep)}, leaving {len(skipped)} ===")
        n = 0
        for old, new in sorted(keep, key=lambda t: t[1]):
            for ext in (".docx", ".pdf"):
                src = folder/f"{old}{ext}"
                if not src.exists():
                    continue
                print(f"  {ext[1:]:4} {old[:48]:48} -> {new}")
                if a.apply:
                    shutil.move(str(src), str(folder/f"{new}{ext}"))
                n += 1
        grand += n
        print(f"  ({n} file(s) on disk)")

    print(f"\n{'RENAMED' if a.apply else 'DRY RUN'}: {grand} file(s) across {', '.join(LEVELS)}")
    if not a.apply:
        print("re-run with --apply")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
