"""Word refused a paper carrying ~5,600 unused list definitions (22 Oct 2026):
a saved sheet must define only the numbered lists it uses, and every list it
uses must be defined.
    python3 .claude/skills/create-worksheet/test_numbering.py
"""
import re
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from worksheet_lib import Worksheet  # noqa: E402


class SavedNumbering(unittest.TestCase):
    def test_only_used_lists_are_defined(self):
        ws = Worksheet()
        for q in range(3):
            ws.Q([('text', f'Question {q + 1}.')])
            ws.numbered([('text', 'First part.')], level=1, restart=True, marks=2)
            ws.numbered([('text', 'Second part.')], level=1, marks=3)
            ws.numbered([('text', 'A sub-part.')], level=2, fmt='roman', restart=True, marks=1)
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / 'sheet.docx'
            ws.save(str(path))
            with zipfile.ZipFile(path) as z:
                doc = z.read('word/document.xml').decode()
                num = z.read('word/numbering.xml').decode()
        used = set(re.findall(r'<w:numId w:val="(\d+)"', doc))
        defined = re.findall(r'<w:num w:numId="(\d+)"', num)
        self.assertTrue(used)
        self.assertEqual(set(defined), used)
        self.assertEqual(len(defined), len(set(defined)))
        self.assertLess(len(defined), 30)
        self.assertEqual(num.count('<w:abstractNum '), 7)


if __name__ == '__main__':
    unittest.main()
