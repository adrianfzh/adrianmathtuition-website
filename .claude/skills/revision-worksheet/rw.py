#!/usr/bin/python3
"""revision-worksheet — build a "(With Worked Examples)" sheet for a topic from the bank.

Three deterministic steps with the judgment left to the session in between:

    rw.py plan     --level S2 --topic Polygons [--examples 6] [--include-na]
    rw.py practice --dir <workdir> --picks "id8 id8:3 id8 ..."
    rw.py render   --dir <workdir> [--pdf] [--out <path.docx>]

plan     fetches the pooled question rows, maps the topic's aspects (bank subgroups,
         merged across the pooled levels), ranks candidate examples per aspect and
         writes plan.json — the checkpoint Adrian approves before anything is written.
practice picks the practice questions: nearest neighbours by embedding to each chosen
         example, inside the pool, never an example and never a question already on
         Adrian's own sheet for the topic. Writes practice.json.
render   imports the session's content.py (Notes, EXAMPLES, ANSWERS), runs verify.py
         if present, lays the sheet out with create-worksheet's worksheet_lib and lands
         the DOCX in Dropbox Revision/<folder>. Writes report.md.

Python: /usr/bin/python3 (the Apple one — it carries python-docx, lxml, Pillow, sympy).
"""
from __future__ import annotations
import argparse
import difflib
import json
import math
import os
import re
import subprocess
import sys
import tempfile
import urllib.parse
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import rw_content as C                     # noqa: E402  (also puts the two libs on sys.path)
import revision_lib as R                   # noqa: E402
from worksheet_lib import Worksheet        # noqa: E402

REPO = HERE.parent.parent.parent
BUILDERS = REPO / "scripts" / "revision-builders"

# ---------------------------------------------------------------- levels
# Which bank levels feed a sheet. Sec 4 E-Math holds every S1–S4 topic, so the
# whole E-Math family pools (Adrian, 5 Sep 2026); the target level's own rows are
# preferred and the others fill. A-Math and JC pool within their own families
# the way copy-revision-worksheet-with-different-practice already does.
FAMILY = {
    "S1":    ["S1", "S2", "S3_EM", "EM"],
    "S2":    ["S2", "S1", "S3_EM", "EM"],
    "S3_EM": ["S3_EM", "EM", "S2", "S1"],
    "EM":    ["EM", "S3_EM", "S2", "S1"],
    "S3_AM": ["S3_AM", "AM"],
    "AM":    ["AM", "S3_AM"],
    "JC1":   ["JC1", "JC2"],
    "JC2":   ["JC2", "JC1"],
}
NA_LEVELS = ["EM_NA", "S3_EM_NA"]
FOLDER = {"S1": "S1", "S2": "S2", "S3_EM": "EM", "EM": "EM",
          "S3_AM": "AM", "AM": "AM", "JC1": "JC", "JC2": "JC"}
LEVEL_LINE = {
    "S1": "Sec 1 Mathematics Revision", "S2": "Sec 2 Mathematics Revision",
    "S3_EM": "Sec 3 E Math Revision", "EM": "O Level E Math Revision",
    "S3_AM": "Sec 3 Additional Math Revision", "AM": "O Level Additional Math Revision",
    "JC1": "JC1 H2 Math Revision", "JC2": "H2 Math Revision",
}
LEVEL_TAG = {"S1": "S1", "S2": "S2", "S3_EM": "S3", "EM": "S4",
             "S3_AM": "S3", "AM": "S4", "JC1": "JC1", "JC2": "JC2"}
# A few tags were spelt differently at different levels; both spellings are fetched.
ALIASES = {
    "Coordinate Geometry": ["Coordinate Geometry (Lines)"],
    "Coordinate Geometry (Lines)": ["Coordinate Geometry"],
}
LEVEL_ALIASES = {"s1": "S1", "s2": "S2", "s3": "S3_EM", "s3em": "S3_EM", "s3 em": "S3_EM",
                 "em": "EM", "s4": "EM", "s4em": "EM", "s4 em": "EM",
                 "s3am": "S3_AM", "s3 am": "S3_AM", "am": "AM", "s4am": "AM", "s4 am": "AM",
                 "jc": "JC2", "jc2": "JC2", "h2": "JC2", "jc1": "JC1"}


