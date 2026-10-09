# Layout macros — `assets/preamble.tex`

Copy `preamble.tex` next to your body files and `\input{preamble}`. Every macro
below is defined there. Three indent levels are used throughout:

| Level | Length | Used for |
|---|---|---|
| `\Lq` | 1.05 cm | question text |
| `\Lp` | 2.10 cm | part text |
| `\Ls` | 3.15 cm | subpart text |

Labels sit in the gutter to the left of their text, so wrapped lines align under
the text rather than under the label — the same as the printed paper.

## Question and part labels

```latex
\Qn{7}   In 2023, the revenue of a company was 12\% more than in 2022.
\nl      In 2024, it was 30\% less than in 2023.
\Pa{a}   Given that $p$ represents the revenue in 2022, ...
\Sb{i}   List the elements in the set $A\cap B$.
```

`\nl` starts a new line at the current indent — use it for the second and later
sentences of a stem, since exam papers break lines by sentence rather than
letting them wrap.

### Merged labels — the thing that is easiest to get wrong

When a question has no stem of its own, the printed paper puts the number on the
same line as the first part. Same when a part exists only to hold subparts. Use
the merged macros, not `\Qn` followed by `\Pa` on the next line:

```latex
\QnPa{10}{a}       Write down the set represented by the shaded region.
\QnPaSb{18}{a}{i}  Write 3150 as a product of its prime factors.
\PaSb{b}{i}        Use prime factors to explain why $14\times 56$ is a perfect square.
```

Exception: if a figure comes immediately after the number, the number stays on
its own line (`\Qn{12}` then `\Fig{...}`), because that is what the paper does.

Check the result with `verify_output.py --same-line`, which reads the glyph
coordinates and reports whether the tokens really share a baseline.

## Answer lines

```latex
\Ans{}{cm}{2}          % Answer  ............ cm  [2]
\Ans{$x=$}{}{2}        % Answer  x = .......      [2]
\Ans{\$}{}{2}          % Answer  $ ...........    [2]
\AnsX{$p=$\makebox[2.2cm]{\dotfill}\,,\enspace $q=$\makebox[2.2cm]{\dotfill}}{2}
\Mk{2}                 % bare [2] flush right, for "show that" parts
```

`\Ans` takes prefix, unit, marks. `\AnsX` takes a custom body plus marks — use it
for multi-slot answers (two blanks, a matrix bracket, "$\ldots$ on Saturday and
$\ldots$ on Sunday").

An empty matrix bracket for the student to fill:

```latex
\AnsX{$\mathbf{P}=\left(\rule{0pt}{1.15cm}\hspace{4.2cm}\right)$}{1}
```

## Ruled writing lines

For explanation parts. Suffix `m` puts the marks on the last line; `s` indents to
subpart level.

```latex
\WL \WL \WLm{2}        % three lines at part indent, marks on the last
\WLs \WLsm{1}          % two lines at subpart indent
```

## Figures, rules, working space

```latex
\Fig{fig/q17_quad.png}{7.26cm}   % centred, width from widths.json
\Rule                            % full-width rule between questions
\WS{3}                           % working space, weight 3
```

`\WS{n}` emits `\vspace{\stretch{n}}`. Because these are stretchable, the glue on
a page expands to fill exactly to the bottom margin when the page is ended with
`\newpage` — so working space is distributed in proportion to marks and every
page fills naturally, the way the original does. Use a weight roughly equal to
the marks for that part. Do not use fixed `\vspace` for working space; you would
have to hand-tune every page.

Fixed `\vspace` is right when the paper puts something at a specific place — for
example a construction line that must sit a set distance down the page:

```latex
\nl \textit{Answer}
\par\vspace{9.3cm}
{\leftskip=0pt\parindent=0pt\centering
 $A$\hspace{2.5mm}\rule[0.62ex]{5.8cm}{0.5pt}\hspace{2.5mm}$B$\par}
```

Two traps here. A `\par` is needed before the centred group, or it joins the
previous paragraph and the line ends up beside "Answer" instead of below it. And
where a length is mathematically load-bearing — a construction line the student
measures against — set it with `\rule` at the exact value and confirm it in the
output with `verify_output.py --rules`.

## Grouping rule for any new macro

Every macro that changes `\leftskip` must end its paragraph *inside* the group:

```latex
{\leftskip=0pt\parindent=0pt\noindent\rule{\textwidth}{0.5pt}\par}   % right
{\leftskip=0pt\parindent=0pt\noindent\rule{\textwidth}{0.5pt}}\par   % wrong
```

TeX applies whatever `\leftskip` is current when the paragraph is broken into
lines. If `\par` falls outside the group, the old value comes back first and the
line overflows by exactly one indent step — 29.87 pt, 59.75 pt or 89.63 pt. Those
three numbers in an overfull warning point straight at this bug.

## Answer key

```latex
\AnsHead{Crescent Girls' School \quad 2025 Prelim S4 Mathematics}{Paper 1 --- Answers}
\A{5}{$\dfrac{-1-4x}{(2x+1)(x-2)}$}
\A{9}{}
\Ap{a}{20 sides}
\Ap{b}{$3240^{\circ}$}
\AQPS{13}{a}{i}{16 cm}      % 13. (a) (i) 16 cm
\ApAs{b}{i}{$k=17$}         % (b) (i) k = 17
\As{ii}{$x=-\dfrac{7}{2}$}
```

Same merging principle as the paper: a label with nothing of its own joins the
next one rather than sitting on an empty line. Start the key on a fresh page.
