"""JC2 H2 Permutations and Combinations -- the manual of methods.

Thirteen sections, each one method, each one taken from a JC2 H2 prelim paper
2023 to 2025:

    A  the two counting principles            H  selections
    B  arranging distinct objects in a row    I  selection with cases
    C  objects that must be together          J  dividing into groups
    D  repeated (identical) objects           K  placing objects into positions
    E  objects that must be apart             L  counting a probability
    F  circular arrangements                  M  traps, and how to avoid them
    G  complements and inclusion-exclusion

A practice question is filed under the method it is chiefly about.  A prelim
question mixes methods, so a later part of one may reach into a section further
on -- that is how the questions come in the paper.

Run with the venv python (python-docx lives there):
    $S/venv/bin/python scripts/revision-builders/build_pc.py
"""
import tempfile
from pathlib import Path

from build_lib import (R, sheet, fetch, place_figures, render_parts,
                       render_practice, save, strip_marks, T, B, I, M)


# --- worked examples -------------------------------------------------------
# 8-char bank-id prefixes.  A row used here may NOT also appear in a practice
# list: render_practice lays out the WHOLE row, so the two halves are disjoint.
EX = {
    'doors':      '086ca281',   # HCI 2024 Q8   -- stages multiply, cases add
    'dresses':    'a123b57d',   # VJC 2023 Q10  -- (a) only: a chain of choices
    'teachers':   '5f09e6b3',   # MI 2024 Q6    -- a row, ends fixed; the at-least-one trap
    'two_rows':   '78ab7e27',   # NJC 2024 Q11  -- (a) only: two rows of four
    'prizes':     'b26c4821',   # HCI 2023 Q6   -- the grouping (block) method
    'coffee':     'a152544a',   # RI 2024 Q6    -- the slotting (gap) method
    'refresh':    'fd51de4e',   # TJC 2024 Q6   -- identical letters; a 4-letter codeword
    'beads':      'd5f555f9',   # YIJC 2023 Q7  -- (a) only: identical beads in a line
    'round_bg':   'a0e797c9',   # RI 2023 Q6    -- the three circle conditions
    'traits':     '13c771c9',   # EJC 2023 Q9   -- complement, cases, inclusion-exclusion
    'staff':      '8adb2375',   # SAJC 2024 Q7  -- a circle read through n(A u B)
    'orbs':       'e1bf5e20',   # JPJC 2025 Q5  -- at least two colours, at least one of each
    'bricks':     '317aee18',   # JPJC 2023 Q7  -- selection cases, then a value constraint
    'basket':     'de94d9d2',   # CJC 2025 Q5   -- (c)(d) only: one player who can fill two roles
    'bookkeeper': 'd2f8c9ec',   # ASRJC 2025 Q11-- (b) only: 4 letters from a word, all cases
    'teams2':     'ce9b139b',   # RVHS 2023 Q7  -- circle cases, fixed order, identical teams
    'groups3':    'feb34512',   # YIJC 2024 Q7  -- (b)(c) only: when NOT to divide by 3!
    'pairs3':     '19346a4b',   # TJC 2023 Q5   -- (a) only: labelled pairs
    'treasure':   'bfacec62',   # TJC 2025 Q6   -- objects into locations, at most one each
    'taxis':      'b4026071',   # SAJC 2025 Q6  -- (a) only: split into two named taxis, then seat
    'officers':   'a235263a',   # CJC 2023 Q7   -- probability counted top and bottom the same way
}


# --- deliberately left out of the sheet ------------------------------------
# bf0ad348  ACJC 2023 Q8  -- the stored key for (a)(i) contradicts its own
#                            working, and (b) asks about star and flower shapes
#                            the stem never introduces.
# 824571c6  DHS 2023 Q6   -- the stem says a 7-character passcode; every part of
#                            the stored solution uses 8 positions.
# 2683a42a  ASRJC 2023 Q8 -- (b) depends on "the 5 girls", who appear nowhere in
#                            the stem, and (b)(ii)'s key is one case of its own
#                            answer.
# 72e4616b  DHS 2024 Q7   -- all three stored solutions argue with themselves
#                            instead of solving the question.

PRACTICE_A = [
    'efe4970c-4a11-438d-aa76-aa20c891db31',   # VJC 2025 Q5  -- letters then digits, repeats allowed
]
PRACTICE_B = [
    '0e56ff34-391a-4f61-989e-3a015d847cbf',   # NYJC 2024 Q6 -- a row of ten parking lots
]
PRACTICE_C = [
    '3152b317-3b73-46c5-9b37-21924934b995',   # VJC 2024 Q5  -- couples together, then a group
]
PRACTICE_D = [
    'ab21d0cd-abcc-47e9-a932-1ebb7acf1f7e',   # JJC 2024 Q6  -- a word with three repeated letters
    'd1c7bf6c-c0a2-4fea-9d1d-73dba184f0d5',   # NJC 2025 Q7  -- identical units, "or", fixed order
]
PRACTICE_E = [
    'caede2be-8418-48e3-9ee4-185c46787eca',   # YIJC 2025 Q6 -- identical bricks, oranges apart
]
PRACTICE_F = [
    '3dfb0cc2-eb31-4ef2-9f42-6563c0d344ae',   # RVHS 2025 Q6 -- a circle of slices, then sharing
    'aa151e69-81ba-4f77-9e4c-6ed7dfa89792',   # EJC 2025 Q5  -- a circular tray, then a row
]
PRACTICE_G = [
    '8147904e-87c7-43a9-a88d-12c6f2e39450',   # HCI 2025 Q5  -- "or, but not both"
    '5df73617-7402-4014-b33a-611b39e94eb9',   # ASRJC 2024 Q5-- notes and beats, "but not both"
]
PRACTICE_H = [
    'e9cebfbb-4c8e-4eae-b724-71d04d9cfbac',   # ASRJC 2024 Q8 -- ten people, five named roles
]
PRACTICE_I = [
    '6742f518-eff9-4848-83d0-c6f47cbbdb15',   # ACJC 2024 Q7 -- a setlist, a team, two circles
    'e7d943d8-d34a-4658-9d60-0de595fd10c8',   # RI 2025 Q6   -- charms by size: circle, row, cases
]
PRACTICE_J = [
    'a092bd0a-8717-4758-90c3-6f303e2bb5c3',   # ACJC 2025 Q7 -- three groups, three named games
]
PRACTICE_L = [
    'c682e71f-0fae-4ea8-9900-1e38a7b814bc',   # MI 2023 Q9   -- roles, at least one of each, a circle
    'f1113d37-fe72-4f0b-b56b-72af78723d76',   # NJC 2023 Q7  -- three families, four methods
    'e5aced59-bfe4-4b2d-b7f0-10c75aa6258f',   # RVHS 2024 Q6 -- counting the factors of a number
]
# Section K has no practice.  Its two methods are exercised by the sharing half
# of the RVHS 2025 practice in F and by the ACJC 2025 practice in J.


# {question id: the stem to print}.  RVHS 2025's stored stem has lost the number
# of slices in a pizza -- it reads "slices forms a full pizza" -- and neither
# answer depends on it, so the sentence is restored to something a student can
# read.  Printed at build time.
STEMS = {
    '3dfb0cc2-eb31-4ef2-9f42-6563c0d344ae':
        'A pizzeria sells pizza by individual slices, and 8 slices form a '
        'full pizza.',
}

# {full id: {part label: the text to print}} for a PRACTICE row whose part the
# extraction mangled.  NJC 2025 Q7(b) stored the example train AFTER the "Find
# the number of ways" line and its own "[3]", wrapped it in markdown stars the
# renderer would show raw, and typed the first six letters in Cyrillic.  The
# train is put back where the paper has it, in Latin letters.  Printed at build
# time, for Adrian to carry back to the bank.
PART_TEXTS = {
    # YIJC 2025 Q6 printed one asking over (b)(i) and (b)(ii); the bank flattened
    # it into (b) and (c), which leaves (c) with no verb of its own, and (b)
    # keeps the blank line where the paper had the diagram -- the diagram the
    # sheet prints above part (a), so the words point up to it instead.
    'caede2be-8418-48e3-9ee4-185c46787eca': {
        'b': 'A girl plans to arrange the 10 bricks in 4 rows as shown in the '
             'diagram above. Find the number of arrangements if there are no '
             'restrictions.',
        'c': 'Find the number of arrangements in which exactly two orange '
             'bricks and only one white brick are in the same row.',
    },
    # RI 2025 Q6 kept the "[" of its own "[3]" on the end of part (a), lost the
    # last letter of "chain" in part (c) and set two of that part's three "cm"
    # in maths italics while the third stayed upright.
    'e7d943d8-d34a-4658-9d60-0de595fd10c8': {
        'a': 'Kitty arranges all the charms in a circle on a corkboard with '
             'charms of the same sizes next to each other. How many ways are '
             'there for her to do so?',
        'c': 'The diameters of all the small, medium and large charms are '
             '0.5 cm, 1 cm and 2 cm respectively. Each of the spherical charms '
             'has a hole through its centre that allows it to be threaded '
             'through a chain. Kitty makes a keychain that includes a 6 cm '
             'chain with one end attached to a keyring, as shown in Fig. 1. It '
             'is given that the 6 cm chain is fully threaded with charms, with '
             'no gaps between them, and is stretched taut in a straight line. '
             'For example, Fig. 2 shows the 6 cm chain threaded with 2 large '
             'and 2 medium charms. How many different ways can she make a '
             'keychain with at least one charm of each of the three sizes?',
    },
    'd1c7bf6c-c0a2-4fea-9d1d-73dba184f0d5': {
        'b': 'For another kind of toy train, all the train units are placed in '
             'a line such that the first train unit is an engine and all the '
             'carriages are in front of the wagons. An example of such a toy '
             'train is E C C E E C W E W. Find the number of ways to form the '
             'toy train.',
    },
}

# {8-char id: {label path: the text to print}} for a WORKED EXAMPLE whose part
# text is unusable.  SAJC 2025's part (a) is the extractor's placeholder, and
# its (a)(i) carries a stray "[2]" in the middle of the sentence with the
# diagram's own sentence stuck on the end.  Printed at build time.
TEXTS = {
    'b4026071': {
        'a': '',
        'a/i': 'Find the number of different ways in which this can be done '
               'if each married couple must travel together in the same taxi.',
        'a/ii': 'Each taxi can take 1 passenger in the front and 3 passengers '
                'in a row at the back. Find the number of seating '
                'arrangements so that each married couple sit next to each '
                'other at the back of the taxi.',
    },
}


