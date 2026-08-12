#!/usr/bin/env python3
"""Propose Notes-numbered names for Revision/{EM,JC,S2,S1}. Writes a table; renames nothing."""
import re, difflib
from pathlib import Path

D = Path.home()/"Library/CloudStorage/Dropbox/Apps/AdrianMathNotes"

# Series prefixes Adrian uses, longest first so `REV 1` doesn't eat `2 REV`.
PREFIX = re.compile(
    r"^(?:N\s+LEVEL\s+REVISION|JC[12]\s+REV|O\s+REV|\d+\s+REV(?:\s+AM|\s+EM)?|REV\s+\d+|REV)\s*", re.I)
# "Algebra 2a", "Algebra 6A" -- a grouping label, not part of the topic name.
GROUP = re.compile(r"^Algebra\s+\d+[a-zA-Z]?\s*", re.I)
# trailing editorial notes: (With Worked Examples), (2019), (Amended), (Optional)
TRAILING = re.compile(
    r"\s*\((?:w[it]{2}h\s+worked\s+examples?|worked\s+examples?|with\s+examples?|amended|optional|"
    r"just\s+examples?|from[^)]*|\d{4}[^)]*|another\s+version|amending[^)]*)\)\s*", re.I)


def clean(stem: str) -> str:
    s = PREFIX.sub("", stem).strip()
    s = GROUP.sub("", s).strip()
    prev = None
    while prev != s:
        prev = s
        s = TRAILING.sub(" ", s).strip()
    # Brackets carry BOTH kinds of thing, so decide by what survives:
    #   JC  `Series and Sequences (Mainly from Promos 2019 to 2021)` -> drop it
    #   S2  `Algebra 2 (Factorization)`                              -> keep it
    # Try dropping every parenthetical; if that leaves a real topic, the brackets
    # were editorial. If it leaves nothing, the topic was inside them, so unwrap.
    dropped = re.sub(r"\(.*?\)", " ", s)
    dropped = re.sub(r"\s+", " ", dropped).strip()
    s = dropped if dropped else s.replace("(", " ").replace(")", " ")
    s = re.sub(r"\s+", " ", s).strip()
    # a trailing "Practice" is Adrian's word for the sheet, not the topic
    s = re.sub(r"\s+Practice$", "", s, flags=re.I).strip()
    return s


def norm(s: str) -> str:
    # `Algebra 2 Factorization` (Notes) and `Factorization` (Revision) are the
    # same topic -- drop the grouping label on BOTH sides so they meet.
    s = GROUP.sub("", s.strip())
    s = re.sub(r"[^a-zA-Z0-9 ]", " ", s.lower())
    s = re.sub(r"\b(and|the|of|with|practice|revision|rev)\b", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def notes_topics(level: str):
    """number -> canonical topic text, preferring the non-(corrected) filename."""
    out = {}
    for p in sorted((D/"Notes"/level).glob("*.docx")):
        if p.name.startswith("~$"):
            continue
        m = re.match(r"^(\d{1,2})([A-Za-z]?)\s+(.*)$", p.stem)
        if not m:
            continue
        num, topic = int(m.group(1)), m.group(3)
        corrected = "(corrected)" in topic.lower()
        topic = re.sub(r"\s*\(corrected\)", "", topic, flags=re.I).strip()
        # Notes carries editorial brackets too -- `04 Functions 1 (Amended)`.
        # Strip them on this side as well, or they never meet the cleaned
        # Revision name and JC collapses to "no match".
        prev = None
        while prev != topic:
            prev = topic
            topic = TRAILING.sub(" ", topic).strip()
        topic = re.sub(r"\s+", " ", topic).strip()
        key = norm(topic)
        if not key:
            continue
        if key not in out or (out[key][2] and not corrected):
            out[key] = (num, topic, corrected)
    return out


def match(level: str):
    nt = notes_topics(level)
    keys = list(nt)
    rows = []
    stems = sorted({p.stem for p in (D/"Revision"/level).iterdir()
                    if p.suffix.lower() in (".docx", ".pdf") and not p.name.startswith("~$")})
    for stem in stems:
        topic = clean(stem)
        key = norm(topic)
        num, how = None, ""
        if key and key in nt:
            num, how = nt[key][0], "exact"
        elif key:
            # containment either way -- "Vectors" vs "Vectors 1"
            cands = [k for k in keys if k.startswith(key) or key.startswith(k)]
            if cands:
                cands.sort(key=lambda k: (abs(len(k) - len(key)), nt[k][0]))
                num, how = nt[cands[0]][0], "contains"
            else:
                close = difflib.get_close_matches(key, keys, n=1, cutoff=0.80)
                if close:
                    num, how = nt[close[0]][0], "fuzzy"
        proposed = f"{num:02d} {topic} Revision" if num is not None else ""
        rows.append((stem, topic, num, how, proposed))
    return rows


LEVELS = ["EM", "JC", "S2", "S1"]
out = ["# Proposed Revision → Notes naming — EM, JC, S2, S1",
       "",
       "Generated 2026-08-13. **Nothing has been renamed.** AM is already done.",
       "",
       "`exact` / `contains` = safe. `fuzzy` = check it. blank = no Notes topic matched;",
       "my default is to LEAVE THOSE ALONE rather than invent a number.",
       ""]
for lv in LEVELS:
    rows = match(lv)
    ok = sum(1 for r in rows if r[3] in ("exact", "contains"))
    fz = sum(1 for r in rows if r[3] == "fuzzy")
    no = sum(1 for r in rows if not r[3])
    # Several distinct sheets can reduce to the same proposed name -- JC has five
    # `Graphing Techniques` variants. Flag them; each needs a distinguishing
    # suffix (or an archive decision) before anything is renamed.
    counts: dict[str, int] = {}
    for *_, proposed in rows:
        if proposed:
            counts[proposed] = counts.get(proposed, 0) + 1
    clash = sum(1 for p, c in counts.items() if c > 1)
    out += [f"## {lv} — {len(rows)} files: {ok} safe, {fz} to check, {no} no match"
            + (f", **{clash} name(s) claimed by more than one file**" if clash else ""), "",
            "| current | how | proposed |", "|---|---|---|"]
    for stem, topic, num, how, proposed in rows:
        mark = " ⚠ COLLIDES" if proposed and counts[proposed] > 1 else ""
        out.append(f"| `{stem}` | {how or '—'} | {proposed or '*leave*'}{mark} |")
    out.append("")
p = Path(__file__).parent/"PROPOSED-REVISION-NAMING.md"
p.write_text("\n".join(out), encoding="utf-8")
print(f"wrote {p}")
for lv in LEVELS:
    rows = match(lv)
    ok = sum(1 for r in rows if r[3] in ("exact", "contains"))
    fz = sum(1 for r in rows if r[3] == "fuzzy")
    no = sum(1 for r in rows if not r[3])
    print(f"  {lv:3} {len(rows):>3} files -> {ok:>3} safe, {fz:>2} check, {no:>3} no match")
