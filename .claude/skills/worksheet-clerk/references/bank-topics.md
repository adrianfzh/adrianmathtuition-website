# Question-bank vocabulary (`questions` table, math Supabase `nempslbewxtlikfzachi`)

Snapshot **2026-09-02**. Topic NAMES are stable; counts drift as the bank grows.
Live check when something looks missing (one query):
`SELECT * FROM bank_topics WHERE level='AM' ORDER BY n DESC;`

Why this file exists: model sessions used to burn 2–5 probe queries discovering
that e.g. AM has no topic named `Differentiation` — the granular names below are
the real vocabulary. With this file plus `pick_candidates()` (fuzzy, so a
substring like `differentiation` works anyway), a candidate fetch is ONE call.

## Levels (`questions.level`) — there is NO bare `H2` or `JC` level

| level | live rows | meaning |
|---|---|---|
| `AM` | ~4,400 | Sec 4 / IP A-Math |
| `S3_AM` | ~2,400 | Sec 3 A-Math (top up from `AM`) |
| `AM_NA` | ~70 | NA-stream A-Math (thin) |
| `EM` | ~4,700 | Sec 4 E-Math (Express) |
| `S3_EM` | ~1,100 | Sec 3 E-Math |
| `EM_NA` | ~2,700 | Sec 4 E-Math (NA stream) |
| `S3_EM_NA` | ~1,500 | Sec 3 E-Math (NA) |
| `S3_EM_NT` | ~270 | Sec 3 E-Math (NT) |
| `S1` / `S2` | ~3,500 / ~3,800 | Sec 1 / Sec 2 |
| `JC2` | ~5,000 | H2 Math, full syllabus (use for "JC"/"H2" requests) |
| `JC1` | ~2,100 | JC1 pure-math topics (top up for `JC2` pure topics) |
| `JC2_H1` | ~200 | H1 Math (thin) |

## Topics per level (exact tag spelling)

### AM (47)
Binomial Theorem | Circles | Coordinate Geometry | Differentiation (Increasing and Decreasing Functions) | Differentiation (Logarithmic and Exponential) | Differentiation (Maximum and Minimum) | Differentiation (Product/Quotient/Chain Rule) | Differentiation (Rates of Change) | Differentiation (Stationary Points) | Differentiation (Tangents and Normals) | Differentiation (Techniques) | Differentiation (Trigonometric) | Functions | Graphs of Functions | Indices | Integration (Applications) | Integration (Area) | Integration (Definite Integrals) | Integration (Definite) | Integration (Indefinite) | Integration (Techniques) | Kinematics | Linear Law | Logarithmic and Exponential Functions | Logarithms | Matrices | Mensuration | Modulus Functions | Nature of Roots | Partial Fractions | Permutations and Combinations | Plane Geometry | Polynomials | Power Graphs | Proof | Quadratic Functions | Quadratic Inequalities | Sets | Simultaneous Equations | Surds | Trigonometry (Applications) | Trigonometry (Equations) | Trigonometry (Graphs) | Trigonometry (Identities) | Trigonometry (R-Formula) | Trigonometry (Ratios) | Vectors

### S3_AM (25)
Binomial Theorem | Circles | Coordinate Geometry | Functions | Graphs of Functions | Indices | Linear Law | Logarithms | Modulus Functions | Nature of Roots | Partial Fractions | Plane Geometry | Polynomials | Power Graphs | Proof | Quadratic Functions | Quadratic Inequalities | Simultaneous Equations | Surds | Trigonometry (Applications) | Trigonometry (Equations) | Trigonometry (Graphs) | Trigonometry (Identities) | Trigonometry (R-Formula) | Trigonometry (Ratios)

### AM_NA (25)
Circles | Coordinate Geometry | Differentiation (Increasing and Decreasing Functions) | Differentiation (Maximum and Minimum) | Differentiation (Rates of Change) | Differentiation (Tangents and Normals) | Differentiation (Techniques) | Indices | Integration (Applications) | Integration (Area) | Integration (Definite Integrals) | Integration (Techniques) | Nature of Roots | Partial Fractions | Polynomials | Quadratic Functions | Quadratic Inequalities | Simultaneous Equations | Surds | Trigonometry (Applications) | Trigonometry (Equations) | Trigonometry (Graphs) | Trigonometry (Identities) | Trigonometry (R-Formula) | Trigonometry (Ratios)

