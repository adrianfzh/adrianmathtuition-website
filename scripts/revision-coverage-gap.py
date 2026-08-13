#!/usr/bin/env python3
"""Which Notes topics have NO revision sheet? AM, EM, JC.

Counts coverage from EVERY file in Revision/<level>, not just the renamed ones --
34 EM and 46 JC sheets were left unnumbered on purpose, and counting only
numbered files reports topics as missing that are in fact covered.

Every "missing" row prints its nearest existing sheet, because the interesting
failure here is a COMBINED sheet: `O REV Trigonometry and Circular Measure`
covers several Notes topics at once and no exact rule will agree with a human
about which. The nearest-match column is there for Adrian to overrule the
verdict, not to be trusted blindly.
"""
import re, difflib, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from propose_naming import D  # noqa: E402

STOP = {"and", "the", "of", "with", "practice", "revision", "rev", "a", "an",
        "to", "for", "in", "on", "from", "worked", "examples", "example",
        "amended", "combined", "miscellaneous", "questions", "version"}
# Series prefixes, incl. the `REV A …` form the first pass missed.
PREFIX = re.compile(
    r"^(?:N\s+LEVEL\s+REVISION|JC[12]\s+REV|O\s+REV|\d+\s+REV(?:\s+AM|\s+EM)?|"
    r"REV\s+[A-Z0-9]\b|REV)\s*", re.I)


def words(s: str) -> set:
    s = re.sub(r"\(.*?\)", " ", s)            # editorial + descriptive brackets
    s = re.sub(r"[^a-zA-Z0-9 ]", " ", s.lower())
    return {w for w in s.split() if w and w not in STOP and not w.isdigit()}


def notes_by_num(level: str):
    """number -> the CLEANEST topic name for it (shortest wins).

    Notes carries several files per number -- `18 Hypothesis Testing` and
    `18 Hypothesis Testing (Common Terminology)`. Keying on whichever came first
    picked the parenthesised one and then failed to match anything.
    """
    best = {}
    for p in sorted((D/"Notes"/level).glob("*.docx")):
        if p.name.startswith("~$"):
            continue
        m = re.match(r"^(\d{1,2})[A-Za-z]?\s+(.*)$", p.stem)
        if not m:
            continue
        num = int(m.group(1))
        topic = re.sub(r"\s*\(corrected\)", "", m.group(2), flags=re.I).strip()
        topic = re.sub(r"\s*\(.*?\)", "", topic).strip()
        if not topic:
            continue
        if num not in best or len(topic) < len(best[num]):
            best[num] = topic
    return best


def main():
    for level in ["AM", "EM", "JC"]:
        nb = notes_by_num(level)
        stems = sorted({p.stem for p in (D/"Revision"/level).iterdir()
                        if p.suffix.lower() in (".docx", ".pdf") and not p.name.startswith("~$")})
        seen_nums = {int(m.group(1)) for s in stems if (m := re.match(r"^(\d{1,2})\s+", s))}
        cleaned = [(s, words(PREFIX.sub("", s))) for s in stems]

        missing = []
        for num, topic in sorted(nb.items()):
            tw = words(topic)
            if not tw:
                continue
            if num in seen_nums:
                continue
            # covered when every significant word of the topic appears in one sheet
            if any(tw <= fw for _, fw in cleaned):
                continue
            # nearest sheet, by word overlap then string similarity
            best, score = None, 0.0
            for s, fw in cleaned:
                if not fw:
                    continue
                ov = len(tw & fw) / len(tw)
                sim = difflib.SequenceMatcher(None, topic.lower(), s.lower()).ratio()
                v = ov * 0.75 + sim * 0.25
                if v > score:
                    best, score = s, v
            missing.append((num, topic, best, score))

        print(f"\n{'='*74}\n{level} — {len(nb)} Notes topics · "
              f"{len(nb)-len(missing)} covered · {len(missing)} with NO revision sheet\n{'='*74}")
        for num, topic, best, score in missing:
            near = f"closest: {best}" if best and score > 0.28 else "nothing close"
            print(f"  {num:02d}  {topic}")
            print(f"        {near}")


if __name__ == "__main__":
    main()
