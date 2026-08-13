"""REFERENCE BUILD (Kinematics, 2026-08-13) — copy-adapt per topic.

Builds a NEW bank-sourced "(With Worked Examples)" revision sheet with
create-worksheet's worksheet_lib. See SKILL.md → "Building a NEW
worked-examples sheet from the bank" for the pipeline + gotchas; the
layout mechanics here (Notes page -> page break -> Examples with concept
heads, Example N labels, padded literal part labels, right-tab marks,
boxed solutions -> page break -> Practice with auto Q/SQ numbering and
[Ans:] lines, per-question keep-together) carry to any topic unchanged.

Inputs it expects in the working dir (produce them with the skill's
fetch + select flow): pool.json (full topic pool rows) and practice.json
({"chosen": [...]} from select_questions AFTER excluding the authored
sheet's questions + the worked-example picks). Stems/parts are used
verbatim from those rows.

The topic-specific content — EXAMPLES (ids, concept lines, solution_box
rows) and ANSWERS — is hand-authored: solve every question yourself;
bank solutions/part-answers are untrusted reference only.
"""
import json
import re
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, "/Users/adrianfong/dev/adrianmathtuition-website/.claude/skills/create-worksheet")
sys.path.insert(0, "/Users/adrianfong/dev/adrianmathtuition-website/.claude/skills/revision-worksheet")
from worksheet_lib import Worksheet
import revision_lib as rl
from docx.shared import Cm

OUT = "30 Kinematics Revision (With Worked Examples) (Past Papers) (S4).docx"
B = {"bold": True}
I = {"italic": True}

# Bare-superscript fragments like "ms$^{-1}$" would hand pandoc the invalid
# latex "^{-1}"; give it an empty base so the unit exponent can't vanish.
def sm(text):
    return rl.split_math(str(text).replace("$^", "${}^"))


ROMANS = {"i": 1, "ii": 2, "iii": 3, "iv": 4, "v": 5, "vi": 6}


def sorted_parts(row):
    parts = rl._parts(row)
    labels = [str(p.get("label") or "").strip().lower() for p in parts]
    if all(l in ROMANS for l in labels):
        return sorted(parts, key=lambda p: ROMANS[str(p["label"]).strip().lower()])
    return sorted(parts, key=lambda p: str(p.get("label") or "").strip().lower())


def pad_label(lab):
    lab = str(lab).strip()
    width = 6 if lab.lower() in ROMANS else 4
    return f"({lab})".ljust(width)


# ---------------------------------------------------------------- data
pool = json.load(open("pool.json"))
by8 = {str(r["id"])[:8]: r for r in pool}
practice = json.load(open("practice.json"))["chosen"]
assert len(practice) == 14
assert str(practice[0]["id"])[:8] == "76e2abbd" and str(practice[-1]["id"])[:8] == "dcb4867f"
assert sum(int(r.get("total_marks") or 0) for r in practice) == 143

FIG_RAW = Path("fig_e5252acf.jpeg")
FIG = Path("fig_e5252acf.png")  # bucket JPEG lacks a JFIF header; python-docx rejects it
if not FIG_RAW.exists():
    env = rl.load_env()
    base, _ = rl.supabase_creds(env)
    url = f"{base}/storage/v1/object/public/question_images/6bc9d353-fe2f-4d2c-b69d-b8e3b9d737d0.jpeg"
    urllib.request.urlretrieve(url, FIG_RAW)
    print(f"downloaded figure -> {FIG_RAW} ({FIG_RAW.stat().st_size} bytes)")
if not FIG.exists():
    from PIL import Image
    Image.open(FIG_RAW).save(FIG)

# ---------------------------------------------------------------- sheet
ws = Worksheet()
ws.title("Sec 4 Additional Math Revision")
ws.subtitle("Kinematics (Past-Paper Edition)")

# ----- Notes (verbatim from the approved authored sheet) -----
ws.para([("text", "Notes:", B)])
ws.para([("text", "The three quantities, and how they connect", B)])
ws.para([("text", "Displacement "), ("math", "s"), ("text", " is measured "),
         ("text", "from the fixed point", I), ("text", " "), ("math", "O"),
         ("text", ". It carries a sign: a negative value means the particle is on the other side of "),
         ("math", "O"), ("text", ".")])
