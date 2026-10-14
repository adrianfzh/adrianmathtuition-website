from worksheet_lib import Worksheet
import re as _re, worksheet_lib as _wl
_orig_split = _wl._split_aligned
def _split_keep_matrices(latex):
    # protect the row breaks inside a column vector so only the block's own \\ split lines
    prot = _re.sub(r'\\begin\{pmatrix\}.*?\\end\{pmatrix\}', lambda m: m.group(0).replace('\\\\', '@@ROW@@'), latex, flags=_re.S)
    rows = _orig_split(prot)
    if rows is None: return None
    return [tuple(x.replace('@@ROW@@', '\\\\') for x in row) for row in rows]
_wl._split_aligned = _split_keep_matrices
from docx.shared import RGBColor
GREY = RGBColor(0x80, 0x80, 0x80)
def T(s, **k): return ('text', s, k) if k else ('text', s)
def M(s, **k): return ('math', s, k) if k else ('math', s)
def V(a, b, c): return r'\begin{pmatrix} %s \\ %s \\ %s \end{pmatrix}' % (a, b, c)
def ANS(*parts):
    out = [T('Answer: ', bold=True)]
    for p in parts:
        out.append(M(p, bold=True) if isinstance(p, str) else p)
    return out
def AL(*rows): return r'\begin{aligned} ' + r' \\ '.join(rows) + r' \end{aligned}'
def G(s): return [T(s, color=GREY)]
r = r'\mathbf{r}'; a = r'\mathbf{a}'; b = r'\mathbf{b}'

ws = Worksheet()
ws.title('A Level Revision — Vectors')
ws.subtitle('Practice Solutions')

# ---------------- Q1 ----------------
ws.Q([T('Line '), M('l: \\dfrac{x-2}{4} = \\dfrac{z+3}{1},\\ y = 2'), T(';  plane '), M('p_1: ' + r + '\\cdot' + V(1,1,1) + ' = 16'), T(';  '), M('\\overrightarrow{OA} = ' + V(2,2,-3)), T('.')])
ws.keep_with_next()
ws.solution_box([
 ('(i)', [
   [T('Direction of '), M('l'), T(': '), M('\\mathbf{d} = ' + V(4,0,1)), T('.   Normal of '), M('p_1'), T(': '), M('\\mathbf{n} = ' + V(1,1,1)), T('.')],
   AL(r'\sin\theta &= \dfrac{|\mathbf{d}\cdot\mathbf{n}|}{|\mathbf{d}||\mathbf{n}|} \quad\text{← line and plane: use sin, since n is perpendicular to the plane}',
      r'&= \dfrac{|4 + 0 + 1|}{\sqrt{17}\,\sqrt{3}}',
      r'&= \dfrac{5}{\sqrt{51}}'),
   AL(r'\theta &= \sin^{-1}\dfrac{5}{\sqrt{51}}', r'&= 44.4^\circ'),
   ANS(r'44.4^\circ'),
 ]),
 ('(ii)', [
   [T('The line through '), M('A'), T(' along the normal meets '), M('p_1'), T(' at '), M('N'), T('.')],
   AL(r'l_{AN}: ' + r + r' &= ' + V(2,2,-3) + r' + t' + V(1,1,1)),
   [T('Put this into '), M('p_1'), T(':')],
   AL(r'(2+t) + (2+t) + (-3+t) &= 16', r'1 + 3t &= 16', r't &= 5'),
   AL(r'\overrightarrow{ON} &= ' + V(2,2,-3) + ' + 5' + V(1,1,1), r'&= ' + V(7,7,2)),
   ANS(r'N(7,\ 7,\ 2)'),
 ]),
 ('(iii)', [
   [M('N'), T(' is the midpoint of '), M('AB'), T('.')],
   AL(r'\overrightarrow{OB} &= 2\overrightarrow{ON} - \overrightarrow{OA}', r'&= ' + V(14,14,4) + ' - ' + V(2,2,-3), r'&= ' + V(12,12,7)),
   ANS(r'B(12,\ 12,\ 7)'),
 ]),
 ('(iv)', [
   [M('A(2, 2, -3)'), T(' lies on '), M('l'), T(', so its reflection '), M('B'), T(' lies on the reflected line.')],
   [T('The point where '), M('l'), T(' meets '), M('p_1'), T(' is on both lines. Write '), M('l'), T(' as:')],
   AL(r + r' &= ' + V(2,2,-3) + r' + s' + V(4,0,1)),
   [T('Put this into '), M('p_1'), T(':')],
   AL(r'(2+4s) + 2 + (-3+s) &= 16', r'1 + 5s &= 16', r's &= 3'),
   AL(r'\overrightarrow{OC} &= ' + V(14,2,0) + r'\quad\text{← C is where l meets the plane}'),
   AL(r'\overrightarrow{CB} &= ' + V(12,12,7) + ' - ' + V(14,2,0), r'&= ' + V(-2,10,7)),
   ANS(r'l_{BC}: ' + r + ' = ' + V(14,2,0) + r' + \lambda' + V(-2,10,7) + r',\ \lambda \in \mathbb{R}'),
 ]),
 ('(v)', [
   [M('p_2'), T(' is parallel to '), M('p_1'), T(', so it has the same normal. It passes through '), M('B'), T(':')],
   AL(r'\overrightarrow{OB}\cdot\mathbf{n} &= 12 + 12 + 7', r'&= 31'),
   [M('p_2: ' + r + r'\cdot' + V(1,1,1) + ' = 31'), T('.  Distance between the planes:')],
   AL(r'd &= \dfrac{31 - 16}{|\mathbf{n}|} \quad\text{← difference of the constants, over the length of n}', r'&= \dfrac{15}{\sqrt{3}}', r'&= 5\sqrt{3}'),
   ANS(r'5\sqrt{3}\ \text{units}'),
 ]),
], keep_together=False)