# ---------------------------------------------------------------------------
def ask(ws, row, figdir=None, keep=None, cap_h=8.0, stem=None, table=None,
        show_marks=True):
    """The exam question, verbatim from the bank, marks right-aligned in [n].

    `keep` is a tuple of part labels for a question whose other parts belong to
    a different chapter -- a probability distribution, a binomial, sampling
    theory.  Such a row can only be a worked example, because render_practice
    lays out a whole row and a practice question may not ask for a method this
    sheet does not teach.  What was dropped is printed at build time.

    A part whose stored text is unusable is replaced from TEXTS, keyed by its
    label path ("a", or "a/i" for a sub-part), and that too is printed.

    `stem` replaces the question's own words, and `table` puts the figures a
    stem says are "in the table below" into a real table instead of leaving
    them run together inside the sentence.  Both are printed at build time.

    `show_marks=False` holds the marks back on a question with no parts whose
    words carry on past a table -- the [n] belongs at the end of the asking,
    not at the end of the first half of it.
    """
    short = row["id"][:8]
    bank_stem = (row.get("question_text") or "").strip()
    if stem is None:
        stem = bank_stem
    else:
        print(f"  [stem] {short} replaced -- bank stem is "
              f"{bank_stem[:60]!r}...")
        stem = stem.strip()
    parts = [p for p in (row.get("parts") or []) if isinstance(p, dict)]

    if keep:
        had = [str(p.get("label") or "?") for p in parts]
        parts = [p for p in parts if str(p.get("label") or "") in keep]
        print(f"  [trim] {short} kept ({') ('.join(keep)}) of "
              f"({') ('.join(had)})")

    swaps = TEXTS.get(short)
    if swaps:
        parts = [dict(p) for p in parts]
        for p in parts:
            path = str(p.get("label") or "")
            if path in swaps:
                print(f"  [text] {short} part ({path}) replaced -- bank text "
                      f"is {(p.get('text') or '')[:40]!r}")
                p["text"] = swaps[path]
            subs = [dict(s) for s in (p.get("subparts") or [])
                    if isinstance(s, dict)]
            for s in subs:
                sp = f"{path}/{s.get('label') or ''}"
                if sp in swaps:
                    print(f"  [text] {short} part ({sp}) replaced -- bank text "
                          f"is {(s.get('text') or '')[:40]!r}")
                    s["text"] = swaps[sp]
            if subs:
                p["subparts"] = subs

    if stem:
        ws.para(R.split_math(stem),
                marks=None if (parts or not show_marks)
                else row.get("total_marks"))

    if table:
        ws.data_table(table, label_w_cm=4.2)

    place_figures(ws, row, figdir, cap_h=cap_h)

    if parts:
        ws.parts()
        # an example's (a) sits at the margin, so its (i) (ii) step in once
        render_parts(ws, parts, roman_level=1, figdir=figdir, cap_h=cap_h)


def mistakes(ws, items):
    ws.para([B('Mistakes to avoid')])
    for i, e in enumerate(items, 1):
        ws.para([T(f'{i}.  ')] + R.split_math(e))


# --- A. the two counting principles ----------------------------------------
def notes_a(ws):
    ws.para([B('Notes')])
    ws.para([B('Two questions settle almost every count')])
    ws.para([T('First: '), B('are these stages, or are these cases?'),
             T('  Stages happen one after another and the counts '),
             B('multiply'), T('.  Cases are alternatives, only one of which '
                              'happens, and the counts '), B('add'), T('.')])
    ws.para([T('Second: '), B('does order matter?'),
             T('  If the objects go into positions that can be told apart — '
               'seats, prizes, the letters of a code — the count is a '),
             B('permutation'), T('.  If they only have to be chosen — a '
                                 'committee, a hand of cards, a set of '
                                 'colours — it is a '), B('combination'),
             T('.')])
    ws.math_block(r'^{n}P_{r} \;=\; \frac{n!}{(n-r)!} '
                  r'\qquad\qquad ^{n}C_{r} \;=\; \frac{n!}{r!\,(n-r)!}')
    ws.para([T('Both formulas take '), M(r'r'), T(' objects from '), M(r'n'),
             T(' different objects, with each object used at most once.')])
    ws.para([B('When repetition is allowed')])
    ws.para([T('If each position may reuse any object, the positions are '
               'independent stages, so a run of '), M(r'r'),
             T(' positions each with '), M(r'n'), T(' choices gives')])
    ws.math_block(r'\underbrace{n \times n \times \cdots \times n}_{r\ \text{positions}} '
                  r'\;=\; n^{\,r}')
    ws.para([T('A padlock code, a colour for each door, a note for each bar: '
               'these are '), M(r'n^{\,r}'), T(' questions, not '),
             M(r'^{n}P_{r}'), T(' questions.')])
    mistakes(ws, [
        'Adding two stages. Choosing a shirt and then a tie is one outfit '
        'built in two steps, so the counts multiply.',
        'Multiplying two cases. "Two girls or three girls" cannot both '
        'happen, so the counts add.',
        r'Using $^{n}P_{r}$ for a committee. Nobody on it has a title, so '
        r'order does not matter and the count is $^{n}C_{r}$.',
        r'Using $^{n}C_{r}$ when the places are named. Chairman, secretary '
        r'and treasurer are three different jobs, so multiply by $3!$ after '
        r'choosing, or use $^{n}P_{r}$ straight away.',
        r'Reading "repetition allowed" and still writing $^{n}P_{r}$. Each '
        r'position keeps all $n$ choices, so the answer is $n^{\,r}$.',
    ])


def worked_a(ws, bank, figdir):
    ws.concept('Stages Multiply, Cases Add')
    ws.example()
    ask(ws, bank['doors'], figdir, cap_h=5.0)
    ws.solution_box([
        ('(a)', [
            [T('Each door is painted independently, so the five doors are '
               'five stages, each with 4 colours to choose from.')],
            r'4 \times 4 \times 4 \times 4 \times 4 = 4^{5} = 1024'
            r'\quad\text{← repetition is allowed, so every door keeps all 4 colours}',
        ]),
        ('(b)', [
            [T('Paint the doors in the order A, B, C, D, E.  Door A is free.  '
               'Every later door has to differ from the one just before it, '
               'which rules out exactly one colour.')],
            r'\begin{aligned}'
            r'&4 \times 3 \times 3 \times 3 \times 3 \\'
            r'&= 4 \times 3^{4} \\'
            r'&= 324'
            r'\end{aligned}',
            [T('The count of 3 does not depend on '), I('which'),
             T(' colour came before, which is why the stages may simply be '
               'multiplied.')],
        ]),
        ('(c)', [
            [T('Five doors carry four colours and every colour is used, so '
               'exactly one colour appears twice and the other three appear '
               'once each.')],
            r'\begin{aligned}'
            r'\text{the two doors sharing a colour:}\quad & ^{5}C_{2} = 10 \\'
            r'\text{the colour they share:}\quad & 4 \\'
            r'\text{the other three doors:}\quad & 3! = 6'
            r'\end{aligned}',
            [T('The three stages are independent, so they multiply.')],
            r'10 \times 4 \times 6 = 240',
            ('check', [T('240 is smaller than the 1024 of part (a), as it '
                         'must be — using every colour is a restriction.')]),
        ]),
    ], keep_together=False)

    ws.example()
    ask(ws, bank['dresses'], figdir, keep=('a',))
    ws.solution_box([
        ('(a)', [
            [T('Only the fourth woman has the extra two colours, so split on '
               'what she wears.  The two cases cannot both happen, so they '
               'add.')],
            [B('Case 1: '), T('the fourth woman wears white or red.')],
            [T('That colour is not available to anybody else, so the three '
               'women on her left form their own chain and the three on her '
               'right form another.  In each chain the first woman has 3 '
               'colours and each of the other two has to avoid one colour.')],
            r'\begin{aligned}'
            r'2 \times (3 \times 2 \times 2) \times (3 \times 2 \times 2)'
            r'&= 2 \times 3^{2} \times 2^{4} \\'
            r'&= 288'
            r'\end{aligned}',
            [B('Case 2: '), T('the fourth woman wears pink, blue or green.')],
            [T('Now her colour blocks one choice for the woman beside her, so '
               'work outwards from her in both directions.')],
            r'\begin{aligned}'
            r'3 \times (2 \times 2 \times 2) \times (2 \times 2 \times 2)'
            r'&= 3 \times 2^{6} \\'
            r'&= 192'
            r'\end{aligned}',
            [T('The cases are alternatives, so add.')],
            r'288 + 192 = 480',
        ]),
    ], keep_together=False)


# --- B. arranging distinct objects in a row --------------------------------
def notes_b(ws):
    ws.para([B('Notes')])
    ws.para([T('If '), M(r'n'), T(' different objects are placed in a row of '),
             M(r'n'), T(' positions, the first position has '), M(r'n'),
             T(' choices, the next has '), M(r'n-1'), T(', and so on:')])
    ws.math_block(r'n \times (n-1) \times (n-2) \times \cdots \times 1 \;=\; n!')
    ws.para([B('The position you are told about is the position you fill first')])
    ws.para([T('A restriction always names a place — the two ends, the middle '
               'seat, the last song. Settle that place first, then fill what '
               'is left with everybody else. Filling the free positions first '
               'leaves the restricted one holding whatever remains, and the '
               'count of choices there changes from case to case.')])
    ws.para([T('Two ends given to 2 particular people out of 10:')])
    ws.math_block(r'\underbrace{2!}_{\text{the 2 ends}} \times '
                  r'\underbrace{8!}_{\text{the other 8 positions}} \;=\; 80640')
    ws.para([B('Two rows are still one row')])
    ws.para([T('Eight people in two rows of four stand in 8 different '
               'positions, so there are '), M(r'8!'),
             T(' arrangements — the same count as one row of eight. The rows '
               'matter only when a restriction mentions them.')])
    mistakes(ws, [
        'Filling the free positions first. The restricted position is then '
        'left with a count that depends on what has already been used.',
        r'Writing $10!$ when 2 of the 10 positions are already spoken for. '
        r'Those 2 positions are filled separately, and the other 8 give $8!$.',
        'Treating two rows of four as something new. Eight positions that can '
        'be told apart give $8!$, whatever shape they are in.',
        'Reading "the 2 teachers stand at the two ends" as one arrangement. '
        'They can swap, which is the $2!$.',
    ])


