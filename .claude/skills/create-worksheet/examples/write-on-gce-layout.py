# Write-on version: GCE-paper layout — each question on its own page, a part never
# split from its writing space, at least 3 lines per mark, a one-page question's
# space stretched to fill the page in proportion to marks; answers on a key at the back.
# Usage (from a work dir holding worksheet_lib.py, the plain author script, its figures
# and word-topdf.sh):  /usr/bin/python3 write-on-gce-layout.py vectors-coefficients-plain.py
# The plain script must start each question with a '# Q<n>' comment and end with ws.save(...).
import re, sys, math, json, os
from worksheet_lib import Worksheet

SRC = open(sys.argv[1] if len(sys.argv) > 1 else 'vectors-coefficients-plain.py').read()
body = SRC.split("ws.subtitle('Sec 4 E Math')", 1)[1].rsplit('ws.save(', 1)[0]
chunks = re.split(r'\n(?=# Q\d)', body)
helpers, qs = chunks[0], chunks[1:]
MIN_LINES = 3.0
PAGE = 26.7

def run(space_for, collect):
    ws = Worksheet(working_space=0, one_mark_bonus=1.0)
    ws.title('Vectors: Comparing Coefficients')
    ws.subtitle('Sec 4 E Math')
    ws.keep_lines_with_text = 10_000          # a part and its space stay on one page
    info, answers = [], []
    real_ws = ws.workspace
    log = []
    def ws_log(marks=None, lines=None):
        if marks is not None: log.append(float(marks))
        return real_ws(marks=marks, lines=lines)
    ws.workspace = ws_log
    real_ans = ws.ans
    ws.ans = lambda parts: answers.append(parts)
    g = {'ws': ws, 'Worksheet': Worksheet}
    exec(helpers, g)
    for i, q in enumerate(qs):
        if i: ws.page_break()
        ws.working_space = space_for(i)
        start = len(ws.doc.paragraphs); log.clear()
        exec(q, g)
        paras = ws.doc.paragraphs[start:]
        info.append({'used': ws._height_cm([p for p in paras if p.text.strip() or id(p) in ws._fig_cm or p._element.xml.count('<w:drawing')]),
                     'marks': sum(log), 'ones': sum(1 for m in log if m == 1)})
    if collect:
        ws.page_break()
        ws.section('Answers')
        for i, a in enumerate(answers, 1):
            p = ws.para([('text', f'{i}.\t', {'bold': True})] + a)
    return ws, info

ws1, info = run(lambda i: 1e-6, False)
# measure: each question alone on its page(s) with no space, rendered by Word
import subprocess, fitz
ws1.save('measure.docx')
subprocess.run([os.path.join(os.path.dirname(os.path.abspath(__file__)), 'word-topdf.sh'), 'measure.docx', 'vec-measure'], check=True)
doc = fitz.open('vec-measure.pdf')
assert doc.page_count == len(info), (doc.page_count, len(info))
for i, pg in enumerate(doc):
    ys = [b[3] for b in pg.get_text('blocks')] + [r.y1 for im in pg.get_images() for r in pg.get_image_rects(im[0])]
    info[i]['used'] = (max(ys) - 56.7) / 28.35
L = Worksheet.LINE_CM
def space(i):
    d = info[i]
    used = d['used'] + 0.3
    need = used + (MIN_LINES * d['marks'] + d['ones']) * L
    pages = max(1, math.ceil(need / PAGE))
    fill = 0.9 if pages == 1 else 0.8   # glued parts cannot split, so leave room on a 2-page question
    return max(MIN_LINES, (fill * (pages * PAGE - 0.8 - used) / L - d['ones']) / d['marks'])
for i, d in enumerate(info):
    print(i + 1, round(d['used'], 1), d['marks'], d['ones'], round(space(i), 2))
ws, _ = run(space, True)
ws.save('Vectors - Comparing Coefficients (Sec 4 EM) - with working space.docx', strict_maths=True)
