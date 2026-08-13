#!/usr/bin/env python3
"""The twelve S2 revision worksheets."""
from batch_lib import build
from build_lib import T, B, I, M
import revision_lib as R

LL = 'Sec 2 Mathematics Revision'


def _mistakes(ws, items):
    ws.para([B('Mistakes to avoid')])
    for i, e in enumerate(items, 1):
        ws.para([T(f'{i}.  ')] + R.split_math(e))


# ---------------------------------------------------------------- Proportion
def n_proportion(ws):
    ws.para([B('Notes:')])
    ws.para([B('Direct proportion')])
    ws.para([T('As one goes up, the other goes up '), I('in the same ratio'), T('.')])
    ws.math_block(r'y \propto x \quad\Longleftrightarrow\quad y = kx \quad\Longleftrightarrow\quad \dfrac{y}{x} = k \text{ (a constant)}')
    ws.para([T('The graph of '), M('y'), T(' against '), M('x'),
             T(' is a straight line through the origin.')])
    ws.para([B('Inverse proportion')])
    ws.para([T('As one goes up, the other goes '), I('down'), T(' in the same ratio.')])
    ws.math_block(r'y \propto \dfrac{1}{x} \quad\Longleftrightarrow\quad y = \dfrac{k}{x} \quad\Longleftrightarrow\quad xy = k')
    ws.para([T('The graph of '), M('y'), T(' against '), M('x'),
             T(' is a hyperbola; the graph of '), M('y'), T(' against '), M(r'\tfrac{1}{x}'),
             T(' is a straight line through the origin.')])
    ws.para([B('Powers')])
    ws.para([T('A question may say '), M('y \\propto x^2'), T(' or '), M(r'y \propto \sqrt{x}'),
             T('. Treat the whole power as the variable: '), M('y = kx^2'), T(' or '),
             M(r'y = k\sqrt{x}'), T('.')])
    ws.para([B('The method that always works')])
    ws.para([T('1.  Write the equation with '), M('k'), T(' in it.')])
    ws.para([T('2.  Substitute the pair of values you were given and solve for '), M('k'), T('.')])
    ws.para([T('3.  Rewrite the equation with '), M('k'),
             T(' replaced by its number, then answer the question.')])
    ws.para([T('Never skip step 2 — almost every mark scheme wants '), M('k'), T(' stated.')])
    _mistakes(ws, [
        'Using $y = kx$ when the quantities are inversely proportional.',
        'Squaring only $x$ and forgetting that $k$ changes too when the power changes.',
        'Finding $k$ and then not using it in the second half of the question.',
        'Assuming any straight-line graph means direct proportion — it must pass through the origin.',
    ])


# ------------------------------------------------ Congruency and Similarity
def n_congruency(ws):
    ws.para([B('Notes:')])
    ws.para([B('Congruent — same shape, same size')])
    ws.para([T('Prove congruency with one of: '), B('SSS, SAS, AAS, ASA, RHS'), T('.')])
    ws.para([T('There is no such test as SSA or AAA for congruency.')])
    ws.para([B('Similar — same shape, different size')])
    ws.para([T('Two triangles are similar if either:')])
    ws.para([T('   all three angles are equal (AA is enough, since the third follows), or')])
    ws.para([T('   all three pairs of sides are in the same ratio, or')])
    ws.para([T('   two pairs of sides are in the same ratio and the '), I('included'),
             T(' angles are equal.')])
    ws.para([B('Writing a proof')])
    ws.para([T('Name the triangles with the vertices in '), B('matching order'),
             T(' — that ordering is what tells the reader which side corresponds to which.')])
    ws.para([T('Give a reason for every statement: "common angle", "vertically opposite angles", '
               '"alternate angles, '), M('AB \\parallel CD'), T('".')])
    ws.para([B('Ratios of length, area and volume')])
    ws.math_block(r'\dfrac{\text{length}_1}{\text{length}_2} = k \quad\Rightarrow\quad \dfrac{\text{area}_1}{\text{area}_2} = k^2 \quad\Rightarrow\quad \dfrac{\text{volume}_1}{\text{volume}_2} = k^3')
    ws.para([T('Given an area ratio, take the square root before working with lengths. '
               'Given a volume ratio, take the cube root.')])
    _mistakes(ws, [
        'Naming triangles in the wrong order, so the sides paired up are not corresponding.',
        'Using the area ratio directly as a length ratio.',
        'Quoting AAA as a congruency test — it proves similarity only.',
        'Giving a statement with no reason; the reason usually carries the mark.',
    ])