# ---------------- Q2 ----------------
ws.Q([M('\\Pi_1: -2x + 5y - 8z = 3'), T(';  line '), M('l: 4 - x = y - 2 = \\dfrac{z-2}{3}'), T(';  '), M('A(-1, 5, 3)'), T(', '), M('B(-3, 1, 1)'), T('.')])
ws.keep_with_next()
ws.solution_box([
 ('(i)', [
   [T('Let '), M('4 - x = y - 2 = \\dfrac{z-2}{3} = t'), T(', so '), M('x = 4 - t'), T(', '), M('y = 2 + t'), T(', '), M('z = 2 + 3t'), T('.')],
   [T('Put these into '), M('\\Pi_1'), T(':')],
   AL(r'-2(4-t) + 5(2+t) - 8(2+3t) &= 3', r'-14 - 17t &= 3', r't &= -1'),
   AL(r'(x,\ y,\ z) &= (4+1,\ 2-1,\ 2-3)', r'&= (5,\ 1,\ -1)'),
   ANS(r'(5,\ 1,\ -1)'),
 ]),
 ('(ii)', [
   AL(r'\overrightarrow{AB} &= ' + V(-3,1,1) + ' - ' + V(-1,5,3), r'&= ' + V(-2,-4,-2), r'&= -2' + V(1,2,1)),
   [M('l'), T(' passes through '), M('(4, 2, 2)'), T(' with direction '), M(V(-1,1,3)), T('. The normal of '), M('\\Pi_2'), T(' is perpendicular to both directions:')],
   AL(r'\mathbf{n} &= ' + V(-1,1,3) + r'\times' + V(1,2,1), r'&= ' + V('(1)(1) - (3)(2)', '(3)(1) - (-1)(1)', '(-1)(2) - (1)(1)'), r'&= ' + V(-5,4,-3)),
   AL(r'\mathbf{n}\cdot' + V(4,2,2) + r' &= -20 + 8 - 6 \quad\text{← use the point (4, 2, 2) on l}', r'&= -18'),
   ANS(r + r'\cdot' + V(-5,4,-3) + ' = -18'),
 ]),
 ('(iii)', [
   [T('The angle between two planes is the angle between their normals.')],
   AL(r'\cos\theta &= \dfrac{|\mathbf{n}_1\cdot\mathbf{n}_2|}{|\mathbf{n}_1||\mathbf{n}_2|}', r'&= \dfrac{|(-2)(-5) + (5)(4) + (-8)(-3)|}{\sqrt{93}\,\sqrt{50}}', r'&= \dfrac{54}{\sqrt{4650}}'),
   AL(r'\theta &= 37.6^\circ'),
   ANS(r'37.6^\circ'),
 ]),
], keep_together=False)