def worked_b(ws, bank, figdir):
    ws.concept('Settle the Restricted Positions, Then Fill the Rest')
    ws.example()
    ask(ws, bank['teachers'], figdir)
    ws.solution_box([
        ('(a)', [
            [T('The two ends are the positions the question names, so give '
               'them to the 2 teachers first.')],
            r'\begin{aligned}'
            r'\text{the 2 teachers into the 2 ends:}\quad & 2! = 2 \\'
            r'\text{the other 8 people into the other 8 positions:}\quad & 8! = 40320'
            r'\end{aligned}',
            r'2! \times 8! = 80640',
            [B('No'), T(', the answer would be the same. Either way the '
                        'question sets aside 2 named positions for the 2 '
                        'teachers and leaves 8 positions for the other 8 '
                        'people, so the working reads '), M(r'2! \times 8!'),
             T(' again. Where those 2 positions sit in the row does not enter '
               'the count.')],
        ]),
        ('(b)', [
            [T('The team of 4 must hold at least 1 teacher. Writing '),
             M(r'^{2}C_{1}'), T(' for "the teacher" and '), M(r'^{9}C_{3}'),
             T(' for the rest lets the second teacher appear again among the '
               '3, so a team holding '), I('both'),
             T(' teachers is produced twice — once with each teacher playing '
               'the part of the chosen one.')],
            [T('Count instead by taking away the teams with no teacher at '
               'all.')],
            r'^{10}C_{4} - {}^{8}C_{4} = 210 - 70 = 140',
        ]),
        ('(c)', [
            [T('Every team of 4 is equally likely, so the probability is the '
               'count from (b) over the count of all teams.')],
            r'\frac{140}{^{10}C_{4}} = \frac{140}{210} = \frac{2}{3}',
        ]),
    ], keep_together=False)

    ws.example()
    ask(ws, bank['two_rows'], figdir, keep=('a',))
    ws.solution_box([
        (('(a)', '(i)'), [
            [T('The 8 students stand in 8 different positions, so there are '),
             M(r'8! = 40320'), T(' arrangements with no restriction.')],
            [T('Count the arrangements that break the condition — the 3 '
               'classmates all next to one another in the same row — and take '
               'them away.')],
            [T('A row of 4 holds 3 consecutive positions in 2 ways, and there '
               'are 2 rows, so the run of three sits in '), M(r'2 \times 2 = 4'),
             T(' places.')],
            r'\begin{aligned}'
            r'\text{the run of three:}\quad & 4 \\'
            r'\text{the 3 classmates inside it:}\quad & 3! = 6 \\'
            r'\text{the other 5 students:}\quad & 5! = 120'
            r'\end{aligned}',
            r'4 \times 6 \times 120 = 2880',
            r'8! - 2880 = 40320 - 2880 = 37440',
        ]),
        (('', '(ii)'), [
            [T('A row of 4 that alternates reads either boy-girl-boy-girl or '
               'girl-boy-girl-boy, so each row has 2 patterns.')],
            r'2 \times 2 = 4 \quad\text{← a pattern for the front row and one for the back}',
            [T('Every one of these patterns uses 2 boys and 2 girls in each '
               'row, so all 4 boys go into the 4 boy positions and all 4 '
               'girls into the 4 girl positions.')],
            r'4 \times 4! \times 4! = 4 \times 24 \times 24 = 2304',
        ]),
    ], keep_together=False)


# --- C. objects that must be together --------------------------------------
def notes_c(ws):
    ws.para([B('Notes')])
    ws.para([B('Tie them together and count the units')])
    ws.para([T('If certain objects have to stay next to one another, tape them '
               'into one block. Count the units — the block counts as one — '
               'arrange the units, then arrange the objects inside the block.')])
    ws.math_block(r'\underbrace{(\text{number of units})!}_{\text{the units in a row}} '
                  r'\;\times\; \underbrace{k!}_{\text{inside a block of }k}')
    ws.para([T('Two separate groups that each have to stay together give two '
               'blocks, and each block brings its own internal factor.')])
    ws.para([B('The same idea around a table')])
    ws.para([T('At a round table only the order around the circle can be told '
               'apart, so '), M(r'u'), T(' units give '), M(r'(u-1)!'),
             T(' arrangements instead of '), M(r'u!'),
             T('. The block still brings its '), M(r'k!'), T('.')])
    ws.para([B('Reading the words')])
    ws.para([T('"Together" for 2 objects and "together" for 3 read the same '
               'but count differently. For 3 objects, "all together" means one '
               'block of 3, while "two of them together" means a block of 2 '
               'with the third somewhere else. Decide which one the sentence '
               'says before writing anything.')])
    mistakes(ws, [
        r'Leaving out the $k!$ inside the block. The 2 people who must stand '
        r'together can stand in either order.',
        r'Counting the units as $n$ when a block of $k$ has swallowed $k$ of '
        r'them. Tying 3 people together turns 8 objects into 6 units.',
        r'Using $u!$ around a round table. Only $(u-1)!$ of those are '
        r'different, since turning everybody one seat along changes nothing.',
        'Treating "all 3 together" and "exactly 2 together" as the same '
        'condition. The second one also says the third is apart.',
    ])


def worked_c(ws, bank, figdir):
    ws.concept('The Block Method')
    ws.example()
    ask(ws, bank['prizes'], figdir)
    ws.solution_box([
        ('(a)', [
            [T('Tape the 2 first-prize winners into one block and the 2 '
               'second-prize winners into another. The row then holds the 2 '
               'blocks, the 4 remaining students and the guest of honour.')],
            r'2 + 4 + 1 = 7 \quad\text{← units, since each block counts as one}',
            r'\begin{aligned}'
            r'\text{the 7 units in a row:}\quad & 7! = 5040 \\'
            r'\text{inside the first-prize block:}\quad & 2! = 2 \\'
            r'\text{inside the second-prize block:}\quad & 2! = 2'
            r'\end{aligned}',
            r'5040 \times 2 \times 2 = 20160',
        ]),
        ('(b)', [
            [T('The 10 seats are identical, so an arrangement is fixed by the '
               'order around the table. Seat the guest of honour first and '
               'read the other 9 seats from him.')],
            [T('He must have 4 students on each side, which accounts for all 8 '
               'students, so the one empty seat is the seat directly opposite '
               'him — there is no choice about where the gap falls.')],
            [T('The 8 students then fill the 8 remaining seats.')],
            r'8! = 40320',
            ('check', [T('Seating the guest of honour first is what removes '
                         'the turning, so there is no extra division by 10 at '
                         'the end.')]),
        ]),
    ], keep_together=False)


# --- D. repeated (identical) objects ---------------------------------------
def notes_d(ws):
    ws.para([B('Notes')])
    ws.para([T('If '), M(r'n'), T(' objects include '), M(r'p'),
             T(' of one kind and '), M(r'q'), T(' of another, all alike, then')])
    ws.math_block(r'\text{number of arrangements} \;=\; \frac{n!}{p!\;q!\;\cdots}')
    ws.para([T('The reason is the same each time. Treat the '), M(r'p'),
             T(' copies as different for a moment and there are '), M(r'n!'),
             T(' arrangements, but every real arrangement has been written '),
             M(r'p!'), T(' times, once for each way of shuffling the copies '
                          'among themselves, so divide by '), M(r'p!'), T('.')])
    ws.para([B('An order that is fixed divides in exactly the same way')])
    ws.para([T('If '), M(r'k'), T(' of the objects have to appear in one '
                                  'particular order — tallest to shortest, '
                                  'oldest to youngest — then only 1 of their '),
             M(r'k!'), T(' orders is allowed, so the count is')])
    ws.math_block(r'\frac{n!}{k!}')
    ws.para([T('The objects are different, yet the arithmetic matches the '
               'identical-object case, because in both a group of '), M(r'k'),
             T(' contributes 1 arrangement where it would normally '
               'contribute '), M(r'k!'), T('.')])
    ws.para([B('Choosing from repeated objects is a different job')])
    ws.para([T('The formula above arranges everything. When a question '),
             I('selects'), T(' a few objects from a pile that has repeats — a '
                             '4-letter codeword from an 11-letter word — the '
                             'count splits into cases on how many repeats are '
                             'taken. Example 5 does exactly that.')])
    mistakes(ws, [
        r'Dividing by the number of repeated letters instead of its factorial. '
        r"Three E's divide by $3!$, not by 3.",
        r"Multiplying the divisors of different letters. Two F's and three "
        r"E's give $\dfrac{11!}{2!\,3!}$, so the divisors multiply under one "
        r'line — there is one division, not two separate answers.',
        r'Dividing by $k!$ for a fixed order and then also multiplying by '
        r'$k!$ somewhere. The fixed order is the reason for the division; the '
        r'group contributes 1 arrangement, not $k!$.',
        'Using the arrangement formula to answer a selection question. '
        'Picking 4 letters out of 11 is settled by cases, not by a single '
        'fraction.',
    ])


def worked_d(ws, bank, figdir):
    ws.concept('Divide by the Factorial of Each Repeat')
    ws.example()
    ask(ws, bank['refresh'], figdir)
    ws.solution_box([
        (('(a)', '(i)'), [
            [T('REFRESHMENT has 11 letters, with 3 E’s and 2 R’s '
               'and every other letter once.')],
            r'\frac{11!}{3!\,2!} = \frac{39916800}{12} = 3326400',
        ]),
        (('', '(ii)'), [
            [T('All the E’s together is one block, all the R’s '
               'together is another. With F, S, H, M, N and T that makes')],
            r'1 + 1 + 6 = 8 \quad\text{← units}',
            [T('Inside a block the letters are alike, so a block brings no '
               'factor of its own.')],
            r'8! = 40320 \quad\text{← both blocks are formed, though they may still touch}',
            [T('Take away the arrangements in which the two blocks are next '
               'to each other. Glue them into one long block, which leaves 7 '
               'units, and the two blocks can be glued in either order.')],
            r'7! \times 2 = 5040 \times 2 = 10080',
            r'40320 - 10080 = 30240',
        ]),
        ('(b)', [
            [T('A codeword takes 4 of the letters and puts them in order. '
               'There are 8 different letters available, with E on 3 cards '
               'and R on 2, so split on how many repeats the codeword uses.')],
            [B('Case 1: '), T('4 different letters.')],
            r'^{8}C_{4} \times 4! = 70 \times 24 = 1680',
            [B('Case 2: '), T('one letter twice, the other 2 different.')],
            r'\underbrace{2}_{\text{E or R}} \times \underbrace{^{7}C_{2}}_{\text{the other 2 letters}} '
            r'\times \underbrace{\frac{4!}{2!}}_{\text{arranging}} = 2 \times 21 \times 12 = 504',
            [B('Case 3: '), T('two letters twice each, so EERR.')],
            r'1 \times \frac{4!}{2!\,2!} = 6',
            [B('Case 4: '), T('E three times, with 1 other letter.')],
            r'1 \times \underbrace{7}_{\text{the other letter}} \times \frac{4!}{3!} = 7 \times 4 = 28',
            [T('The four cases are alternatives, so add.')],
            r'1680 + 504 + 6 + 28 = 2218',
        ]),
    ], keep_together=False)

    ws.example()
    ask(ws, bank['beads'], figdir, keep=('a',))
    ws.solution_box([
        ('(a)', [
            [T('The 2 red discs and the blue disc form one block of 3. Inside '
               'it the 2 reds are alike, so the block has')],
            r'\frac{3!}{2!} = 3 \quad\text{← orders inside the block}',
            [T('The line then holds the block and the 6 green discs, which '
               'are alike, so the units are 1 block and 6 identical greens.')],
            r'\frac{7!}{6!} = 7 \quad\text{← the block can sit in any of 7 places}',
            r'7 \times 3 = 21',
        ]),
    ], keep_together=False)


