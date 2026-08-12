#!/usr/bin/env python3
"""EM Statistics revision worksheet — standard deviation, median, IQR, cumulative frequency.

Every worked solution recomputed in verify_stats.py before it was written here.
"""
from build_lib import sheet, fetch, render_practice, save, T, B, I, M
import revision_lib as R

PRACTICE = [
    "3fe4cba6-f8e4-451f-8fb8-b00afb40945c",   # Ahmad Ibrahim 2021, 3
    "0d82e35d-4cb2-4a85-9274-0aa75fbc6fde",   # Presbyterian High 2024, 3
    "b1cd2a40-2e0b-401e-a155-52d3ceba307b",   # Nan Chiau 2021, 3
    "d96566c6-630c-48b9-84af-166def207154",   # St Joseph Institute 2024, 3
    "a630c6af-5f99-4d12-bbbb-6786ab34005c",   # Crescent Girls 2023, 3
    "0742b550-3f45-4c7c-b1b7-ec077078ec2b",   # Ang Mo Kio 2021, 4
    "3ab69c2e-6878-4646-9b05-5fbb953c5b0f",   # Chung Cheng (Main) 2021, 4
    "0c0ff626-0931-4e37-8ef5-6e19475b42d2",   # Chung Cheng (Main) 2024, 4
    "05bdc64a-06f7-426d-8c78-6792daf66889",   # Dunman 2025, 4
    "b65a6ff0-4263-44ac-a9cd-8a815e900c50",   # Kranji 2024, 4
    "7b13ef9b-2a7c-459e-b11e-8ba3668941d5",   # Outram 2022, 4
    "76e1b8f5-e747-400c-be5d-b19cbb9c269a",   # Zhenghua 2023, 4
    "0af189ce-20d2-49b2-b51c-3e95380f9667",   # Nan Chiau 2021, 4
    "0eec6d43-42f3-4854-bed0-acd9e09a9ce3",   # Pei Hwa 2023, 4
]


def notes(ws):
    ws.para([B('Notes:')])
    ws.para([B('The two questions every statistics answer must settle')])
    ws.para([T('An average tells you '), I('where'), T(' the data sits. A measure of spread tells '
             'you '), I('how consistent'), T(' it is. Almost every comparison question wants both.')])
    ws.para([B('Averages')])
    ws.para([T('Mean '), M(r'= \dfrac{\sum x}{n}'),
             T('   — uses every value, so one extreme value drags it.')])
    ws.para([T('Median — the middle value once the data is '), I('in order'),
             T('. For '), M('n'), T(' values it is the '), M(r'\tfrac{1}{2}(n+1)'),
             T('th. Unaffected by extremes.')])
    ws.para([T('Mode — the most frequent value. For grouped data, the modal '), I('class'), T('.')])
    ws.para([B('Spread')])
    ws.para([T('Range '), M(r'= \text{largest} - \text{smallest}'), T('.')])
    ws.para([T('Lower quartile '), M('Q_1'), T(' is the '), M(r'\tfrac{1}{4}(n+1)'),
             T('th value; upper quartile '), M('Q_3'), T(' is the '), M(r'\tfrac{3}{4}(n+1)'),
             T('th.')])
    ws.math_block(r'\text{Interquartile range} = Q_3 - Q_1')
    ws.para([T('The IQR covers the middle half of the data, so unlike the range it ignores '
               'extreme values.')])
    ws.para([B('Standard deviation')])
    ws.math_block(r'\text{s.d.} = \sqrt{\dfrac{\sum x^2}{n} - \left(\dfrac{\sum x}{n}\right)^{\!2}} = \sqrt{\dfrac{\sum fx^2}{\sum f} - \bar{x}^{\,2}}')
    ws.para([T('Read it as "mean of the squares minus the square of the mean". '
               'Keep full accuracy inside the square root and round only at the end.')])
    ws.para([B('Grouped data is an estimate')])
    ws.para([T('You no longer have the individual values, so use the '), B('mid-point'),
             T(' of each class as '), M('x'), T('. Every answer from a grouped table is an '),
             I('estimate'), T(' — say so if the question says "estimate".')])
    ws.para([B('Transformations — what happens to the mean and the s.d.')])
    ws.para([T('Add '), M('k'), T(' to every value: the mean increases by '), M('k'),
             T(', the standard deviation is '), B('unchanged'),
             T(' (the data has shifted, not spread out).')])
    ws.para([T('Multiply every value by '), M('k'), T(': the mean and the standard deviation are '
             'both multiplied by '), M('k'), T('.')])
    ws.para([B('Cumulative frequency curves')])
    ws.para([T('Plot cumulative frequency against the '), B('upper class boundary'),
             T(' — not the mid-point — and join with a smooth curve.')])
    ws.para([T('To read a value, go '), I('up'), T(' from the horizontal axis and '), I('across'),
             T(' to the vertical, or the reverse. With '), M('n'),
             T(' values, read the median at '), M(r'\tfrac{n}{2}'), T(', '), M('Q_1'),
             T(' at '), M(r'\tfrac{n}{4}'), T(' and '), M('Q_3'), T(' at '), M(r'\tfrac{3n}{4}'), T('.')])
    ws.para([T('"How many scored more than '), M('a'), T('?" is '), M('n'),
             T(' minus the reading at '), M('a'), T(' — the curve gives you "less than".')])
    ws.para([B('Comparing two sets — always two sentences')])
    ws.para([T('One about the average: a higher mean (or median) means the values are generally larger.')])
    ws.para([T('One about the spread: a '), I('smaller'), T(' standard deviation (or IQR) means the '
             'values are '), B('more consistent'), T('. Quote both figures.')])
    ws.para([B('Five mistakes to avoid')])
    for i, e in enumerate([
        'Finding the median without ordering the data first.',
        'Using the class mid-point when plotting a cumulative frequency curve — it is the upper boundary.',
        'Rounding the mean before substituting it into the standard deviation formula.',
        'Saying a set is "better" without quoting the figures that support it.',
        'Claiming the standard deviation changes when a constant is merely added to every value.',
    ], 1):
        ws.para([T(f'{i}.  ')] + R.split_math(e))