# ---------------- Q3 ----------------
ws.Q([T('Line '), M('l: \\dfrac{x-1}{-3} = \\dfrac{y-2}{4} = z + 1'), T(';  plane '), M('p: x + 3y + az = b'), T('.')])
ws.keep_with_next()
ws.solution_box([
 ('(i)', [
   [M('l: ' + r + ' = ' + V(1,2,-1) + r' + t' + V(-3,4,1)), T('.  The '), M('y'), T('-axis has direction '), M(V(0,1,0)), T('.')],
   AL(r'\cos\theta &= \dfrac{|(-3)(0) + (4)(1) + (1)(0)|}{\sqrt{26}\,(1)}', r'&= \dfrac{4}{\sqrt{26}}'),
   AL(r'\theta &= 0.669 \text{ rad}'),
   ANS(r'0.669\ \text{rad}\ (38.3^\circ)'),
 ]),
 ('(ii)', [
   [T('If '), M('l'), T(' lies in '), M('p'), T(': (1) its direction is perpendicular to the normal, and (2) its point '), M('(1, 2, -1)'), T(' is on '), M('p'), T('.')],
   AL(r'\text{(1)}\quad ' + V(-3,4,1) + r'\cdot' + V(1,3,'a') + r' &= 0', r'-3 + 12 + a &= 0', r'a &= -9'),
   AL(r'\text{(2)}\quad b &= 1 + 3(2) + (-9)(-1)', r'&= 16'),
   ANS(r'a = -9,\ b = 16'),
 ]),
 ('(iii)', [
   [M('q'), T(' is perpendicular to '), M('l'), T(', so its normal is the direction of '), M('l'), T(':')],
   AL(r'q: -3x + 4y + z &= -3(0) + 4(7) + 2', r'&= 30'),
   [T('The direction of '), M('m'), T(' is perpendicular to both normals:')],
   AL(V(1,3,-9) + r'\times' + V(-3,4,1) + r' &= ' + V('(3)(1) - (-9)(4)', '(-9)(-3) - (1)(1)', '(1)(4) - (3)(-3)'), r'&= ' + V(39,26,13), r'&= 13' + V(3,2,1)),
   [T('A point on both planes: put '), M('z = 0'), T('.')],
   AL(r'x + 3y &= 16', r'-3x + 4y &= 30'),
   [T('Solving: '), M('y = 6'), T(', '), M('x = -2'), T(', so '), M('(-2, 6, 0)'), T(' is on '), M('m'), T('.')],
   ANS(r + ' = ' + V(-2,6,0) + r' + k' + V(3,2,1) + r',\ k \in \mathbb{R}'),
 ]),
 ('(iv)', [
   [T('A point on '), M('l'), T(' is '), M('(1 - 3t,\\ 2 + 4t,\\ -1 + t)'), T('. Its distance from '), M('q: -3x + 4y + z = 30'), T(' is')],
   AL(r'\dfrac{|-3(1-3t) + 4(2+4t) + (-1+t) - 30|}{\sqrt{26}} &= \dfrac{|26t - 26|}{\sqrt{26}}', r'&= \sqrt{26}\,|t - 1|'),
   AL(r'\sqrt{26}\,|t-1| &= \sqrt{416}', r'|t - 1| &= \sqrt{16}', r'&= 4'),
   ('or', AL(r't - 1 &= 4', r't &= 5'), AL(r't - 1 &= -4', r't &= -3')),
   [M('t = 5'), T(' gives '), M('(-14, 22, 4)'), T(';  '), M('t = -3'), T(' gives '), M('(10, -10, -4)'), T('.')],
   ANS(r'(-14,\ 22,\ 4)\ \text{or}\ (10,\ -10,\ -4)'),
 ]),
], keep_together=False)

# ---------------- Q4 ----------------
ws.Q([M('p_1: ' + r + r'\cdot(\mathbf{i} + 2\mathbf{j} + 2\mathbf{k}) = 5'), T(';  line '), M('l: \\dfrac{x-a}{2} = \\dfrac{y-1}{b} = -\\dfrac{z}{2}'), T('.')])
ws.keep_with_next()
ws.solution_box([
 ('', [
   [M('l: ' + r + ' = ' + V('a',1,0) + r' + t' + V(2,'b',-2)), T('. If '), M('l'), T(' lies on '), M('p_1'), T(': (1) its direction is perpendicular to the normal, and (2) its point is on '), M('p_1'), T('.')],
   AL(r'\text{(1)}\quad ' + V(2,'b',-2) + r'\cdot' + V(1,2,2) + r' &= 0', r'2 + 2b - 4 &= 0', r'b &= 1 \quad\text{← shown}'),
   AL(r'\text{(2)}\quad ' + V('a',1,0) + r'\cdot' + V(1,2,2) + r' &= 5', r'a + 2 &= 5', r'a &= 3'),
   ANS(r'b = 1,\ a = 3'),
 ]),
 ('(i)', [
   [M('p_2'), T(' contains '), M('l'), T(' and is perpendicular to '), M('p_1'), T(', so its normal is perpendicular to the direction of '), M('l'), T(' and to the normal of '), M('p_1'), T(':')],
   AL(r'\mathbf{n}_2 &= ' + V(2,1,-2) + r'\times' + V(1,2,2), r'&= ' + V('(1)(2) - (-2)(2)', '(-2)(1) - (2)(2)', '(2)(2) - (1)(1)'), r'&= ' + V(6,-6,3), r'&= 3' + V(2,-2,1)),
   AL(r'c &= ' + V(3,1,0) + r'\cdot' + V(2,-2,1) + r' \quad\text{← use the point (3, 1, 0) on l}', r'&= 6 - 2 + 0', r'&= 4'),
   ANS(r + r'\cdot' + V(2,-2,1) + ' = 4'),
 ]),
 ('(ii)', [
   [M('p_1: x + 2y + 2z = 5'), T(' and '), M('p_2: 2x - 2y + z = 4'), T('. Both normals have length 3.')],
   AL(r'\dfrac{|x + 2y + 2z - 5|}{3} &= \dfrac{|2x - 2y + z - 4|}{3}'),
   [T('So '), M('x + 2y + 2z - 5 = \\pm(2x - 2y + z - 4)'), T('.')],
   ('or', AL(r'x + 2y + 2z - 5 &= 2x - 2y + z - 4', r'x - 4y - z &= -1'),
          AL(r'x + 2y + 2z - 5 &= -2x + 2y - z + 4', r'3x + 3z &= 9', r'x + z &= 3')),
   ANS(r'x + z = 3\ \text{or}\ x - 4y - z = -1'),
 ]),
], keep_together=False)