def norm_level(s: str) -> str:
    k = s.strip().lower().replace("_", " ")
    if k in LEVEL_ALIASES:
        return LEVEL_ALIASES[k]
    if s.upper() in FAMILY:
        return s.upper()
    raise SystemExit(f"unknown level {s!r}; one of {', '.join(FAMILY)}")


# ---------------------------------------------------------------- PostgREST
def _creds():
    env = R.load_env()
    base, key = R.supabase_creds(env)
    return env, base, {"apikey": key, "Authorization": "Bearer " + key}


def _get(base, headers, path):
    data, _ = R._http_json(f"{base}/rest/v1/{path}", headers)
    if not isinstance(data, list):
        raise RuntimeError("Supabase error: %s" % json.dumps(data)[:300])
    return data


def _in(values) -> str:
    return "(" + ",".join(urllib.parse.quote(str(v), safe="") for v in values) + ")"


def _batched(base, headers, path_fmt, ids, size=120):
    out = []
    for i in range(0, len(ids), size):
        out += _get(base, headers, path_fmt.format(ids=_in(ids[i:i + size])))
    return out


def id8(qid) -> str:
    return str(qid)[:8]


# ---------------------------------------------------------------- pool
def fetch_family_pool(env, levels, topic, figures=True):
    """Every usable row tagged `topic` (or an alias) at any pooled level."""
    tags = [topic] + ALIASES.get(topic, [])
    seen, rows, per_level, rejected = set(), [], {}, defaultdict(int)
    for lv in levels:
        n_lv = 0
        for tag in tags:
            for r in R.fetch_pool(env, lv, tag, figures=figures):
                if r["id"] in seen:
                    continue
                seen.add(r["id"])
                ok, why = R.usable(r, figures=figures)
                if not ok:
                    rejected[why] += 1
                    continue
                rows.append(r)
                n_lv += 1
        per_level[lv] = n_lv
    return rows, per_level, dict(rejected)


def fetch_aspects(base, headers, levels, topic, ids):
    """Bank subgroups for the topic at the pooled levels, and which rows carry them."""
    tags = [topic] + ALIASES.get(topic, [])
    sgs = _get(base, headers,
               f"subgroups?select=id,level,topic,name,order_index&topic=in.{_in(tags)}"
               f"&level=in.{_in(levels)}&order=level,order_index")
    by_sg = {s["id"]: s for s in sgs}
    if not sgs:
        return [], {}
    links = _batched(base, headers,
                     "question_subgroups?select=question_id,subgroup_id,is_primary,confidence"
                     f"&subgroup_id=in.{_in(list(by_sg))}&question_id=in.{{ids}}", ids)
    return sgs, {"links": links, "by_sg": by_sg}


def _key(name: str) -> str:
    s = re.sub(r"[^a-z0-9 ]", " ", name.lower())
    s = re.sub(r"\b(the|a|an|of|from|for|in|and|with|to|one|find|finding|using|use|angles?)\b", " ", s)
    return " ".join(s.split())