# ------------------------------------- Pythagoras' Theorem and Trigonometry
def n_pythagoras(ws):
    ws.para([B('Notes:')])
    ws.para([B("Pythagoras' Theorem — right-angled triangles only")])
    ws.math_block(r'a^2 + b^2 = c^2 \qquad (c = \text{hypotenuse, opposite the right angle})')
    ws.para([T('To find the hypotenuse, add. To find a shorter side, '), B('subtract'), T('.')])
    ws.para([B('The three ratios')])
    ws.math_block(r'\sin\theta = \dfrac{\text{opp}}{\text{hyp}} \qquad \cos\theta = \dfrac{\text{adj}}{\text{hyp}} \qquad \tan\theta = \dfrac{\text{opp}}{\text{adj}}')
    ws.para([T('"Opposite" and "adjacent" are relative to the angle you are using — relabel them '
               'every time the angle changes.')])
    ws.para([B('Choosing what to use')])
    ws.para([T('Two sides given, angle wanted: use the ratio containing both sides, then '),
             M(r'\sin^{-1}'), T(', '), M(r'\cos^{-1}'), T(' or '), M(r'\tan^{-1}'), T('.')])
    ws.para([T('One side and one angle given, side wanted: pick the ratio containing the known '
               'side and the wanted side.')])
    ws.para([B('Angles of elevation and depression')])
    ws.para([T('Both are measured from the '), B('horizontal'),
             T('. An angle of depression from the top of a cliff equals the angle of elevation '
               'from the boat — they are alternate angles.')])
    ws.para([B('Accuracy')])
    ws.para([T('Keep full calculator accuracy through the working and round only the final '
               'answer, normally to 3 significant figures or 1 decimal place for an angle. '
               'Rounding an intermediate value is the most common source of a lost accuracy mark.')])
    _mistakes(ws, [
        'Adding when the missing side is a shorter side, not the hypotenuse.',
        'Using Pythagoras on a triangle with no right angle.',
        'Keeping the same "opposite" and "adjacent" after switching to the other acute angle.',
        'Leaving the calculator in radian mode.',
        'Rounding partway through and losing the last significant figure.',
    ])


# ---------------------------------------------------------------- Statistics
def n_stats(ws):
    ws.para([B('Notes:')])
    ws.para([B('The three averages')])
    ws.para([T('Mean '), M(r'= \dfrac{\text{total}}{\text{how many}}'),
             T('  — uses every value, so extremes pull it.')])
    ws.para([T('Median — the middle value after '), B('ordering'), T('. For '), M('n'),
             T(' values it is the '), M(r'\tfrac{1}{2}(n+1)'), T('th.')])
    ws.para([T('Mode — the most common value. There can be more than one, or none.')])
    ws.para([B('Spread')])
    ws.math_block(r'\text{range} = \text{largest} - \text{smallest}')
    ws.para([T('A small range means the data is consistent.')])
    ws.para([B('Reading the diagrams')])
    ws.para([T('Bar graph — heights are frequencies; bars are separate.')])
    ws.para([T('Pie chart — the whole circle is the total, so a sector of angle '), M(r'\theta'),
             T(' represents '), M(r'\tfrac{\theta}{360}'), T(' of it.')])
    ws.para([T('Stem-and-leaf — the data is already in order, which makes the median easy. '
               'Always read the key before using it.')])
    ws.para([T('Dot diagram — one dot is one value.')])
    ws.para([B('Comparing two sets')])
    ws.para([T('Say one thing about the average and one thing about the spread, quoting the '
               'figures for both. "Class A did better" on its own scores nothing.')])
    _mistakes(ws, [
        'Finding the median without putting the data in order first.',
        'Ignoring the key on a stem-and-leaf diagram.',
        'Treating the frequency column as the data when finding the mean of a table.',
        'Comparing two sets using only the average.',
    ])