# --- E. objects that must be apart -----------------------------------------
def notes_e(ws):
    ws.para([B('Notes')])
    ws.para([B('Seat the others first, then use the gaps')])
    ws.para([T('"No two of them next to each other" is settled backwards. '
               'Arrange everybody else first; they stand shoulder to shoulder '
               'with gaps between them and one gap at each end. Dropping the '
               'objects that must stay apart into '), I('different'),
             T(' gaps keeps them apart, because a whole object sits between '
               'any two of them.')])
    ws.math_block(r'\underbrace{m!}_{\text{the others in a row}} \;\times\; '
                  r'\underbrace{^{m+1}P_{r}}_{r\text{ different objects into }m+1\text{ gaps}}')
    ws.para([T('If the objects being kept apart are alike, only the choice of '
               'gaps counts, so the second factor is '), M(r'^{m+1}C_{r}'),
             T(' instead.')])
    ws.para([B('A row has one more gap than a circle')])
    ws.para([T('A row of '), M(r'm'), T(' objects has '), M(r'm+1'),
             T(' gaps, counting the two ends. Around a table the two ends join '
               'up, so '), M(r'm'), T(' objects make only '), M(r'm'),
             T(' gaps.')])
    ws.para([B('When "apart" has to be counted the other way')])
    ws.para([T('The gap method needs the objects to be kept apart from '),
             I('one another'),
             T('. If the condition is about one named pair — "A is not beside '
               'B" — it is quicker to count the arrangements where they '
               'are beside each other and take those away.')])
    mistakes(ws, [
        r'Counting $m$ gaps in a row. The two ends are gaps as well, so there '
        r'are $m+1$ of them.',
        r'Counting $m+1$ gaps around a table. The circle has no ends, so there '
        r'are $m$.',
        r'Putting 2 of the apart objects into the same gap. They would then be '
        r'next to each other, which is the condition being broken.',
        r'Using $^{m+1}C_{r}$ when the objects being spread out are different. '
        r'They can be arranged among the chosen gaps, so it is $^{m+1}P_{r}$.',
        'Arranging the apart objects first. The gaps only exist once the '
        'others are in place.',
    ])


def worked_e(ws, bank, figdir):
    ws.concept('The Gap Method')
    ws.example()
    ask(ws, bank['coffee'], figdir)
    ws.solution_box([
        ('(a)', [
            [T('COFFEEHOUSE has 11 letters, with 3 E’s, 2 F’s and '
               '2 O’s.')],
            r'\frac{11!}{3!\,2!\,2!} = \frac{39916800}{24} = 1663200',
        ]),
        ('(b)', [
            [T('Two conditions sit together here. Deal with the "together" '
               'one by making a block, then use the gaps that block leaves '
               'for the "apart" one.')],
            [T('Tie the 2 F’s into one block and set the 3 E’s '
               'aside. What is left to arrange first is')],
            [T('the block, C, O, O, H, U and S — 7 units, with the 2 '
               'O’s alike.')],
            r'\frac{7!}{2!} = \frac{5040}{2} = 2520',
            [T('These 7 units leave 8 gaps, and the 3 E’s go into 3 '
               'different gaps. The E’s are alike, so only the choice of '
               'gaps counts.')],
            r'^{8}C_{3} = 56',
            r'2520 \times 56 = 141120',
        ]),
        ('(c)', [
            [T('Now the cards are being chosen, not arranged. Three different '
               'letters come from the 7 letters that appear in the word: C, '
               'O, F, E, H, U, S.')],
            r'^{7}C_{3} = 35',
        ]),
        ('(d)', [
            [T('Exactly two of the three cards bear the same letter, so that '
               'letter must appear at least twice in COFFEEHOUSE — O, F or E.')],
            r'\begin{aligned}'
            r'\text{the repeated letter:}\quad & 3 \\'
            r'\text{the third card, a different letter:}\quad & 6'
            r'\end{aligned}',
            r'3 \times 6 = 18',
            ('check', [T('The order of selection does not matter here, so '
                         'nothing is multiplied by an arranging factor.')]),
        ]),
    ], keep_together=False)


# --- F. circular arrangements ----------------------------------------------
def notes_f(ws):
    ws.para([B('Notes')])
    ws.para([T('Around a table only the order '), I('around the circle'),
             T(' can be told apart. Sliding everybody one seat along gives the '
               'same arrangement, and there are '), M(r'n'),
             T(' such slides, so')])
    ws.math_block(r'\frac{n!}{n} \;=\; (n-1)!')
    ws.para([T('The same thing said another way: seat one person first and '
               'read the rest of the table from him. That person has no '
               'choice to make, and the other '), M(r'n-1'),
             T(' people fill the remaining seats in '), M(r'(n-1)!'),
             T(' ways.')])
    ws.para([B('When a circle is worth the full factorial')])
    ws.para([T('If the seats can be told apart — numbered seats, a different '
               'colour on each chair, one seat facing the stage — then sliding '
               'along '), I('does'), T(' change the arrangement, and the count '
                                        'is '), M(r'n!'),
             T('. Read the question for a word that marks the seats.')])
    ws.para([B('Turning it over')])
    ws.para([T('A keyring or a bracelet can be flipped, so each arrangement is '
               'counted twice and the answer is ')])
    ws.math_block(r'\frac{(n-1)!}{2}')
    ws.para([B('Blocks and gaps around a table')])
    ws.para([T('A block still counts as one unit, so '), M(r'u'),
             T(' units give '), M(r'(u-1)!'),
             T(' times the internal arrangements. For gaps, remember that '),
             M(r'm'), T(' objects in a circle make '), M(r'm'),
             T(' gaps, one fewer than in a row.')])
    mistakes(ws, [
        r'Writing $n!$ for a plain round table. Turning the whole table gives '
        r'nothing new, so it is $(n-1)!$.',
        r'Writing $(n-1)!$ when the seats are numbered or coloured. Those '
        r'seats can be told apart, so it is $n!$.',
        r'Dividing by 2 at a dinner table. The flip only matters for something '
        r'that can be picked up and turned over, such as a keyring.',
        r'Counting $m+1$ gaps around the table. The ends have joined, so there '
        r'are $m$.',
        r'Dividing by $n$ twice — once by seating one person first and again '
        r'by $n$ at the end.',
    ])


def worked_f(ws, bank, figdir):
    ws.concept('Fix One Position, Then Count the Rest')
    ws.example()
    ask(ws, bank['round_bg'], figdir)
    ws.solution_box([
        ('(a)', [
            [T('Seat the 5 boys around the table first, which can be done in')],
            r'(5-1)! = 4! = 24 \quad\text{← the table can be turned, so one boy is seated first}',
            [T('The 5 boys make 5 gaps. No 2 girls are next to each other '
               'exactly when the 3 girls go into 3 different gaps, and the '
               'girls are different people, so the order among the chosen '
               'gaps counts.')],
            r'^{5}P_{3} = 60',
            r'24 \times 60 = 1440',
        ]),
        ('(b)', [
            [T('The 3 girls form one block, so the table holds the block and '
               'the 5 boys — 6 units.')],
            r'\begin{aligned}'
            r'\text{the 6 units around the table:}\quad & (6-1)! = 120 \\'
            r'\text{the 3 girls inside the block:}\quad & 3! = 6'
            r'\end{aligned}',
            r'120 \times 6 = 720',
        ]),
        ('(c)', [
            [T('"Exactly 2 adjacent" says two things: 2 of the girls sit '
               'together, and the third girl is away from both. So make a '
               'block of 2 girls and keep the block and the lone girl in '
               'different gaps.')],
            r'\begin{aligned}'
            r'\text{which 2 girls form the block:}\quad & ^{3}C_{2} = 3 \\'
            r'\text{their order inside it:}\quad & 2! = 2 \\'
            r'\text{the 5 boys around the table:}\quad & 4! = 24 \\'
            r'\text{the block and the lone girl into 2 of the 5 gaps:}\quad & ^{5}P_{2} = 20'
            r'\end{aligned}',
            r'3 \times 2 \times 24 \times 20 = 2880',
            ('check', [T('Part (b) is 720 and part (c) is 2880. Together with '
                         'the 1440 of part (a) they come to 5040, which is '),
             M(r'(8-1)! = 5040'),
             T(' — every seating falls into exactly one of the three.')]),
        ]),
    ], keep_together=False)


# --- G. complements and inclusion-exclusion --------------------------------
def notes_g(ws):
    ws.para([B('Notes')])
    ws.para([B('Count what you do not want')])
    ws.para([T('"At least one", "not all", "no two of them" — each of these is '
               'easier the other way round.')])
    ws.math_block(r'n(\text{what is wanted}) \;=\; n(\text{everything}) '
                  r'\;-\; n(\text{what is not wanted})')
    ws.para([T('"At least 1 teacher on the team" has the tidy opposite "no '
               'teacher at all", which is a single count. Doing it directly '
               'means adding the cases of 1 teacher and 2 teachers, and it is '
               'the direct route that double-counts.')])
    ws.para([B('Two conditions at once')])
    ws.para([T('When a question says "A or B", an object satisfying both has '
               'been counted twice, so')])
    ws.math_block(r'n(A \cup B) \;=\; n(A) + n(B) - n(A \cap B)')
    ws.para([T('"A or B '), B('but not both'),
             T('" takes the overlap away a second time, because those objects '
               'should not be there at all:')])
    ws.math_block(r'n(A) + n(B) - 2\,n(A \cap B)')
    ws.para([B('Writing it down before counting')])
    ws.para([T('Name the two sets in words first — "A: the 2 F’s '
               'are together", "B: the 3 E’s are all apart" — then '
               'count '), M(r'n(A)'), T(', '), M(r'n(B)'), T(' and '),
             M(r'n(A \cap B)'), T(' one at a time. Most of the marks are lost '
                                  'by starting to count before the sets have '
                                  'been named.')])
    mistakes(ws, [
        r'Subtracting from the wrong total. The "everything" must be the count '
        r'under the same conditions as the rest of the question.',
        r'Forgetting $n(A \cap B)$. Adding $n(A)$ and $n(B)$ counts the '
        r'overlap twice.',
        r'Taking the overlap away once for "but not both". It has to go twice, '
        r'since those objects are unwanted.',
        r'Reading "at least 2" as "2". The complement of "at least 2" is '
        r'"0 or 1", which is two counts, not one.',
        r'Using ${}^{2}C_{1} \times {}^{9}C_{3}$ for "at least 1 teacher". '
        r'Choosing a teacher and then choosing freely lets the other teacher '
        r'reappear, and each two-teacher team is produced twice.',
    ])