def merge_aspects(sgs, links, levels):
    """Subgroup names differ per level ("Composite Polygon Figures" vs "Angles where two
    polygons meet"), so merge by fuzzy name across the pooled levels, ordered by the
    target level's own order first, then the richest other level's."""
    rank = {lv: i for i, lv in enumerate(levels)}
    aspects = []
    for s in sorted(sgs, key=lambda s: (rank.get(s["level"], 99), s.get("order_index") or 99)):
        k = _key(s["name"])
        home = None
        for a in aspects:
            if any(difflib.SequenceMatcher(None, k, _key(n)).ratio() >= 0.78 for n in a["names"]):
                home = a
                break
        if home is None:
            aspects.append({"names": [s["name"]], "levels": {s["level"]: s["name"]},
                            "sg_ids": [s["id"]], "order": s.get("order_index") or 99,
                            "order_level": s["level"]})
        else:
            if s["name"] not in home["names"]:
                home["names"].append(s["name"])
            home["levels"][s["level"]] = s["name"]
            home["sg_ids"].append(s["id"])
    by_sg = {sid: a for a in aspects for sid in a["sg_ids"]}
    for a in aspects:
        a["primary"], a["any"] = [], []
    for l in links:
        a = by_sg.get(l["subgroup_id"])
        if a is None:
            continue
        (a["primary"] if l.get("is_primary") else a["any"]).append(l["question_id"])
    for i, a in enumerate(aspects, 1):
        a["n"] = i
        a["label"] = a["levels"].get(a["order_level"]) or a["names"][0]
        a["primary"] = sorted(set(a["primary"]))
        a["any"] = sorted(set(a["any"]) - set(a["primary"]))
    return aspects


def aspect_hints(base, headers, aspects, rows):
    """Subgroup names differ per level and a string match cannot see that "Sum of
    interior angles equation" (S1) and "Find n from a mix of given angles" (EM) are
    one skill. The questions' embeddings can: each aspect gets the centroid of its
    members and the nearest aspects from OTHER levels are printed as `≈` hints, so
    the session collapses the list into a teaching arc with evidence, not guesswork."""
    ids = [q for asp in aspects for q in asp["primary"] + asp["any"]]
    if not ids:
        return
    emb = {e["id"]: _vec(e["embedding"]) for e in _batched(
        base, headers, "questions?select=id,embedding&embedding=not.is.null&id=in.{ids}", ids)}
    cents = {}
    for asp in aspects:
        vs = [emb[q] for q in asp["primary"] + asp["any"] if q in emb]
        if vs:
            cents[asp["n"]] = [sum(col) / len(vs) for col in zip(*vs)]
    for asp in aspects:
        c = cents.get(asp["n"])
        asp["like"] = []
        if c is None:
            continue
        for other in aspects:
            oc = cents.get(other["n"])
            if oc is None or other is asp or set(other["levels"]) & set(asp["levels"]):
                continue
            asp["like"].append((round(_cos(c, oc), 2), other["n"]))
        asp["like"] = sorted(asp["like"], reverse=True)[:3]


def sheet_overlap(folder, topic, rows):
    """Questions already on Adrian's own worked sheet for this topic — his authored
    Practice sections are bank-sourced, so a new sheet must not repeat them."""
    try:
        res = R.resolve_worked(folder, topic)
    except Exception:
        return None, set()
    try:
        txt = subprocess.run(["pandoc", str(res.path), "-t", "plain", "--wrap=none"],
                             capture_output=True, text=True, timeout=60).stdout
    except Exception:
        return str(res.path), set()
    hay = re.sub(r"[^a-z0-9]", "", txt.lower())
    hit = set()
    for r in rows:
        stem = re.sub(r"[^a-z0-9]", "", (r.get("question_text") or "").lower())
        if len(stem) >= 40 and stem[:60] in hay:
            hit.add(r["id"])
    return str(res.path), hit


def notes_source(level, topic):
    """Reuse a hand-authored Notes function from the August builders when one exists."""
    mod = {"S1": "build_s1", "S2": "build_s2"}.get(level)
    if not mod or not (BUILDERS / f"{mod}.py").exists():
        return None
    src = (BUILDERS / f"{mod}.py").read_text()
    for m in re.finditer(r"tags=\[([^\]]*)\].*?notes=(n_\w+)", src, re.S):
        tags = re.findall(r"'([^']+)'|\"([^\"]+)\"", m.group(1))
        tags = [a or b for a, b in tags]
        if topic in tags:
            return f"{mod}:{m.group(2)}"
    return None


