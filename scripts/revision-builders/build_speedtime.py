#!/usr/bin/env python3
"""EM Distance and Speed-Time Graphs revision worksheet.

Nearly every question in this topic carries a diagram -- 120 of 122 in the bank
-- so the practice half embeds the stored figures. The three worked examples
were each checked against the actual graph image, not just against the stored
solution: the arithmetic can be self-consistent and still describe a different
picture.
"""
from pathlib import Path
import tempfile
from build_lib import sheet, fetch, render_practice, save, T, B, I, M
import revision_lib as R

PRACTICE = [
    "4eca9a29-a426-4b6c-ab4f-99aabc821d11",   # Anglican High 2024, 4
    "b8c438fb-eaa5-4baa-a1b9-8db29fcde044",   # Anglican High 2025, 4
    "8da563ad-3389-40ab-9fde-add6129357e9",   # ACS (Barker Road) 2025, 4
    "8a631306-21c7-46ef-a3b6-931b99b51122",   # Bendemeer 2021, 4
    "87b1b6ca-e21b-44e5-8e11-f9c1c8681265",   # Bukit View 2024, 4
    "4f0fa31b-2fac-475c-b471-6a9aeea7714f",   # Canberra 2021, 4
    "b1e25e2d-3e9b-4257-9b15-65c3e8264086",   # Cedar Girls 2024, 4
    "3ec8cbd6-47d4-4334-ad28-39e2f78890d0",   # Chung Cheng (Main) 2025, 4
    "09d6ed4f-341b-46a0-be4d-360b3ac3e62b",   # Dunman 2024, 4
    "c9a2d704-3d60-40c2-bd56-5a5489825e1c",   # Geylang Methodist 2023, 4
    "e22121b3-8a27-4fe9-93d3-a24d357de86b",   # Kranji 2022, 4
    "56517880-aa52-4190-b51f-cb592b3b6aa6",   # Bendemeer 2023, 5
    "12b2c4d6-f468-425c-8a29-9557c186e73d",   # Bukit Merah 2025, 5
    "8bba9d1d-47ec-4aeb-8da9-117e5d91e7dc",   # Canberra 2024, 5
]


def notes(ws):
    ws.para([B('Notes:')])
    ws.para([B('Two graphs that look alike and mean different things')])
    ws.para([T('Read the '), B('vertical axis label first'),
             T('. Everything below depends on which of the two you are holding.')])
    ws.para([B('Distance–time graph')])
    ws.para([T('Gradient '), M(r'='), T(' speed. A steeper line means a faster journey.')])
    ws.para([T('A horizontal section means the object is '), B('stationary'), T(' — not "constant speed".')])
    ws.para([T('The area underneath means nothing at all.')])
    ws.para([B('Speed–time graph')])
    ws.para([T('Gradient '), M(r'='), T(' acceleration. A negative gradient is a deceleration.')])
    ws.para([T('A horizontal section means '), B('constant speed'), T(', not stopped.')])
    ws.para([T('The '), B('area under the graph'), T(' '), M(r'='), T(' distance travelled. '
             'This is the one most marks are hidden in.')])
    ws.math_block(r'\text{acceleration} = \dfrac{\text{change in speed}}{\text{time taken}} \qquad \text{distance} = \text{area under the speed--time graph}')
    ws.para([B('Finding the area')])
    ws.para([T('Split the shape into triangles, rectangles and trapeziums, then add.')])
    ws.math_block(r'\text{triangle} = \tfrac{1}{2}bh \qquad \text{trapezium} = \tfrac{1}{2}(a + b)h')
    ws.para([T('For a trapezium on a speed–time graph, '), M('a'), T(' and '), M('b'),
             T(' are the two '), I('parallel'), T(' sides — the top and bottom '),
             I('times'), T(' — and '), M('h'), T(' is the speed. It is easy to grab the wrong pair.')])
    ws.para([B('Average speed')])
    ws.math_block(r'\text{average speed} = \dfrac{\text{total distance}}{\text{total time}}')
    ws.para([T('Never the average of the separate speeds. Find the whole area, divide by the whole time.')])
    ws.para([B('When a speed is unknown')])
    ws.para([T('Give it a letter, write the area in terms of that letter, and set it equal to the '
               'distance you were given. If the graph gives you two similar triangles, the ratio '
               'of matching sides is equal — that is often quicker than finding the gradient.')])
    ws.para([B('Units')])
    ws.para([T('Read them off the axes and keep them. If speed is in km/min then acceleration is in '),
             M(r'\text{km/min}^2'), T(', and a time given in hours must be converted before use.')])
    ws.para([B('Five mistakes to avoid')])
    for i, e in enumerate([
        'Reading a distance–time graph as if it were a speed–time graph.',
        'Calling a horizontal section on a distance–time graph "constant speed" — the object is stationary.',
        'Averaging the speeds instead of dividing total distance by total time.',
        'Using the sloping side of a trapezium as one of the parallel sides.',
        'Losing the units, especially when the axes use minutes and the question asks in hours.',
    ], 1):
        ws.para([T(f'{i}.  ')] + R.split_math(e))


