#!/usr/bin/env python3
"""The maths chain check for a clip's board plan (SPEC-CLIP-PIPELINE.md §2 step 4).

    /usr/bin/python3 scripts/clips/chain-check.py <slug|path> [--json]

Reads data/clip-plans/<slug>.json and proves, with sympy, that every line on the
board follows from the line before it and that the last line is the answer. No
model, seconds. Exit 0 = pass, 1 = a check failed, 2 = the plan is malformed.

Each board line carries `checks` — the line's maths in sympy syntax (never TeX).
The kinds:

  {"model": {"y": "A*exp(-n*x)"}}             a definition later identities substitute
  {"given": {"P0": 100}}                       a value read off the question
  {"start": "lhs = rhs", "var": "x",           the question's equation; `domain` = the
   "domain": ["x - 8 > 0", "x > 0"]}           conditions every log argument needs
  {"step": "lhs = rhs"}                        IMPLIED by the chain's previous equation:
                                               every real solution of it solves this one
  {"start_expr": "..."} / {"step_expr": "..."} an expression chain: each line equals the last
  {"roots": [9, -1], "reject": [-1]}           exactly the solutions of the previous equation;
                                               each rejected root breaks the start's domain,
                                               each kept root solves the start equation
  {"approx": -8.57, "sf": 3, "of": "x"}        the chain's value, rounded, is this
  {"identity": "lhs = rhs"}                    true for every positive value of the free
                                               symbols (after the models are substituted)
  {"fact": "lhs = rhs"}                        true with what is known; `m = 2` with m
                                               unknown binds m instead
  {"solves": "lhs = rhs", "var": "x",          the equation's ONLY real solution is this
   "gives": 2}                                 (and binds it)
  {"shape": "log(2 - x)", "family": "ln(-x)"}  which of the four basic log shapes it is

The plan's `answer.facts` must hold at the end, and every number in
`answer.display` must be written on the last line of the board.
"""
import json
import math
import os
import random
import re
import sys

import sympy as sp
from sympy.parsing.sympy_parser import (parse_expr, standard_transformations,
                                        implicit_multiplication_application,
                                        convert_xor)

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
TRANSFORMS = standard_transformations + (implicit_multiplication_application, convert_xor)
TOL = 1e-8
random.seed(7)


class PlanError(Exception):
    pass


def P(text, local):
    try:
        return parse_expr(text, local_dict=local, transformations=TRANSFORMS, evaluate=True)
    except Exception as e:  # noqa: BLE001
        raise PlanError(f'cannot read "{text}": {e}')


def rel(text, local):
    """'a = b' → (a, b). A single '=' only (no ==, <=, >=)."""
    parts = re.split(r'(?<![<>=!])=(?!=)', text)
    if len(parts) != 2:
        raise PlanError(f'"{text}" must be one equation "lhs = rhs"')
    return P(parts[0], local), P(parts[1], local)


def num(v):
    """A sympy value → complex, or None when it does not evaluate to a number."""
    try:
        c = complex(sp.N(v, 30))
    except Exception:  # noqa: BLE001
        return None
    if math.isnan(c.real) or math.isinf(c.real):
        return None
    return c


def is_real_zero(v):
    c = num(v)
    return c is not None and abs(c.imag) < TOL and abs(c.real) < TOL * 10


def holds(lhs, rhs, subs):
    """lhs = rhs at subs, with both sides REAL (a log of a negative is not a solution)."""
    a, b = num(lhs.subs(subs)), num(rhs.subs(subs))
    if a is None or b is None:
        return False
    if abs(a.imag) > 1e-9 or abs(b.imag) > 1e-9:
        return False
    return abs(a.real - b.real) <= TOL * (1 + abs(a.real) + abs(b.real))


