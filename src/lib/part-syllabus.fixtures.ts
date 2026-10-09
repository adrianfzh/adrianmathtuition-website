// Two real bank rows, copied on 9 Oct 2026 (SELECT only) — the fixtures for the two fixes in
// SPEC-PART-SYLLABUS.md: the answer line that vanished, and the "Hence" that was missed.
// Functions, so each test gets its own copy.

/** ASRJC 2023 Prelim P1 Q9. The stored answer line spells its labels "(bi) (bii) (biii)", and (b)(ii) — a "show that" — has no answer of its own. */
export const asrjc2023Q9 = () => ({
  "id": "923966ae-0d37-4f0e-b436-cd628276e66c",
  "question_text": "**Do not use a calculator in answering this question.**",
  "total_marks": 12,
  "answer": "(a) $2\\sqrt{2}\\left(\\cos\\left(-\\dfrac{7\\pi}{12}\\right)+i\\sin\\left(-\\dfrac{7\\pi}{12}\\right)\\right)$ (bi) $i\\cot\\dfrac{\\theta}{2}$ (bii) shown (biii) $\\tan\\dfrac{\\pi}{8}=\\sqrt{2}-1$",
  "solution": null,
  "parts": [
    {
      "label": "a",
      "text": "Given $z_1 = 1+i$, $z_2 = \\sqrt{3}-i$, $z_3 = \\cos\\frac{\\pi}{3} + i\\sin\\frac{\\pi}{3}$. Find $\\frac{z_1 z_2}{z_3^2}$ in polar form.",
      "marks": 4,
      "answer": "$2\\sqrt{2}(\\cos(-\\frac{7\\pi}{12}) + i\\sin(-\\frac{7\\pi}{12}))$",
      "solution": "$\\dfrac{z_1 z_2}{z_3^2} = \\dfrac{\\sqrt{2}\\,e^{i(\\pi/4)} \\cdot 2\\,e^{-i(\\pi/6)}}{\\left(e^{i(\\pi/3)}\\right)^2}$\n$= \\dfrac{2\\sqrt{2}\\,e^{i(\\pi/12)}}{e^{i(2\\pi/3)}}$\n$= 2\\sqrt{2}\\,e^{-i(7\\pi/12)}$\n$= 2\\sqrt{2}\\left(\\cos\\left(\\dfrac{-7\\pi}{12}\\right) + i\\sin\\left(\\dfrac{-7\\pi}{12}\\right)\\right)$"
    },
    {
      "label": "b",
      "text": "$z_4 = \\cos\\theta + i\\sin\\theta$.",
      "marks": 8,
      "answer": "",
      "subparts": [
        {
          "label": "i",
          "text": "Show that $\\frac{1+z_4}{1-z_4} = k\\cot\\frac{\\theta}{2}$. Find $k$.",
          "marks": 4,
          "answer": "$k = i$",
          "solution": "$\\dfrac{1 + z_4}{1 - z_4} = \\dfrac{1 + e^{i\\theta}}{1 - e^{i\\theta}}$\n$= \\dfrac{e^{i\\theta/2}\\left(e^{-i\\theta/2} + e^{i\\theta/2}\\right)}{e^{i\\theta/2}\\left(e^{-i\\theta/2} - e^{i\\theta/2}\\right)}$\n$= \\dfrac{2\\cos\\dfrac{\\theta}{2}}{-2i\\sin\\dfrac{\\theta}{2}}$\n$= \\dfrac{1}{-i}\\cot\\dfrac{\\theta}{2}$\n$= i\\cot\\dfrac{\\theta}{2}$, where $k = i$."
        },
        {
          "label": "ii",
          "text": "For $\\theta = \\frac{\\pi}{4}$, show $\\frac{1+z_4}{1-z_4} = (1+\\sqrt{2})i$.",
          "marks": 2,
          "answer": "",
          "solution": "$\\dfrac{1 + z_4}{1 - z_4} = \\dfrac{1 + z_4}{1 - z_4}\\times\\dfrac{1 - z_4^*}{1 - z_4^*}$\n$= \\dfrac{1 + z_4 - z_4^* - z_4 z_4^*}{1 - z_4 - z_4^* + z_4 z_4^*}$\n$= \\dfrac{1 + 2i\\,\\text{Im}(z_4) - |z_4|^2}{1 - 2\\,\\text{Re}(z_4) + |z_4|^2}$\n\nWith $\\theta = \\dfrac{\\pi}{4}$, $z_4 = \\dfrac{\\sqrt{2}}{2} + i\\dfrac{\\sqrt{2}}{2}$, $|z_4| = 1$:\n$= \\dfrac{1 + 2i\\left(\\dfrac{\\sqrt{2}}{2}\\right) - 1}{1 - 2\\left(\\dfrac{\\sqrt{2}}{2}\\right) + 1}$\n$= \\dfrac{\\sqrt{2}\\,i}{2 - \\sqrt{2}}\\times\\dfrac{2 + \\sqrt{2}}{2 + \\sqrt{2}}$\n$= (1 + \\sqrt{2})i \\quad$ (shown)"
        },
        {
          "label": "iii",
          "text": "Hence find the exact value of $\\tan\\frac{\\pi}{8}$.",
          "marks": 2,
          "answer": "$\\sqrt{2} - 1$",
          "solution": "$i\\cot\\dfrac{\\pi}{8} = (1 + \\sqrt{2})i$\n$\\cot\\dfrac{\\pi}{8} = 1 + \\sqrt{2}$\n$\\tan\\dfrac{\\pi}{8} = \\dfrac{1}{1 + \\sqrt{2}} = \\sqrt{2} - 1$"
        }
      ]
    }
  ]
});