### EM (44)
Algebra (Expansion) | Algebra (Expressions) | Algebra (Factorization) | Algebra (Fractions) | Algebra (Graph on Graph Paper) | Algebra (Identities) | Algebra (Inequalities) | Algebra (Linear Equations) | Algebra (Quadratic Equations) | Algebra (Quadratic Graphs) | Algebra (Simultaneous Equations) | Algebra (Subject of Formula) | Angles | Circle Properties | Circular Measure | Congruency and Similarity | Coordinate Geometry | Distance and Speed Time Graphs | Financial Math (Hire Purchase) | Financial Math (Interest) | Financial Math (Taxation) | Geometrical Constructions | Graphs of Functions | Indices | Indices (Standard Form) | Map Scales | Math In Real World Context | Matrices | Mensuration | Number Patterns | Numbers (Estimation) | Numbers (HCF and LCM) | Numbers (Percentages) | Numbers (Prime Factorization) | Numbers (Rate) | Numbers (Ratio) | Numbers (Speed) | Polygons | Probability | Proportion | Sets | Statistics | Trigonometry | Vectors

### S3_EM (43)
Algebra (Expansion) | Algebra (Expressions) | Algebra (Factorization) | Algebra (Fractions) | Algebra (Graph on Graph Paper) | Algebra (Identities) | Algebra (Inequalities) | Algebra (Linear Equations) | Algebra (Quadratic Equations) | Algebra (Quadratic Graphs) | Algebra (Simultaneous Equations) | Algebra (Subject of Formula) | Angles | Circle Properties | Circular Measure | Congruency and Similarity | Coordinate Geometry | Distance and Speed Time Graphs | Financial Math (Interest) | Financial Math (Taxation) | Geometrical Constructions | Graphs of Functions | Indices | Indices (Standard Form) | Logarithms | Map Scales | Math In Real World Context | Mensuration | Number Patterns | Numbers (Estimation) | Numbers (HCF and LCM) | Numbers (Integers) | Numbers (Percentages) | Numbers (Prime Factorization) | Numbers (Rate) | Numbers (Ratio) | Numbers (Speed) | Polygons | Probability | Proportion | Statistics | Surds | Trigonometry

### EM_NA (42)
Algebra (Expansion) | Algebra (Expressions) | Algebra (Factorization) | Algebra (Fractions) | Algebra (Graph on Graph Paper) | Algebra (Identities) | Algebra (Inequalities) | Algebra (Linear Equations) | Algebra (Quadratic Equations) | Algebra (Quadratic Graphs) | Algebra (Simultaneous Equations) | Algebra (Subject of Formula) | Angles | Circle Properties | Circular Measure | Congruency and Similarity | Coordinate Geometry | Distance and Speed Time Graphs | Financial Math (Hire Purchase) | Financial Math (Interest) | Financial Math (Taxation) | Geometrical Constructions | Graphs of Functions | Indices | Indices (Standard Form) | Map Scales | Math In Real World Context | Mensuration | Number Patterns | Numbers (Estimation) | Numbers (HCF and LCM) | Numbers (Percentages) | Numbers (Prime Factorization) | Numbers (Rate) | Numbers (Ratio) | Numbers (Speed) | Polygons | Probability | Proportion | Pythagoras' Theorem | Statistics | Trigonometry

### S3_EM_NA (41)
Algebra (Expansion) | Algebra (Expressions) | Algebra (Factorization) | Algebra (Fractions) | Algebra (Graph on Graph Paper) | Algebra (Identities) | Algebra (Inequalities) | Algebra (Linear Equations) | Algebra (Quadratic Equations) | Algebra (Quadratic Graphs) | Algebra (Simultaneous Equations) | Algebra (Subject of Formula) | Angles | Circular Measure | Congruency and Similarity | Coordinate Geometry | Distance and Speed Time Graphs | Financial Math (Hire Purchase) | Financial Math (Interest) | Financial Math (Taxation) | Geometrical Constructions | Graphs of Functions | Indices | Indices (Standard Form) | Map Scales | Math In Real World Context | Mensuration | Number Patterns | Numbers (Estimation) | Numbers (HCF and LCM) | Numbers (Percentages) | Numbers (Prime Factorization) | Numbers (Rate) | Numbers (Ratio) | Numbers (Speed) | Polygons | Probability | Proportion | Pythagoras' Theorem | Statistics | Trigonometry

### S3_EM_NT (36)
Algebra (Expansion) | Algebra (Expressions) | Algebra (Factorization) | Algebra (Fractions) | Algebra (Graph on Graph Paper) | Algebra (Linear Equations) | Algebra (Simultaneous Equations) | Algebra (Subject of Formula) | Angles | Circular Measure | Congruency and Similarity | Coordinate Geometry | Financial Math (Hire Purchase) | Financial Math (Interest) | Financial Math (Taxation) | Geometrical Constructions | Graphs of Functions | Indices | Indices (Standard Form) | Map Scales | Math In Real World Context | Mensuration | Number Patterns | Numbers (Estimation) | Numbers (Percentages) | Numbers (Prime Factorization) | Numbers (Rate) | Numbers (Ratio) | Numbers (Real Numbers) | Numbers (Speed) | Polygons | Probability | Proportion | Pythagoras' Theorem | Statistics | Symmetry