def worked_g(ws, bank, figdir):
    ws.concept('Take Away What You Do Not Want')
    ws.example()
    ask(ws, bank['traits'], figdir)
    ws.solution_box([
        ('(a)', [
            [T('A result is the top 5 traits written in ascending order of '
               'strength, so it is an ordered list of 5 different traits '
               'chosen from 32.')],
            r'^{32}P_{5} = 32 \times 31 \times 30 \times 29 \times 28 = 24165120',
        ]),
        ('(b)', [
            [T('The opposite of "traits from at least 2 domains" is "all 5 '
               'traits from 1 domain", which is one count.')],
            r'\begin{aligned}'
            r'\text{5 traits from one domain of 8:}\quad & ^{8}P_{5} = 6720 \\'
            r'\text{over the 4 domains:}\quad & 4 \times 6720 = 26880'
            r'\end{aligned}',
            r'24165120 - 26880 = 24138240',
        ]),
        ('(c)', [
            [T('Five traits covering all 4 domains means one domain supplies '
               '2 traits and the other three supply 1 each. Split on whether '
               'the doubled domain is Cognition, because the second condition '
               'is about Cognition.')],
            [B('Case 1: '), T('Cognition supplies 2 of the 5 traits.')],
            r'^{8}C_{2} \times 8 \times 8 \times 8 = 28 \times 512 = 14336 '
            r'\quad\text{← which traits are in the result}',
            [T('The 2 places at the strong end are closed to Cognition, so '
               'both Cognition traits sit among the other 3 places.')],
            r'^{3}P_{2} \times 3! = 6 \times 6 = 36 \quad\text{← the orders allowed}',
            r'14336 \times 36 = 516096',
            [B('Case 2: '), T('one of the other 3 domains supplies 2 traits.')],
            r'3 \times \big(\underbrace{8}_{\text{Cognition}} \times \underbrace{^{8}C_{2}}_{\text{the doubled domain}} '
            r'\times \underbrace{8 \times 8}_{\text{the last two}}\big) = 3 \times 14336 = 43008',
            [T('Only 1 Cognition trait has to be kept out of the 2 strong '
               'places.')],
            r'3 \times 4! = 72',
            r'43008 \times 72 = 3096576',
            r'516096 + 3096576 = 3612672',
        ]),
        ('(d)', [
            [T('The 5 traits are given, so only their order is in question. '
               'Written by domain, the list reads R, R, P, P, I in some '
               'order.')],
            r'\frac{5!}{2!\,2!} = 30 \quad\text{← the orders of the domain pattern}',
            [T('Let A be the patterns with the 2 Rapport traits together and '
               'B those with the 2 Planning traits together.')],
            r'\begin{aligned}'
            r'n(A) = \frac{4!}{2!} = 12, \qquad n(B) &= \frac{4!}{2!} = 12 \\'
            r'n(A \cap B) &= 3! = 6'
            r'\end{aligned}',
            r'30 - (12 + 12 - 6) = 12 \quad\text{← patterns with no two alike next to each other}',
            [T('Each pattern is then filled by the particular traits: the 2 '
               'Rapport traits into their 2 places, and the same for '
               'Planning.')],
            r'12 \times 2! \times 2! = 48',
        ]),
    ], keep_together=False)

    ws.example()
    ask(ws, bank['staff'], figdir,
        stem=('In a small company there are four departments — Administrative, '
              'Marketing, Sales and Human Resource (HR) — with 7 staff between '
              'them. The number of staff in each department is shown below.'),
        table=[['Department', 'Administrative', 'Marketing', 'Sales', 'HR'],
               ['Number of staff', '1', '2', '3', '1']],
        show_marks=False)
    ws.para(R.split_math(
        'At the annual company dinner the organiser draws up a seating '
        'arrangement for a round table with 7 seats, one for each member of '
        'staff. To plan it the organiser prepares a card label for each seat '
        'carrying a department name, and two card labels are indistinguishable '
        'when they carry the same department. Find the number of different '
        'arrangements that can be drawn up in which the staff from Marketing '
        'are not seated together and the staff from Sales are not seated '
        'together.'), marks=4)
    ws.solution_box([
        ('', [
            [T('The card labels are being arranged, not the people, so the 2 '
               'Marketing labels are alike and the 3 Sales labels are alike.')],
            r'\frac{(7-1)!}{2!\,3!} = \frac{720}{12} = 60 \quad\text{← every arrangement of the labels}',
            [T('Let A be the arrangements with the 2 Marketing labels '
               'together, and B those with the 3 Sales labels together.')],
            [T('For A, tie the 2 Marketing labels into one label. That leaves '
               '6 labels around the table, 3 of them alike.')],
            r'n(A) = \frac{(6-1)!}{3!} = \frac{120}{6} = 20',
            [T('For B, tie all 3 Sales labels into one. That leaves 5 labels, '
               '2 of them alike.')],
            r'n(B) = \frac{(5-1)!}{2!} = \frac{24}{2} = 12 '
            r'\quad\text{← with 3 labels, "together" means all three in one block}',
            [T('For both at once, tie each group into one label. That leaves 4 '
               'labels, all different.')],
            r'n(A \cap B) = (4-1)! = 6',
            r'n(A \cup B) = 20 + 12 - 6 = 26',
            r'60 - 26 = 34',
        ]),
    ], keep_together=False)


# --- H. selections ---------------------------------------------------------
def notes_h(ws):
    ws.para([B('Notes')])
    ws.para([T('When objects are only chosen, and nothing is done with them '
               'afterwards, the order of the choosing carries no meaning:')])
    ws.math_block(r'^{n}C_{r} \;=\; \frac{n!}{r!\,(n-r)!} \;=\; \frac{^{n}P_{r}}{r!}')
    ws.para([T('The second form says what the difference is. Every selection '
               'of '), M(r'r'), T(' objects was produced '), M(r'r!'),
             T(' times by '), M(r'^{n}P_{r}'),
             T(', once for each order they could be picked in.')])
    ws.para([B('Choose first, arrange after')])
    ws.para([T('A question that picks a group and then does something with it '
               '— seats them, gives them jobs, puts them in a photo — is two '
               'stages, so the counts multiply.')])
    ws.math_block(r'\underbrace{^{n}C_{r}}_{\text{who is chosen}} \;\times\; '
                  r'\underbrace{r!}_{\text{what they then do}}')
    ws.para([B('Selecting from several groups')])
    ws.para([T('If the objects come in kinds and the question fixes how many '
               'of each kind are taken, choose inside each kind and multiply. '
               'If the question only gives a limit — "at least one of each" — '
               'the numbers taken from each kind become cases, which is '
               'Section I.')])
    mistakes(ws, [
        r'Using $^{n}P_{r}$ for a committee with no titles. Nobody on it can '
        r'be told from anybody else, so it is $^{n}C_{r}$.',
        r'Using $^{n}C_{r}$ when the places are named. A chairperson, a '
        r'secretary and a treasurer are 3 different jobs, so multiply by $3!$ '
        r'after choosing, or write $^{n}P_{r}$ at the start.',
        r'Adding the counts from different kinds. Choosing 2 men '
        r'$\textbf{and}$ 3 women is one committee built in two stages, so the '
        r'counts multiply.',
        r'Choosing the same object twice by accident. After $^{9}C_{2}$ the '
        r'next choice comes from the 7 that are left, not from 9.',
    ])


def worked_h(ws, bank, figdir):
    ws.concept('Choosing, When Order Carries No Meaning')
    ws.example()
    ask(ws, bank['orbs'], figdir)
    ws.solution_box([
        ('(a)', [
            [T('The pouch holds '), M(r'5 + 4 + 3 = 12'),
             T(' orbs, all different, and 4 are drawn with the order set '
               'aside.')],
            r'^{12}C_{4} = 495',
        ]),
        ('(b)', [
            [T('The opposite of "at least two colours" is "all four orbs the '
               'same colour", which is a short count.')],
            r'\begin{aligned}'
            r'\text{4 red from 5:}\quad & ^{5}C_{4} = 5 \\'
            r'\text{4 blue from 4:}\quad & ^{4}C_{4} = 1 \\'
            r'\text{4 green from 3:}\quad & 0'
            r'\end{aligned}',
            r'495 - (5 + 1) = 489 \quad\text{← there are only 3 green orbs, so green cannot fill a draw}',
        ]),
        ('(c)', [
            [T('All three colours appear among 4 orbs, so one colour supplies '
               '2 and the other two supply 1 each. That is three cases.')],
            ('cols', [
                [[B('2 red, 1 blue, 1 green')],
                 r'^{5}C_{2} \times 4 \times 3 = 10 \times 12 = 120'],
                [[B('1 red, 2 blue, 1 green')],
                 r'5 \times {}^{4}C_{2} \times 3 = 5 \times 18 = 90'],
            ], [8.0, 8.0]),
            [B('1 red, 1 blue, 2 green')],
            r'5 \times 4 \times {}^{3}C_{2} = 20 \times 3 = 60',
            [T('The three cases are alternatives, so add.')],
            r'120 + 90 + 60 = 270',
        ]),
    ], keep_together=False)


# --- I. selection with cases -----------------------------------------------
def notes_i(ws):
    ws.para([B('Notes')])
    ws.para([T('"At least", "at most", "not more than", "a mixture of" — none '
               'of these fixes how many of each kind are taken, so the answer '
               'is a sum over the possibilities.')])
    ws.para([B('The routine')])
    ws.para([T('1.  Write down what the cases are, in a line or a small '
               'table. They must not overlap, and together they must cover '
               'everything asked for.')])
    ws.para([T('2.  Count each case as a product of selections.')])
    ws.para([T('3.  Add the cases.')])
    ws.para([B('Which way is shorter')])
    ws.para([T('Count the cases when there are two or three of them, and use '
               'the complement when the unwanted side is shorter. "At least 1" '
               'out of many kinds is almost always a complement; "exactly 2 of '
               'the 3 kinds" has to be cases.')])
    ws.para([B('A case split that is forced by the question')])
    ws.para([T('Sometimes the split is not about how many, but about '), I('who'),
             T('. If one particular member changes what the others may do — a '
               'player who can fill two positions, a person who refuses to sit '
               'beside another — split on that member: he is in, or he is out.')])
    mistakes(ws, [
        r'Cases that overlap. "At least 2 girls" split as "2 girls" and '
        r'"2 girls and a third person" counts the 3-girl teams twice.',
        r'Cases that leave a gap. Check that the case counts add up to the '
        r'unrestricted total when the restriction is dropped.',
        r'Multiplying the cases. Cases are alternatives, so they add.',
        r'Choosing "the 2 that must be there" and then filling freely. That '
        r'produces the same group several times — split into cases or take a '
        r'complement instead.',
    ])


