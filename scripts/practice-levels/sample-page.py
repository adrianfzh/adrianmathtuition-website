import json, sys, html, re
# page.py <sample.json> <scores.json> <out.html> <title> <intro-html> <order: adv-first|core-first> [figs.json]
samp, scores, out, title, intro, order = sys.argv[1:7]
s={x['id']:x for x in json.load(open(samp))}
sc=json.load(open(scores))
figs=json.load(open(sys.argv[7])) if len(sys.argv)>7 else {}
def t0(x):
    # keep display maths ($$…$$, e.g. tables) on one line so KaTeX can find it
    seg=html.escape(x or '').split('$$')
    return '$$'.join(g.replace('\n',' ') if i%2 else g.replace('\n','<br>') for i,g in enumerate(seg))
def t(x):
    # markdown pipe tables (| a | b | rows) → a real table, as the app draws them
    out=[];buf=[];tbl=[]
    def flush_tbl():
        rows=[[c.strip() for c in r.strip().strip('|').split('|')] for r in tbl]
        rows=[r for r in rows if not all(re.fullmatch(r':?-{2,}:?',c) for c in r)]
        if rows: out.append('<table class="pt">'+''.join('<tr>'+''.join(f'<td>{t0(c)}</td>' for c in r)+'</tr>' for r in rows)+'</table>')
        tbl.clear()
    for line in (x or '').split('\n'):
        if line.strip().startswith('|') and line.strip().endswith('|'):
            if buf: out.append(t0('\n'.join(buf))); buf.clear()
            tbl.append(line)
        else:
            if tbl: flush_tbl()
            buf.append(line)
    if tbl: flush_tbl()
    if buf: out.append(t0('\n'.join(buf)))
    return ''.join(out)
def pimg(v):
    # a part's own picture (parts[].image_url / image_url_after, 15 Oct 2026): one url, a JSON list, or {url}
    if not v: return ''
    try: v=json.loads(v) if isinstance(v,str) and v.strip().startswith('[') else v
    except Exception: pass
    urls=[(u.get('url') if isinstance(u,dict) else u) for u in (v if isinstance(v,list) else [v])]
    return ''.join(f'<img src="{html.escape(u)}">' for u in urls if isinstance(u,str) and len(u)>5)
def part(p, depth=0):
    sub=''.join(part(c, depth+1) for c in (p.get('subparts') or []))
    ans='' if p.get('subparts') else f'<div class="ans">Answer: {t(p.get("answer"))}</div>'
    txt=t(p.get('text'))
    return f'<div class="part" style="margin-left:{depth*18}px">{pimg(p.get("image_url"))}<b>({html.escape(p.get("label",""))})</b> {txt} <span class="mk">[{p.get("marks","")}]</span>{pimg(p.get("image_url_after"))}{ans}{sub}</div>'
LINE={'Core':'Every exam question you must be able to do. B3 to A1.','Advanced':'For A1 and above, and harder school papers.','Challenge':'Beyond the exam.'}
G=[('Advanced',None,'Advanced'),('Challenge',None,'Challenge'),('Core','Short','Core · Short (1–4 marks)'),('Core','Long','Core · Long (5+ marks)')]
if order=='core-first': G=G[2:]+G[:2]
SHORT = order=='shortlist'
if SHORT:
    G=[('Advanced',None,'Likely Advanced'),('Challenge',None,'Maybe Advanced')]
    LINE={'Advanced':'The reader is fairly sure these need an idea students do not usually drill.','Challenge':'Borderline. Most of these are probably Core.'}
