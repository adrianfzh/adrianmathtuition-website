from worksheet_lib import Worksheet
ws = Worksheet()
ws.title('Vectors: Comparing Coefficients')
ws.subtitle('Sec 4 E Math')

V = lambda s: r'\overrightarrow{' + s + '}'
B = lambda s: r'\mathbf{' + s + '}'
T = lambda s: ('text', s)
M = lambda s: ('math', s)

def rom(parts, first=False, marks=None, level=2):
    return ws.numbered(parts, level, 'roman', restart=first, marks=marks)
def let(parts, first=False, marks=None, level=2):
    return ws.numbered(parts, level, 'letter', restart=first, marks=marks)
def lead():
    ws.keep_with_next()

# Q1 — CHIJ St Nicholas Girls 2023 P2 Q8
ws.Q([])
ws.SQ([M('OBCD'), T(' is a trapezium where '), M('DC'), T(' is parallel to '), M('OB'), T('. '),
       M(V('OA') + '=' + B('p')), T(' and '), M(V('OD') + '=' + B('q')), T('. '),
       M(r'OA = \tfrac{1}{2}OB'), T(' and '), M('DC : OB = 1 : 6'), T('.')])
ws.figure('img/afeaab3e-3dee-49f4-866f-59541e9e8463.jpg', width_cm=9)
rom([T('Show that '), M(V('BC') + '=' + B('q') + r'-\dfrac{5}{3}' + B('p')), T('.')], first=True, marks=2)
rom([M('X'), T(' is a point on '), M('OB'), T(' such that '), M('XD'), T(' is parallel to '), M('BC'), T('. Find '), M(V('XC')),
     T(', as simply as possible, in terms of '), M(B('p')), T(' and '), M(B('q')), T('.')], marks=2)
rom([T('Find the ratio area '), M('XBCD'), T(' : area '), M('OBCD'), T('.')], marks=1)
rom([M('Y'), T(' is a point on '), M('BC'), T(' produced such that '), M(V('OY') + '= h' + B('q')), T('. By using '),
     M(V('BY') + '= k' + V('BC')), T(', find the value of '), M('h'), T(' and the value of '), M('k'), T('.')], marks=3)
ws.SQ([M('T'), T(' is the point '), M('(-2, 6)'), T(' and '), M(V('ST') + r'= \begin{pmatrix} -7 \\ 9 \end{pmatrix}'), T('.')])
lead()
rom([T('Find the position vector of '), M('S'), T('.')], first=True, marks=1)
rom([T('Find the magnitude of '), M(r'\begin{pmatrix} -7 \\ 9 \end{pmatrix}'), T('.')], marks=1)
ws.ans([T('(a)(ii) '), M(B('q') + r'-\tfrac{4}{3}' + B('p')), T('; (iii) '), M('2 : 7'), T('; (iv) '), M(r'h = k = \tfrac{6}{5}'),
        T('; (b)(i) '), M(r'\begin{pmatrix} 5 \\ -3 \end{pmatrix}'), T('; (ii) 11.4')])

# Q2 — Nanyang Girls 2017 P1 Q8
ws.Q([T('In the parallelogram '), M('OABC'), T(', '), M(V('OA') + '=' + B('a')), T(' and '), M(V('OC') + '=' + B('c')), T('.')])
ws.figure('img/95a71fc5-139d-40a6-a771-f53da957987c.png', width_cm=5.5)
ws.SQ([T('Express '), M(V('OB')), T(' and '), M(V('AC')), T(' in terms of '), M(B('a')), T(' and '), M(B('c')), T('.')], marks=2)
ws.SQ([T('Given that '), M(r'|' + B('a') + '| = |' + B('c') + '|'),
       T(', explain why the size of the angle between the lines represented by '),
       M(B('a') + '+' + B('c')), T(' and '), M(B('a') + '-' + B('c')), T(' is '), M(r'90^\circ'), T('.')], marks=2)
ws.SQ([T('Points '), M('P'), T(' and '), M('Q'), T(' are such that '), M(V('OP') + '= 3' + B('a')), T(', '),
       M(V('OQ') + '= k' + B('c')), T(' and '), M('P'), T(', '), M('B'), T(' and '), M('Q'), T(' are collinear.')])
lead()
rom([T('Find '), M(V('PB')), T(' in terms of '), M(B('a')), T(' and '), M(B('c')), T('.')], first=True, marks=1)
rom([T('Find '), M(V('PQ')), T(' in terms of '), M('k'), T(', '), M(B('a')), T(' and '), M(B('c')), T('.')], marks=1)
rom([T('Find the value of '), M('k'), T('.')], marks=2)
rom([T('Find the ratio of the area of '), M('OABC'), T(' to the area of triangle '), M('OPQ'), T('.')], marks=2)
ws.ans([T('(a) '), M(B('a') + '+' + B('c') + r',\ ' + B('c') + '-' + B('a')),
        T('; (c)(i) '), M(B('c') + '- 2' + B('a')), T('; (ii) '), M('k' + B('c') + '- 3' + B('a')),
        T('; (iii) '), M(r'k = \tfrac{3}{2}'), T('; (iv) '), M('4 : 9')])