ws.para(sm("Velocity $v$ is the rate of change of displacement. Its sign gives the direction of travel."))
ws.para(sm("Acceleration $a$ is the rate of change of velocity."))
ws.math_block(r"v = \frac{ds}{dt} \qquad a = \frac{dv}{dt} = \frac{d^2s}{dt^2}")
ws.para(sm("Going the other way, integrate — and every integration needs a constant:"))
ws.math_block(r"s = \int v\,dt \qquad v = \int a\,dt")
ws.para([("text", "The four conditions you are asked to translate", B)])
ws.para(sm("Instantaneously at rest, or changes direction: $v=0$."))
ws.para(sm("Maximum or minimum velocity: $a=0$  (differentiate $v$ and set it to zero)."))
ws.para(sm("Back at $O$, or returns to its starting point: $s=0$."))
ws.para(sm("Starts from rest: $v=0$ when $t=0$.   Starts from $O$: $s=0$ when $t=0$."))
ws.para([("text", "Distance is not displacement", B)])
ws.para([("text", "Displacement is the "), ("text", "final position", I),
         ("text", " relative to "), ("math", "O"), ("text", ". Distance is "),
         ("text", "how far the particle actually travelled", I), ("text", ".")])
ws.para(sm("They differ the moment the particle turns round. To find total distance:"))
ws.para(sm("1.  Solve $v=0$ to find every turning time inside the interval."))
ws.para(sm("2.  Work out $s$ at both endpoints and at each of those times."))
ws.para([("text", "3.  Add the "), ("text", "absolute", I),
         ("text", " differences between consecutive values.")])
ws.para([("text", "Speeding up or slowing down", B)])
ws.para([("text", "The particle speeds up when "), ("math", "v"), ("text", " and "),
         ("math", "a"), ("text", " have the "), ("text", "same", I),
         ("text", " sign, and slows down when they have opposite signs.")])
ws.para([("text", "So "), ("math", "a>0"), ("text", " does "), ("text", "not", I),
         ("text", " mean speeding up.")])
ws.para([("text", "Six mistakes to avoid", B)])
ws.para(sm("1. Giving displacement when the question asked for total distance."))
ws.para(sm("2. Forgetting the constant of integration."))
ws.para(sm("3. Assuming the initial condition is at $t=0$. Sometimes you are given a value at another time."))
ws.para(sm("4. Confusing $v=0$ (instantaneously at rest) with $s=0$ (back at $O$)."))
ws.para(sm("5. Assuming $a>0$ means speeding up."))
ws.para(sm("6. Losing units, or mixing cm and m within one question."))