def real_solutions(lhs, rhs, var, hints=()):
    """Every real solution of lhs = rhs in var, as floats."""
    eq = sp.Eq(lhs, rhs)
    try:
        s = sp.solveset(eq, var, sp.S.Reals)
        if isinstance(s, sp.FiniteSet):
            out = []
            for r in s:
                c = num(r)
                if c is not None and abs(c.imag) < 1e-9:
                    out.append(c.real)
            return sorted(set(round(v, 12) for v in out)), 'exact'
        if s == sp.S.EmptySet:
            return [], 'exact'
    except Exception:  # noqa: BLE001
        pass
    # Numeric fallback: sign changes on a grid where both sides are real, then refine.
    f = sp.lambdify(var, lhs - rhs, 'mpmath')
    import mpmath as mp

    def g(v):
        try:
            y = f(mp.mpf(v))
        except Exception:  # noqa: BLE001
            return None
        y = complex(y)
        return y.real if abs(y.imag) < 1e-12 else None

    found = []
    xs = [-60 + i * 0.005 for i in range(24001)] + list(hints)
    xs.sort()
    prev = None
    for v in xs:
        y = g(v)
        if y is not None and abs(y) < 1e-12:
            found.append(v)
        if prev is not None and y is not None and prev[1] is not None and prev[1] * y < 0:
            try:
                r = mp.findroot(lambda t: f(t), (prev[0], v), solver='bisect')
                found.append(float(r))
            except Exception:  # noqa: BLE001
                pass
        prev = (v, y)
    found = [v for v in found if holds(lhs, rhs, {var: v})]
    out = []
    for v in sorted(found):
        if not out or abs(v - out[-1]) > 1e-6:
            out.append(v)
    return out, 'numeric'


def sig_round(v, sf):
    if v == 0:
        return 0.0
    return round(v, sf - int(math.floor(math.log10(abs(v)))) - 1)