def rank_candidates(rows_by_id, ids, levels, k=4):
    rank = {lv: i for i, lv in enumerate(levels)}

    def score(r):
        marks = int(r.get("total_marks") or 0)
        parts = len(C.sorted_parts(r))
        band = 0 if 3 <= marks <= 8 else 1
        return (R._tier(r), rank.get(r.get("level"), 9), band, -parts, -marks,
                -(int(r.get("year") or 0)))
    cands = sorted((rows_by_id[i] for i in ids if i in rows_by_id), key=score)
    return cands[:k]


def lite(r):
    return {"id": r["id"], "id8": id8(r["id"]), "level": r.get("level"), "school": r.get("school"),
            "year": r.get("year"), "marks": r.get("total_marks"), "parts": len(C.sorted_parts(r)),
            "figure": bool(R._images(r)), "tier": R._tier(r),
            "stem": preview(r)}


def preview(r, n=140) -> str:
    stem = (r.get("question_text") or "").strip()
    if not stem:
        parts = C.sorted_parts(r)
        stem = "(parts only) " + (parts[0].get("text") or "").strip() if parts else ""
    return " ".join(stem.split())[:n]


def cmd_plan(a):
    level = norm_level(a.level)
    levels = list(FAMILY[level]) + (NA_LEVELS if a.include_na and level in ("S1", "S2", "S3_EM", "EM") else [])
    if a.no_pool:
        levels = [level]
    env, base, headers = _creds()
    rows, per_level, rejected = fetch_family_pool(env, levels, a.topic)
    if not rows:
        raise SystemExit(f"no usable questions tagged {a.topic!r} at {levels}; check the tag "
                         f"spelling against worksheet-clerk/references/bank-topics.md")
    by_id = {r["id"]: r for r in rows}
    sgs, extra = fetch_aspects(base, headers, levels, a.topic, list(by_id))
    aspects = merge_aspects(sgs, extra.get("links", []), levels) if sgs else []
    tagged = {q for asp in aspects for q in asp["primary"] + asp["any"]}
    untagged = [i for i in by_id if i not in tagged]
    sheet_path, on_sheet = sheet_overlap(FOLDER[level], a.topic, rows)
    aspect_hints(base, headers, aspects, rows)
    for asp in aspects:
        pool_ids = [i for i in asp["primary"] + asp["any"] if i not in on_sheet]
        asp["candidates"] = [lite(r) for r in rank_candidates(by_id, pool_ids, levels)]
        asp["count"] = len(pool_ids)
        asp["count_by_level"] = dict(sorted(
            ((lv, sum(1 for i in pool_ids if by_id[i].get("level") == lv)) for lv in levels)))
    plan = {
        "level": level, "topic": a.topic, "levels": levels, "folder": FOLDER[level],
        "level_line": LEVEL_LINE[level], "level_tag": LEVEL_TAG[level],
        "examples_wanted": a.examples,
        "pool": {"total": len(rows), "by_level": per_level, "rejected": rejected,
                 "untagged": len(untagged)},
        "adrian_sheet": sheet_path, "on_sheet": sorted(id8(i) for i in on_sheet),
        "notes_source": notes_source(level, a.topic) or "draft",
        "aspects": aspects,
        "untagged_candidates": [lite(r) for r in rank_candidates(by_id, untagged, levels, k=6)],
        "rows": {r["id"]: r for r in rows},
    }
    out = Path(a.dir) if a.dir else Path(tempfile.mkdtemp(prefix=f"rw_{level}_"))
    out.mkdir(parents=True, exist_ok=True)
    (out / "plan.json").write_text(json.dumps(plan, indent=1, default=str))
    print_plan(plan, out)