# ---------------- Q5 ----------------
ws.Q([M('\\Pi_1: 3x + ay - 2z = 7'), T(',  '), M('\\Pi_2: x + by - z = 3'), T(';  '), M('l_2: ' + r + ' = 6\\mathbf{i} - 4\\mathbf{j} + \\mathbf{k} + \\mu(2\\mathbf{i} - \\mathbf{j} - 3\\mathbf{k})'), T('.')])
ws.keep_with_next()
ws.solution_box([
 ('(i)', [
   [T('Put '), M('y = 0'), T(' so that '), M('a'), T(' and '), M('b'), T(' drop out:')],
   AL(r'3x - 2z &= 7', r'x - z &= 3'),
   [T('From the second, '), M('x = 3 + z'), T('. Then '), M('3(3 + z) - 2z = 7'), T(', so '), M('z = -2'), T(' and '), M('x = 1'), T('.')],
   ANS(r'(1,\ 0,\ -2)'),
 ]),
 ('(ii)', [
   [M('l_1'), T(' lies on both planes, so it is perpendicular to both normals:')],
   AL(r'\mathbf{d} &= ' + V(3,'a',-2) + r'\times' + V(1,'b',-1), r'&= ' + V('(a)(-1) - (-2)(b)', '(-2)(1) - (3)(-1)', '(3)(b) - (a)(1)'), r'&= ' + V('2b - a', 1, '3b - a')),
   ANS(V('2b - a', 1, '3b - a')),
 ]),
 ('(iii)', [
   [T('With '), M('a = b'), T(', the direction is '), M(V('a',1,'2a')), T('. So '), M('l_1: ' + r + ' = ' + V(1,0,-2) + r' + \lambda' + V('a',1,'2a')), T('.')],
   [T('At the point where the lines meet, the coordinates are equal:')],
   AL(r'1 + \lambda a &= 6 + 2\mu \quad\text{← (1)}', r'\lambda &= -4 - \mu \quad\text{← (2)}', r'-2 + 2a\lambda &= 1 - 3\mu \quad\text{← (3)}'),
   [T('From (2), '), M('\\mu = -4 - \\lambda'), T('. Put this into (1) and (3):')],
   AL(r'1 + a\lambda &= -2 - 2\lambda', r'\lambda(a + 2) &= -3 \quad\text{← (4)}'),
   AL(r'-2 + 2a\lambda &= 13 + 3\lambda', r'\lambda(2a - 3) &= 15 \quad\text{← (5)}'),
   [T('Divide (5) by (4):')],
   AL(r'\dfrac{2a - 3}{a + 2} &= -5', r'2a - 3 &= -5a - 10', r'7a &= -7', r'a &= -1'),
   ('check', [M('\\lambda = -3'), T(', '), M('\\mu = -1'), T(': both lines pass through '), M('(4, -3, 4)'), T('.')]),
   ANS(r'a = -1'),
 ]),
], keep_together=False)