# ----- Examples (bank stems verbatim; solutions are mine, verified) -----
EXAMPLES = [
    ("d9b06d3b", "The full routine when velocity is given", [
        ("(a)", [
            r"\begin{aligned} v(2) = -3(2)^2 + k(2) + 15 &= 11 \\ 2k + 3 &= 11 \\ k &= 4 \quad\text{← shown} \end{aligned}",
        ]),
        ("(b)", [
            r"\begin{aligned} -3t^2 + 4t + 15 &= 0 \\ 3t^2 - 4t - 15 &= 0 \\ (3t + 5)(t - 3) &= 0 \\ t &= 3 \quad\text{← reject t = -5/3} \end{aligned}",
        ]),
        ("(c)", [
            r"\begin{aligned} a = \frac{dv}{dt} &= -6t + 4 \\ -6t + 4 &= 0 \quad\text{← max/min velocity when a = 0} \\ t &= \frac{2}{3} \end{aligned}",
            r"\begin{aligned} v\left(\tfrac{2}{3}\right) &= -3\left(\tfrac{2}{3}\right)^2 + 4\left(\tfrac{2}{3}\right) + 15 \\ &= 16\frac{1}{3} \text{ m/s} \quad\text{← quadratic opens downward, so a maximum} \end{aligned}",
        ]),
        ("(d)", [
            r"\begin{aligned} s = \int v\,dt &= -t^3 + 2t^2 + 15t + c \\ s(0) = 0: \; c &= 0 \end{aligned}",
            r"\begin{aligned} s(3) &= -27 + 18 + 45 = 36 \quad\text{← turns round at t = 3} \\ s(4) &= -64 + 32 + 60 = 28 \end{aligned}",
            r"\text{distance} = 36 + (36 - 28) = 44 \text{ m}",
        ]),
        ("(e)", [
            r"\begin{aligned} -t^3 + 2t^2 + 15t &= 0 \\ -t(t^2 - 2t - 15) &= 0 \\ -t(t - 5)(t + 3) &= 0 \\ t &= 5 \quad\text{← reject t = 0 (start) and t = -3} \end{aligned}",
        ]),
    ]),
    ("333d9338", "An unknown constant from an acceleration condition — and the distance trap", [
        ("(a)", [
            r"\begin{aligned} a = \frac{dv}{dt} &= 12t + m \\ a(1) = 12 + m &= -9 \quad\text{← deceleration 9 means a = -9} \\ m &= -21 \quad\text{← shown} \end{aligned}",
        ]),
        ("(b)", [
            r"\begin{aligned} 6t^2 - 21t + 9 &= 0 \\ 2t^2 - 7t + 3 &= 0 \\ (2t - 1)(t - 3) &= 0 \\ t &= 0.5 \text{ or } t = 3 \end{aligned}",
        ]),
        ("(c)", [
            sm("The displacement at $t=4$ gives only the final position measured from $O$. "
               "The particle changes direction at $t=0.5$ and $t=3$, so it doubles back — "
               "that backtracked distance is not counted by the displacement alone."),
        ]),
        ("(d)", [
            r"\begin{aligned} s = \int v\,dt &= 2t^3 - \frac{21}{2}t^2 + 9t + c \\ s(0) = 0: \; c &= 0 \end{aligned}",
            r"\begin{aligned} s(0.5) &= 2.125 \\ s(3) &= -13.5 \\ s(4) &= -4 \quad\text{← s at both endpoints and both turning times} \end{aligned}",
            r"\text{distance} = 2.125 + (2.125 + 13.5) + (13.5 - 4) = 27.25 \text{ m}",
        ]),
    ]),
    ("c62045f2", "Displacement given: differentiate — nothing to integrate", [
        ("(i)", [
            r"\begin{aligned} v = \frac{dx}{dt} &= 3t^2 - 24t + 45 \\ 3(t - 3)(t - 5) &= 0 \quad\text{← set v = 0} \\ t &= 3 \text{ or } t = 5 \end{aligned}",
        ]),
        ("(ii)", [
            r"\begin{aligned} x(3) &= 27 - 108 + 135 = 54 \quad\text{← turns round at t = 3} \\ x(4) &= 64 - 192 + 180 = 52 \end{aligned}",
            r"\text{distance} = 54 + (54 - 52) = 56 \text{ m}",
        ]),
        ("(iii)", [
            sm("Returning to the starting point needs $x=0$ for some $t>0$."),
            r"\begin{aligned} x = t(t^2 - 12t + 45) &= 0 \\ t^2 - 12t + 45 &= 0 \quad\text{← discriminant: 144 - 180 = -36 < 0} \end{aligned}",
            sm("No real roots, so $x=0$ only at $t=0$ — the particle never returns."),
        ]),
    ]),
    ("b3fc6170", "Acceleration given: integrate up to velocity, then displacement", [
        ("(i)", [
            r"\begin{aligned} v = \int a\,dt &= 20e^{-0.2t} + c \\ v(0) = 18: \; 20 + c &= 18 \\ v &= 20e^{-0.2t} - 2 \end{aligned}",
        ]),
        ("(ii)", [
            r"\begin{aligned} 20e^{-0.2t} - 2 &= 0 \\ e^{-0.2t} &= \frac{1}{10} \\ -0.2t &= -\ln 10 \\ t &= 5\ln 10 \quad\text{← shown} \end{aligned}",
        ]),
        ("(iii)", [
            r"\begin{aligned} s = \int v\,dt &= -100e^{-0.2t} - 2t + c \\ s(0) = 0: \; c &= 100 \end{aligned}",
            r"\begin{aligned} s(5\ln 10) &= -100\left(\tfrac{1}{10}\right) - 10\ln 10 + 100 \quad\text{← e^(-0.2t) = 1/10 at R} \\ &= 90 - 10\ln 10 = 67.0 \text{ m (3 s.f.)} \end{aligned}",
        ]),
    ]),
    ("e073d17c", "Exponential velocity: exact rest times, and proving it passes the start again", [
        ("(a)", [
            r"\begin{aligned} 10e^{-0.1t} - 5 &= 0 \\ e^{-0.1t} &= \frac{1}{2} \\ -0.1t &= -\ln 2 \\ t &= 10\ln 2 \end{aligned}",
        ]),
        ("(b)", [
            r"\begin{aligned} s = \int v\,dt &= -100e^{-0.1t} - 5t + c \\ s(0) = 0: \; c &= 100 \end{aligned}",
            r"\begin{aligned} AB = s(10\ln 2) &= -100\left(\tfrac{1}{2}\right) - 50\ln 2 + 100 \quad\text{← e^(-0.1t) = 1/2 at B} \\ &= 50 - 50\ln 2 = 15.3 \text{ m (3 s.f.)} \end{aligned}",
        ]),
        ("(c)", [
            r"\begin{aligned} a = \frac{dv}{dt} &= -e^{-0.1t} \\ a(3) = -e^{-0.3} &= -0.741 \text{ m/s}^2 \text{ (3 s.f.)} \end{aligned}",
        ]),
        ("(d)", [
            r"\begin{aligned} s(15) &= 25 - 100e^{-1.5} = 2.69 > 0 \\ s(16) &= 20 - 100e^{-1.6} = -0.190 < 0 \end{aligned}",
            sm("$s$ changes sign between $t=15$ and $t=16$, so $s=0$ at some instant in the "
               "sixteenth second — the particle is again at $A$."),
        ]),
    ]),
    ("f49adbee", "Trigonometric velocity: work in radians", [
        ("(a)", [
            r"\begin{aligned} 9\sin\frac{t}{2} &= 0 \\ \frac{t}{2} &= \pi \quad\text{← first rest after leaving O; work in radians} \\ t &= 2\pi \end{aligned}",
        ]),
        ("(b)", [
            r"\begin{aligned} a = \frac{dv}{dt} &= \frac{9}{2}\cos\frac{t}{2} \\ \cos\frac{t}{2} &= 0 \quad\text{← max velocity when a = 0} \\ t &= \pi \end{aligned}",
        ]),
        ("(c)", [
            r"\begin{aligned} s = \int v\,dt &= -18\cos\frac{t}{2} + c \\ s(0) = 0: \; c &= 18 \end{aligned}",
            r"\begin{aligned} s(2\pi) &= 36 \quad\text{← turns round at t = 2π} \\ s(10) &= 18 - 18\cos 5 = 12.89 \end{aligned}",
            r"\text{distance} = 36 + (36 - 12.89) = 59.1 \text{ m (3 s.f.)}",
        ]),
        ("(d)", [
            r"\begin{aligned} 18 - 18\cos\frac{t}{2} &= 0 \\ \cos\frac{t}{2} &= 1 \\ \frac{t}{2} &= 2\pi \\ t &= 4\pi \end{aligned}",
        ]),
    ]),
]