def worked_i(ws, bank, figdir):
    ws.concept('Split Into Cases That Do Not Overlap')
    ws.example()
    ask(ws, bank['bricks'], figdir)
    ws.solution_box([
        ('(a)', [
            [T('The 2 bricks are chosen from the 4 colours, and the pair is '
               'not put in any order.')],
            r'^{4}C_{2} = 6',
        ]),
        ('(b)', [
            [T('Three bricks from four colours, with repeats allowed. The '
               'cases are set by how the colours repeat.')],
            ('cols', [
                [[B('all 3 the same')], r'4'],
                [[B('exactly 2 the same')], r'4 \times 3 = 12'],
            ], [8.0, 8.0]),
            [B('all 3 different'), T(': ')],
            r'^{4}C_{3} = 4',
            r'4 + 12 + 4 = 19',
        ]),
        ('(c)', [
            [T('Now the tower is built, so the order up the tower counts as '
               'well. Take the same cases and multiply each by the number of '
               'orders its pattern allows.')],
            ('cols', [
                [[B('all 4 the same')], r'4 \times 1 = 4'],
                [[B('3 the same, 1 different')],
                 r'4 \times 3 \times \frac{4!}{3!} = 12 \times 4 = 48'],
            ], [8.0, 8.0]),
            [B('2 and 2'), T(': choose the 2 colours, then arrange.')],
            r'^{4}C_{2} \times \frac{4!}{2!\,2!} = 6 \times 6 = 36',
            [B('2 the same, 2 different'), T(': choose the doubled colour, '
                                             'then 2 more from the other 3.')],
            r'4 \times {}^{3}C_{2} \times \frac{4!}{2!} = 4 \times 3 \times 12 = 144',
            [B('all 4 different'), T(': ')],
            r'1 \times 4! = 24',
            r'4 + 48 + 36 + 144 + 24 = 256',
            ('check', [T('Every tower is 4 independent choices of colour, so '
                         'the total must be '), M(r'4^{4} = 256'), T('.')]),
        ]),
    ], keep_together=False)

    ws.example()
    ask(ws, bank['basket'], figdir, keep=('c', 'd'),
        stem=('The basketball club in a college has 5 centres, 8 forwards and '
              '7 guards. A basketball team to play in a match consists of '
              '1 centre, 2 forwards and 2 guards.'))
    ws.solution_box([
        ('(a)', [
            [T('Each position is filled from its own group, and the 2 forwards '
               'are not told apart from each other, nor are the 2 guards.')],
            r'5 \times {}^{8}C_{2} \times {}^{7}C_{2} = 5 \times 28 \times 21 = 2940',
        ]),
        ('(b)', [
            [T('One forward and one guard are out, leaving 5 centres, '
               '7 forwards and 6 guards. One of those 6 guards — call him K — '
               'can play in either position, so split on what K does. The '
               'three cases cannot happen together.')],
            ('cols', [
                [[B('K is not in the team')],
                 r'5 \times {}^{7}C_{2} \times {}^{5}C_{2} = 5 \times 21 \times 10 = 1050'],
                [[B('K plays as a guard')],
                 r'5 \times {}^{7}C_{2} \times {}^{5}C_{1} = 5 \times 21 \times 5 = 525'],
            ], [8.0, 8.0]),
            [B('K plays as a forward'), T(': the other forward comes from the '
                                          '7, and both guards from the other '
                                          '5.')],
            r'5 \times {}^{7}C_{1} \times {}^{5}C_{2} = 5 \times 7 \times 10 = 350',
            r'1050 + 525 + 350 = 1925',
            ('check', [T('The three cases cover every team: K is in it or he '
                         'is not, and if he is, he fills exactly one of the '
                         'two kinds of place.')]),
        ]),
    ], keep_together=False)

    ws.example()
    ask(ws, bank['bookkeeper'], figdir, keep=('b',))
    ws.solution_box([
        (('(a)', '(i)'), [
            [T('BOOKKEEPER has 10 letters made of B, O, O, K, K, E, E, P, E, '
               'R — that is 6 different letters: B, O, K, E, P, R.')],
            [T('A 4-letter code word with all letters different is an ordered '
               'choice of 4 from those 6.')],
            r'^{6}P_{4} = 360',
        ]),
        (('', '(ii)'), [
            [T('Now the repeats may be used. The letters available are B, R, P '
               '(one each), O, K (two each) and E (three). Split on the '
               'pattern of repeats.')],
            ('cols', [
                [[B('all 4 different')], r'^{6}P_{4} = 360'],
                [[B('exactly one pair')],
                 r'^{3}C_{1} \times {}^{5}C_{2} \times \frac{4!}{2!} = 3 \times 10 \times 12 = 360'],
            ], [6.0, 10.0]),
            [T('The pair comes from O, K or E — the 3 letters with a spare — '
               'and the other 2 letters from the remaining 5.')],
            [B('two pairs'), T(': choose 2 of O, K, E.')],
            r'^{3}C_{2} \times \frac{4!}{2!\,2!} = 3 \times 6 = 18',
            [B('three the same'), T(': only E has three, and the fourth letter '
                                    'is any of the other 5.')],
            r'1 \times 5 \times \frac{4!}{3!} = 5 \times 4 = 20',
            r'360 + 360 + 18 + 20 = 758',
        ]),
        (('', '(iii)'), [
            [T('"At least one from each group" over three groups is faster '
               'from the other end: count every team of 12, then take away '
               'the teams that miss a group out.')],
            r'^{18}C_{12} = 18564',
            ('cols', [
                [[B('no youth')], r'^{13}C_{12} = 13'],
                [[B('no young adult')], r'^{12}C_{12} = 1'],
            ], [8.0, 8.0]),
            [T('No senior would leave 12 people to be chosen from the 11 '
               'youths and young adults, which cannot be done, so that case '
               'contributes 0. No two groups can be missing at once either, '
               'so the three cases do not overlap.')],
            r'18564 - 13 - 1 = 18550',
            ('check', [T('The three cases taken away are counted once each, '
                         'because a team of 12 out of 18 leaves only 6 people '
                         'out and cannot miss two whole age groups.')]),
        ]),
    ], keep_together=False)


# --- J. dividing into groups -----------------------------------------------
def notes_j(ws):
    ws.para([B('Notes')])
    ws.para([T('Choosing one group is '), M(r'^{n}C_{r}'),
             T('. Cutting a whole set into several groups needs one more '
               'decision: can the groups be told apart?')])
    ws.para([B('Groups that can be told apart')])
    ws.para([T('If the groups are named — Group A, Group B, the red car and '
               'the blue car, the team that plays chess and the team that '
               'plays draughts — pick them one after another and multiply.')])
    ws.math_block(r'\underbrace{^{12}C_{4}}_{\text{Group A}} \times '
                  r'\underbrace{^{8}C_{4}}_{\text{Group B}} \times '
                  r'\underbrace{^{4}C_{4}}_{\text{Group C}} = 34650')
    ws.para([B('Groups of the same size that cannot be told apart')])
    ws.para([T('If the three groups of 4 are only "three groups", the same '
               'three groups have been produced in every order, so')])
    ws.math_block(r'\frac{34650}{3!} = 5775')
    ws.para([T('Divide by '), M(r'k!'), T(' only for '), M(r'k'),
             T(' groups that are the same size '), I('and'),
             T(' carry no name. Groups of different sizes are already told '
               'apart by their size, so nothing is divided.')])
    ws.para([B('Something inside a group can name it')])
    ws.para([T('If each group must hold exactly one of 3 different men, those '
               'men name the groups and there is no division. Read the '
               'question for anything that marks one group off from another.')])
    ws.para([B('Fixing one person to name a group')])
    ws.para([T('A quick way to avoid the division altogether: settle one '
               'particular person into a group first and build the rest around '
               'him. That group is now "the one with him in it", so the count '
               'comes out right with no '), M(r'k!'), T(' to remove.')])
    mistakes(ws, [
        r'Dividing by $k!$ when the groups are named. Group A and Group B are '
        r'different groups, so the same split in the other order is a '
        r'different answer.',
        r'Dividing by $k!$ when the groups are different sizes. A group of 5 '
        r'is never mistaken for a group of 3.',
        r'Forgetting to divide when the groups really are alike. This is the '
        r'commonest lost mark in the whole chapter.',
        r'Dividing by $k!$ after each group has been given a job to do. Naming '
        r'the jobs puts the $k!$ back, so do one or the other, not both.',
    ])


def worked_j(ws, bank, figdir):
    ws.concept('Name the Groups, or Divide by the Factorial')
    ws.example()
    ask(ws, bank['teams2'], figdir)
    ws.solution_box([
        ('(a)', [
            [T('Seat the 4 women around the table first.')],
            r'(4-1)! = 3! = 6',
            [T('The 4 women make 4 gaps. A child must sit between 2 women, so '
               'no one else may share his gap; and 2 men in one gap would be '
               'next to each other. So each gap takes exactly one of the 2 '
               'children and 2 men.')],
            r'4! = 24 \quad\text{← the 4 people into the 4 gaps, one each}',
            r'6 \times 24 = 144',
        ]),
        ('(b)', [
            [T('All 8 stand in a row, and the 4 women may stand in only 1 of '
               'their '), M(r'4!'), T(' possible orders.')],
            r'\frac{8!}{4!} = \frac{40320}{24} = 1680',
        ]),
        ('(c)', [
            [T('The 2 teams have no names, but each team holds exactly 1 of '
               'the 2 children — so a child names his own team. Build the team '
               'that holds the first child.')],
            r'\begin{aligned}'
            r'\text{his 2 women from the 4:}\quad & ^{4}C_{2} = 6 \\'
            r'\text{his man from the 2:}\quad & 2'
            r'\end{aligned}',
            [T('Everyone left over forms the other team, so there is nothing '
               'more to choose.')],
            r'6 \times 2 = 12 \quad\text{← no }\div 2!\text{, the children have already told the teams apart}',
        ]),
    ], keep_together=False)

    ws.example()
    ask(ws, bank['groups3'], figdir, keep=('b', 'c'))
    ws.solution_box([
        ('(a)', [
            [T('Each group holds exactly 1 of the 3 men, and the men are '
               'different people, so the men name the groups. Give each man '
               'his 3 women.')],
            r'^{9}C_{3} \times {}^{6}C_{3} \times {}^{3}C_{3} = 84 \times 20 \times 1 = 1680',
            ('check', [T('There is no '), M(r'\div 3!'),
                       T(' here. Swapping the three groups moves the men as '
                         'well, so it does not give the same split back.')]),
        ]),
        ('(b)', [
            [T('Seat the 9 women around the table first, then drop the men '
               'into different gaps.')],
            r'\begin{aligned}'
            r'\text{the 9 women:}\quad & (9-1)! = 8! = 40320 \\'
            r'\text{the 3 men into 3 of the 9 gaps:}\quad & ^{9}P_{3} = 504'
            r'\end{aligned}',
            r'40320 \times 504 = 20321280',
        ]),
    ], keep_together=False)

    ws.example()
    ask(ws, bank['pairs3'], figdir, keep=('a',),
        stem=('A group of 12 artistes, comprising 7 men and 5 women, are '
              'invited to participate in a TV variety show. In one challenge, '
              '3 pairs of artistes, each a man-woman pair, are selected to '
              'play a game.'))
    ws.solution_box([
        ('(a)', [
            [T('The 3 pairs are named A, B and C, so the pairs can be told '
               'apart. Fill the 3 named pairs with men, then with women.')],
            r'\begin{aligned}'
            r'\text{the men into pairs } A,\,B,\,C:\quad & ^{7}P_{3} = 210 \\'
            r'\text{the women into pairs } A,\,B,\,C:\quad & ^{5}P_{3} = 60'
            r'\end{aligned}',
            r'210 \times 60 = 12600',
            ('check', [T('Had the 3 pairs carried no names, the answer would '
                         'be '), M(r'12600 \div 3! = 2100'), T('.')]),
        ]),
    ], keep_together=False)