### S1 (28)
Algebra (Expansion) | Algebra (Expressions) | Algebra (Factorization) | Algebra (Fractions) | Algebra (Inequalities) | Algebra (Linear Equations) | Algebra (Simultaneous Equations) | Angles | Coordinate Geometry (Lines) | Financial Math (Exchange Rate) | Financial Math (Interest) | Geometrical Constructions | Math In Real World Context | Mensuration | Number Patterns | Numbers (Estimation) | Numbers (HCF and LCM) | Numbers (Integers) | Numbers (Percentages) | Numbers (Prime Factorization) | Numbers (Rate) | Numbers (Ratio) | Numbers (Real Numbers) | Numbers (Speed) | Polygons | Proportion | Statistics | Symmetry

### S2 (43)
Algebra (Expansion) | Algebra (Expressions) | Algebra (Factorization) | Algebra (Fractions) | Algebra (Graph on Graph Paper) | Algebra (Identities) | Algebra (Inequalities) | Algebra (Linear Equations) | Algebra (Quadratic Equations) | Algebra (Quadratic Graphs) | Algebra (Simultaneous Equations) | Algebra (Subject of Formula) | Angles | Circle Properties | Congruency and Similarity | Coordinate Geometry (Lines) | Financial Math (Exchange Rate) | Financial Math (Hire Purchase) | Financial Math (Interest) | Geometrical Constructions | Indices | Indices (Standard Form) | Map Scales | Math In Real World Context | Matrices | Mensuration | Number Patterns | Numbers (Estimation) | Numbers (HCF and LCM) | Numbers (Integers) | Numbers (Percentages) | Numbers (Prime Factorization) | Numbers (Rate) | Numbers (Ratio) | Numbers (Real Numbers) | Numbers (Speed) | Polygons | Probability | Proportion | Pythagoras' Theorem | Sets | Statistics | Trigonometry

### JC2 (33) — full H2
APGP | Binomial Distribution | Binomial Expansion | Complex Numbers | Differentiation (Concavity) | Differentiation (Maclaurin Series) | Differentiation (Maximum and Minimum) | Differentiation (Rates of Change) | Differentiation (Tangents and Normals) | Differentiation (Techniques) | Discrete Random Variables | Distributions (Binomial) | Distributions (DRV) | Distributions (Normal) | Distributions (Poisson) | Distributions (Sampling) | Equations | Functions | Graphing Techniques | Hypothesis Testing | Inequalities | Integration (Area and Volume) | Integration (Differential Equations) | Integration (Techniques) | Linear Regression | Mathematical Induction | Parametric Equations | Permutations and Combinations | Probability | Sampling | Sampling Methods | Series and Sequences | Vectors

### JC1 (24) — pure math
APGP | Binomial Expansion | Complex Numbers | Conics and Parametric Equations | Differentiation (Concavity) | Differentiation (Maclaurin Series) | Differentiation (Maximum and Minimum) | Differentiation (Rates of Change) | Differentiation (Tangents and Normals) | Differentiation (Techniques) | Equations | Equations and Inequalities | Functions | Graphing Techniques | Graphs and Transformations | Inequalities | Integration (Area and Volume) | Integration (Differential Equations) | Integration (Techniques) | Parametric Equations | Permutations and Combinations | Series and Sequences | System of Linear Equations | Vectors

### JC2_H1 (20)
Differentiation (Maximum and Minimum) | Differentiation (Rates of Change) | Differentiation (Tangents and Normals) | Differentiation (Techniques) | Distributions (Binomial) | Distributions (Normal) | Distributions (Sampling) | Equations | Exponential and Logarithmic Functions | Graphing Techniques | Hypothesis Testing | Inequalities | Integration (Applications) | Integration (Area) | Integration (Techniques) | Linear Regression | Nature of Roots | Permutations and Combinations | Probability | Simultaneous Equations

## The one-call fetch

```sql
SELECT * FROM pick_candidates('<LEVEL>', '<topic fragment>', 15);
-- fuzzy + case-insensitive: 'differentiation' matches every "Differentiation (…)" tag;
-- matched_topics in the result says which tag hit.
-- Exclude already-picked ids: pick_candidates('AM','differentiation',15, ARRAY['<uuid>']::uuid[])
```

Ranked real-past-paper-first (verified, newest), AI-generated last. NOTE:
`revision_lib.py` (revision-worksheet skill) filters PostgREST with
`topics=cs.{…}` — that is EXACT containment, so `--topic` there must be the
exact spelling from the lists above.