# Q3 — Fairfield Methodist 2024 P2 Q5
ws.Q([])
ws.SQ([M('P'), T(' is the point '), M('(8, -4)'), T(' and '), M('Q'), T(' is the point '), M('(6, 2)'), T('. '),
       M('R'), T(' has coordinates '), M('(2, h)'), T(' and '), M(V('PQ') + '= k' + V('PR')),
       T('. Find the value of '), M('h'), T(' and '), M('k'), T('.')], marks=3)
ws.SQ([T('In the diagram, '), M(V('OR') + '= 2' + B('a')), T(', '), M(V('OP') + '= 4' + B('b')),
       T(', '), M(V('TQ') + '=' + B('b')), T(' and '), M(V('PQ') + '= 5' + B('a')),
       T('. '), M('PR'), T(' and '), M('OT'), T(' intersect at point '), M('S'),
       T(' such that '), M('PS : PR = m : 13'), T('.')])
ws.figure('img/5f82d600-7d80-4f57-8cfd-af4f986f732f.png', width_cm=10)
rom([T('Express '), M(V('OS')), T(' in terms of '), M(B('a')), T(', '), M(B('b')), T(' and '), M('m'), T(' as simply as possible.')], first=True, marks=2)
rom([T('Given that '), M('ST : OS = 9 : 4'), T(', find the value of '), M('m'), T('.')], marks=3)
rom([M('U'), T(' is the point such that '), M(V('RU') + r'= \dfrac{2}{3}(7' + B('a') + '+ 6' + B('b') + ')'),
     T('. Explain why '), M('O'), T(', '), M('S'), T(' and '), M('U'), T(' lie on a straight line.')], marks=3)
ws.ans([T('(a) '), M(r'h = 14,\ k = \tfrac{1}{3}'), T('; (b)(i) '),
        M(r'\tfrac{2m}{13}' + B('a') + r'+\left(4 - \tfrac{4m}{13}\right)' + B('b')),
        T('; (ii) '), M('m = 10'), T('; (iii) shown')])

# Q4 — Cedar Girls 2024 P1 Q25
ws.Q([M(V('OX') + r'= \begin{pmatrix} -4 \\ 6 \end{pmatrix}'), T(' and '), M(V('XY') + r'= \begin{pmatrix} 15 \\ 5 \end{pmatrix}'), T('.')])
rom([T('Find '), M(V('OY')), T('.')], first=True, marks=1, level=1)
rom([T('Given that '), M(V('XZ') + r'= \begin{pmatrix} 8 \\ k \end{pmatrix}'), T(' and '),
     M(V('XZ') + '= h' + V('OX')), T(', find the value of '), M('h'), T(' and of '), M('k'), T('.')], marks=2, level=1)
ws.ans([T('(i) '), M(r'\begin{pmatrix} 11 \\ 11 \end{pmatrix}'), T('; (ii) '), M(r'h = -2,\ k = -12')])

# Q5 — Dunman High (IP) 2016 P1 Q11
ws.Q([M('ABCD'), T(' is a trapezium where '), M(V('AB') + '=' + B('p')), T(', '),
      M(V('BC') + '=' + B('q')), T(' and '), M('AD'), T(' is parallel to '), M('BC'),
      T('. The diagonals of the trapezium intersect at '), M('E'), T(', such that '), M('AE : EC = 3 : 2'), T('.')])
ws.figure('img/01e0028f-402f-451d-8c80-2c60c58fd413.png', width_cm=5)
rom([T('Name a triangle that is similar to triangle '), M('BEC'), T('.')], first=True, marks=1, level=1)
rom([T('Express, as simply as possible, in terms of '), M(B('p')), T(' and/or '), M(B('q')), T(',')], level=1)
lead()
let([M(V('AD')), T(',')], first=True, marks=1)
let([M(V('DC')), T(',')], marks=1)
let([M(V('CF')), T(', given that '), M('AB'), T(' produced and '), M('DC'), T(' produced meet at '), M('F'), T('.')], marks=2)
rom([T('Find')], level=1)
lead()
let([T('the ratio area of triangle '), M('BCF'), T(' : area of trapezium '), M('ABCD'), T(',')], first=True, marks=2)
let([T('the ratio area of triangle '), M('ADE'), T(' : area of triangle '), M('BDF'), T('.')], marks=2)
ws.ans([T('(i) '), M('DEA'), T('; (ii)(a) '), M(r'\tfrac{3}{2}' + B('q')),
        T('; (b) '), M(B('p') + r'-\tfrac{1}{2}' + B('q')), T('; (c) '), M('2' + B('p') + '-' + B('q')),
        T('; (iii)(a) '), M('4 : 5'), T('; (b) '), M('3 : 10')])