# --- K. placing objects into positions -------------------------------------
def notes_k(ws):
    ws.para([B('Notes')])
    ws.para([T('A second way of looking at the same chapter: instead of '
               'arranging the objects, hand out the '), I('places'), T('.')])
    ws.para([B('At most one object per place')])
    ws.para([T('Choose the set of places first, then decide which object goes '
               'where.')])
    ws.math_block(r'\underbrace{^{n}C_{r}}_{\text{which places are used}} '
                  r'\times \underbrace{r!}_{\text{which object in which}}')
    ws.para([T('If the objects are identical the second factor is 1, and if '
               'some are identical and some are not, only the ones that differ '
               'need placing. Four identical treasures and one special one in '
               '5 chosen locations is '), M(r'5'),
             T(' — the special one picks its location and the rest follow.')])
    ws.para([B('Places that may take more than one object')])
    ws.para([T('If a place may be used again, every object chooses freely and '
               'the count is '), M(r'n^{r}'),
             T('. The phrase "each place can hold at most one" is what tells '
               'the two apart, and it is worth underlining in the question.')])
    ws.para([B('Places that come in groups')])
    ws.para([T('Locations on different storeys, seats in two taxis, a front '
               'seat and a row at the back — when the places come in groups, '
               'split the count by how many objects go to each group, count '
               'each split, and add.')])
    mistakes(ws, [
        r'Using $n^{r}$ when each place takes at most one object.',
        r'Using $^{n}C_{r}$ when the objects are different and it matters '
        r'which place each one lands in.',
        r'Treating identical objects as different. Four identical treasures in '
        r'4 chosen locations is 1 way, not $4!$.',
        r'Forgetting that a group of places may be too small. A storey with '
        r'3 locations cannot take 4 objects, so that split is worth 0.',
    ])


def worked_k(ws, bank, figdir):
    ws.concept('Choose the Places, Then Fill Them')
    ws.example()
    ask(ws, bank['treasure'], figdir)
    ws.solution_box([
        (('(a)', '(i)'), [
            [T('Five of the 12 locations are used, and each holds one '
               'treasure. Four of the treasures are alike, so only the fifth '
               'one has to be placed.')],
            r'\begin{aligned}'
            r'\text{which 5 locations:}\quad & ^{12}C_{5} = 792 \\'
            r'\text{which of them holds the different treasure:}\quad & 5'
            r'\end{aligned}',
            r'792 \times 5 = 3960',
        ]),
        (('', '(ii)'), [
            [T('Exactly 2 of the 5 locations used are on the 3rd storey, so '
               'the other 3 come from the 6 locations on the 1st and 2nd '
               'storeys.')],
            r'^{6}C_{2} \times {}^{6}C_{3} \times 5 = 15 \times 20 \times 5 = 1500',
        ]),
        (('', '(iii)'), [
            [T('Write the split as (1st, 2nd, 3rd). With at least 1, at least '
               '1 and at least 2 out of 5 treasures, only three splits are '
               'possible.')],
            ('cols', [
                [[B('(1, 1, 3)')], r'3 \times 3 \times {}^{6}C_{3} = 3 \times 3 \times 20 = 180'],
                [[B('(1, 2, 2)')], r'3 \times {}^{3}C_{2} \times {}^{6}C_{2} = 3 \times 3 \times 15 = 135'],
            ], [8.0, 8.0]),
            [B('(2, 1, 2)'), T(': ')],
            r'^{3}C_{2} \times 3 \times {}^{6}C_{2} = 3 \times 3 \times 15 = 135',
            r'180 + 135 + 135 = 450 \quad\text{← the sets of locations}',
            [T('Each set of 5 locations is then filled, with only the '
               'different treasure to place.')],
            r'450 \times 5 = 2250',
        ]),
        ('(b)', [
            [T('Each team of 2 is one block, so the table holds 5 blocks and '
               '2 game masters — 7 units.')],
            r'\begin{aligned}'
            r'\text{the 7 units:}\quad & (7-1)! = 720 \\'
            r'\text{inside the 5 blocks:}\quad & 2^{5} = 32'
            r'\end{aligned}',
            r'720 \times 32 = 23040 \quad\text{← teams together, the masters not yet ruled on}',
            [T('Take away the ones with the 2 game masters side by side, by '
               'tying them into a block as well — 6 units.')],
            r'(6-1)! \times 2! \times 2^{5} = 120 \times 2 \times 32 = 7680',
            r'23040 - 7680 = 15360',
        ]),
    ], keep_together=False)

    ws.example()
    ask(ws, bank['taxis'], figdir)
    ws.solution_box([
        (('(a)', '(i)'), [
            [T('The two taxis are named, and a couple travels as one unit.')],
            [B('Case 1: '), T('both couples in the same taxi. That taxi is '
                              'then full, and the 4 singles fill the other.')],
            r'2 \quad\text{← the couples take taxi } X \text{ or taxi } Y',
            [B('Case 2: '), T('the couples in different taxis. Each taxi then '
                              'needs 2 more from the 4 singles.')],
            r'2 \times {}^{4}C_{2} = 2 \times 6 = 12',
            r'2 + 12 = 14',
        ]),
        (('', '(ii)'), [
            [T('A couple must sit side by side at the back, and the back of a '
               'taxi is a row of 3. Two couples cannot both do that in the '
               'same taxi, so the couples are in different taxis: 2 ways round.')],
            [T('In one taxi, the couple takes 2 of the 3 back seats that are '
               'next to each other — the left pair or the right pair — and may '
               'sit either way round.')],
            r'2 \times 2 = 4 \quad\text{← the couple in one taxi}',
            [T('Each taxi has 2 seats left, the spare back seat and the front '
               'seat, and the 4 singles fill the 4 empty seats.')],
            r'2 \times \underbrace{4 \times 4}_{\text{the two couples}} \times \underbrace{4!}_{\text{the singles}} = 2 \times 16 \times 24 = 768',
        ]),
    ], keep_together=False)


# --- L. counting a probability ---------------------------------------------
def notes_l(ws):
    ws.para([B('Notes')])
    ws.para([T('When every arrangement is as likely as every other, a '
               'probability is two counts:')])
    ws.math_block(r'\mathrm{P}(\text{event}) \;=\; '
                  r'\frac{n(\text{arrangements in which it happens})}'
                  r'{n(\text{all the arrangements})}')
    ws.para([B('Count both lines the same way')])
    ws.para([T('If the top line treats the people as different, the bottom '
               'line must too. If the top line is a circle, the bottom line is '
               'a circle. Mixing the two viewpoints is what makes an answer '
               'come out bigger than 1.')])
    ws.para([B('Cancel before you evaluate')])
    ws.para([T('The factorials are large, so leave them stacked and cancel:')])
    ws.math_block(r'\frac{14! \times {}^{15}P_{3}}{17!} '
                  r'= \frac{^{15}P_{3}}{17 \times 16 \times 15} '
                  r'= \frac{2730}{4080} = \frac{91}{136}')
    ws.para([B('A useful shortcut')])
    ws.para([T('When the bottom line is "all arrangements", the probability '
               'often does not need the arrangement of the people who are not '
               'mentioned — their '), M(r'k!'),
             T(' appears on both lines and cancels. Set the count up so that '
               'it does.')])
    mistakes(ws, [
        r'Counting the top line as a circle and the bottom line as a row.',
        r'Leaving a restriction out of the bottom line. The total must be the '
        r'count under the conditions the question has already imposed.',
        r'Evaluating $17!$ on the calculator. It overflows the display and the '
        r'fraction never simplifies.',
        r'Adding probabilities of cases that overlap. The cases must be '
        r'exclusive on the top line just as they are in a counting question.',
    ])


def worked_l(ws, bank, figdir):
    ws.concept('Count the Top and the Bottom the Same Way')
    ws.example()
    ask(ws, bank['officers'], figdir)
    ws.solution_box([
        (('(a)', '(i)'), [
            [T('The 3 posts are different, so this is an ordered choice of 3 '
               'from the 12 girls.')],
            r'^{12}P_{3} = 12 \times 11 \times 10 = 1320',
        ]),
        (('', '(ii)'), [
            [T('The opposite of "at least one of each" is "all girls" or "all '
               'boys", and those two cannot happen together.')],
            r'\begin{aligned}'
            r'\text{all 3 from the 18:}\quad & ^{18}P_{3} = 4896 \\'
            r'\text{all girls:}\quad & ^{12}P_{3} = 1320 \\'
            r'\text{all boys:}\quad & ^{6}P_{3} = 120'
            r'\end{aligned}',
            r'4896 - 1320 - 120 = 3456',
        ]),
        ('(b)', [
            [T('All 18 sit in a circle, so the bottom line is')],
            r'(18-1)! = 17!',
            [T('For the top line, seat the other 15 students in the circle '
               'first and put the 3 officers into 3 different gaps.')],
            r'\begin{aligned}'
            r'\text{the 15 students:}\quad & (15-1)! = 14! \\'
            r'\text{the 3 officers into 3 of the 15 gaps:}\quad & ^{15}P_{3} = 2730'
            r'\end{aligned}',
            r'\mathrm{P} = \frac{14! \times 2730}{17!} = \frac{2730}{17 \times 16 \times 15} '
            r'= \frac{2730}{4080} = \frac{91}{136}',
        ]),
        ('(c)', [
            [T('There are 6 boys and 12 girls. Exactly 2 girls between each '
               'boy uses all 12 girls in 6 blocks of 2, so the seating is '
               'forced into the pattern B G G B G G …')],
            r'\begin{aligned}'
            r'\text{the 6 boys around the circle:}\quad & (6-1)! = 120 \\'
            r'\text{the 12 girls into the 12 places between them:}\quad & 12!'
            r'\end{aligned}',
            r'\mathrm{P} = \frac{120 \times 12!}{17!} = \frac{120}{17 \times 16 \times 15 \times 14 \times 13} '
            r'= \frac{120}{742560} = \frac{1}{6188}',
        ]),
    ], keep_together=False)