VOTE='<div class="vote">Your call: <label><input type="radio" name="v{n}" value="ok"> Right</label> <label><input type="radio" name="v{n}" value="Core"> Core</label> <label><input type="radio" name="v{n}" value="Advanced"> Advanced</label> <label><input type="radio" name="v{n}" value="Challenge"> Challenge</label></div>'
VOTE_S='<div class="vote">Your call: <label><input type="radio" name="v{n}" value="Advanced"> Advanced</label> <label><input type="radio" name="v{n}" value="Core"> Core</label> <label><input type="radio" name="v{n}" value="Challenge"> Challenge</label></div>'
cards=[]; n=0
for lv,ln,ti in G:
    rows=[r for r in sc if r['level']==lv and (ln is None or r['length']==ln)]
    rows.sort(key=lambda r:s[r['id']].get('topic') or '')
    cards.append(f'<h2 class="{lv}">{ti} <span>{len(rows)} questions</span></h2><div class="sub">{LINE[lv]}</div>')
    if not rows: cards.append('<div class="empty">None in this sample.</div>')
    for r in rows:
        n+=1; q=s[r['id']]
        fu=q.get('figure_url') or figs.get(r['id'])
        fig=f'<img src="{html.escape(fu)}">' if fu else ''
        cards.append(f'''<div class="card" data-n="{n}" data-id="{r['id'][:8]}" data-lv="{lv}">
<div class="head"><span class="badge {lv}">{('Likely' if lv=='Advanced' else 'Maybe') if SHORT else lv}</span> <b>Q{n}</b> · {html.escape(q.get('topic') or '')} · {q['marks']} marks</div>
<div class="why">{'Why it might be Advanced' if SHORT else 'Why '+lv}: {html.escape(r['reason'])} <span class="hp">(hardest part {html.escape(str(r.get('hardest_part','')))})</span></div>
<div class="q">{t(q.get('question'))}</div>{fig}{''.join(part(p) for p in (q.get('parts') or []))}
<details><summary>Worked solution</summary><div class="sol">{t(q.get('solution'))}</div></details>
{VOTE_S.format(n=n) if SHORT else VOTE.format(n=n)}
</div>''')
CSS='''body{font:16px/1.6 -apple-system,system-ui,sans-serif;max-width:820px;margin:0 auto;padding:16px;background:#fafaf9;color:#1c1917}
h1{font-size:22px;margin:0 0 4px}.intro{color:#57534e;margin-bottom:16px}h2{margin:28px 0 10px;font-size:20px}h2 span{font-weight:400;color:#78716c;font-size:15px}
.sub{color:#57534e;font-size:14px;margin:-6px 0 8px}.empty{color:#78716c;font-style:italic;font-size:14px}
.card{background:#fff;border:1px solid #e7e5e4;border-radius:12px;padding:14px 16px;margin:12px 0}.head{font-size:15px;margin-bottom:6px}
.badge{padding:2px 10px;border-radius:999px;font-size:13px;font-weight:600}.Core{background:#dcfce7;color:#166534}h2.Core{background:none}
.Advanced{background:#dbeafe;color:#1e40af}h2.Advanced{background:none}.Challenge{background:#fee2e2;color:#991b1b}h2.Challenge{background:none}
.why{background:#f5f5f4;border-radius:8px;padding:6px 10px;font-size:14px;margin-bottom:10px}.hp{color:#78716c}
.part{margin:8px 0 8px 4px}.mk{color:#78716c;font-size:14px}.ans{color:#c2410c;font-size:14px;margin-top:2px}
img{max-width:100%;max-height:320px;display:block;margin:8px 0}details{margin-top:8px;font-size:14px}summary{cursor:pointer;color:#57534e}
.sol{background:#fafaf9;padding:8px;border-radius:8px;margin-top:6px}.vote{margin-top:10px;font-size:14px;border-top:1px solid #f5f5f4;padding-top:8px}
.vote label{margin-right:10px;white-space:nowrap}#done{background:#fff;border:1px solid #e7e5e4;border-radius:12px;padding:12px;margin-top:20px}
button{font-size:15px;padding:8px 14px;border-radius:8px;border:1px solid #a8a29e;background:#fff}textarea{width:100%;height:70px;margin-top:8px;font-size:13px}
.katex-display{overflow-x:auto;overflow-y:hidden}\n.pt{border-collapse:collapse;margin:8px 0;font-size:15px;display:block;overflow-x:auto}.pt td{border:1px solid #d6d3d1;padding:4px 8px}.pt tr:first-child td{font-weight:600;background:#f5f5f4}'''
tag=title.split(':')[0]
page=f'''<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{html.escape(tag)}</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.css"><style>{CSS}</style></head><body>
<h1>{html.escape(title)}</h1><div class="intro">{intro}</div>{''.join(cards)}
<div id="done"><button onclick="copyV()">Copy my answers</button> <span id="cnt"></span><textarea id="out" readonly></textarea></div>
<script>const SHORTJS={'true' if SHORT else 'false'};function copyV(){{const L=[];document.querySelectorAll('.card').forEach(c=>{{const v=c.querySelector('input:checked');if(v&&v.value!=='ok'&&(SHORTJS||v.value!==c.dataset.lv))L.push('Q'+c.dataset.n+' ('+c.dataset.id+') '+(SHORTJS?'':c.dataset.lv+' -> ')+v.value);}});
const all=document.querySelectorAll('.card input:checked').length;const txt='{html.escape(tag)} verdicts: '+all+'/{n} ticked. '+(L.length?(SHORTJS?'Calls: ':'Change: ')+L.join('; '):'All ticked ones right.');
const o=document.getElementById('out');o.value=txt;try{{navigator.clipboard.writeText(txt);document.getElementById('cnt').textContent='Copied';}}catch(e){{o.select();}}}}</script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/contrib/auto-render.min.js"></script>
<script>renderMathInElement(document.body,{{delimiters:[{{left:'$$',right:'$$',display:true}},{{left:'$',right:'$',display:false}}],throwOnError:false}});</script></body></html>'''
open(out,'w').write(page); print(n)