# ------------------------------------------------------------------- Algebra
def n_algebra(ws):
    ws.para([B('Notes:')])
    ws.para([B('Expanding')])
    ws.math_block(r'a(b + c) = ab + ac')
    ws.math_block(r'(a + b)(c + d) = ac + ad + bc + bd')
    ws.para([T('Every term in the first bracket multiplies every term in the second. '
               'A minus sign in front of a bracket changes '), B('every'), T(' sign inside it.')])
    ws.math_block(r'-(x - 3) = -x + 3')
    ws.para([B('The three results worth memorising')])
    ws.math_block(r'(a + b)^2 = a^2 + 2ab + b^2')
    ws.math_block(r'(a - b)^2 = a^2 - 2ab + b^2')
    ws.math_block(r'(a + b)(a - b) = a^2 - b^2')
    ws.para([T('Note '), M(r'(a+b)^2 \neq a^2 + b^2'),
             T(' — the middle term is the one everybody drops.')])
    ws.para([B('Collecting like terms')])
    ws.para([T('Only terms with '), I('identical'), T(' letters and powers combine. '),
             M('3x'), T(' and '), M('3x^2'), T(' are not like terms.')])
    ws.para([B('Substitution')])
    ws.para([T('Put brackets round a negative value before you square it: if '), M('x = -3'),
             T(' then '), M('x^2 = (-3)^2 = 9'), T(', not '), M('-9'), T('.')])
    _mistakes(ws, [
        'Forgetting the middle term when squaring a bracket.',
        'Changing only the first sign when a minus sits in front of a bracket.',
        'Adding unlike terms such as $2x + 3x^2$.',
        'Squaring a negative substitution without brackets.',
    ])


# ---------------------------------------------------------------- Map Scales
def n_mapscales(ws):
    ws.para([B('Notes:')])
    ws.para([B('What a scale means')])
    ws.para([T('A scale of '), M('1 : n'), T(' means 1 unit on the map is '), M('n'),
             T(' of the same units on the ground. The ratio has '), B('no units'),
             T(' — both sides must be converted to the same unit first.')])
    ws.para([B('The conversions you need')])
    ws.math_block(r'1 \text{ km} = 1000 \text{ m} = 100\,000 \text{ cm}')
    ws.math_block(r'1 \text{ m}^2 = 10\,000 \text{ cm}^2 \qquad 1 \text{ km}^2 = 1\,000\,000 \text{ m}^2')
    ws.para([B('Length, area and the square')])
    ws.para([T('If the length scale is '), M('1 : n'), T(', the '), B('area'), T(' scale is '),
             M('1 : n^2'), T('.')])
    ws.math_block(r'\text{scale } 1 : 50\,000 \quad\Rightarrow\quad \text{area scale } 1 : 2\,500\,000\,000')
    ws.para([T('This is where most marks go. An area on the map must be multiplied by '), M('n^2'),
             T(', not by '), M('n'), T('.')])
    ws.para([B('A reliable order of work')])
    ws.para([T('1.  Write the scale as '), M('1 : n'), T(' with both sides in the same unit.')])
    ws.para([T('2.  Decide whether the question is about length or area.')])
    ws.para([T('3.  Multiply or divide, then convert to the unit the question asks for — last.')])
    _mistakes(ws, [
        'Using the length scale on an area.',
        'Forgetting that $1\\text{ m}^2 = 10\\,000\\text{ cm}^2$, not $100$.',
        'Leaving units inside the ratio.',
        'Converting to the final unit at the start and then converting again.',
    ])


# --------------------------------------------------- Simultaneous Equations
def n_simeq(ws):
    ws.para([B('Notes:')])
    ws.para([B('Elimination')])
    ws.para([T('Make the coefficients of one letter match, then add or subtract.')])
    ws.para([T('Same sign — '), B('subtract'), T('. Different signs — '), B('add'), T('.')])
    ws.para([T('Multiply one or both equations first if nothing matches.')])
    ws.para([B('Substitution')])
    ws.para([T('Best when one equation already has a letter on its own, such as '),
             M('y = 3x - 1'), T('. Substitute it into the other equation, solve, then '
               'substitute back to find the second letter.')])
    ws.para([B('Always find both letters')])
    ws.para([T('An answer with only '), M('x'), T(' in it is half a solution. '
               'Substitute back into the '), I('simpler'), T(' original equation.')])
    ws.para([B('Checking')])
    ws.para([T('Put both values into the equation you did '), I('not'),
             T(' use for the substitution. If it balances, the pair is right — this costs '
               'ten seconds and catches sign errors.')])
    ws.para([B('Word problems')])
    ws.para([T('Say what each letter stands for, '), I('including units'),
             T(', before forming the equations. Two unknowns need two equations.')])
    _mistakes(ws, [
        'Adding when the signs are the same, or subtracting when they differ.',
        'Multiplying only one term of an equation instead of every term.',
        'Stopping after finding one unknown.',
        'Not defining the letters in a word problem.',
    ])


