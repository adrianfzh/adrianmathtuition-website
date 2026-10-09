"""
skill_pick.py — picking questions by skill, the Python twin of src/lib/skill-pick.ts.

docs/SKILL-PICK.md (website repo root) is the rule; src/lib/skill-pick.fixtures.json
holds the cases BOTH implementations must pass (test_skill_pick.py here runs them).
Pure: no I/O. Rows are dicts with id, marks, skills (list of skill ids), and
optionally tier (0 verified human · 1 human · 2 verified AI · 3 AI), pref (0 the
requested level · 1 top-up), parts, school. Skills are dicts with id, name, order.
"""
from __future__ import annotations


def fnv1a(s: str) -> int:
    """FNV-1a 32-bit over the UTF-8 bytes — identical to skill-pick.ts fnv1a."""
    h = 0x811C9DC5
    for b in s.encode("utf-8"):
        h ^= b
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h


def pick_by_skill(pool: list, skills: list, count: int, seed: str = "", weights: dict | None = None) -> dict:
    """Return {items: [{row, skill_id, round}], skipped, empty, unfiled, unfiled_count, per_skill}."""
    weights = weights or {}
    ordered = sorted(skills, key=lambda s: s["order"])
    skill_ids = {s["id"] for s in ordered}
    n = max(0, int(count))

    filed = [r for r in pool if any(sid in skill_ids for sid in (r.get("skills") or []))]
    unfiled_count = len(pool) - len(filed)
    per_skill = {s["id"]: 0 for s in ordered}
    if not filed or n == 0:
        return {"items": [], "skipped": [], "empty": [s["id"] for s in ordered],
                "unfiled": not filed, "unfiled_count": unfiled_count, "per_skill": per_skill}

    used: set = set()
    schools: set = set()
    items: list = []

    def h(r): return fnv1a("%s|%s" % (seed, r["id"]))
    # tier 0/1 = human (verified / not), 2/3 = AI: human-vs-AI ranks first, verified only breaks ties
    def ai(r): return 1 if (r.get("tier") or 0) >= 2 else 0
    def unverified(r): return (r.get("tier") or 0) % 2
    def pref(r): return r.get("pref") if r.get("pref") is not None else 0
    def marks(r): return r.get("marks") if r.get("marks") is not None else 99
    def parts(r): return r.get("parts") if r.get("parts") is not None else 0
    def school_penalty(r): return 1 if r.get("school") and r["school"] in schools else 0

    def candidates(sid):
        return [r for r in filed if r["id"] not in used and sid in (r.get("skills") or [])]

    def plainest(r): return (ai(r), pref(r), marks(r), parts(r), unverified(r), school_penalty(r), h(r))
    def twist(r): return (ai(r), pref(r), -marks(r), -parts(r), unverified(r), school_penalty(r), h(r))

    def take(r, sid, rnd):
        used.add(r["id"])
        if r.get("school"):
            schools.add(r["school"])
        per_skill[sid] = per_skill.get(sid, 0) + 1
        items.append({"row": r, "skill_id": sid, "round": rnd})

    empty: list = []
    visited = ordered[:min(n, len(ordered))]
    skipped = [s["id"] for s in ordered[len(visited):]]
    for s in visited:
        if len(items) >= n:
            break
        c = sorted(candidates(s["id"]), key=plainest)
        if not c:
            empty.append(s["id"])
            continue
        take(c[0], s["id"], 1)
    for s in ordered[len(visited):]:
        if not candidates(s["id"]):
            empty.append(s["id"])

    order2 = sorted(visited, key=lambda s: (-(weights.get(s["id"]) or 0), s["order"]))
    rnd = 2
    while len(items) < n:
        progressed = False
        for s in order2:
            if len(items) >= n:
                break
            c = sorted(candidates(s["id"]), key=twist)
            if not c:
                continue
            take(c[0], s["id"], rnd)
            progressed = True
        if not progressed:
            break
        rnd += 1

    order_of = {s["id"]: s["order"] for s in ordered}
    items.sort(key=lambda it: (order_of.get(it["skill_id"], 99), marks(it["row"]), h(it["row"])))
    return {"items": items, "skipped": skipped, "empty": empty, "unfiled": False,
            "unfiled_count": unfiled_count, "per_skill": per_skill}
