"""A shorter cut of one of the hand-picked practice sheets, same questions word for word.
Adrian, 10 Oct 2026, after seeing the long ones: "for worksheet 2: just have 8-10 questions",
"for worksheet 3: just have 5-6 questions".

  python3 build_short.py build_calculus_every_type.py 1,4,6,7,9,11,13,15,16,18 out.docx
  python3 build_short.py build_circles_draw_it.py 7,8,9,10,11,12 out.docx

The long builder is read as text: its question blocks (blank-line separated) are numbered
as they print on the long sheet, the chosen ones are kept, and a section heading is kept
when one of its questions is. Answers are the long sheet's (verify_*.py)."""
import re, sys
from pathlib import Path
src = (Path(__file__).resolve().parent / sys.argv[1]).read_text()
keep = {int(n) for n in sys.argv[2].split(',')}
head, _, tail = src.partition("\nQ = lambda")
blocks = ("Q = lambda" + tail).split('\n\n')
out, n, pending = [head, blocks[0]], 0, None
for blk in blocks[1:]:
    if blk.lstrip().startswith('ws.save'):
        continue
    lines = blk.split('\n')
    if lines[0].startswith('ws.section('):
        pending, lines = lines[0], lines[1:]
    if not lines or not re.match(r'(Q\(|ws\.Q\()', lines[0]):
        continue
    n += 1
    if n in keep:
        if pending:
            out.append(pending); pending = None
        out.append('\n'.join(lines))
assert keep <= set(range(1, n + 1)), (keep, n)
out.append("ws.save(sys.argv[3], strict_maths=True)")
exec(compile('\n\n'.join(out), sys.argv[1], 'exec'), {'__file__': str(Path(__file__).resolve()), '__name__': '__main__'})