# ------------------------------------------------------- Subject of Formula
def n_subject(ws):
    ws.para([B('Notes:')])
    ws.para([B('The goal')])
    ws.para([T('Rearrange until the required letter stands alone on one side. Whatever you do '
               'to one side, do to the other.')])
    ws.para([B('The usual order')])
    ws.para([T('1.  Clear fractions — multiply every term by the denominator.')])
    ws.para([T('2.  Expand any brackets.')])
    ws.para([T('3.  Collect every term containing the wanted letter on one side, everything '
               'else on the other.')])
    ws.para([T('4.  Factorise out the wanted letter.')])
    ws.para([T('5.  Divide by the bracket.')])
    ws.para([B('When the letter appears twice')])
    ws.para([T('Step 4 is the one students miss. If '), M('ax = bx + c'), T(', then')])
    ws.math_block(r'ax - bx = c \quad\Rightarrow\quad x(a - b) = c \quad\Rightarrow\quad x = \dfrac{c}{a - b}')
    ws.para([B('Roots and squares')])
    ws.para([T('To undo a square, take the square root of '), B('both sides'),
             T(' — and write '), M(r'\pm'), T(' if the context allows a negative value. '
               'To undo a square root, square both sides.')])
    _mistakes(ws, [
        'Dividing by only part of an expression instead of the whole bracket.',
        'Failing to factorise when the wanted letter appears in two terms.',
        'Multiplying only some terms when clearing a fraction.',
        'Square-rooting term by term: $\\sqrt{a^2 + b^2}$ is not $a + b$.',
    ])


# ------------------------------------- Quadratic Equations and Applications
def n_quadratic(ws):
    ws.para([B('Notes:')])
    ws.para([B('Get it to zero first')])
    ws.math_block(r'ax^2 + bx + c = 0')
    ws.para([T('Nothing below works until one side is 0.')])
    ws.para([B('Three methods')])
    ws.para([T('Factorisation — fastest when it works. If '), M('(x - p)(x - q) = 0'),
             T(' then '), M('x = p'), T(' or '), M('x = q'), T('.')])
    ws.para([T('The formula — always works:')])
    ws.math_block(r'x = \dfrac{-b \pm \sqrt{b^2 - 4ac}}{2a}')
    ws.para([T('Completing the square — needed when the question asks for it or wants the '
               'turning point.')])
    ws.para([B('Reading the question')])
    ws.para([T('"Solve" wants exact values or the accuracy stated. "Correct to 2 decimal places" '
               'means the formula, not factorisation.')])
    ws.para([B('Word problems')])
    ws.para([T('1.  Define the unknown with its unit.')])
    ws.para([T('2.  Form the equation from the sentence.')])
    ws.para([T('3.  Solve.')])
    ws.para([T('4.  '), B('Reject the impossible root'),
             T(' — a length, a age or a number of people cannot be negative — and say why.')])
    ws.para([T('5.  Answer the question actually asked, which is often not '), M('x'), T(' itself.')])
    _mistakes(ws, [
        'Using the formula without writing the equation as $ax^2 + bx + c = 0$ first.',
        'Dropping a negative sign when reading off $b$ or $c$.',
        'Keeping a negative root for a length or an age.',
        'Solving for $x$ and forgetting the question asked for the perimeter.',
    ])