/** RI 2024 Prelim P1 Q8. (b)(iii) "Hence find tan π/12" leans on (b)(i), past (b)(ii). (Adrian has since ruled (b)(i) IN syllabus: a fixture for the dependency logic only.) */
export const ri2024Q8 = () => ({
  "id": "2c7e8516-26f7-427d-abf6-843d5753b9d0",
  "question_text": "Do not use a calculator in answering this question.",
  "total_marks": 12,
  "answer": "(a) $w = 1 + 3i$ and $w = 1 - i$; (b)(i) $\\arg(z) = \\frac{11\\pi}{12}$; (b)(ii) $z = \\frac{-1 - \\sqrt{3}}{2} + \\frac{\\sqrt{3} - 1}{2}i$; (b)(iii) $\\tan \\frac{\\pi}{12} = 2 - \\sqrt{3}$",
  "solution": null,
  "parts": [
    {
      "label": "a",
      "text": "The complex number $w$ is such that $w = a + ib$, where $a$ and $b$ are non-zero real numbers. The complex conjugate of $w$ is denoted by $w^*$. Given that $ww^* = 4 - 2i + 2iw^*$, find the two possible values of $w$.",
      "marks": 4,
      "answer": "$w = 1 + 3i$ and $w = 1 - i$",
      "solution": "$ww^* = 4 - 2i + 2iw^*$\nLet $w = a + ib$, so $w^* = a - ib$ and $ww^* = a^2 + b^2$.\n$a^2 + b^2 = 4 - 2i + 2i(a - ib)$\n$a^2 + b^2 = 4 - 2i + 2ai + 2b$\n$a^2 + b^2 = (4 + 2b) + 2(a - 1)i$\n\nComparing real and imaginary parts:\n$a^2 + b^2 = 4 + 2b$ and $2(a - 1) = 0 \\implies a = 1$.\n\n$1 + b^2 = 4 + 2b$\n$b^2 - 2b - 3 = 0$\n$(b - 3)(b + 1) = 0$\n$b = 3$ or $b = -1$.\n\nThe two possible values of $w$ are $1 + 3i$ and $1 - i$."
    },
    {
      "label": "b",
      "text": "The complex number $z$ is given by $z = \\frac{1 - \\sqrt{3}i}{-1 + i}$.",
      "marks": 8,
      "subparts": [
        {
          "label": "i",
          "text": "Find $\\arg(z)$.",
          "marks": 3,
          "answer": "$\\arg(z) = \\frac{11\\pi}{12}$",
          "solution": "$z = \\frac{1 - \\sqrt{3}i}{-1 + i}$.\n\n$|1 - \\sqrt{3}i| = \\sqrt{1 + 3} = 2$, $\\arg(1 - \\sqrt{3}i) = -\\frac{\\pi}{3}$.\n$|-1 + i| = \\sqrt{2}$, $\\arg(-1 + i) = \\frac{3\\pi}{4}$.\n\n$\\arg(z) = \\arg(1 - \\sqrt{3}i) - \\arg(-1 + i)$\n$= -\\frac{\\pi}{3} - \\frac{3\\pi}{4}$\n$= -\\frac{4\\pi + 9\\pi}{12} = -\\frac{13\\pi}{12}$\n\nAdjusting to principal range $(-\\pi, \\pi]$: $\\arg(z) = -\\frac{13\\pi}{12} + 2\\pi = \\frac{11\\pi}{12}$."
        },
        {
          "label": "ii",
          "text": "Find $z$ in cartesian form $x + iy$.",
          "marks": 2,
          "answer": "$z = \\frac{-1 - \\sqrt{3}}{2} + \\frac{\\sqrt{3} - 1}{2}i$",
          "solution": "$z = \\frac{1 - \\sqrt{3}i}{-1 + i} \\cdot \\frac{-1 - i}{-1 - i}$\n$= \\frac{(1 - \\sqrt{3}i)(-1 - i)}{1 + 1}$\n$= \\frac{-1 - i + \\sqrt{3}i + \\sqrt{3}i^2}{2}$\n$= \\frac{-1 - \\sqrt{3} + (\\sqrt{3} - 1)i}{2}$\n$= \\frac{-1 - \\sqrt{3}}{2} + \\frac{\\sqrt{3} - 1}{2}i$."
        },
        {
          "label": "iii",
          "text": "Hence find the value of $\\tan \\frac{\\pi}{12}$ in the form $c + d\\sqrt{3}$, where $c$ and $d$ are integers to be found.",
          "marks": 3,
          "answer": "$\\tan \\frac{\\pi}{12} = 2 - \\sqrt{3}$",
          "solution": "From part (b)(i), $\\arg(z) = \\frac{11\\pi}{12}$.\nAlso, $\\arg(z) = \\pi - \\frac{\\pi}{12}$, so $\\tan\\left(\\arg(z)\\right) = -\\tan\\frac{\\pi}{12}$.\n\nFrom the cartesian form: $\\tan(\\arg(z)) = \\frac{\\text{Im}(z)}{\\text{Re}(z)} = \\frac{(\\sqrt{3} - 1)/2}{(-1 - \\sqrt{3})/2} = \\frac{\\sqrt{3} - 1}{-1 - \\sqrt{3}}$\n\n$\\tan\\frac{\\pi}{12} = -\\frac{\\sqrt{3} - 1}{-1 - \\sqrt{3}} = \\frac{\\sqrt{3} - 1}{1 + \\sqrt{3}}$\n\nRationalising: $\\frac{(\\sqrt{3} - 1)(\\sqrt{3} - 1)}{(1 + \\sqrt{3})(\\sqrt{3} - 1)} = \\frac{3 - 2\\sqrt{3} + 1}{\\sqrt{3} - 1 + 3 - \\sqrt{3}} = \\frac{4 - 2\\sqrt{3}}{2} = 2 - \\sqrt{3}$.\n\nHence $\\tan\\frac{\\pi}{12} = 2 - \\sqrt{3}$, so $c = 2, d = -1$."
        }
      ]
    }
  ]
});