# ---------------- Q6 ----------------
ws.Q([M('p_1: ' + r + ' = ' + V(-1,1,16) + r' + \lambda' + V(3,-1,2) + r' + \mu' + V(2,1,1)), T(';  '), M('\\overrightarrow{OA} = 5\\mathbf{i} - 6\\mathbf{j} + 7\\mathbf{k}'), T(';  '), M('p_2: ' + r + r'\cdot' + V(1,-2,5) + ' = 52'), T('.')])
ws.keep_with_next()
ws.solution_box([
 ('(i)', [
   AL(r'\mathbf{n}_1 &= ' + V(3,-1,2) + r'\times' + V(2,1,1), r'&= ' + V('(-1)(1) - (2)(1)', '(2)(2) - (3)(1)', '(3)(1) - (-1)(2)'), r'&= ' + V(-3,1,5)),
   AL(r'\mathbf{n}_1\cdot' + V(-1,1,16) + r' &= 3 + 1 + 80', r'&= 84'),
   ANS(r'-3x + y + 5z = 84'),
 ]),
 ('(ii)', [
   AL(r'l_{AF}: ' + r + r' &= ' + V(5,-6,7) + r' + t' + V(-3,1,5) + r'\quad\text{← through A, along the normal}'),
   [T('Put this into '), M('p_1'), T(':')],
   AL(r'-3(5 - 3t) + (-6 + t) + 5(7 + 5t) &= 84', r'14 + 35t &= 84', r't &= 2'),
   AL(r'\overrightarrow{OF} &= ' + V(5,-6,7) + ' + 2' + V(-3,1,5), r'&= ' + V(-1,-4,17)),
   ANS(r'\overrightarrow{OF} = ' + V(-1,-4,17)),
 ]),
 ('', [
   [T('Step 1. '), M('A'), T(' is on '), M('p_2'), T(', since '), M('5 - 2(-6) + 5(7) = 52'), T('. So the reflection '), M("A'"), T(' of '), M('A'), T(' in '), M('p_1'), T(' is on '), M('p_3'), T('.')],
   AL(r"\overrightarrow{OA'} &= 2\overrightarrow{OF} - \overrightarrow{OA} \quad\text{← F is the midpoint of AA'}", r'&= ' + V(-2,-8,34) + ' - ' + V(5,-6,7), r'&= ' + V(-7,-2,27)),
   [T('Step 2. The line where '), M('p_1'), T(' and '), M('p_2'), T(' meet does not move under the reflection, so it lies on '), M('p_3'), T(' too.')],
   AL(r'\text{direction} &= ' + V(-3,1,5) + r'\times' + V(1,-2,5), r'&= ' + V(15,20,5), r'&= 5' + V(3,4,1)),
   [T('A point on both planes: put '), M('x = 1'), T(', then '), M('y + 5z = 87'), T(' and '), M('-2y + 5z = 51'), T(', so '), M('y = 12'), T(', '), M('z = 15'), T('. Point '), M('P(1, 12, 15)'), T('.')],
   [T('Step 3. The normal of '), M('p_3'), T(' is perpendicular to the line and to '), M("\\overrightarrow{PA'}"), T(':')],
   AL(r"\overrightarrow{PA'} &= " + V(-7,-2,27) + ' - ' + V(1,12,15), r'&= ' + V(-8,-14,12), r'&= 2' + V(-4,-7,6)),
   AL(r'\mathbf{n}_3 &= ' + V(3,4,1) + r'\times' + V(-4,-7,6), r'&= ' + V('(4)(6) - (1)(-7)', '(1)(-4) - (3)(6)', '(3)(-7) - (4)(-4)'), r'&= ' + V(31,-22,-5)),
   [T('Use '), M(V(-31,22,5)), T(' and the point '), M('P'), T(':')],
   AL(r'-31(1) + 22(12) + 5(15) &= 308'),
   ('check', [M("A'(-7, -2, 27)"), T(': '), M('217 - 44 + 135 = 308'), T('.')]),
   ANS(r'-31x + 22y + 5z = 308'),
 ]),
], keep_together=False)