def check_plan(plan):
    names = set()
    for line in plan['lines']:
        for c in line.get('checks', []):
            for t in json.dumps(c).split('"'):
                names.update(re.findall(r'\b[A-Za-z_][A-Za-z_0-9]*\b', t))
    local = {}
    for n in names:
        if n in ('log', 'exp', 'ln', 'sqrt', 'E', 'pi', 'Rational', 'oo', 'I'):
            continue
        local[n] = sp.Symbol(n, real=True)
    local['ln'] = sp.log
    local['lg'] = lambda a: sp.log(a, 10)
    local['e'] = sp.E

    env = {}        # symbol → value (given + bound)
    models = {}     # symbol → expression
    for k, v in (plan.get('env') or {}).items():
        env[local.setdefault(k, sp.Symbol(k, real=True))] = sp.nsimplify(v)
    chain = None    # {'mode': 'eq'|'expr', 'lhs', 'rhs', 'var', 'sols', 'start', 'domain'} or expr value
    results = []
    last_value = None

    def S(expr):
        return expr.subs(models).subs(env)

    for li, line in enumerate(plan['lines']):
        checks = line.get('checks', [])
        if not checks:
            results.append((li, False, 'no checks — every line on the board is checked'))
            continue
        for c in checks:
            kind = next((k for k in ('model', 'given', 'start', 'step', 'start_expr', 'step_expr', 'roots',
                                     'approx', 'identity', 'fact', 'solves', 'shape') if k in c), None)
            if kind is None:
                raise PlanError(f'line {li}: unknown check {c}')
            ok, detail = True, ''
            if kind == 'model':
                for k, v in c['model'].items():
                    models[local.setdefault(k, sp.Symbol(k, real=True))] = P(v, local)
                detail = f"model {c['model']}"
            elif kind == 'given':
                for k, v in c['given'].items():
                    env[local.setdefault(k, sp.Symbol(k, real=True))] = sp.nsimplify(v)
                detail = f"given {c['given']}"
            elif kind == 'start':
                var = local[c['var']]
                lhs, rhs = rel(c['start'], local)
                lhs, rhs = S(lhs), S(rhs)
                dom = [P(d, local) for d in c.get('domain', [])]
                sols, how = real_solutions(lhs, rhs, var)
                sols = [s for s in sols if all(bool(S(d).subs(var, s)) for d in dom)] if dom else sols
                chain = {'mode': 'eq', 'lhs': lhs, 'rhs': rhs, 'var': var, 'sols': sols,
                         'start': (lhs, rhs), 'domain': dom}
                ok = len(sols) > 0
                detail = f"start {c['start']}: real solutions {fmt(sols)} ({how})"
            elif kind == 'step':
                if not chain or chain['mode'] != 'eq':
                    raise PlanError(f'line {li}: "step" needs an equation chain started first')
                var = chain['var']
                lhs, rhs = rel(c['step'], local)
                lhs, rhs = S(lhs), S(rhs)
                bad = [s for s in chain['sols'] if not holds(lhs, rhs, {var: s})]
                ok = not bad
                sols, how = real_solutions(lhs, rhs, var, hints=chain['sols'])
                detail = (f"step {c['step']}: follows (every solution {fmt(chain['sols'])} of the line before solves it)"
                          if ok else f"step {c['step']}: does NOT follow — {fmt(bad)} solves the line before but not this")
                chain.update(lhs=lhs, rhs=rhs, sols=sols)
            elif kind == 'start_expr':
                v = S(P(c['start_expr'], local))
                chain = {'mode': 'expr', 'value': v}
                last_value = v
                ok = num(v) is not None
                detail = f"start {c['start_expr']} = {fmtv(v)}"
            elif kind == 'step_expr':
                if not chain or chain['mode'] != 'expr':
                    raise PlanError(f'line {li}: "step_expr" needs an expression chain started first')
                v = S(P(c['step_expr'], local))
                ok = holds(v, chain['value'], {})
                detail = f"{c['step_expr']} = {fmtv(v)}" + ('' if ok else f" ≠ the line before ({fmtv(chain['value'])})")
                chain['value'] = v
                last_value = v
            elif kind == 'roots':
                if not chain or chain['mode'] != 'eq':
                    raise PlanError(f'line {li}: "roots" needs an equation chain')
                var = chain['var']
                want = sorted(float(r) for r in c['roots'])
                have = chain['sols']
                same = len(want) == len(have) and all(abs(a - b) < 1e-6 for a, b in zip(want, have))
                rej = [float(r) for r in c.get('reject', [])]
                kept = [r for r in want if all(abs(r - x) > 1e-9 for x in rej)]
                slhs, srhs = chain['start']
                rej_ok = all(any(not bool(d.subs(var, r)) for d in chain['domain']) or not holds(slhs, srhs, {var: r}) for r in rej)
                kept_ok = all(holds(slhs, srhs, {var: r}) and all(bool(d.subs(var, r)) for d in chain['domain']) for r in kept)
                ok = same and rej_ok and kept_ok
                detail = (f"roots {fmt(want)} {'=' if same else '≠'} solutions of the line before {fmt(have)}; "
                          f"rejected {fmt(rej)} {'break' if rej_ok else 'do NOT break'} the question's logs; "
                          f"kept {fmt(kept)} {'solve' if kept_ok else 'do NOT solve'} the question")
                chain['sols'] = kept
                if len(kept) == 1:
                    env[var] = sp.nsimplify(kept[0])
            elif kind == 'approx':
                sf = int(c.get('sf', 3))
                if 'of' in c:
                    v = num(S(P(c['of'], local)))
                    v = v.real if v is not None else None
                elif chain and chain['mode'] == 'eq':
                    v = chain['sols'][0] if len(chain['sols']) == 1 else None
                elif chain and chain['mode'] == 'expr':
                    v = num(chain['value']).real
                else:
                    v = None
                if v is None:
                    ok, detail = False, 'approx: no single value to round'
                else:
                    r = sig_round(v, sf)
                    ok = abs(r - float(c['approx'])) < 10 ** (math.floor(math.log10(abs(r) or 1)) - sf + 1) / 2
                    detail = f"{v:.6g} to {sf} s.f. is {r:g} ({'matches' if ok else 'board says'} {c['approx']})"
            elif kind == 'identity':
                lhs, rhs = rel(c['identity'], local)
                lhs, rhs = lhs.subs(models), rhs.subs(models)
                free = sorted((lhs.free_symbols | rhs.free_symbols) - set(env), key=str)
                bad = None
                for _ in range(8):
                    subs = {s: sp.Float(round(random.uniform(0.3, 6), 4)) for s in free}
                    subs.update(env)
                    if not holds(lhs, rhs, subs):
                        bad = subs
                        break
                ok = bad is None
                detail = f"identity {c['identity']}: " + ('holds for every value tried' if ok else f'FAILS at {bad}')
            elif kind == 'fact':
                lhs, rhs = rel(c['fact'], local)
                if lhs.is_Symbol and lhs not in env and lhs not in models:
                    v = S(rhs)
                    ok = num(v) is not None
                    env[lhs] = v
                    detail = f"{lhs} = {fmtv(v)} (bound)"
                else:
                    ok = holds(S(lhs), S(rhs), {})
                    detail = f"fact {c['fact']}: " + ('true' if ok else f'FALSE ({fmtv(S(lhs))} vs {fmtv(S(rhs))})')
            elif kind == 'solves':
                var = local[c['var']]
                lhs, rhs = rel(c['solves'], local)
                sols, _ = real_solutions(S(lhs), S(rhs), var)
                ok = len(sols) == 1 and abs(sols[0] - float(c['gives'])) < 1e-9
                if ok:
                    env[var] = sp.nsimplify(c['gives'])
                detail = f"{c['solves']} → {c['var']} ∈ {fmt(sols)} ({'= ' if ok else '≠ '}{c['gives']})"
            elif kind == 'shape':
                var = local[c.get('var', 'x')]
                f = P(c['shape'], local)
                outer, arg = 1, None
                if isinstance(f, sp.Mul):
                    coeff, rest = f.as_coeff_Mul()
                    outer, f = (1 if coeff > 0 else -1), rest
                if isinstance(f, sp.log):
                    arg = f.args[0]
                ok = arg is not None and sp.degree(arg, var) == 1
                if ok:
                    inner = 1 if sp.diff(arg, var) > 0 else -1
                    fam = {(1, 1): 'ln(x)', (1, -1): 'ln(-x)', (-1, 1): '-ln(x)', (-1, -1): '-ln(-x)'}[(outer, inner)]
                    ok = fam == c['family']
                    detail = f"{c['shape']} has the shape of {fam} ({'matches' if ok else 'board says ' + c['family']})"
                else:
                    detail = f"{c['shape']}: not a log of a linear expression"
            results.append((li, bool(ok), detail))

    # The answer: its facts hold at the end, and its numbers are on the last line.
    if chain and chain['mode'] == 'eq' and len(chain['sols']) == 1 and chain['var'] not in env:
        env[chain['var']] = sp.Float(chain['sols'][0], 30)
    ans = plan.get('answer') or {}
    for fact in ans.get('facts', []):
        lhs, rhs = rel(fact, local)
        ok = holds(S(lhs), S(rhs), {}) if not (lhs.is_Symbol and lhs not in env) else False
        results.append(('answer', ok, f"answer {fact}: {'true' if ok else 'NOT established by the board'}"))
    last_tex = ''.join(t['tex'] for t in plan['lines'][-1]['tokens'])
    for n in re.findall(r'-?\d+(?:\.\d+)?', ans.get('display', '')):
        ok = n in last_tex.replace(' ', '')
        results.append(('answer', ok, f"answer number {n} {'is' if ok else 'is NOT'} on the last line"))
    if not ans.get('facts'):
        results.append(('answer', False, 'answer.facts is empty — the plan must state the answer'))
    return results


