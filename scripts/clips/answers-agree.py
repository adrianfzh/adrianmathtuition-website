#!/usr/bin/env python3
"""Do two blind solves of a photo question agree? (SPEC-CLIP-PIPELINE.md §9b)

    /usr/bin/python3 scripts/clips/answers-agree.py <solve-A.json> <solve-B.json>

Prints JSON {agree, parts: [{part, a, b, same, why}]}. Each part's `sympy` is compared as the
same kind of thing: a list of roots as a set, a range as a set of reals, a dict of unknowns key by
key, a point `(k, 3*k - k**2)` entry by entry, an expression by simplify(a - b) == 0. Decimals agree when they round alike to the places
the shorter one gives (2.65 vs 2.646 → same). Anything unparseable → not agreed (never guessed).
"""
import json, sys
import sympy as sp

def load(p):
    with open(p) as f:
        return json.load(f)

def parse(s):
    s = str(s).strip()
    if s.startswith('{'):
        d = json.loads(s)
        return {str(k): parse(v) for k, v in d.items()}
    if s.startswith('['):
        return sp.FiniteSet(*[sp.sympify(x) for x in json.loads(s.replace("'", '"'))]) if all(c not in s for c in 'sqrtpiln') else sp.FiniteSet(*sp.sympify(s))
    e = sp.sympify(s.replace('^', '**'))
    if isinstance(e, tuple):
        return sp.Tuple(*e)
    if isinstance(e, (sp.core.relational.Relational, sp.And, sp.Or)):
        free = list(e.free_symbols)
        if len(free) != 1:
            raise ValueError('a range in more than one letter')
        return e.as_set()
    return e

def places(x):
    t = str(x)
    return len(t.split('.')[1].rstrip('0')) if '.' in t else None

def same(a, b):
    if isinstance(a, sp.Tuple) or isinstance(b, sp.Tuple):  # a point / an ordered pair: entry by entry
        return isinstance(a, sp.Tuple) and isinstance(b, sp.Tuple) and len(a) == len(b) and all(same(x, y) for x, y in zip(a, b))
    if isinstance(a, dict) or isinstance(b, dict):
        if not (isinstance(a, dict) and isinstance(b, dict)) or set(a) != set(b):
            return False
        return all(same(a[k], b[k]) for k in a)
    if isinstance(a, sp.Set) or isinstance(b, sp.Set):
        if isinstance(a, sp.FiniteSet) and isinstance(b, sp.FiniteSet):
            if len(a) != len(b):
                return False
            return all(any(same(x, y) for y in b) for x in a)
        try:
            return bool(sp.simplify(a.symmetric_difference(b)) == sp.EmptySet) or a == b
        except Exception:
            return a == b
    try:
        if sp.simplify(a - b) == 0:
            return True
    except Exception:
        pass
    if a.free_symbols or b.free_symbols:
        return False
    fa, fb = float(a), float(b)
    pa, pb = places(a) if a.is_Float else None, places(b) if b.is_Float else None
    if pa is None and pb is None:
        return abs(fa - fb) < 1e-9
    p = min(x for x in (pa, pb) if x is not None)
    return round(fa, p) == round(fb, p)

def main():
    A, B = load(sys.argv[1]), load(sys.argv[2])
    pa = {str(x.get('part', '')).strip(): x for x in A.get('answers', [])}
    pb = {str(x.get('part', '')).strip(): x for x in B.get('answers', [])}
    out = []
    for k in sorted(set(pa) | set(pb)):
        row = {'part': k, 'a': pa.get(k, {}).get('sympy'), 'b': pb.get(k, {}).get('sympy')}
        if row['a'] is None or row['b'] is None:
            row.update(same=False, why='one solve has no answer for this part')
        else:
            try:
                row['same'] = bool(same(parse(row['a']), parse(row['b'])))
                row['why'] = '' if row['same'] else 'different answers'
            except Exception as e:
                row.update(same=False, why=f'could not read: {e}')
        out.append(row)
    print(json.dumps({'agree': bool(out) and all(r['same'] for r in out), 'parts': out}))

if __name__ == '__main__':
    main()