# ---------------- Q7 ----------------
ws.Q([M('\\Pi: ' + r + r'\cdot' + V(1,-1,5) + ' = 0'), T(';  satellite '), M(r + ' = ' + V(3,2,3) + r' + \lambda' + V(-2,3,1)), T(';  Earth '), M(r + ' = ' + V(15,20,-1) + r' + \mu' + V(4,-1,-1)), T('.')])
ws.keep_with_next()
ws.solution_box([
 ('(a)', [
   AL(V(-2,3,1) + r'\cdot' + V(1,-1,5) + r' &= -2 - 3 + 5', r'&= 0 \quad\text{← so the path is parallel to }\Pi'),
   AL(V(3,2,3) + r'\cdot' + V(1,-1,5) + r' &= 3 - 2 + 15', r'&= 16 \neq 0 \quad\text{← so the point (3, 2, 3) is not on }\Pi'),
   [T('The path is parallel to '), M('\\Pi'), T(' and not on it, so it never meets '), M('\\Pi'), T('.')],
   [T('Answer: ', bold=True), T('No, the satellite does not cross Earth\'s orbital plane.', bold=True)],
 ]),
 ('(b)', [
   [T('Let '), M('\\dfrac{x-10}{2} = y + 2 = \\dfrac{0.25 - z}{k} = s'), T(', so the asteroid path is '), M(r + ' = ' + V(10,-2,0.25) + ' + s' + V(2,1,'-k')), T('.')],
   [T('The two directions are not parallel (compare the '), M('x'), T(' and '), M('y'), T(' parts: '), M('4 : -1'), T(' and '), M('2 : 1'), T('). Find when the paths meet:')],
   AL(r'15 + 4\mu &= 10 + 2s \quad\text{← (1)}', r'20 - \mu &= -2 + s \quad\text{← (2)}', r'-1 - \mu &= 0.25 - ks \quad\text{← (3)}'),
   [T('From (2), '), M('s = 22 - \\mu'), T('. Into (1): '), M('15 + 4\\mu = 54 - 2\\mu'), T(', so '), M('\\mu = 6.5'), T(' and '), M('s = 15.5'), T('.')],
   AL(r'\text{Into (3):}\quad -1 - 6.5 &= 0.25 - 15.5k', r'15.5k &= 7.75', r'k &= 0.5'),
   [T('The paths meet only when '), M('k = 0.5'), T('.')],
   ANS(r'k > 0,\ k \neq 0.5'),
 ]),
 ('(c)', [
   AL(r'\cos\theta &= \dfrac{|(4)(2) + (-1)(1) + (-1)(-3)|}{\sqrt{18}\,\sqrt{14}}', r'&= \dfrac{10}{\sqrt{252}}'),
   AL(r'\theta &= 51.0^\circ'),
   ANS(r'51.0^\circ'),
 ]),
 (('(d)', '(i)'), [
   AL(r'\text{vector} &= ' + V(12,18,-3) + ' - ' + V(12,-1,-2.75), r'&= ' + V(0,19,-0.25)),
   AL(r'\text{distance} &= \sqrt{0^2 + 19^2 + 0.25^2}', r'&= 19.0'),
   ANS(r'19.0\ \text{million km}'),
 ]),
 (('', '(ii)'), [
   [T('The shortest distance is along a vector perpendicular to BOTH paths. Test it with the Earth\'s direction:')],
   AL(V(0,19,-0.25) + r'\cdot' + V(4,-1,-1) + r' &= 0 - 19 + 0.25', r'&= -18.75 \neq 0'),
   [T('The vector is not perpendicular to the Earth\'s path, so 19.0 is not the shortest distance.')],
   [T('Answer: ', bold=True), T('No.', bold=True)],
   G('Note: (12, 18, −3) is not on the Earth\'s path as printed. Worked out directly, the shortest distance between the two paths is 18.9 million km, which also gives "No".'),
 ]),
], keep_together=False)