def print_plan(plan, out):
    p = plan["pool"]
    print(f"\n# {plan['level']} · {plan['topic']}  —  pool {p['total']} usable "
          f"({', '.join(f'{k} {v}' for k, v in p['by_level'].items())}); "
          f"rejected {sum(p['rejected'].values())}; untagged {p['untagged']}")
    if plan["adrian_sheet"]:
        print(f"  Adrian's sheet: {Path(plan['adrian_sheet']).name} — "
              f"{len(plan['on_sheet'])} pool questions already on it (excluded)")
    print(f"  Notes source: {plan['notes_source']}")
    print(f"\n## Aspects ({len(plan['aspects'])}) — want ~{plan['examples_wanted']} examples, one per aspect")
    for asp in plan["aspects"]:
        lv = ", ".join(f"{k} {v}" for k, v in asp["count_by_level"].items() if v)
        like = "   ≈ " + ", ".join(f"{n} ({s:.2f})" for s, n in asp.get("like", [])[:2] if s >= 0.90) if asp.get("like") else ""
        thin = "  (thin)" if asp["count"] < 3 else ""
        print(f"\n{asp['n']:>2}. {asp['label']}   [{asp['count']} q: {lv}]{thin}{like.rstrip(' ≈')}")
        for c in asp["candidates"]:
            fig = " ◪" if c["figure"] else ""
            print(f"      {c['id8']}  {c['level']:<5} {str(c['school'] or '')[:22]:<22} {c['year'] or ''}  "
                  f"[{c['marks'] if c['marks'] is not None else '?'}] {c['parts']}p{fig}  {c['stem'][:90]}")
    if plan["untagged_candidates"]:
        print(f"\n## Untagged but usable ({plan['pool']['untagged']}) — top few, in case an aspect is missing")
        for c in plan["untagged_candidates"]:
            print(f"      {c['id8']}  {c['level']:<5} [{c['marks'] if c['marks'] is not None else '?'}] {c['parts']}p  {c['stem'][:90]}")
    print(f"\nplan.json → {out}\nnext: rw.py practice --dir {out} --picks \"id8 id8:3 …\"  (:N = practice items under that example)")


# ---------------------------------------------------------------- practice
def _vec(s):
    return json.loads(s) if isinstance(s, str) else list(s)


def _cos(u, v):
    dot = sum(a * b for a, b in zip(u, v))
    nu = math.sqrt(sum(a * a for a in u)) or 1.0
    nv = math.sqrt(sum(b * b for b in v)) or 1.0
    return dot / (nu * nv)


def cmd_practice(a):
    d = Path(a.dir)
    plan = json.loads((d / "plan.json").read_text())
    rows = plan["rows"]
    by8 = {id8(i): i for i in rows}
    picks, want = [], {}
    for tok in a.picks.replace(",", " ").split():
        k, _, n = tok.partition(":")
        if k not in by8:
            raise SystemExit(f"pick {k!r} is not in the plan's pool")
        picks.append(by8[k])
        want[by8[k]] = int(n) if n else 1
    env, base, headers = _creds()
    emb = {e["id"]: _vec(e["embedding"]) for e in _batched(
        base, headers, "questions?select=id,embedding&embedding=not.is.null&id=in.{ids}", list(rows))}
    excluded = set(picks) | {i for i in rows if id8(i) in set(plan["on_sheet"])}
    chosen, out = set(), []
    for seed in picks:
        sv = emb.get(seed)
        if sv is None:
            print(f"  !! {id8(seed)} has no embedding; falling back to same-aspect pool")
        same_aspect = {q for asp in plan["aspects"] if seed in asp["primary"] + asp["any"]
                       for q in asp["primary"] + asp["any"]}
        scored = []
        for qid, r in rows.items():
            if qid in excluded or qid in chosen:
                continue
            if sv is None and qid not in same_aspect:
                continue
            sim = _cos(sv, emb[qid]) if (sv is not None and qid in emb) else 0.0
            scored.append((sim, -R._tier(r), qid))
        scored.sort(reverse=True)
        take = [q for _, _, q in scored[:want[seed]]]
        take.sort(key=lambda q: (int(rows[q].get("total_marks") or 0), str(rows[q].get("year") or "")))
        for q in take:
            chosen.add(q)
            sim = next(s for s, _, qq in scored if qq == q)
            out.append({"id": q, "id8": id8(q), "seed": id8(seed),
                        "sim": round(sim, 3) if sv is not None else None,
                        "marks": rows[q].get("total_marks"), "level": rows[q].get("level"),
                        "school": rows[q].get("school"), "year": rows[q].get("year"),
                        "stem": preview(rows[q], 110)})
    budget = R.size_budget([rows[o["id"]] for o in out])
    over = budget["marks"] - a.max_marks
    while over > 0 and out:
        # drop the last item of whichever example has the most practice
        counts = defaultdict(int)
        for o in out:
            counts[o["seed"]] += 1
        heavy = max(counts, key=counts.get)
        victim = [o for o in out if o["seed"] == heavy][-1]
        out.remove(victim)
        over -= int(victim["marks"] or 0)
        budget = R.size_budget([rows[o["id"]] for o in out])
    practice = {"examples": [id8(p) for p in picks], "practice": out, "budget": budget}
    (d / "practice.json").write_text(json.dumps(practice, indent=1, default=str))
    print(f"\n## Practice — {len(out)} questions, {budget['marks']} marks, ~{budget['minutes']} min")
    for o in out:
        how = f"sim {o['sim']:.2f}" if o['sim'] is not None else "same aspect"
        print(f"   {o['id8']}  ← {o['seed']} {how:<11} {o['level']:<5} "
              f"{str(o['school'] or '')[:20]:<20} {o['year'] or ''} [{o['marks']}]  {o['stem'][:80]}")
    for w in budget["warnings"]:
        print("   ⚠", w)
    print(f"\npractice.json → {d}\nnext: write {d}/content.py (see authoring.md), verify.py, then rw.py render --dir {d}")