# -------------------------------------------------------------- Factorization
def n_factorization(ws):
    ws.para([B('Notes:')])
    ws.para([B('Always look for a common factor first')])
    ws.math_block(r'6x^2 + 9x = 3x(2x + 3)')
    ws.para([T('Take out the '), I('highest'), T(' common factor, numbers and letters together.')])
    ws.para([B('Difference of two squares')])
    ws.math_block(r'a^2 - b^2 = (a + b)(a - b)')
    ws.para([T('Only for a '), B('difference'), T('. '), M('a^2 + b^2'), T(' does not factorise.')])
    ws.para([B('Quadratic trinomials')])
    ws.para([T('For '), M('x^2 + bx + c'), T(', find two numbers that '), B('multiply to '),
             M('c'), T(' and '), B('add to '), M('b'), T('.')])
    ws.para([T('When '), M('a \\neq 1'), T(', multiply '), M('a'), T(' by '), M('c'),
             T(', find two numbers multiplying to '), M('ac'), T(' and adding to '), M('b'),
             T(', split the middle term and group.')])
    ws.para([B('Grouping — four terms')])
    ws.math_block(r'ax + ay + bx + by = a(x + y) + b(x + y) = (a + b)(x + y)')
    ws.para([B('Check by expanding')])
    ws.para([T('Multiplying your brackets back out takes seconds and catches every sign error.')])
    _mistakes(ws, [
        'Taking out only part of the common factor, e.g. $2$ instead of $6x$.',
        'Trying to factorise $a^2 + b^2$.',
        'Getting the signs the wrong way round in the two brackets.',
        'Stopping after the common factor when the bracket factorises further.',
    ])


# --------------------------------------------------------- Algebraic Fractions
def n_fractions(ws):
    ws.para([B('Notes:')])
    ws.para([B('Simplifying')])
    ws.para([T('Factorise the top and the bottom '), B('completely'),
             T(', then cancel whole brackets.')])
    ws.math_block(r'\dfrac{x^2 - 9}{x^2 + 4x + 3} = \dfrac{(x+3)(x-3)}{(x+3)(x+1)} = \dfrac{x-3}{x+1}')
    ws.para([T('You may only cancel '), I('factors'), T(', never individual terms. In '),
             M(r'\dfrac{x + 3}{x}'), T(' the '), M('x'), T(' does not cancel.')])
    ws.para([B('Multiplying and dividing')])
    ws.para([T('Multiply: factorise, cancel across, then combine.')])
    ws.para([T('Divide: turn the second fraction upside down and multiply.')])
    ws.para([B('Adding and subtracting')])
    ws.para([T('Factorise every denominator, take the lowest common denominator, rewrite both '
               'fractions over it, then combine the numerators.')])
    ws.para([T('Put the second numerator in a bracket before subtracting:')])
    ws.math_block(r'\dfrac{A}{d} - \dfrac{B + C}{d} = \dfrac{A - (B + C)}{d}')
    ws.para([B('Solving an equation with fractions')])
    ws.para([T('Multiply '), B('every term'), T(' by the common denominator to clear them, '
               'then solve as usual.')])
    _mistakes(ws, [
        'Cancelling a term instead of a factor.',
        'Forgetting the bracket when subtracting a two-term numerator.',
        'Using the product of the denominators when a smaller common denominator exists.',
        'Multiplying only some terms when clearing fractions from an equation.',
    ])


# --------------------------------------------------------- Algebraic Identities
def n_identities(ws):
    ws.para([B('Notes:')])
    ws.para([B('Identity or equation?')])
    ws.para([T('An '), B('equation'), T(' is true for particular values of the letter. An '),
             B('identity'), T(' is true for '), I('every'), T(' value, and is written with '),
             M(r'\equiv'), T('.')])
    ws.para([B('The standard identities')])
    ws.math_block(r'(a + b)^2 = a^2 + 2ab + b^2')
    ws.math_block(r'(a - b)^2 = a^2 - 2ab + b^2')
    ws.math_block(r'(a + b)(a - b) = a^2 - b^2')
    ws.para([B('Using them in reverse')])
    ws.para([T('Recognising the pattern is what saves time:')])
    ws.math_block(r'x^2 + 10x + 25 = (x + 5)^2 \qquad 49 - y^2 = (7 + y)(7 - y)')
    ws.para([B('Comparing coefficients')])
    ws.para([T('If two expressions are identical, the coefficient of each power must match on '
               'both sides. Compare the '), M('x^2'), T(' terms, then the '), M('x'),
             T(' terms, then the constants, and solve the resulting equations.')])
    ws.para([B('Mental arithmetic')])
    ws.para([T('The identities make some numerical work quick:')])
    ws.math_block(r'98 \times 102 = (100 - 2)(100 + 2) = 10\,000 - 4 = 9996')
    _mistakes(ws, [
        'Writing $(a+b)^2 = a^2 + b^2$.',
        'Losing the minus sign on the middle term of $(a-b)^2$.',
        'Applying the difference of two squares to a sum.',
        'Comparing coefficients without first expanding both sides fully.',
    ])


