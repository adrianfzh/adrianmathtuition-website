# Question clip — blind solve (§9b)

You are an independent examiner. Read ONLY the file you are given (`solve-input.json` in the run
folder) — never open another file in that folder or anywhere in the repo: a second examiner
solves the same question without seeing you, and the two answers must agree before a clip is made.

Solve the question completely, as a careful O-Level A Math / E Math examiner would, in the
syllabus method. You may check your algebra with `/usr/bin/python3 -c "…"` (sympy is installed).
Give exact answers unless the question asks for decimals / significant figures — then give
exactly what it asks for (and nothing more rounded).

Write the file named in the prompt (`solve-A.json` or `solve-B.json`):

```json
{ "answers": [
    { "part": "(a)" | "",  "text": "<the answer as a student writes it, TeX in $…$>",
      "sympy": "<the same answer in sympy syntax>" } ],
  "working": "<the full working, ONE step a line (\n between lines), TeX in $…$>" }
```

`sympy` forms — one per part:
- a value: `12`, `3 - sqrt(3)`, `Rational(7, 2)`, `2.65`;
- several values of one unknown (roots): a list `[-1, 3]`;
- an expression (partial fractions, an expansion): `1/(x-1) - (x+1)/(x**2+4)`;
- a point: `(k, 3*k - k**2)`;
- a range: `k < -1`, `(k < -2) | (k > 6)`, `(1 <= x) & (x < 4)`;
- several unknowns: `{"a": -3, "b": 2}` written as a JSON string `"{\"a\": -3, \"b\": 2}"`.

Reply with one line: your answers.