# ---------------------------------------------------------------- render
def _notes_from_builder(ws, spec):
    mod, fn = spec.split(":")
    sys.path.insert(0, str(BUILDERS))
    m = __import__(mod)
    getattr(m, fn)(ws)


def _notes_from_list(ws, notes):
    ws.para([C.B("Notes:")])
    for kind, val in notes:
        if kind == "head":
            ws.para([C.B(val)])
        elif kind == "para":
            ws.para(val)
        elif kind == "math":
            ws.math_block(val)
        elif kind == "mistakes":
            ws.para([C.B("Mistakes to avoid")])
            for i, e in enumerate(val, 1):
                ws.para([C.T(f"{i}.  ")] + C.sm(e))
        else:
            raise SystemExit(f"NOTES entry kind {kind!r} not understood")


def _figures(ws, row, figdir, inside_box=False):
    steps = []
    for j, f in enumerate(row.get("_figures") or []):
        fp = C.normalise_figure(f, figdir / f"{id8(row['id'])}_{j}")
        if fp is None:
            print(f"  !! figure unreadable, laid out without it: {id8(row['id'])}")
            continue
        if inside_box:
            steps.append(("figure", str(fp), min(8.0, C.figure_width_cm(f))))
        else:
            ws.figure(str(fp), width_cm=C.figure_width_cm(f))
    return steps