# ---------------- Q8 ----------------
ws.Q([M('\\overrightarrow{OA} = ' + a), T(', '), M('\\overrightarrow{OB} = ' + b), T(', '), M('\\overrightarrow{OC} = 3' + a + ' + ' + b), T(';  '), M('D'), T(' on '), M('AB'), T(' with '), M('AD = kAB'), T(', '), M('0 < k < 1'), T('. See the diagram in the question.')])
ws.keep_with_next()
ws.solution_box([
 ('(a)', [
   AL(r'\overrightarrow{OD} &= \overrightarrow{OA} + k\overrightarrow{AB}', r'&= ' + a + r' + k(' + b + ' - ' + a + ')', r'&= (1 - k)' + a + ' + k' + b),
   ANS(r'l_{OD}: ' + r + r' = \lambda\big[(1-k)' + a + ' + k' + b + r'\big],\ \lambda \in \mathbb{R}'),
 ]),
 ('(b)', [
   AL(r'\overrightarrow{OE} &= \tfrac{1}{2}(\overrightarrow{OB} + \overrightarrow{OC}) \quad\text{← E is the midpoint of BC}', r'&= \tfrac{1}{2}(' + b + ' + 3' + a + ' + ' + b + ')', r'&= \tfrac{3}{2}' + a + ' + ' + b),
   [M('O'), T(', '), M('D'), T(', '), M('E'), T(' collinear means '), M('\\overrightarrow{OE} = \\lambda\\overrightarrow{OD}'), T(' for some '), M('\\lambda'), T('. Compare the coefficients of '), M(a), T(' and '), M(b), T(' (they are not parallel):')],
   AL(r'\lambda(1 - k) &= \tfrac{3}{2}', r'\lambda k &= 1'),
   [T('Divide the first by the second:')],
   AL(r'\dfrac{1 - k}{k} &= \dfrac{3}{2}', r'2 - 2k &= 3k', r'k &= \dfrac{2}{5}'),
   ANS(r'k = \dfrac{2}{5}'),
 ]),
 ('(c)', [
   AL(r'(3' + a + ' - 2' + b + r')\cdot(3' + a + ' - 2' + b + r') &= 9|' + a + r'|^2 - 12\,' + a + r'\cdot' + b + r' + 4|' + b + r'|^2', r'&= 9(1) - 12\,' + a + r'\cdot' + b + ' + 4(4)', r'&= 25 - 12\,' + a + r'\cdot' + b),
   [T('This equals '), M('|3' + a + ' - 2' + b + '|^2 = 31'), T(':')],
   AL(r'25 - 12\,' + a + r'\cdot' + b + r' &= 31', a + r'\cdot' + b + r' &= -\dfrac{1}{2}'),
   AL(r'\cos\theta &= \dfrac{' + a + r'\cdot' + b + '}{|' + a + '||' + b + r'|}', r'&= \dfrac{-\frac{1}{2}}{(1)(2)}', r'&= -\dfrac{1}{4}'),
   AL(r'\theta &= 104.5^\circ'),
   ANS(a + r'\cdot' + b + r' = -\dfrac{1}{2},\ \theta = 104.5^\circ\ (1.82\ \text{rad})'),
 ]),
 ('(d)', [
   AL(r'|' + a + r'\cdot' + b + r'| &= |' + b + r'|\,|\cos\theta| \quad\text{← since } |\mathbf{a}| = 1'),
   [T('This is the length of the projection of '), M(b), T(' onto '), M(a), T(' (the line '), M('OA'), T(').')],
   [T('Answer: ', bold=True), T('the length of the projection of ', bold=True), M(b, bold=True), T(' onto ', bold=True), M(a, bold=True), T('.', bold=True)],
 ]),
], keep_together=False)

# ---------------- Q9 ----------------
ws.Q([M('\\overrightarrow{OA} = ' + a), T(', '), M('\\overrightarrow{OB} = ' + b), T(', '), M('\\angle AOB = 30^\\circ'), T(', '), M('|' + a + '| = 4|' + b + '|'), T('.')])
ws.keep_with_next()
ws.solution_box([
 ('(i)', [
   AL(r'\overrightarrow{AB} &= ' + b + ' - ' + a, r'\overrightarrow{AC} &= (m - 1)' + a + ' + n' + b),
   AL(r'\overrightarrow{AB}\times\overrightarrow{AC} &= (m-1)(' + b + r'\times' + a + ') + n(' + b + r'\times' + b + ') - (m-1)(' + a + r'\times' + a + ') - n(' + a + r'\times' + b + ')',
      r'&= -(m-1)(' + a + r'\times' + b + ') - n(' + a + r'\times' + b + r') \quad\text{← using } \mathbf{a}\times\mathbf{a} = \mathbf{0},\ \mathbf{b}\times\mathbf{a} = -\mathbf{a}\times\mathbf{b}',
      r'&= -(m + n - 1)(' + a + r'\times' + b + ')'),
   AL(r'|' + a + r'\times' + b + r'| &= |' + a + '||' + b + r'|\sin 30^\circ', r'&= 4|' + b + '|^2 \\times \\tfrac{1}{2}', r'&= 2|' + b + '|^2'),
   AL(r'\text{Area} &= \tfrac{1}{2}|\overrightarrow{AB}\times\overrightarrow{AC}|', r'&= \tfrac{1}{2}(m + n - 1)(2|' + b + r'|^2) \quad\text{← m + n − 1 > 0, since m, n are positive integers}', r'&= (m + n - 1)|' + b + '|^2'),
   ANS(r'(m + n - 1)|' + b + '|^2'),
 ]),
 ('(ii)', [
   [M('D'), T(' is the midpoint of '), M('OA'), T('. '), M('OE : EB = 3 : 2'), T(' means '), M('OE'), T(' is '), M('\\tfrac{3}{5}'), T(' of '), M('OB'), T('.')],
   ANS(r'\overrightarrow{OD} = \tfrac{1}{2}' + a + r',\ \overrightarrow{OE} = \tfrac{3}{5}' + b),
 ]),
 ('(iii)', [
   AL(r'l_{BD}: ' + r + r' &= ' + b + r' + t\left(\tfrac{1}{2}' + a + ' - ' + b + r'\right)', r'&= \tfrac{t}{2}' + a + ' + (1 - t)' + b),
   [T('Let '), M('\\lambda = \\tfrac{t}{2}'), T(', so '), M('t = 2\\lambda'), T(' and '), M(r + ' = \\lambda' + a + ' + (1 - 2\\lambda)' + b), T(' (shown).')],
   AL(r'l_{AE}: ' + r + r' &= ' + a + r' + s\left(\tfrac{3}{5}' + b + ' - ' + a + r'\right)', r'&= (1 - s)' + a + r' + \tfrac{3s}{5}' + b),
   [T('Let '), M('s = 5\\mu'), T(', so '), M('l_{AE}: ' + r + ' = (1 - 5\\mu)' + a + ' + 3\\mu' + b), T('.')],
   [T('At '), M('F'), T(' the two are equal. '), M(a), T(' and '), M(b), T(' are not parallel, so compare coefficients:')],
   AL(r'\lambda &= 1 - 5\mu \quad\text{← coefficient of a}', r'1 - 2\lambda &= 3\mu \quad\text{← coefficient of b}'),
   AL(r'1 - 2(1 - 5\mu) &= 3\mu', r'-1 + 10\mu &= 3\mu', r'\mu &= \dfrac{1}{7}'),
   [T('So '), M('\\lambda = 1 - \\tfrac{5}{7} = \\tfrac{2}{7}'), T('.')],
   AL(r'\overrightarrow{OF} &= \tfrac{2}{7}' + a + r' + \left(1 - \tfrac{4}{7}\right)' + b, r'&= \tfrac{2}{7}' + a + r' + \tfrac{3}{7}' + b),
   ANS(r'\overrightarrow{OF} = \tfrac{2}{7}' + a + r' + \tfrac{3}{7}' + b),
 ]),
], keep_together=False)