def fmt(vals):
    return '{' + ', '.join(f'{v:.6g}' for v in vals) + '}'


def fmtv(v):
    c = num(v)
    if c is None:
        return str(v)
    return f'{c.real:.6g}' if abs(c.imag) < 1e-12 else f'{c:.6g}'


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if not args:
        print(__doc__)
        sys.exit(2)
    arg = args[0]
    path = arg if arg.endswith('.json') else os.path.join(ROOT, 'data', 'clip-plans', f'{arg}.json')
    plan = json.load(open(path))
    try:
        results = check_plan(plan)
    except PlanError as e:
        print(f'✗ plan malformed: {e}')
        sys.exit(2)
    failed = [r for r in results if not r[1]]
    if '--json' in sys.argv:
        print(json.dumps({'slug': plan.get('slug'), 'pass': not failed,
                          'checks': [{'line': r[0], 'ok': r[1], 'detail': r[2]} for r in results]}, indent=1))
    else:
        print(f"maths chain · {plan.get('slug')}")
        for li, ok, d in results:
            print(f"  {'✓' if ok else '✗'} {('L' + str(li)) if isinstance(li, int) else li}: {d}")
        print(f"{'PASS' if not failed else 'FAIL'} — {len(results) - len(failed)}/{len(results)} checks")
    sys.exit(0 if not failed else 1)


if __name__ == '__main__':
    main()
