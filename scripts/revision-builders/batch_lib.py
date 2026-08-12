#!/usr/bin/env python3
"""Config-driven builder for the S1/S2 revision sheets.

Difference from the four hand-built sheets (Kinematics, EM Statistics, EM
Speed-Time, EM Graphs of Functions), stated plainly so nobody assumes otherwise:

  * the Notes section is still hand-authored per topic -- that is the part with
    the teaching value and it cannot be generated
  * the worked examples RENDER THE BANK'S OWN STORED SOLUTION under a skill
    title, rather than being rewritten with fresh commentary in Adrian's voice.
    The maths is his pipeline's, already gated; what is missing is the
    "why this step" narration the first four sheets carry.
  * practice questions are selected programmatically (widest school spread,
    graduated by marks) instead of hand-picked

So these are complete and usable, but the examples read like model answers
rather than like teaching. Deepening any one of them is a follow-up, not a
rebuild -- the notes and the question selection stay.
"""
from pathlib import Path
import tempfile, re
from build_lib import sheet, save, render_practice, _normalise, T, B, I, M
import revision_lib as R

BAD_STEM = re.compile(r"^\s*$")


def pick(env, level, tags, want=14, min_marks=2, max_marks=10, prefer_text=True):
    """Choose practice questions: usable, real stem, spread across schools."""
    rows = []
    seen = set()
    for tag in tags:
        for r in R.fetch_pool(env, level, tag, figures=True):
            if r["id"] in seen:
                continue
            seen.add(r["id"])
            rows.append(r)

    def usable(r):
        # NOT filtered on `solution`: revision_lib's QCOLS does not select that
        # column, so r["solution"] is always absent here and requiring it
        # rejected every row (12 sheets built with zero questions before this
        # was caught). The practice half only needs a stem and an answer key;
        # solutions are fetched separately for the worked examples.
        if not (r.get("answer") or "").strip():
            return False
        if BAD_STEM.match(r.get("question_text") or ""):
            return False
        m = r.get("total_marks") or 0
        return min_marks <= m <= max_marks

    pool = [r for r in rows if usable(r)]
    pool.sort(key=lambda r: (r.get("total_marks") or 0, r.get("school") or "", r["id"]))
    # one per school first, so a sheet is not five questions from one paper
    out, used_schools = [], set()
    for r in pool:
        s = r.get("school") or ""
        if s not in used_schools:
            out.append(r)
            used_schools.add(s)
        if len(out) >= want:
            break
    if len(out) < want:                       # top up if the topic is small
        for r in pool:
            if r not in out:
                out.append(r)
            if len(out) >= want:
                break
    out.sort(key=lambda r: (r.get("total_marks") or 0, r.get("school") or ""))
    return out


def fetch_solutions(env, rows):
    """Fill in row-level `solution`, which fetch_pool does not select."""
    import urllib.parse, urllib.request, json
    base, key = R.supabase_creds(env)
    ids = [r["id"] for r in rows]
    if not ids:
        return
    q = urllib.parse.quote(f"({','.join(ids)})", safe="")
    url = f"{base}/rest/v1/questions?select=id,solution&id=in.{q}"
    req = urllib.request.Request(url, headers={"apikey": key, "Authorization": "Bearer " + key})
    with urllib.request.urlopen(req, timeout=30) as resp:
        got = {d["id"]: d.get("solution") for d in json.loads(resp.read())}
    for r in rows:
        r["solution"] = got.get(r["id"])


def has_solution(r) -> bool:
    """Does this row carry worked steps anywhere -- row level or per part?"""
    if (r.get("solution") or "").strip():
        return True
    parts = r.get("parts") or []
    return isinstance(parts, list) and any(
        isinstance(p, dict) and (p.get("solution") or "").strip() for p in parts)


def worked_from_bank(ws, rows, figdir, titles):
    """Render bank solutions as worked examples under a named skill heading."""
    ws.page_break()
    ws.para([B('Examples')])
    for r, title in zip(rows, titles):
        ws.para([B(title)])
        ws.para(R.split_math((r.get("question_text") or "").strip()))
        figs = r.get("_figures") or []
        for j, f in enumerate(figs):
            fp = _normalise(f, figdir/f"wx_{r['id'][:8]}_{j}")
            if fp:
                px = f.get("px") or (0, 0)
                ws.figure(str(fp), width_cm=min(10.5, max(6.0, (px[0] or 600)/96*2.54)))
        parts = r.get("parts") or []
        has = isinstance(parts, list) and any(isinstance(p, dict) for p in parts)
        if has:
            for p in parts:
                if isinstance(p, dict) and (p.get("text") or "").strip():
                    ws.para([T(f"({p.get('label','').strip('()')})  ")]
                            + R.split_math(p["text"].strip()), marks=p.get("marks"))
        ws.para([B('Solution:')])
        if has:
            for p in parts:
                if not isinstance(p, dict):
                    continue
                sol = (p.get("solution") or "").strip()
                if not sol:
                    continue
                ws.para([T(f"({p.get('label','').strip('()')})")])
                for line in sol.split("\n"):
                    if line.strip():
                        ws.para(R.split_math(line.strip()))
        else:
            for line in (r.get("solution") or "").split("\n"):
                if line.strip():
                    ws.para(R.split_math(line.strip()))


def build(cfg):
    env = R.load_env()
    figdir = Path(tempfile.mkdtemp(prefix="figs_b_"))
    chosen = pick(env, cfg["level"], cfg["tags"], want=cfg.get("want", 16))
    R.fetch_figures(env, chosen)
    fetch_solutions(env, chosen)

    # A worked example is only worth printing if it actually shows the working,
    # so pick the first rows that HAVE a solution rather than the first rows.
    n_wx = cfg.get("n_worked", 2)
    wx = [r for r in chosen if has_solution(r)][:n_wx]
    wx_ids = {r["id"] for r in wx}
    practice = [r for r in chosen if r["id"] not in wx_ids][:cfg.get("n_practice", 14)]

    ws = sheet(cfg["level_line"], cfg["title"])
    cfg["notes"](ws)
    if wx:
        worked_from_bank(ws, wx, figdir, cfg.get("skill_titles", ["Worked Example"] * n_wx))
    ws.page_break()
    ws.para([B('Practice')])
    ws.para([I('Show all working. The answer follows each question.')])
    by_id = {r["id"]: r for r in practice}
    n = render_practice(ws, by_id, [r["id"] for r in practice], figdir=figdir)
    out = save(ws, cfg["folder"], cfg["filename"])
    print(f"   worked {len(wx)}  practice {n}")
    return out