# ---------------- Q10 ----------------
ws.Q([T('Points '), M('A'), T(', '), M('B'), T(' and '), M('R'), T(' have position vectors '), M(a), T(', '), M(b), T(' and '), M(r), T('; '), M('A'), T(' and '), M('B'), T(' are fixed.')])
ws.keep_with_next()
ws.solution_box([
 ('(a)', [
   [M(r + ' = \\lambda' + a), T(' is a multiple of '), M('\\overrightarrow{OA}'), T('. '), M('\\lambda = 0'), T(' gives '), M('O'), T(', '), M('\\lambda = 1'), T(' gives '), M('A'), T('.')],
   [T('Answer: ', bold=True), T('the line segment ', bold=True), M('OA', bold=True), T(' (from ', bold=True), M('O', bold=True), T(' to ', bold=True), M('A', bold=True), T(').', bold=True)],
 ]),
 ('(b)', [
   [M(r + '\\times(' + a + ' - ' + b + ') = \\mathbf{0}'), T(' means '), M(r), T(' is parallel to '), M(a + ' - ' + b + ' = \\overrightarrow{BA}'), T('.')],
   [T('So '), M('R'), T(' lies on the line through '), M('O'), T(' in the direction of '), M('AB'), T('.')],
   [T('Answer: ', bold=True), T('the line through ', bold=True), M('O', bold=True), T(' parallel to ', bold=True), M('AB', bold=True), T('.', bold=True)],
 ]),
 ('(c)', [
   [M(r + '\\cdot(' + r + ' - ' + a + ') = 0'), T(' means '), M('\\overrightarrow{OR}\\cdot\\overrightarrow{AR} = 0'), T(', so '), M('OR'), T(' is perpendicular to '), M('AR'), T('.')],
   [T('So '), M('\\angle ORA = 90^\\circ'), T(': '), M('R'), T(' sees '), M('OA'), T(' at a right angle (angle in a semicircle).')],
   [T('Answer: ', bold=True), T('the sphere with ', bold=True), M('OA', bold=True), T(' as a diameter.', bold=True)],
 ]),
 ('(d)', [
   [M('(' + r + ' - ' + a + ')\\times(' + r + ' - ' + b + ') = \\mathbf{0}'), T(' means '), M('\\overrightarrow{AR}'), T(' is parallel to '), M('\\overrightarrow{BR}'), T('.')],
   [T('The two vectors share the point '), M('R'), T(', so '), M('A'), T(', '), M('B'), T(' and '), M('R'), T(' are collinear: '), M('R'), T(' is on the line '), M('AB'), T('.')],
   AL(r + r' &= \overrightarrow{OA} + \alpha\overrightarrow{AB}', r'&= ' + a + r' + \alpha(' + b + ' - ' + a + ')'),
   ANS(r + ' = ' + a + r' + \alpha(' + b + ' - ' + a + r'),\ \alpha \in \mathbb{R}'),
 ]),
], keep_together=False)

ws.save('out.docx')