ws.page_break()
ws.para([("text", "Examples", B)])
for id8, concept, sol_rows in EXAMPLES:
    r = by8[id8]
    ws.concept(concept)
    ws.example()
    ws.para(sm(r["question_text"]))
    for p in sorted_parts(r):
        ws.para([("text", pad_label(p["label"]))] + sm(p["text"]), marks=p.get("marks"))
    ws.solution_box(sol_rows)

# ----- Practice (bank stems verbatim; answers are mine, verified) -----
ANSWERS = {
    "76e2abbd": "(a) no — $v = 8e^{-2t} > 0$ for all $t$, so the particle never comes to rest; "
                "(b)(i) $-0.293\\ \\mathrm{m/s^2}$; (ii) $3.93$ m",
    "e5252acf": "(a) $t = 2$ and $t = 3.5$; (b) $12\\frac{1}{6}$ m; (c) $t = 2.75$ s",
    "d5605b0a": "(a) $-\\frac{4}{3}$ m/s; (b) $t = \\frac{2}{3}$ s; (c) $1$ m",
    "cda78ffe": "(a) shown; (b) $s = 15t - 3e^{2t} + 3$; total distance $= 4.74$ m",
    "aedef640": "(a) $t = 0.0972$ s; (b) $t = \\frac{5}{6}$ s; "
                "(c) no — $v_X < 0$ and $v_Y > 0$, so they travel in opposite directions",
    "7bc84330": "(a) $\\frac{8}{3}$ m/s; (b) $t = \\frac{8}{3}$ s; (c) $9\\frac{13}{27}$ m",
    "29f9fa9b": "(a) $3 < t < 5$; (b) no — $s_A - s_B = -t(t^2 - 12t + 45) < 0$ for all $t > 0$, "
                "so $B$ stays ahead and there is no overtaking",
    "47dec294": "(a) shown; (b) $OP = 80 - 20\\ln 5 \\approx 47.8$ m; "
                "(c) $s(49) > 0$ and $s(50) < 0$, so the particle passes $O$ during the fiftieth second",
    "0f93d3d8": "(a) $t = 1$ and $t = 4$; (b) $t = \\frac{15 \\pm \\sqrt{33}}{4} \\approx 2.31$ and $5.19$; "
                "(c) $-0.372\\ \\mathrm{m/s^2}$; (d) $1.63$ m/s",
    "c26b8c15": "(a) speed $= 189$ m/s, acceleration $= 48\\ \\mathrm{m/s^2}$; "
                "(b) $t = 1$ and $t = 3$; (c) $12$ m",
    "2cf14ad4": "(a) $\\frac{5\\sqrt{2}}{8} \\approx 0.884\\ \\mathrm{m/s^2}$; (b) $OA = 10$ m; "
                "(c) shown — and $v = 0.25t - 4\\pi \\geq 0$ for $t \\geq 16\\pi$, so Jean never travels back towards $O$; "
                "(d) $91.8$ m",
    "71ed967d": "(a) $e^{-t/2} > 0$ for all $t$, so $a < 0$: the car is always decelerating; "
                "(b) $v = 15e^{-t/2} - 1$; (c) $2\\ln 15 \\approx 5.42$ s; "
                "(d) $s = 30 - 30e^{-t/2} - t$; (e) yes — it stops $22.6$ m from where the brakes were applied, short of the $35$ m stop line",
    "d6b32935": "(a) $\\frac{3}{5}\\ \\mathrm{m/s^2}$ (at $t = 4$); "
                "(b) $s = t + \\frac{t^2}{2} - \\frac{1}{6}(4t + 9)^{3/2} + \\frac{9}{2}$",
    "dcb4867f": "(a) $t = 1$ and $t = 9$; (b) $-16$ m/s, a minimum; (c) $-7.54$ m/s; (d) $17\\frac{2}{3}$ m",
}
assert set(ANSWERS) == {str(r["id"])[:8] for r in practice}

ws.page_break()
ws.para([("text", "Practice", B)])
ws.para([("text", "Answers are at the end of each question. Show all working.", I)])
for r in practice:
    id8 = str(r["id"])[:8]
    ws.Q(sm(r["question_text"]))
    if id8 == "e5252acf":
        ws.figure(str(FIG), 10.5)
    for p in sorted_parts(r):
        subparts = p.get("subparts") or []
        if subparts:
            ws.SQ(sm(p["text"]))
            for sp in subparts:
                pp = ws.para([("text", f"({sp['label']}) ".ljust(5))] + sm(sp["text"]),
                             marks=sp.get("marks"))
                pp.paragraph_format.left_indent = Cm(1.4)
        else:
            ws.SQ(sm(p["text"]), marks=p.get("marks"))
    ws.ans(sm(ANSWERS[id8]))
    for para in ws._block_paras[:-1]:  # keep each question + its [Ans:] on one page
        para.paragraph_format.keep_with_next = True
    ws._block_paras = []

ws.save(OUT)
print(f"saved {OUT}")
print(f"examples: {len(EXAMPLES)} ({sum(int(by8[e[0]].get('total_marks') or 0) for e in EXAMPLES)}m), "
      f"practice: {len(practice)} (143m)")