SHEETS = [
    dict(level='S2', folder='S2', level_line=LL, tags=['Proportion'],
         title='Proportion', filename='09 Proportion Revision.docx', notes=n_proportion,
         skill_titles=['Direct and Inverse Proportion — Finding k First',
                       'Applying the Constant of Proportionality']),
    dict(level='S2', folder='S2', level_line=LL, tags=['Congruency and Similarity'],
         title='Congruency and Similarity', filename='11 Congruency and Similarity Revision.docx',
         notes=n_congruency,
         skill_titles=['Proving Two Triangles Are Similar',
                       'Using the Ratio of Corresponding Sides']),
    dict(level='S2', folder='S2', level_line=LL, tags=["Pythagoras' Theorem", 'Trigonometry'],
         title="Pythagoras' Theorem and Trigonometry",
         filename='12 Pythagoras Theorem and Trigonometry Revision.docx', notes=n_pythagoras,
         skill_titles=['Finding a Missing Side With Pythagoras',
                       'Choosing the Right Trigonometric Ratio']),
    dict(level='S2', folder='S2', level_line=LL, tags=['Statistics'],
         title='Statistics', filename='16 Statistics Revision.docx', notes=n_stats,
         skill_titles=['Mean, Median and Mode From a Table',
                       'Comparing Two Sets of Data']),
    dict(level='S2', folder='S2', level_line=LL, tags=['Algebra (Expansion)', 'Algebra (Expressions)'],
         title='Algebra — Expansion and Expressions',
         filename='03 Algebra Expansion and Expressions Revision.docx', notes=n_algebra,
         skill_titles=['Expanding and Simplifying', 'Substituting Into an Expression']),
    dict(level='S2', folder='S2', level_line=LL, tags=['Map Scales'],
         title='Map Scales', filename='10 Map Scales Revision.docx', notes=n_mapscales,
         skill_titles=['Converting a Length Using the Scale',
                       'Using the Square of the Scale for an Area']),
    dict(level='S2', folder='S2', level_line=LL, tags=['Algebra (Simultaneous Equations)'],
         title='Simultaneous Equations', filename='01 Simultaneous Equations Revision.docx',
         notes=n_simeq,
         skill_titles=['Solving by Elimination', 'Forming Equations From a Word Problem']),
    dict(level='S2', folder='S2', level_line=LL, tags=['Algebra (Subject of Formula)'],
         title='Subject of a Formula', filename='06 Subject of Formula Revision.docx',
         notes=n_subject,
         skill_titles=['Rearranging a Formula', 'When the Letter Appears Twice']),
    dict(level='S2', folder='S2', level_line=LL, tags=['Algebra (Quadratic Equations)'],
         title='Quadratic Equations and Applications',
         filename='07 Quadratic Equations and Applications Revision.docx', notes=n_quadratic,
         skill_titles=['Solving a Quadratic Equation', 'Forming and Solving From a Word Problem']),
    dict(level='S2', folder='S2', level_line=LL, tags=['Algebra (Factorization)'],
         title='Factorisation', filename='04 Factorization Revision.docx', notes=n_factorization,
         skill_titles=['Common Factors and the Difference of Two Squares',
                       'Factorising a Quadratic Trinomial']),
    dict(level='S2', folder='S2', level_line=LL, tags=['Algebra (Fractions)'],
         title='Algebraic Fractions', filename='05 Algebraic Fractions Revision.docx',
         notes=n_fractions,
         skill_titles=['Simplifying by Factorising and Cancelling',
                       'Adding and Subtracting With a Common Denominator']),
    dict(level='S2', folder='S2', level_line=LL, tags=['Algebra (Identities)'],
         title='Algebraic Identities', filename='03 Algebraic Identities Revision.docx',
         notes=n_identities,
         skill_titles=['Using the Standard Identities', 'Comparing Coefficients']),
]

if __name__ == "__main__":
    for cfg in SHEETS:
        print(f"\n=== {cfg['title']}")
        try:
            build(cfg)
        except Exception as e:
            print(f"   !! FAILED: {type(e).__name__}: {e}")