def worked(ws, figdir):
    ws.page_break()
    ws.para([B('Examples')])

    ws.para([B('Gradient for Acceleration, Area for Distance')])
    ws.para([T('The diagram shows the speed–time graph of a train. It accelerates uniformly from '
               'rest to 30 m/s in 10 seconds, holds that speed until '), M('t = 30'),
             T(' seconds, then decelerates uniformly to rest.')])
    ws.para([T('(a) Find the acceleration of the train in the first 10 seconds.')], marks=1)
    ws.para([T('(b) Given that the train decelerates at 2 m/s'), M('^2'),
             T(', find the total distance travelled.')], marks=3)
    ws.para([B('Solution:')])
    ws.para([T('(a)')])
    ws.para([T('Acceleration is the gradient — the speed gained divided by the time taken.')])
    ws.math_block(r'a = \dfrac{30 - 0}{10} = 3 \text{ m/s}^2')
    ws.para([T('(b)')])
    ws.para([T('You cannot find the area until you know where the graph ends, so find the '
               'deceleration time first.')])
    ws.math_block(r'\text{time to stop} = \dfrac{30}{2} = 15 \text{ s} \quad\Rightarrow\quad \text{journey ends at } t = 30 + 15 = 45 \text{ s}')
    ws.para([T('The shape is a trapezium. The parallel sides are the two '), I('times'),
             T(' — the top 20 s of constant speed and the whole 45 s at the bottom — and the '
               'height is the speed, 30 m/s.')])
    ws.math_block(r'\text{Distance} = \tfrac{1}{2}(20 + 45)(30) = 975 \text{ m}')

    ws.para([B('Working Backwards to an Unknown Speed')])
    ws.para([T('A train slows down uniformly from 50 m/s to 10 m/s in 20 seconds. During the next '
               '30 seconds it accelerates uniformly to a speed of '), M('u'), T(' m/s.')])
    ws.para([T('(a) The size of the acceleration is half the size of the deceleration. '
               'Find the value of '), M('u'), T('.')], marks=2)
    ws.para([T('(b) Calculate the average speed of the train during the 50 seconds.')], marks=2)
    ws.para([B('Solution:')])
    ws.para([T('(a)')])
    ws.para([T('Find the deceleration first — it is the only rate you can compute from the numbers given.')])
    ws.math_block(r'\text{deceleration} = \dfrac{50 - 10}{20} = 2 \text{ m/s}^2 \quad\Rightarrow\quad \text{acceleration} = \tfrac{1}{2}(2) = 1 \text{ m/s}^2')
    ws.para([T('Now write the acceleration in terms of '), M('u'), T(' and solve.')])
    ws.math_block(r'\dfrac{u - 10}{30} = 1 \quad\Rightarrow\quad u = 40')
    ws.para([T('(b)')])
    ws.para([T('Two trapeziums, one for each stage. Add the areas, then divide by the total time.')])
    ws.math_block(r'\text{Distance} = \tfrac{1}{2}(50 + 10)(20) + \tfrac{1}{2}(10 + 40)(30) = 600 + 750 = 1350 \text{ m}')
    ws.math_block(r'\text{Average speed} = \dfrac{1350}{50} = 27 \text{ m/s}')
    ws.para([T('Note it is not '), M(r'\tfrac{1}{2}(50 + 40) = 45'),
             T(' — averaging the speeds is the classic wrong answer here.')])

    ws.page_break()
    ws.para([B('Using Similar Triangles to Read a Value Off the Slope')])
    ws.para([T('A particle accelerates from rest to 22 cm/s in the first 2 seconds, then '
               'accelerates uniformly to 40 cm/s at '), M('t = 10'),
             T(' seconds, then decelerates uniformly to rest at '), M('t = 16'), T(' seconds.')])
    ws.para([T('(a) Calculate the speed of the particle after 6 seconds.')], marks=2)
    ws.para([T('(b) Calculate the average speed during the 16 seconds.')], marks=2)
    ws.para([B('Solution:')])
    ws.para([T('(a)')])
    ws.para([T('The point at '), M('t = 6'), T(' lies on the sloping line between '),
             M('(2,\\ 22)'), T(' and '), M('(10,\\ 40)'),
             T('. Matching sides of similar triangles are in the same ratio.')])
    ws.math_block(r'\dfrac{v - 22}{6 - 2} = \dfrac{40 - 22}{10 - 2}')
    ws.math_block(r'\dfrac{v - 22}{4} = \dfrac{18}{8} \quad\Rightarrow\quad v - 22 = 9 \quad\Rightarrow\quad v = 31 \text{ cm/s}')
    ws.para([T('(b)')])
    ws.para([T('Three pieces: a triangle, a trapezium and a triangle.')])
    ws.math_block(r'\text{Distance} = \tfrac{1}{2}(2)(22) + \tfrac{1}{2}(22 + 40)(8) + \tfrac{1}{2}(40)(6)')
    ws.math_block(r'= 22 + 248 + 120 = 390 \text{ cm}')
    ws.math_block(r'\text{Average speed} = \dfrac{390}{16} = 24.375 \text{ cm/s}')


def main():
    by_id, _ = fetch("EM", "Distance and Speed Time Graphs", figures=True)
    print(f"pool: {len(by_id)} rows")
    figdir = Path(tempfile.mkdtemp(prefix="figs_st_"))
    ws = sheet('O Level E Math Revision', 'Distance–Time and Speed–Time Graphs')
    notes(ws)
    worked(ws, figdir)
    ws.page_break()
    ws.para([B('Practice')])
    ws.para([I('Each question refers to the diagram printed with it. Show all working.')])
    n = render_practice(ws, by_id, PRACTICE, figdir=figdir)
    save(ws, "EM", "11 Distance and Speed Time Graphs Revision.docx")
    print(f"worked examples: 3    practice: {n}/{len(PRACTICE)}")


if __name__ == "__main__":
    main()