def cmd_render(a):
    d = Path(a.dir).resolve()
    plan = json.loads((d / "plan.json").read_text())
    practice = json.loads((d / "practice.json").read_text())
    rows = plan["rows"]
    by8 = {id8(i): r for i, r in rows.items()}
    sys.path.insert(0, str(d))
    if "content" in sys.modules:
        del sys.modules["content"]
    content = __import__("content")
    warnings = []

    if (d / "verify.py").exists():
        res = subprocess.run(["/usr/bin/python3", str(d / "verify.py")], capture_output=True, text=True)
        print(res.stdout[-2000:])
        if res.returncode != 0:
            raise SystemExit("verify.py failed — fix the working before rendering")
    else:
        warnings.append("no verify.py in the working dir — the numbers on this sheet were not machine-checked")

    examples = []
    for ex in content.EXAMPLES:
        k, concept, sol_rows = ex[0], ex[1], ex[2]
        letter = ex[3] if len(ex) > 3 else None
        if k not in by8:
            raise SystemExit(f"EXAMPLES id8 {k!r} is not in the plan pool")
        examples.append((by8[k], concept, sol_rows, letter))
    missing = [o["id8"] for o in practice["practice"] if o["id8"] not in content.ANSWERS]
    if missing:
        raise SystemExit(f"ANSWERS missing for practice questions: {missing}")

    env, base, headers = _creds()
    fig_rows = [r for r, *_ in examples] + [by8[o["id8"]] for o in practice["practice"]]
    for note in R.fetch_figures(env, fig_rows):
        warnings.append(f"figure: {note}")
    figdir = d / "figs"
    figdir.mkdir(exist_ok=True)

    ws = Worksheet()
    ws.title(getattr(content, "TITLE", plan["level_line"]))
    ws.subtitle(getattr(content, "SUBTITLE", f"{plan['topic']} (Past-Paper Edition)"))
    notes = getattr(content, "NOTES", None)
    if isinstance(notes, str) and ":" in notes:
        _notes_from_builder(ws, notes)
    elif notes:
        _notes_from_list(ws, notes)
    else:
        warnings.append("no Notes block")

    ws.page_break()
    ws.para([C.B("Examples")])
    for r, concept, sol_rows, letter in examples:
        parts = C.sorted_parts(r)
        psum = sum(int(p.get("marks") or 0) for p in parts)
        if parts and psum != int(r.get("total_marks") or 0):
            warnings.append(f"example {id8(r['id'])}: part marks {psum} ≠ total_marks {r.get('total_marks')}")
        if letter in (None, "", "a"):
            ws.concept(concept)
        ws.example(letter or None)
        stem = (r.get("question_text") or "").strip()
        if stem:
            ws.para(C.sm(stem), marks=None if parts else r.get("total_marks"))
        _figures(ws, r, figdir)
        for p in parts:
            ws.para([C.T(C.pad_label(p.get("label")))] + C.sm(p.get("text")), marks=p.get("marks"))
            for sp in p.get("subparts") or []:
                pp = ws.para([C.T(f"({sp['label']}) ".ljust(5))] + C.sm(sp.get("text")), marks=sp.get("marks"))
                pp.paragraph_format.left_indent = C.Cm(1.4)
        ws.solution_box(sol_rows, keep_together=not a.flow)

    ws.page_break()
    ws.para([C.B("Practice")])
    ws.para([C.I("Answers are at the end of each question. Show all working.")])
    ws.restart_numbering()
    for o in practice["practice"]:
        r = by8[o["id8"]]
        parts = C.sorted_parts(r)
        stem = (r.get("question_text") or "").strip()
        if stem:
            ws.Q(C.sm(stem), marks=None if parts else r.get("total_marks"))
            _figures(ws, r, figdir)
            for p in parts:
                subs = p.get("subparts") or []
                ws.SQ(C.sm(p.get("text")), marks=None if subs else p.get("marks"))
                for sp in subs:
                    pp = ws.para([C.T(f"({sp['label']}) ".ljust(5))] + C.sm(sp.get("text")), marks=sp.get("marks"))
                    pp.paragraph_format.left_indent = C.Cm(1.4)
        elif parts:
            first, rest = parts[0], parts[1:]
            C.hoist_Q(ws, first.get("label"), C.sm(first.get("text")), marks=first.get("marks"))
            _figures(ws, r, figdir)
            for p in rest:
                C.lit_part(ws, p.get("label"), C.sm(p.get("text")), marks=p.get("marks"))
        ws.ans(C.sm(content.ANSWERS[o["id8"]]))
        for para in ws._block_paras[:-1]:
            para.paragraph_format.keep_with_next = True
        ws._block_paras = []

    tall = [h for h in ws.glued_heights() if h > ws.PAGE_CM]
    if tall:
        warnings.append(f"{len(tall)} glued block(s) taller than a page — Word will break inside")

    if a.out:
        out = Path(a.out)
    else:
        name = f"{plan['topic']} Revision (With Worked Examples) (Past Papers) ({plan['level_tag']}).docx"
        out = R.REVISION_ROOT / plan["folder"] / re.sub(r"[/:]", "-", name)
    out.parent.mkdir(parents=True, exist_ok=True)
    ws.save(str(out))
    n_omml = subprocess.run(["bash", "-c", f"unzip -p '{out}' word/document.xml | grep -o 'm:oMath' | wc -l"],
                            capture_output=True, text=True).stdout.strip()

    rep = [f"# {plan['level']} · {plan['topic']} — {out.name}", "",
           f"- saved: `{out}`", f"- OMML equations: {n_omml}",
           f"- notes: {notes if isinstance(notes, str) else 'authored in content.py (drafted)'}",
           f"- examples: {len(examples)}   practice: {len(practice['practice'])} "
           f"({practice['budget']['marks']} marks, ~{practice['budget']['minutes']} min)", "",
           "## Examples (provenance stays OFF the sheet)"]
    for r, concept, _, letter in examples:
        rep.append(f"- Example{' ' + letter if letter else ''}: {concept} — {id8(r['id'])} "
                   f"{R.provenance(r)} [{r.get('total_marks')}] level {r.get('level')}")
    rep.append("\n## Practice")
    for o in practice["practice"]:
        rep.append(f"- {o['id8']} ← {o['seed']} (sim {o['sim']}) {R.provenance(by8[o['id8']])} "
                   f"[{o['marks']}] level {o['level']}")
    if warnings:
        rep.append("\n## Warnings")
        rep += [f"- {w}" for w in warnings]
    (d / "report.md").write_text("\n".join(rep) + "\n")
    print("\n".join(rep))

    if a.pdf:
        pdf = to_pdf(out)
        if pdf:
            pages = d / "pages"
            pages.mkdir(exist_ok=True)
            subprocess.run(["pdftoppm", "-r", "60", "-png", str(pdf), str(pages / "p")])
            print(f"\nPDF → {pdf}\npage images → {pages}  (LOOK at every page before handing over)")


