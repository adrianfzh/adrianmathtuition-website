"""Runs the shared cases in src/lib/skill-pick.fixtures.json against skill_pick.py.
    /usr/bin/python3 -m unittest .claude/skills/copy-revision-worksheet-with-different-practice/test_skill_pick.py
"""
import json
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import skill_pick as sp  # noqa: E402

FIX = json.loads((HERE.parents[2] / "src" / "lib" / "skill-pick.fixtures.json").read_text())


class SharedCases(unittest.TestCase):
    def test_cases(self):
        for c in FIX["cases"]:
            with self.subTest(c["name"]):
                skills = [s for s in FIX["skills"] if s["id"] in c["skills"]]
                r = sp.pick_by_skill(c["pool"], skills, c["count"], seed=c["seed"], weights=c.get("weights"))
                e = c["expect"]
                self.assertEqual([it["row"]["id"] for it in r["items"]], e["ids"])
                self.assertEqual([it["round"] for it in r["items"]], e["rounds"])
                self.assertEqual(r["skipped"], e["skipped"])
                self.assertEqual(r["empty"], e["empty"])
                self.assertEqual(r["unfiled"], e["unfiled"])
                if "unfiledCount" in e:
                    self.assertEqual(r["unfiled_count"], e["unfiledCount"])
                for qid, sid in (e.get("skillOf") or {}).items():
                    self.assertEqual(next(it["skill_id"] for it in r["items"] if it["row"]["id"] == qid), sid)

    def test_hash_matches_the_typescript_twin(self):
        self.assertEqual(sp.fnv1a(""), 0x811C9DC5)
        self.assertEqual(sp.fnv1a("a"), 0xE40C292C)


if __name__ == "__main__":
    unittest.main()