# --- M. traps, and how to avoid them ---------------------------------------
def notes_m(ws):
    ws.para([B('Notes')])
    ws.para([T('Every trap below has cost marks in a prelim paper in the last '
               'three years. Each one is named so that it can be spotted '
               'before the working starts.')])
    ws.notes_end()

    ws.concept('Trap 1 — "At Least One", Done Forwards')
    ws.para([T('A team of 4 is chosen from 2 teachers and 8 students, and at '
               'least 1 teacher must be on it. The tempting line is')])
    ws.math_block(r'^{2}C_{1} \times {}^{9}C_{3} = 2 \times 84 = 168 '
                  r'\quad\text{← picks a teacher, then fills the other 3 places freely}')
    ws.para([T('It is wrong because the free part can pick up the other '
               'teacher, and then the same two-teacher team has been built '
               'twice — once with each teacher chosen first. Take the '
               'complement instead:')])
    ws.math_block(r'^{10}C_{4} - {}^{8}C_{4} = 210 - 70 = 140')
    ws.para([T('Section B has this question in full, and the complement is the '
               'method of Section G.')])

    ws.notes_end()

    ws.concept('Trap 2 — Dividing by the Factorial Out of Habit')
    ws.para([T('The '), M(r'\div k!'),
             T(' belongs to groups that are the same size and carry no names. '
               'Three groups of 4, each holding exactly 1 of 3 different men, '
               'are already told apart by their man, so the answer is')])
    ws.math_block(r'^{9}C_{3} \times {}^{6}C_{3} \times {}^{3}C_{3} = 1680')
    ws.para([T('with no division. Before dividing, ask what would have to be '
               'true for two of the groups to be swapped and the split to look '
               'the same. Section J is the whole rule.')])

    ws.notes_end()

    ws.concept('Trap 3 — One Object Per Place, or Not')
    ws.para([T('Two questions that look alike:')])
    ws.para([T('"A 4-character code is made from 6 letters, repeats allowed" '
               'gives '), M(r'6^{4} = 1296'),
             T('. "Five treasures go into 12 locations, each location holding '
               'at most one" gives '), M(r'^{12}C_{5}'),
             T(' and then the placing. The words "at most one", "no repeats" '
               'and "each used once" are the switch. Underline them in the '
               'question paper.')])

    ws.notes_end()

    ws.concept('Trap 4 — Which Factorial a Round Table Takes')
    ws.para([T('A plain round table is '), M(r'(n-1)!'),
             T(', because turning everybody one seat along changes nothing. '
               'Numbered seats, coloured chairs or one seat facing the stage '
               'make the seats different, and the count goes back to '),
             M(r'n!'), T('. A keyring or bracelet can also be turned over, so '
                         'it is '), M(r'\dfrac{(n-1)!}{2}'), T('.')])

    ws.notes_end()

    ws.concept('Trap 5 — The Two Meanings of "Or"')
    ws.para([T('"The 2 F’s together '), B('or'),
             T(' the 3 E’s apart" allows both at once:')])
    ws.math_block(r'n(A) + n(B) - n(A \cap B)')
    ws.para([T('"… '), B('but not both'),
             T('" rules the overlap out altogether, so it comes off twice:')])
    ws.math_block(r'n(A) + n(B) - 2\,n(A \cap B)')
    ws.para([T('Two of the practice questions in Section G turn on exactly '
               'this phrase.')])

    ws.notes_end()

    ws.concept('Trap 6 — "Exactly Two Together"')
    ws.para([T('"Exactly 2 of the 3 girls are next to each other" is two '
               'conditions, not one: a block of 2, '), I('and'),
             T(' the third girl away from that block. Counting only the block '
               'lets the third girl join it and turns some of the '
               'arrangements into all 3 together. Build the block, then put '
               'the block and the lone girl into different gaps — the '
               'worked example in Section F does it in three lines.')])

    ws.notes_end()

    ws.concept('Before You Write the Answer Down')
    ws.para([T('1.  Is the answer with a restriction smaller than the answer '
               'without it? If it is larger, something has been counted '
               'twice.')])
    ws.para([T('2.  Do the cases add up to the unrestricted total when the '
               'restriction is dropped?')])
    ws.para([T('3.  Were the objects different or alike, and does the working '
               'say so?')])
    ws.para([T('4.  Row or circle? Order or no order? Those two questions '
               'settle most of the marks.')])
    ws.para([T('5.  For a probability, are the top and the bottom counted the '
               'same way?')])
    ws.notes_end()


def main():
    by_id, _ = fetch("JC2", "Permutations and Combinations", figures=True)
    print(f"pool: {len(by_id)} rows")
    bank = {}
    for nick, short in EX.items():
        hit = [r for r in by_id.values() if r["id"].startswith(short)]
        if not hit:
            raise SystemExit(f"worked example {short} is not in the pool")
        bank[nick] = hit[0]

    # MI 2024 (i) asks whether the answer changes; the stored key says "Yes",
    # but both readings give 2! x 8! = 80640, so the answer is "No".  The row
    # is a worked example, so the bad key never reaches the page -- printed
    # here so it is not forgotten.
    print("  [key] 5f09e6b3 part (a) stored answer says \"Yes\"; both "
          "readings give 2! x 8! = 80640, so the sheet says \"No\"")

    figdir = Path(tempfile.mkdtemp(prefix="pcfig-"))
    ws = sheet('JC2 H2 Math', 'Permutations and Combinations Revision')

    counts = {}

    ws.section('Section A — The Two Counting Principles')
    notes_a(ws)
    ws.notes_end()   # notes may break across a page; a question may not
    worked_a(ws, bank, figdir)
    ws.para([B('Practice')])
    counts['A'] = render_practice(ws, by_id, PRACTICE_A, figdir,
                                  part_texts=PART_TEXTS)

    ws.section('Section B — Arranging Distinct Objects in a Row', new_page=True)
    notes_b(ws)
    ws.notes_end()
    worked_b(ws, bank, figdir)
    ws.para([B('Practice')])
    counts['B'] = render_practice(ws, by_id, PRACTICE_B, figdir,
                                  part_texts=PART_TEXTS)

    ws.section('Section C — Objects That Must Be Together', new_page=True)
    notes_c(ws)
    ws.notes_end()
    worked_c(ws, bank, figdir)
    ws.para([B('Practice')])
    counts['C'] = render_practice(ws, by_id, PRACTICE_C, figdir,
                                  part_texts=PART_TEXTS)

    ws.section('Section D — Repeated (Identical) Objects', new_page=True)
    notes_d(ws)
    ws.notes_end()
    worked_d(ws, bank, figdir)
    ws.para([B('Practice')])
    counts['D'] = render_practice(ws, by_id, PRACTICE_D, figdir,
                                  part_texts=PART_TEXTS)

    ws.section('Section E — Objects That Must Be Apart', new_page=True)
    notes_e(ws)
    ws.notes_end()
    worked_e(ws, bank, figdir)
    ws.para([B('Practice')])
    counts['E'] = render_practice(ws, by_id, PRACTICE_E, figdir,
                                  part_texts=PART_TEXTS)

    ws.section('Section F — Circular Arrangements', new_page=True)
    notes_f(ws)
    ws.notes_end()
    worked_f(ws, bank, figdir)
    ws.para([B('Practice')])
    counts['F'] = render_practice(ws, by_id, PRACTICE_F, figdir, stems=STEMS,
                                  part_texts=PART_TEXTS)

    ws.section('Section G — Complements and Inclusion-Exclusion', new_page=True)
    notes_g(ws)
    ws.notes_end()
    worked_g(ws, bank, figdir)
    ws.para([B('Practice')])
    counts['G'] = render_practice(ws, by_id, PRACTICE_G, figdir,
                                  part_texts=PART_TEXTS)

    ws.section('Section H — Selections', new_page=True)
    notes_h(ws)
    ws.notes_end()
    worked_h(ws, bank, figdir)
    ws.para([B('Practice')])
    counts['H'] = render_practice(ws, by_id, PRACTICE_H, figdir,
                                  part_texts=PART_TEXTS)

    ws.section('Section I — Selection With Cases', new_page=True)
    notes_i(ws)
    ws.notes_end()
    worked_i(ws, bank, figdir)
    ws.para([B('Practice')])
    counts['I'] = render_practice(ws, by_id, PRACTICE_I, figdir,
                                  part_texts=PART_TEXTS)

    ws.section('Section J — Dividing Into Groups', new_page=True)
    notes_j(ws)
    ws.notes_end()
    worked_j(ws, bank, figdir)
    ws.para([B('Practice')])
    counts['J'] = render_practice(ws, by_id, PRACTICE_J, figdir,
                                  part_texts=PART_TEXTS)

    ws.section('Section K — Placing Objects Into Positions', new_page=True)
    notes_k(ws)
    ws.notes_end()
    worked_k(ws, bank, figdir)

    ws.section('Section L — Counting a Probability', new_page=True)
    notes_l(ws)
    ws.notes_end()
    worked_l(ws, bank, figdir)
    ws.para([B('Practice')])
    counts['L'] = render_practice(ws, by_id, PRACTICE_L, figdir,
                                  part_texts=PART_TEXTS)

    ws.section('Section M — Traps, and How to Avoid Them', new_page=True)
    notes_m(ws)

    # a run Word cannot keep whole has to break inside itself -- the page rule
    tall = [h for h in ws.glued_heights() if h > ws.PAGE_CM - 1.5]
    if tall:
        print(f"  !! runs too tall to keep on one page: {tall}")

    save(ws, "JC",
         "JC2 REV Permutations and Combinations (With Worked Examples).docx")
    wanted = {'A': PRACTICE_A, 'B': PRACTICE_B, 'C': PRACTICE_C,
              'D': PRACTICE_D, 'E': PRACTICE_E, 'F': PRACTICE_F,
              'G': PRACTICE_G, 'H': PRACTICE_H, 'I': PRACTICE_I,
              'J': PRACTICE_J, 'L': PRACTICE_L}
    line = '  '.join(f"{k} {counts[k]}/{len(v)}" for k, v in wanted.items())
    print(f"worked examples: {len(EX)}    practice: {line}")


if __name__ == "__main__":
    main()