def to_pdf(docx: Path):
    """Export through Microsoft Word (the only converter on the Mac that renders
    Cambria Math correctly). Returns the PDF path or None."""
    pdf = docx.with_suffix(".pdf")
    script = f'''
    set inFile to POSIX file "{docx}"
    set outFile to POSIX file "{pdf}"
    tell application "Microsoft Word"
        open inFile
        set d to active document
        save as d file name (outFile as text) file format format PDF
        close d saving no
    end tell'''
    try:
        subprocess.run(["osascript", "-e", script], check=True, capture_output=True, timeout=120)
        return pdf if pdf.exists() else None
    except Exception as e:
        print(f"  !! Word export failed: {e}")
        return None


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("plan")
    p.add_argument("--level", required=True)
    p.add_argument("--topic", required=True)
    p.add_argument("--examples", type=int, default=6)
    p.add_argument("--include-na", action="store_true", help="also pool EM_NA / S3_EM_NA")
    p.add_argument("--no-pool", action="store_true", help="target level only")
    p.add_argument("--dir", help="working dir (default: a fresh temp dir)")
    p.set_defaults(fn=cmd_plan)
    p = sub.add_parser("practice")
    p.add_argument("--dir", required=True)
    p.add_argument("--picks", required=True, help='"id8 id8:3 id8" — :N practice items under that example (default 1)')
    p.add_argument("--max-marks", type=int, default=40)
    p.set_defaults(fn=cmd_practice)
    p = sub.add_parser("render")
    p.add_argument("--dir", required=True)
    p.add_argument("--out", help="exact output path (default: Dropbox Revision/<folder>/…)")
    p.add_argument("--pdf", action="store_true", help="also export a PDF via Word and page PNGs to look at")
    p.add_argument("--flow", action="store_true", help="let solution boxes flow across pages")
    p.set_defaults(fn=cmd_render)
    a = ap.parse_args()
    a.fn(a)


if __name__ == "__main__":
    main()
