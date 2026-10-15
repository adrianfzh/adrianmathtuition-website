// A Math · Quadratic Functions — the SAMPLE topic for the skill layout
// (Adrian, 15 Oct 2026: "okay go ahead", one A Math topic first).
// Rules: SPEC-NOTES-PORTAL.md §Skill layout. Applied by ../apply.mjs.
//
// skills[] is in LEARNING order (becomes subgroups.order_index 1..n).
// examples[]: `id` = an existing content_snippets row (rewritten in place and
// re-filed under this skill); `key` = a new row (inserted once, found again by
// its card_title on a re-run). unpublish[] = rows taken off the page (kept, not
// deleted). Every number below was re-worked by hand and checked by
// ../check-quadratic-functions.py.

const R = String.raw;

export default {
  level: 'AM',
  topic: 'Quadratic Functions',
  unpublish: [
    // "Pitfall: max/min value vs x-coordinate" — now skill 1's Common mistake.
    '2386027d-28d5-4a8a-afe5-829532e9aed7',
  ],
  skills: [
    {
      subgroup_id: 823,
      name: 'Completing the square and the turning point',
      intro: R`Write $ax^2 + bx + c$ as $a(x - h)^2 + k$, then read off the turning point.`,
      idea: R`$y = a(x - h)^2 + k$ has its turning point at $(h, k)$.

$a > 0$: a minimum point.

$a < 0$: a maximum point.

$x^2 + bx = \left(x + \tfrac{b}{2}\right)^2 - \left(\tfrac{b}{2}\right)^2$

When $a \neq 1$, take $a$ out of the $x^2$ and $x$ terms first.`,
      examples: [
        {
          id: '379fc611-692d-4531-b8de-d565693526c6',
          card_title: 'Complete the square when a = 1',
          content: R`**Question:** Express $y = x^2 - 4x$ in the form $(x - h)^2 + k$. Hence state the turning point.

**Solution:**

Half of $-4$ is $-2$. Add and subtract $(-2)^2 = 4$.

$$\begin{aligned}
y &= x^2 - 4x + 4 - 4 \\
  &= (x - 2)^2 - 4
\end{aligned}$$

$a = 1 > 0$, so it is a minimum point.

**Answer:** $y = (x - 2)^2 - 4$; minimum point $(2, -4)$.`,
        },
        {
          id: 'f52852df-c040-4250-84b4-b3446128f372',
          card_title: 'Complete the square when a ≠ 1',
          content: R`**Question:** Express $y = 2x^2 - 10x - 18$ in the form $a(x - h)^2 + k$. Hence state the turning point.

**Solution:**

Take out the $2$ from the $x^2$ and $x$ terms.

$$\begin{aligned}
y &= 2(x^2 - 5x) - 18 \\
  &= 2\left[\left(x - \tfrac{5}{2}\right)^2 - \tfrac{25}{4}\right] - 18 \\
  &= 2\left(x - \tfrac{5}{2}\right)^2 - \tfrac{25}{2} - 18 \\
  &= 2\left(x - \tfrac{5}{2}\right)^2 - \tfrac{61}{2}
\end{aligned}$$

$a = 2 > 0$, so it is a minimum point.

**Answer:** $y = 2\left(x - \tfrac{5}{2}\right)^2 - \tfrac{61}{2}$; minimum point $\left(\tfrac{5}{2}, -\tfrac{61}{2}\right)$.`,
        },
        {
          id: '57643b05-afd5-40a2-b767-5831cb4a2797',
          card_title: 'Sketch the curve from the completed square',
          content: R`**Question:** Express $y = -4x^2 - 24x - 35$ in the form $a(x - h)^2 + k$. Hence sketch the curve, showing the turning point and where it meets the axes.

**Solution:**

$$\begin{aligned}
y &= -4(x^2 + 6x) - 35 \\
  &= -4\left[(x + 3)^2 - 9\right] - 35 \\
  &= -4(x + 3)^2 + 36 - 35 \\
  &= -4(x + 3)^2 + 1
\end{aligned}$$

$a = -4 < 0$, so $(-3, 1)$ is a maximum point.

Where it meets the $x$-axis: put $y = 0$.

$$\begin{aligned}
(x + 3)^2 &= \tfrac{1}{4} \\
x + 3 &= \pm\tfrac{1}{2} \\
x &= -\tfrac{5}{2} \text{ or } -\tfrac{7}{2}
\end{aligned}$$

Where it meets the $y$-axis: put $x = 0$, so $y = -35$.

**Answer:** $y = -4(x + 3)^2 + 1$. The curve is ∩-shaped, with maximum point $(-3, 1)$. It cuts the $x$-axis at $-\tfrac{7}{2}$ and $-\tfrac{5}{2}$, and the $y$-axis at $(0, -35)$.`,
        },
      ],
      mistake: R`Giving the $x$-coordinate as the minimum value.

For $y = (x - 2)^2 - 4$, the minimum value is $-4$, not $2$.

The minimum (or maximum) value is always the $y$-coordinate of the turning point.`,
    },
    {
      subgroup_id: 825,
      name: 'Proving a quadratic is always positive',
      intro: R`Complete the square, then use the fact that a square is never negative.`,
      idea: R`$(x - h)^2 \geq 0$ for every real $x$.

So $a(x - h)^2 + k \geq k$ when $a > 0$.

If that $k$ is positive, the expression is always positive.`,
      examples: [
        {
          id: '11df1584-776a-46e1-a732-fdc390679007',
          card_title: 'Show x² − 4x + 7 is always positive',
          content: R`**Question:** Show that $x^2 - 4x + 7 > 0$ for all real values of $x$.

**Solution:**

$$\begin{aligned}
x^2 - 4x + 7 &= (x - 2)^2 - 4 + 7 \\
             &= (x - 2)^2 + 3
\end{aligned}$$

$(x - 2)^2 \geq 0$ for all real $x$.

So $(x - 2)^2 + 3 \geq 3 > 0$.

**Answer:** $x^2 - 4x + 7 = (x - 2)^2 + 3 > 0$ for all real $x$ (shown).`,
        },
        {
          id: 'aaaa2545-4bb0-471c-ab71-3b26d9d21333',
          card_title: 'Show 4x² − 6x + 14 ≥ 47/4',
          content: R`**Question:** Show that $4x^2 - 6x + 14 \geq \tfrac{47}{4}$ for all real values of $x$.

**Solution:**

$$\begin{aligned}
4x^2 - 6x + 14 &= 4\left(x^2 - \tfrac{3}{2}x\right) + 14 \\
               &= 4\left[\left(x - \tfrac{3}{4}\right)^2 - \tfrac{9}{16}\right] + 14 \\
               &= 4\left(x - \tfrac{3}{4}\right)^2 - \tfrac{9}{4} + 14 \\
               &= 4\left(x - \tfrac{3}{4}\right)^2 + \tfrac{47}{4}
\end{aligned}$$

$4\left(x - \tfrac{3}{4}\right)^2 \geq 0$ for all real $x$.

**Answer:** $4x^2 - 6x + 14 \geq \tfrac{47}{4}$ for all real $x$ (shown). The least value, $\tfrac{47}{4}$, is at $x = \tfrac{3}{4}$.`,
        },
      ],
      mistake: R`Stopping at $(x - 2)^2 + 3$ without giving the reason.

Write the sentence "$(x - 2)^2 \geq 0$ for all real $x$". That reason earns the mark.`,
    },
    {
      subgroup_id: 828,
      name: 'Finding unknown constants from the curve',
      intro: R`Use the turning point, or points on the curve, to find the unknown constants.`,
      idea: R`A turning point $(h, k)$ means $y = a(x - h)^2 + k$.

A point on the curve: substitute its $x$ and $y$ to get an equation.

Each unknown needs its own equation.`,
      examples: [
        {
          key: 'qf-constants-1',
          card_title: 'Find b and c from the minimum point',
          content: R`**Question:** The curve $y = x^2 + bx + c$ has a minimum point at $(3, -5)$. Find the value of $b$ and of $c$.

**Solution:**

The turning point is $(3, -5)$ and $a = 1$.

$$\begin{aligned}
y &= (x - 3)^2 - 5 \\
  &= x^2 - 6x + 9 - 5 \\
  &= x^2 - 6x + 4
\end{aligned}$$

Compare with $y = x^2 + bx + c$.

**Answer:** $b = -6$, $c = 4$.`,
        },
        {
          key: 'qf-constants-2',
          card_title: 'Find p, q and r from the turning point and a point',
          content: R`**Question:** The curve $y = p - q(x + r)^2$ has a turning point at $(2, 6)$ and passes through $(0, 4)$. Find $p$, $q$ and $r$.

**Solution:**

The turning point of $y = p - q(x + r)^2$ is $(-r, p)$.

$-r = 2$, so $r = -2$.

$p = 6$.

So $y = 6 - q(x - 2)^2$.

Substitute $(0, 4)$:

$$\begin{aligned}
4 &= 6 - q(0 - 2)^2 \\
4 &= 6 - 4q \\
q &= \tfrac{1}{2}
\end{aligned}$$

**Answer:** $p = 6$, $q = \tfrac{1}{2}$, $r = -2$.`,
        },
      ],
      mistake: R`Reading the sign of $h$ wrongly.

$(x + 3)^2$ means $h = -3$, not $3$.

Set the bracket to zero to find the $x$-coordinate: $x + 3 = 0$, so $x = -3$.`,
    },
    {
      subgroup_id: 830,
      name: 'Line of symmetry and reflecting the curve',
      intro: R`The curve is symmetrical about the vertical line through its turning point.`,
      idea: R`The line of symmetry is $x = h$, through the turning point.

It is halfway between the two $x$-intercepts: $x = \dfrac{x_1 + x_2}{2}$.

For $y = ax^2 + bx + c$, the line of symmetry is $x = -\dfrac{b}{2a}$.

Reflecting in the $x$-axis: $y$ becomes $-y$, so $(h, k)$ becomes $(h, -k)$.`,
      examples: [
        {
          id: 'f70de931-337d-44e3-add0-ff4973f8cc03',
          card_title: 'Use the line of symmetry to find the other root',
          content: R`**Question:** A quadratic curve meets the $x$-axis at $x = -2$ and $x = p$. Its line of symmetry is $x = 3$. Find $p$. Hence write the equation of the curve in the form $y = (x - m)(x - n)$.

**Solution:**

The line of symmetry is halfway between the two $x$-intercepts.

$$\begin{aligned}
\frac{-2 + p}{2} &= 3 \\
-2 + p &= 6 \\
p &= 8
\end{aligned}$$

The roots are $-2$ and $8$.

**Answer:** $p = 8$; $y = (x + 2)(x - 8)$.`,
        },
        {
          id: '305c3665-dac4-417d-91b1-27173ae5ab9e',
          card_title: 'Reflect a curve in the x-axis',
          content: R`**Question:** The curve $y = x^2 - 4x - 5$ is reflected in the $x$-axis. Write the equation of the new curve in the form $a(x - h)^2 + k$, and state its turning point.

**Solution:**

Complete the square on the original curve.

$$\begin{aligned}
y &= (x - 2)^2 - 4 - 5 \\
  &= (x - 2)^2 - 9
\end{aligned}$$

Reflect in the $x$-axis: replace $y$ with $-y$.

$$\begin{aligned}
-y &= (x - 2)^2 - 9 \\
y &= -(x - 2)^2 + 9
\end{aligned}$$

$a = -1 < 0$, so it is a maximum point.

**Answer:** $y = -(x - 2)^2 + 9$; maximum point $(2, 9)$.

**Check:** the original minimum point $(2, -9)$ flips to $(2, 9)$.`,
        },
      ],
      mistake: R`Changing the $x$-coordinate when reflecting in the $x$-axis.

Only the $y$-coordinate changes sign: $(2, -9)$ becomes $(2, 9)$, not $(-2, 9)$.`,
    },
    {
      subgroup_id: 824,
      name: 'Word problems: greatest or least value',
      intro: R`Complete the square on the model to find the greatest or least value, and when it happens.`,
      idea: R`Write the model as $y = a(x - h)^2 + k$.

The greatest or least value is $k$. It happens when $x = h$.

The starting value: put $x = 0$ (or $t = 0$).

Answer in the words of the question, with units.`,
      examples: [
        {
          id: '8dea94d4-1886-412a-8b9e-e39e22ae7496',
          card_title: 'Stone thrown upwards: greatest height',
          content: R`**Question:** A stone is thrown upwards. Its height, $h$ m, after $t$ s is $h = 16t - 4t^2 + 1$.

(a) State the height from which the stone is thrown.

(b) Find the greatest height of the stone, and the time it takes to get there.

**Solution:**

**(a)** Put $t = 0$: $h = 0 - 0 + 1 = 1$.

**(b)** Complete the square.

$$\begin{aligned}
h &= -4t^2 + 16t + 1 \\
  &= -4(t^2 - 4t) + 1 \\
  &= -4\left[(t - 2)^2 - 4\right] + 1 \\
  &= -4(t - 2)^2 + 17
\end{aligned}$$

$-4(t - 2)^2 \leq 0$, so $h$ is greatest when $t = 2$.

**Answer:** (a) $1$ m. (b) Greatest height $17$ m, after $2$ s.`,
        },
        {
          id: 'e87d69db-556a-4368-ac33-23ec4772406b',
          card_title: 'Tunnel arch: can the lorry pass?',
          content: R`**Question:** An arched tunnel is modelled by $y = -1.76x^2 + 4.4x$, where $y$ m is the height and $x$ m is the distance from one wall.

(a) Find the greatest height of the tunnel.

(b) A lorry $1.8$ m wide and $2$ m tall drives along the centre of the tunnel. Can it pass through?

**Solution:**

**(a)** Complete the square.

$$\begin{aligned}
y &= -1.76(x^2 - 2.5x) \\
  &= -1.76\left[(x - 1.25)^2 - 1.5625\right] \\
  &= -1.76(x - 1.25)^2 + 2.75
\end{aligned}$$

**(b)** The centre is at $x = 1.25$. Each side of the lorry is $0.9$ m from the centre.

$1.25 - 0.9 = 0.35$

Height of the tunnel at $x = 0.35$:

$$\begin{aligned}
y &= -1.76(0.35)^2 + 4.4(0.35) \\
  &= -0.2156 + 1.54 \\
  &= 1.3244
\end{aligned}$$

**Answer:** (a) $2.75$ m. (b) No. At the sides of the lorry the tunnel is only $1.32$ m high, but the lorry is $2$ m tall.`,
        },
      ],
      mistake: R`Giving the time instead of the height.

In $h = -4(t - 2)^2 + 17$, the greatest height is $17$ m. $t = 2$ is only when it happens.

"Greatest height" wants $17$; "when" wants $t = 2$.`,
    },
    {
      subgroup_id: 826,
      name: 'Do the two curves meet? Compare max and min',
      intro: R`Compare the highest point of one curve with the lowest point of the other.`,
      idea: R`Complete the square on both curves.

If one curve's maximum value is below the other curve's minimum value, the curves never meet.`,
      examples: [
        {
          id: '9bc63edb-0f57-4dec-b496-ff164d4a42aa',
          card_title: 'Show two curves do not meet',
          content: R`**Question:**

(a) Express $y = -x^2 + 6x - 14$ and $y = 3x^2 + 12x + 13$ in the form $a(x - h)^2 + k$.

(b) Hence explain why the two curves do not meet.

**Solution:**

**(a)**

$$\begin{aligned}
-x^2 + 6x - 14 &= -(x^2 - 6x) - 14 \\
               &= -\left[(x - 3)^2 - 9\right] - 14 \\
               &= -(x - 3)^2 - 5
\end{aligned}$$

$$\begin{aligned}
3x^2 + 12x + 13 &= 3(x^2 + 4x) + 13 \\
                &= 3\left[(x + 2)^2 - 4\right] + 13 \\
                &= 3(x + 2)^2 + 1
\end{aligned}$$

**(b)** The first curve has maximum value $-5$, so on it $y \leq -5$.

The second curve has minimum value $1$, so on it $y \geq 1$.

**Answer:** (a) $y = -(x - 3)^2 - 5$ and $y = 3(x + 2)^2 + 1$. (b) The first curve is never above $-5$ and the second is never below $1$, so they have no point in common.`,
        },
      ],
      mistake: R`Comparing the $x$-coordinates of the turning points.

Whether two curves meet depends on their $y$-values. Compare the maximum value of one with the minimum value of the other.`,
    },
    {
      subgroup_id: 827,
      name: 'Using the discriminant to find a range of k',
      intro: R`Turn the condition into a sign of $b^2 - 4ac$, then solve for $k$.`,
      idea: R`Two real roots (meets at two points): $b^2 - 4ac > 0$.

One real root (tangent): $b^2 - 4ac = 0$.

No real roots (does not meet): $b^2 - 4ac < 0$.

Curve always above the $x$-axis: $a > 0$ and $b^2 - 4ac < 0$.

A line and a curve: substitute the line into the curve first, to get one quadratic in $x$.`,
      examples: [
        {
          id: '9403a27f-d86c-42e3-8998-4503e47a3d0e',
          card_title: 'Find k for no real roots',
          content: R`**Question:** Find the range of values of $k$ for which the equation $x^2 + kx + 9 = 0$ has no real roots.

**Solution:**

No real roots: $b^2 - 4ac < 0$, with $a = 1$, $b = k$, $c = 9$.

$$\begin{aligned}
k^2 - 4(1)(9) &< 0 \\
k^2 - 36 &< 0 \\
(k + 6)(k - 6) &< 0
\end{aligned}$$

**Answer:** $-6 < k < 6$`,
        },
        {
          id: 'b434c6f8-9b8b-48a9-9c8b-f3256664d478',
          card_title: 'Find k for a tangent',
          content: R`**Question:** Find the value of $k$ for which the line $y = 2x + k$ is a tangent to the curve $y = x^2 - 4x + 5$.

**Solution:**

Substitute the line into the curve.

$$\begin{aligned}
x^2 - 4x + 5 &= 2x + k \\
x^2 - 6x + (5 - k) &= 0
\end{aligned}$$

Tangent: $b^2 - 4ac = 0$.

$$\begin{aligned}
(-6)^2 - 4(1)(5 - k) &= 0 \\
36 - 20 + 4k &= 0 \\
4k &= -16
\end{aligned}$$

**Answer:** $k = -4$`,
        },
        {
          id: 'bab4440d-c484-4f95-98df-9e042ba75ade',
          card_title: 'Find k for two meeting points',
          content: R`**Question:** Find the range of values of $k$ for which the line $2y = 6x + k$ meets the curve $y = x^2 - 5x + 5$ at two distinct points.

**Solution:**

Make $y$ the subject of the line: $y = 3x + \tfrac{k}{2}$.

Substitute into the curve.

$$\begin{aligned}
x^2 - 5x + 5 &= 3x + \tfrac{k}{2} \\
x^2 - 8x + \left(5 - \tfrac{k}{2}\right) &= 0
\end{aligned}$$

Two distinct points: $b^2 - 4ac > 0$.

$$\begin{aligned}
(-8)^2 - 4(1)\left(5 - \tfrac{k}{2}\right) &> 0 \\
64 - 20 + 2k &> 0 \\
2k &> -44
\end{aligned}$$

**Answer:** $k > -22$`,
        },
      ],
      mistake: R`Using the discriminant before the equation is in the form $ax^2 + bx + c = 0$.

Bring every term to one side first. Then read off $a$, $b$ and $c$, with their signs.`,
    },
    {
      subgroup_id: 829,
      name: 'Where a line meets a curve, then find a length',
      intro: R`Solve the line and the curve together, then use the points.`,
      idea: R`Substitute the line into the curve to get one quadratic in $x$.

Solve it. Each root gives one point.

Find each $y$ from the line — it is the easier equation.

Length $AB = \sqrt{(x_2 - x_1)^2 + (y_2 - y_1)^2}$`,
      examples: [
        {
          id: 'c853a6ba-7ff7-46f4-95b9-4a94c90c9ae7',
          card_title: 'Find where a line meets a curve, then the length AB',
          content: R`**Question:** The line $y = 5 - 3x$ meets the curve $y = -x^2 + 4x - 7$ at $A$ and $B$. Find the coordinates of $A$ and $B$, and the exact length of $AB$.

**Solution:**

Substitute the line into the curve.

$$\begin{aligned}
5 - 3x &= -x^2 + 4x - 7 \\
x^2 - 7x + 12 &= 0 \\
(x - 3)(x - 4) &= 0
\end{aligned}$$

$x = 3$ or $x = 4$.

Use $y = 5 - 3x$:

$x = 3$: $y = 5 - 9 = -4$.

$x = 4$: $y = 5 - 12 = -7$.

$$\begin{aligned}
AB &= \sqrt{(4 - 3)^2 + (-7 + 4)^2} \\
   &= \sqrt{1 + 9} \\
   &= \sqrt{10}
\end{aligned}$$

**Answer:** $A(3, -4)$ and $B(4, -7)$; $AB = \sqrt{10}$ units.`,
        },
      ],
      mistake: R`Stopping after finding $x$.

Each value of $x$ is only half a point. Find its $y$-coordinate too.`,
    },
    {
      subgroup_id: 1522,
      name: 'Sum and product of roots',
      intro: R`Use $\alpha + \beta$ and $\alpha\beta$ without solving the equation.`,
      idea: R`For $ax^2 + bx + c = 0$ with roots $\alpha$ and $\beta$:

$\alpha + \beta = -\dfrac{b}{a}$

$\alpha\beta = \dfrac{c}{a}$

$\alpha^2 + \beta^2 = (\alpha + \beta)^2 - 2\alpha\beta$

$\alpha^3 + \beta^3 = (\alpha + \beta)^3 - 3\alpha\beta(\alpha + \beta)$

An equation with given roots: $x^2 - (\text{sum of roots})\,x + (\text{product of roots}) = 0$`,
      examples: [
        {
          id: '8d95d742-fbfb-4b64-bc20-fef5ed89d544',
          card_title: 'Find α + β and αβ',
          content: R`**Question:** The roots of $3x^2 + 4x - 2 = 0$ are $\alpha$ and $\beta$. Without solving the equation, find $\alpha + \beta$ and $\alpha\beta$.

**Solution:**

$a = 3$, $b = 4$, $c = -2$.

$\alpha + \beta = -\dfrac{4}{3}$

$\alpha\beta = \dfrac{-2}{3} = -\dfrac{2}{3}$

**Answer:** $\alpha + \beta = -\tfrac{4}{3}$, $\alpha\beta = -\tfrac{2}{3}$`,
        },
        {
          id: '2ae0cd8f-9f80-41f4-8926-8eb88df32e85',
          card_title: 'Find α² + β²',
          content: R`**Question:** The roots of $4x^2 + 7x + 1 = 0$ are $\alpha$ and $\beta$. Find $\alpha^2 + \beta^2$.

**Solution:**

$\alpha + \beta = -\tfrac{7}{4}$, $\alpha\beta = \tfrac{1}{4}$.

$$\begin{aligned}
\alpha^2 + \beta^2 &= (\alpha + \beta)^2 - 2\alpha\beta \\
                   &= \left(-\tfrac{7}{4}\right)^2 - 2\left(\tfrac{1}{4}\right) \\
                   &= \tfrac{49}{16} - \tfrac{8}{16} \\
                   &= \tfrac{41}{16}
\end{aligned}$$

**Answer:** $\alpha^2 + \beta^2 = \tfrac{41}{16}$`,
        },
        {
          id: 'd5e569f5-1de5-4519-87d5-36af9aedc5b2',
          card_title: 'Find α³ + β³',
          content: R`**Question:** The roots of $x^2 + 4x + 5 = 0$ are $\alpha$ and $\beta$. Find $\alpha^3 + \beta^3$.

**Solution:**

$\alpha + \beta = -4$, $\alpha\beta = 5$.

$$\begin{aligned}
\alpha^3 + \beta^3 &= (\alpha + \beta)^3 - 3\alpha\beta(\alpha + \beta) \\
                   &= (-4)^3 - 3(5)(-4) \\
                   &= -64 + 60 \\
                   &= -4
\end{aligned}$$

**Answer:** $\alpha^3 + \beta^3 = -4$`,
        },
        {
          id: '4182ef58-8a70-451e-847b-5fb469ed4759',
          card_title: 'New equation with roots α + β and αβ',
          content: R`**Question:** The roots of $x^2 - 5x + 6 = 0$ are $\alpha$ and $\beta$. Find a quadratic equation whose roots are $\alpha + \beta$ and $\alpha\beta$.

**Solution:**

$\alpha + \beta = 5$ and $\alpha\beta = 6$, so the new roots are $5$ and $6$.

Sum of new roots: $5 + 6 = 11$.

Product of new roots: $5 \times 6 = 30$.

**Answer:** $x^2 - 11x + 30 = 0$`,
        },
        {
          id: '83f62d6c-9756-44d4-9d83-ab7be3a9b447',
          card_title: 'New equation with roots 1/α and 1/β',
          content: R`**Question:** The roots of $3x^2 - 2x + 5 = 0$ are $\alpha$ and $\beta$. Find a quadratic equation whose roots are $\dfrac{1}{\alpha}$ and $\dfrac{1}{\beta}$.

**Solution:**

$\alpha + \beta = \tfrac{2}{3}$, $\alpha\beta = \tfrac{5}{3}$.

Sum of new roots:

$$\begin{aligned}
\frac{1}{\alpha} + \frac{1}{\beta} &= \frac{\alpha + \beta}{\alpha\beta} \\
                                   &= \frac{2}{3} \div \frac{5}{3} \\
                                   &= \frac{2}{5}
\end{aligned}$$

Product of new roots:

$$\frac{1}{\alpha} \times \frac{1}{\beta} = \frac{1}{\alpha\beta} = \frac{3}{5}$$

$$\begin{aligned}
x^2 - \tfrac{2}{5}x + \tfrac{3}{5} &= 0 \\
5x^2 - 2x + 3 &= 0
\end{aligned}$$

**Answer:** $5x^2 - 2x + 3 = 0$`,
        },
        {
          id: '3cd05b82-4a82-4cd6-85eb-83a46279705b',
          card_title: 'New equation with roots α² − 1 and β² − 1',
          content: R`**Question:** The roots of $2x^2 - 7x + 8 = 0$ are $\alpha$ and $\beta$. Find a quadratic equation whose roots are $\alpha^2 - 1$ and $\beta^2 - 1$.

**Solution:**

$\alpha + \beta = \tfrac{7}{2}$, $\alpha\beta = 4$.

First find $\alpha^2 + \beta^2$:

$$\begin{aligned}
\alpha^2 + \beta^2 &= (\alpha + \beta)^2 - 2\alpha\beta \\
                   &= \tfrac{49}{4} - 8 \\
                   &= \tfrac{17}{4}
\end{aligned}$$

Sum of new roots:

$$\begin{aligned}
(\alpha^2 - 1) + (\beta^2 - 1) &= \alpha^2 + \beta^2 - 2 \\
                               &= \tfrac{17}{4} - 2 \\
                               &= \tfrac{9}{4}
\end{aligned}$$

Product of new roots:

$$\begin{aligned}
(\alpha^2 - 1)(\beta^2 - 1) &= (\alpha\beta)^2 - (\alpha^2 + \beta^2) + 1 \\
                            &= 16 - \tfrac{17}{4} + 1 \\
                            &= \tfrac{51}{4}
\end{aligned}$$

$$\begin{aligned}
x^2 - \tfrac{9}{4}x + \tfrac{51}{4} &= 0 \\
4x^2 - 9x + 51 &= 0
\end{aligned}$$

**Answer:** $4x^2 - 9x + 51 = 0$`,
        },
        {
          id: 'b471629c-4770-4a80-8ba4-f2e61ada07c3',
          card_title: 'Roots that differ by 3',
          content: R`**Question:** The roots of $x^2 - 3x + k = 0$ differ by $3$. Find the value of $k$.

**Solution:**

Let the roots be $\alpha$ and $\alpha - 3$.

Sum of roots $= 3$:

$$\begin{aligned}
\alpha + (\alpha - 3) &= 3 \\
2\alpha &= 6 \\
\alpha &= 3
\end{aligned}$$

The roots are $3$ and $0$.

Product of roots $= k$, so $k = 3 \times 0 = 0$.

**Answer:** $k = 0$`,
        },
      ],
      mistake: R`Putting the minus sign on the product as well as the sum.

$\alpha + \beta = -\dfrac{b}{a}$ has a minus sign. $\alpha\beta = \dfrac{c}{a}$ does not.

Keep the signs of $b$ and $c$: for $6x^2 - x - 3 = 0$, $\alpha + \beta = -\dfrac{-1}{6} = \dfrac{1}{6}$.`,
    },
  ],
};
