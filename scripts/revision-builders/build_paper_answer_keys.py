# -*- coding: utf-8 -*-
"""Typeset an answers-only key per paper, matching the earlier practice sets.

mathptmx so the key sets in the same Times face as the papers. enumitem is not
installed in this TeX tree, so the numbered list is a hand-rolled \\K macro
with a fixed-width number box and a minipage for the answer — the same one the
Cedar Girls / Chung Cheng keys used.

A question the bank has no answer for prints as a visible dash rather than
being dropped, so a gap in the bank can never read as a shorter paper.
"""
import os, subprocess
import json

HEAD = r'''\documentclass[10pt,a4paper]{article}
\usepackage[a4paper,top=2cm,bottom=2cm,left=2cm,right=2cm]{geometry}
\usepackage{mathptmx}
\usepackage{amsmath,amssymb}
\usepackage[table]{xcolor}
\usepackage{eurosym}
\pagestyle{empty}
\setlength{\parindent}{0pt}
\newcounter{keyno}
\newcommand{\K}[2]{%
  \noindent\makebox[2.1em][l]{\textbf{#1.}}%
  \begin{minipage}[t]{\dimexpr\linewidth-2.1em\relax}#2\end{minipage}%
  \par\vspace{5pt}}
\begin{document}
\begin{center}
{\large\bfseries TITLE}\\[2pt]
{\bfseries Answers}
\end{center}
\vspace{6pt}
\hrule
\vspace{10pt}
'''

TAIL = r'''
\end{document}
'''

GAP = r'\textit{--- no answer on file ---}'


def build(key, title, out_pdf, workdir='_tex'):
    os.makedirs(workdir, exist_ok=True)
    rows = json.load(open('answers.json'))[f'{key[0]}|{key[1]}']
    body = ''.join('\\K{%s}{%s}\n' % (q, (a if a else GAP)) for q, a in rows)
    tex = HEAD.replace('TITLE', title) + body + TAIL
    stem = f'{key[0]}_p{key[1]}'
    with open(f'{workdir}/{stem}.tex', 'w') as fh:
        fh.write(tex)
    r = subprocess.run(['pdflatex', '-interaction=nonstopmode', '-halt-on-error',
                        f'{stem}.tex'], cwd=workdir, capture_output=True, text=True)
    if r.returncode != 0:
        tail = [l for l in r.stdout.splitlines() if l.startswith('!')][:4]
        raise SystemExit(f'{stem}: pdflatex failed\n' + '\n'.join(tail))
    os.replace(f'{workdir}/{stem}.pdf', out_pdf)
    return out_pdf


TITLES = {
 ('am5','1'): 'Sec 4 A Math Prelims Practice Set 5 --- Paper 1',
 ('am5','2'): 'Sec 4 A Math Prelims Practice Set 5 --- Paper 2',
 ('em5','1'): 'Sec 4 E Math Prelims Practice Set 5 --- Paper 1',
 ('em5','2'): 'Sec 4 E Math Prelims Practice Set 5 --- Paper 2',
 ('jc4','1'): 'JC2 H2 Math Prelims Practice Set 4 --- Paper 1',
 ('jc4','2'): 'JC2 H2 Math Prelims Practice Set 4 --- Paper 2',
 ('jc5','1'): 'JC2 H2 Math Prelims Practice Set 5 --- Paper 1',
 ('jc5','2'): 'JC2 H2 Math Prelims Practice Set 5 --- Paper 2',
}

if __name__ == '__main__':
    os.makedirs('keys', exist_ok=True)
    for key, title in TITLES.items():
        p = build(key, title, f'keys/{key[0]}_p{key[1]}.pdf')
        import pypdf
        print(f'  {key} -> {p}  ({len(pypdf.PdfReader(p).pages)} page/s)')