def worked(ws):
    ws.page_break()
    ws.para([B('Examples')])

    # ---- 1 -----------------------------------------------------------------
    ws.para([B('Using the Standard Deviation Formula Backwards')])
    ws.para([T('Given that '), M(r'x_1, x_2, x_3, \ldots, x_{10}'),
             T(' are 10 numbers whose mean '), M(r'\bar{x}'), T(' is '), M('11.8'),
             T(' and standard deviation is '), M('4.729'), T(', find the value of')])
    ws.para([T('(i)  '), M(r'x_1 + x_2 + \ldots + x_{10}'), T(',')], marks=1)
    ws.para([T('(ii) '), M(r'x_1^2 + x_2^2 + \ldots + x_{10}^2'),
             T(', to the nearest whole number.')], marks=2)
    ws.para([T('(iii) Each value is changed as follows: if '), M(r'x_n < \bar{x}'), T(' it is '
             'decreased by 2; if '), M(r'x_n > \bar{x}'), T(' it is increased by 2. Explain how '
             'this affects the standard deviation.')], marks=2)
    ws.para([B('Solution:')])
    ws.para([T('(i)')])
    ws.para([T('The mean is just the total divided by how many, so the total is the mean times '), M('n'), T('.')])
    ws.math_block(r'\dfrac{\sum x}{10} = 11.8 \quad\Rightarrow\quad \sum x = 118')
    ws.para([T('(ii)')])
    ws.para([T('Write the formula down first, then substitute — the only unknown left is '), M(r'\sum x^2'), T('.')])
    ws.math_block(r'\text{s.d.} = \sqrt{\dfrac{\sum x^2}{10} - \bar{x}^{\,2}}')
    ws.math_block(r'4.729^2 = \dfrac{\sum x^2}{10} - 11.8^2')
    ws.math_block(r'22.363 = \dfrac{\sum x^2}{10} - 139.24 \quad\Rightarrow\quad \dfrac{\sum x^2}{10} = 161.603')
    ws.math_block(r'\sum x^2 = 1616 \text{ (nearest whole number)}')
    ws.para([T('(iii)')])
    ws.para([T('This is not a calculation — it is asking whether the values move '), I('towards'),
             T(' the mean or '), I('away'), T(' from it.')])
    ws.para([T('Values below the mean go down and values above it go up, so every value ends up '
               'further from the mean. The deviations all increase, so the '),
             B('standard deviation increases'), T('.')])

    # ---- 2 -----------------------------------------------------------------
    ws.para([B('Mean and Standard Deviation From a Grouped Frequency Table')])
    ws.para([T('The waiting times, in minutes, for 50 patients at the A&E clinic of Hospital A are:')])
    ws.para([T('   '), M(r'20 < t \leq 24'), T(': 8    '), M(r'24 < t \leq 28'), T(': 10    '),
             M(r'28 < t \leq 32'), T(': 21    '), M(r'32 < t \leq 36'), T(': 7    '),
             M(r'36 < t \leq 40'), T(': 4')])
    ws.para([T('For Hospital B, the mean is '), M('29.12'), T(' and the standard deviation is '),
             M('3.2'), T('.')])
    ws.para([T('(a) Calculate the mean and standard deviation for Hospital A.')], marks=3)
    ws.para([T('(b) Compare briefly the waiting times at the two hospitals.')], marks=2)
    ws.para([B('Solution:')])
    ws.para([T('(a)')])
    ws.para([T('Grouped data, so use the mid-point of each class: 22, 26, 30, 34, 38.')])
    ws.math_block(r'\bar{t} = \dfrac{22(8) + 26(10) + 30(21) + 34(7) + 38(4)}{50} = \dfrac{1456}{50} = 29.12 \text{ min}')
    ws.math_block(r'\text{s.d.} = \sqrt{\dfrac{8(22)^2 + 10(26)^2 + 21(30)^2 + 7(34)^2 + 4(38)^2}{50} - 29.12^2}')
    ws.math_block(r'= \sqrt{868 - 847.9744} = \sqrt{20.0256} = 4.47 \text{ min (3 s.f.)}')
    ws.para([T('(b)')])
    ws.para([T('Two sentences, each quoting its figure — one for the average, one for the spread.')])
    ws.para([T('The mean waiting time is the same at both hospitals ('), M('29.12'),
             T(' min), so on average patients wait equally long.')])
    ws.para([T('The standard deviation at Hospital B ('), M('3.2'), T(' min) is smaller than at '
             'Hospital A ('), M('4.47'), T(' min), so waiting times at Hospital B are '),
             B('more consistent'), T('.')])

    # ---- 3 -----------------------------------------------------------------
    ws.page_break()
    ws.para([B('Using a Quartile to Recover a Missing Frequency')])
    ws.para([T('A class of 40 students were asked how much time they spent on social media last week.')])
    ws.para([T('   '), M(r'0 < x \leq 10'), T(': '), M('p'), T('    '), M(r'10 < x \leq 20'),
             T(': 6    '), M(r'20 < x \leq 30'), T(': 12    '), M(r'30 < x \leq 40'), T(': '),
             M('q'), T('    '), M(r'40 < x \leq 50'), T(': 3')])
    ws.para([T('The lower quartile of the time spent was 20 hours.')])
    ws.para([T('(i)   Show that '), M('p = 4'), T('.')], marks=2)
    ws.para([T('(ii)  Hence state the value of '), M('q'), T('.')], marks=1)
    ws.para([T('(iii) Estimate the mean number of hours.')], marks=2)
    ws.para([T('(iv)  Estimate the standard deviation.')], marks=1)
    ws.para([B('Solution:')])
    ws.para([T('(i)')])
    ws.para([T('Turn the quartile into a '), I('count'), T('. The lower quartile is the value '
             'below which a quarter of the data lies.')])
    ws.math_block(r'\tfrac{1}{4} \times 40 = 10 \text{ students spent 20 hours or less}')
    ws.para([T('Those students are exactly the first two classes:')])
    ws.math_block(r'p + 6 = 10 \quad\Rightarrow\quad p = 4 \text{ (shown)}')
    ws.para([T('(ii)')])
    ws.para([T('The frequencies must total 40.')])
    ws.math_block(r'q = 40 - 4 - 6 - 12 - 3 = 15')
    ws.para([T('(iii)')])
    ws.para([T('Mid-points 5, 15, 25, 35, 45. It says "estimate" because the individual values are lost.')])
    ws.math_block(r'\bar{x} = \dfrac{4(5) + 6(15) + 12(25) + 15(35) + 3(45)}{40} = \dfrac{1070}{40} = 26.75 \text{ hours}')
    ws.para([T('(iv)')])
    ws.math_block(r'\text{s.d.} = \sqrt{\dfrac{33400}{40} - 26.75^2} = \sqrt{835 - 715.5625} = 10.9 \text{ hours (3 s.f.)}')

    # ---- 4 -----------------------------------------------------------------
    ws.para([B('What Multiplying Every Value Does to the Standard Deviation')])
    ws.para([T('The mean of 5 positive numbers '), M('a, b, c, d, e'), T(' is '), M('3.8'),
             T('. The sum of their squares is '), M('360'),
             T('. Each number is now multiplied by 2. Find the new standard deviation.')], marks=3)
    ws.para([B('Solution:')])
    ws.para([T('Find the original standard deviation first, then apply the rule — do not try to '
               'rebuild the five numbers.')])
    ws.math_block(r'\text{s.d.} = \sqrt{\dfrac{\sum x^2}{n} - \bar{x}^{\,2}} = \sqrt{\dfrac{360}{5} - 3.8^2}')
    ws.math_block(r'= \sqrt{72 - 14.44} = \sqrt{57.56} = 7.5868\ldots')
    ws.para([T('Multiplying every value by 2 multiplies the spread by 2 as well.')])
    ws.math_block(r'\text{new s.d.} = 2 \times 7.5868\ldots = 15.2 \text{ (3 s.f.)}')
    ws.para([T('Had the question '), I('added'), T(' 2 to every value instead, the standard '
             'deviation would have been unchanged.')])


def main():
    by_id, _ = fetch("EM", "Statistics", figures=False)
    print(f"pool: {len(by_id)} EM Statistics rows")
    ws = sheet('O Level E Math Revision', 'Statistics — Standard Deviation, Median, Quartiles and Cumulative Frequency')
    notes(ws)
    worked(ws)
    ws.page_break()
    ws.para([B('Practice')])
    ws.para([I('Show all working. Answers follow each question.')])
    n = render_practice(ws, by_id, PRACTICE)
    save(ws, "EM", "25 Statistics Revision.docx")
    print(f"worked examples: 4    practice: {n}/{len(PRACTICE)}")


if __name__ == "__main__":
    main()