# Q6 — NJC (IP) 2019 P2 Q11
ws.Q([])
ws.SQ([T('Point '), M('P'), T(' has coordinates '), M('(-8, 2)'), T(' and '), M(V('QP') + r'= \begin{pmatrix} -9 \\ -2 \end{pmatrix}'), T('.')])
lead()
rom([T('Calculate the exact value of '), M(r'|' + V('PQ') + '|'), T('.')], first=True, marks=1)
rom([T('Find the position vector of '), M('Q'), T('.')], marks=1)
rom([T('Explain why '), M(r'\angle POQ'), T(' is '), M(r'90^\circ'), T('.')], marks=2)
ws.SQ([T('In the diagram, '), M('ABCD'), T(' is a parallelogram. The position vectors of '), M('A'),
       T(' and '), M('B'), T(', relative to '), M('O'), T(', are '), M(B('a')),
       T(' and '), M(B('b')), T(' respectively. The point '), M('E'), T(' on '), M('CD'),
       T(' is such that '), M(r'DE = \tfrac{1}{2}CD'), T('.')])
ws.figure('img/1f533dd2-0ed1-43c6-8f33-978d2d14b06b.png', width_cm=9)
rom([T('Find the ratio area of triangle '), M('COE'), T(' : area of triangle '), M('AOB'), T('.')], first=True, marks=1)
rom([T('Find the ratio area of triangle '), M('COE'), T(' : area of triangle '), M('ABC'), T('.')], marks=2)
rom([T('Express '), M(V('AD')), T(' in terms of '), M(B('a')), T(' and '), M(B('b')), T('.')], marks=2)
rom([M('F'), T(' is the point on '), M('BO'), T(' produced such that '), M('BF = kBO'),
     T(' for some constant '), M('k'), T('. Express '), M(V('OF')), T(' in terms of '), M('k'),
     T(' and '), M(B('b')), T('. Given that the points '), M('A'), T(', '), M('D'),
     T(' and '), M('F'), T(' lie on a straight line, find the value of '), M('k'), T('.')], marks=3)
ws.ans([T('(a)(i) '), M(r'\sqrt{85}'), T('; (ii) '), M(r'\begin{pmatrix} 1 \\ 4 \end{pmatrix}'),
        T('; (b)(i) '), M('1 : 4'), T('; (ii) '), M('1 : 6'),
        T('; (iii) '), M(r'-\tfrac{1}{2}' + B('a') + '-' + B('b')),
        T('; (iv) '), M('(1-k)' + B('b') + r',\ k = 3')])

# Q7 — Catholic High 2024 P2 Q2
ws.Q([T('The position vectors of points '), M('A'), T(', '), M('B'), T(' and '), M('C'),
      T(', relative to the origin, are '), M(r'\begin{pmatrix} -2 \\ 3 \end{pmatrix}'), T(', '),
      M(r'\begin{pmatrix} 4 \\ 7 \end{pmatrix}'), T(' and '), M(r'\begin{pmatrix} -4 \\ 58 \end{pmatrix}'),
      T(' respectively. A point '), M('D'), T(' is such that '), M(V('OD') + r'= \lambda' + V('OC')),
      T(' and '), M(V('AD') + r'= \mu' + V('BA')), T(', where '), M(r'\lambda'), T(' and '),
      M(r'\mu'), T(' are constants.')])
ws.SQ([T('Express '), M(V('OD')), T(' in terms of')])
lead()
rom([M(r'\lambda'), T(',')], first=True, marks=1)
rom([M(r'\mu'), T('.')], marks=2)
ws.SQ([T('Hence, find the value of '), M(r'\lambda'), T(' and of '), M(r'\mu'), T('.')], marks=3)
ws.ans([T('(a)(i) '), M(r'\begin{pmatrix} -4\lambda \\ 58\lambda \end{pmatrix}'), T('; (ii) '),
        M(r'\begin{pmatrix} -2-6\mu \\ 3-4\mu \end{pmatrix}'), T('; (b) '),
        M(r'\lambda = \tfrac{1}{14},\ \mu = -\tfrac{2}{7}')])

# Q8 — written for this sheet
ws.Q([M(B('a') + r'= \begin{pmatrix} 3 \\ 2 \end{pmatrix}'), T(' and '),
      M(B('b') + r'= \begin{pmatrix} -1 \\ 4 \end{pmatrix}'), T('. '), M('P'), T(' is the point '),
      M('(-2, 1)'), T(' and '), M('Q'), T(' is the point '), M('(5, 1)'), T('.')])
ws.SQ([T('Write down '), M(V('PQ')), T(' as a column vector.')], marks=1)
ws.SQ([T('Given that '), M(V('PQ') + '= m' + B('a') + '+ n' + B('b')), T(', where '), M('m'),
       T(' and '), M('n'), T(' are constants, find the value of '), M('m'), T(' and the value of '), M('n'), T('.')], marks=3)
ws.SQ([T('The vector '), M(B('a') + '+ k' + B('b')), T(' is parallel to the '), M('y'),
       T('-axis. Find the value of '), M('k'), T('.')], marks=2)
ws.ans([T('(a) '), M(r'\begin{pmatrix} 7 \\ 0 \end{pmatrix}'), T('; (b) '), M(r'm = 2,\ n = -1'), T('; (c) '), M('k = 3')])

ws.save('Vectors - Comparing Coefficients (Sec 4 EM).docx', strict_maths=True)
