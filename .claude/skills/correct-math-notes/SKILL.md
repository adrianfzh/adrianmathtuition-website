---
name: "correct-math-notes"
description: "Audit and correct Adrian's Singapore math teaching notes (.docx) — verify every answer computationally, fix errors in red, add lean pedagogical improvements. Use whenever Adrian uploads or points at a chapter of his notes (AM / EM / JC / S1 / S2) and asks to check it, find errors, review it, or improve it."
---

# Correcting Adrian's math notes

Adrian tutors Singapore secondary (EM/AM), JC (H2) and lower-sec maths. His notes live in
`AdrianMathNotes/Notes/<LEVEL>/` (LEVEL = AM, EM, JC, S1, S2). A parallel `Revision/` tree exists.
He reviews every corrected file himself, so the goal is a clean, verified, clearly-marked draft —
not a finished product.

## Output convention

Deliver `<original name> (corrected).docx` in the SAME folder as the original. Never overwrite his file.
**Every change must be red** so he can see the diff at a glance.

## Non-negotiable: verify every answer computationally

Do not eyeball the maths. For every worked example, Practice item and Assignment item:

- Recompute independently with `python3` + `sympy` (`pip install sympy --break-system-packages -q`);
  use `numpy`/`scipy` for regression and statistics chapters.
- Substitute answers back into the original equation rather than re-deriving the same way.
- **Check intermediate lines too.** A worked example that reaches the right answer through a wrong
  line is still an error — students copy the working, not just the answer. In practice most of the
  errors found are here, not in final answers.
- Open every embedded image (`unzip -o file.docx -d /tmp/x`, then Read the PNGs) and check the
  diagram matches its own text: axis labels, asymptotes, intercepts, quadrants, shaded regions,
  which curve is which. Diagram/text contradictions are common and students copy pictures verbatim.

State what you verified. If a category is clean, say so — do not invent issues.

## What always gets fixed

- Wrong answers and wrong working lines.
- Text that contradicts itself (a solution disagreeing with its own diagram, annotation, or answer key).
- Answer keys with shifted part labels, parts that don't exist, or answers imported from another question.
- Questions with no answer at all.
- **Worked examples that stop before answering their own question** — finish them. Students use worked
  examples as the model of a complete method, so a missing final step (the nature test, the units,
  the conclusion sentence) is an error.
- Typos, wrong variable names, broken/duplicate numbering, grammar.

## Editorial premise — important

**Adrian deliberately leaves some concepts for students to discover**, with a teacher present in class
to guide them. "Self-readable" means a student can *follow the worked material* alone — NOT that every
rule is pre-stated. Do not report "the questions need this rule but the notes never state it" as a
defect by default; that is often the design.

Consequences, learned from comparing his edits against ~23 proposed chapters:

- **Consolidation after the fact is welcome.** End-of-chapter "Quick Recap" tables and "Common Mistakes"
  boxes summarise what has already been met — these were adopted most often.
- **Front-loading a concept before the student meets it is what he strips.** Long multi-paragraph
  "RULE —" explanation boxes had a 0% survival rate across every chapter.
- **Keep insertions lean.** Cap any rule box at about 3 lines. Add roughly +10% text, not +30%.
- Add a rule box only where the notes are **factually incomplete or wrong**, not where they are
  deliberately open.

### Common Mistakes boxes — the format he keeps

- Aim for **~15 words per item, 5–6 items**. Not 24 words and 8 items.
- An item earns its place only if the misconception can be shown **as a wrong equation beside a right
  one**. Items that merely restate a rule get cut.
- Good: `1/(7x²) = (1/7)x⁻², not 7x⁻²`. Weak: "remember to rewrite before differentiating".

## Technical procedure

Two helper scripts ship with the built-in **docx** skill and are always available — use them, do not
rewrite them: `<docx-skill>/scripts/merge_runs.py` and `<docx-skill>/scripts/office/validate.py`.
The red-marking library is embedded at the bottom of this file; write it out first.

```bash
mkdir -p /tmp/w && cd /tmp/w
# write the red-marking library from the appendix of this skill:
cat > lib.py <<'EOF'
... (paste the appendix code) ...
EOF
python3 -c "import sys;sys.path.insert(0,'/tmp/w');import lib;print('lib OK')"

cp "<source>.docx" F.docx
pandoc F.docx -t markdown --wrap=none > F.md        # read this IN FULL, in chunks
rm -rf Fx && mkdir Fx && unzip -qo F.docx -d Fx && find Fx -type l -delete
grep -c '<w:sym' Fx/word/document.xml               # see the merge_runs warning below
python3 <docx-skill>/scripts/merge_runs.py Fx/
```

Edit `Fx/word/document.xml` using the library (`Doc`, `omml`, `wrun`, `mrun`, `redden`, `para`, `box`,
`table`, `cell`). Then:

```bash
cd Fx && rm -f ../out.docx && zip -Xrq ../out.docx . && cd ..
python3 <docx-skill>/scripts/office/validate.py /tmp/w/out.docx --original /tmp/w/F.docx
pandoc out.docx -t markdown --wrap=none | grep -c "<text you added>"   # confirm edits landed
```

Validation must print "All validations PASSED!". Then copy to `<original name> (corrected).docx`.

## Five pitfalls that will corrupt the file

1. **Text is split across runs.** `d.index("some sentence")` usually fails — Word splits text
   mid-sentence. Match on the *visible text of a paragraph*, then rebuild that paragraph preserving
   its `<w:pPr>`:
   ```python
   def paras(d):
       for m in re.finditer(r'<w:p[ >].*?</w:p>', d, re.S):
           t=''.join(a or b for a,b in re.findall(
               r'<w:t[^>]*>([^<]*)</w:t>|<m:t[^>]*>([^<]*)</m:t>', m.group()))
           yield m, t
   ```
2. **Never use a `-1` from find/index.** `d.rfind(x,0,-1)` and `d.find(x,-1)` silently produce garbage
   and can duplicate the entire document. Always `assert idx != -1`, and assert the document length
   changed by a sane amount after each edit.
3. **Escape XML.** `<`, `>`, `&` must be escaped — `wrun()` does it, raw concatenation does not.
   Avoid `<` in prose; write "less than".
4. **Equations are OMML, not text.** To change an equation, find the `<m:oMath>` whose concatenated
   `<m:t>` text matches and replace the whole element via `omml(latex, sz)`.
5. **Insert boxes at top level only.** Before inserting, check the anchor is not inside a shape or a
   table: `pre.count('<w:txbxContent>')==pre.count('</w:txbxContent>')`, and skip past `</w:tbl>` if
   `pre.count('<w:tbl>') > pre.count('</w:tbl>')`. A table inserted inside a text box is silently
   dropped by renderers — the content vanishes with no validation error.

**merge_runs.py corrupts `<w:sym>` runs** (Wingdings), fusing them into adjacent text and producing
garbage glyphs. The validator passes it happily. If `<w:sym>` is present, skip merge_runs or restore
those paragraphs afterwards and verify by rendering.

## Rendering caveats

- Some of his files fail LibreOffice PDF conversion. Check whether the **original** also fails before
  treating it as your fault — usually pre-existing. Pandoc text extraction is sufficient proof.
- **LibreOffice does not render colour inside OMML equations**, so equation-level corrections look
  black in a LibreOffice-generated PDF preview but are red in Word. Say so rather than "re-fixing" it.

## Housekeeping

Do ALL scratch work in `/tmp/`. Never write temp files or extracted images anywhere under
`AdrianMathNotes/` — the sandbox cannot delete from it and they become litter he must remove by hand.
To view a PNG with the Read tool, copy it to the session outputs folder first.

## Reporting back

Keep it tight — he is a busy reader. Structure:

- **MATH ERRORS FIXED** — numbered: the wrong text, the correction, and the numerical proof.
- **TYPOS FIXED** — brief list.
- **ADDED** — brief list.
- **NOT FIXED / NEEDS ADRIAN** — bad PNGs you cannot edit, ambiguous questions, anything you'd cut.
- One short paragraph of assessment.

Lead with the most damaging error, not the first one found. Order lists top-to-bottom by position in
the document — he asked for this explicitly.

Diagram errors baked into PNGs are worth fixing directly when the change is small (relabelling,
removing a character): use PIL to patch, or matplotlib to redraw to the original pixel size. Otherwise
insert a red note beside the figure stating exactly what to change.

---

## Appendix — red-marking library (write this to /tmp/w/lib.py)

```python
import re, subprocess, os, hashlib
from xml.sax.saxutils import escape
RED = '<w:color w:val="FF0000"/>'

def redden(frag):
    """Add red to every <w:rPr> in a fragment (leaves already-coloured runs alone)."""
    out=[]; i=0
    for m in re.finditer(r'<w:rPr>(.*?)</w:rPr>', frag, re.S):
        out.append(frag[i:m.start()]); inner=m.group(1)
        if 'w:color' not in inner:
            inner = inner.replace('<w:sz ', RED+'<w:sz ',1) if '<w:sz ' in inner else inner+RED
        out.append('<w:rPr>'+inner+'</w:rPr>'); i=m.end()
    out.append(frag[i:]); return ''.join(out)

def mrun(text, sz='20'):
    rpr=('<w:rPr><w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math" w:cs="Times New Roman"/>'
         + RED + '<w:sz w:val="%s"/><w:szCs w:val="%s"/></w:rPr>')%(sz,sz)
    return '<m:r>'+rpr+'<m:t xml:space="preserve">'+escape(text)+'</m:t></m:r>'

def wrun(text, sz='20', bold=False):
    rpr='<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>'
    if bold: rpr+='<w:b/>'
    rpr+=RED+'<w:sz w:val="%s"/><w:szCs w:val="%s"/></w:rPr>'%(sz,sz)
    return '<w:r>'+rpr+'<w:t xml:space="preserve">'+escape(text)+'</w:t></w:r>'

_CACHE={}
def omml(latex, sz='20', tmp='/tmp/w/_gen'):
    """Red <m:oMath> built by round-tripping LaTeX through pandoc."""
    key=(latex,sz)
    if key in _CACHE: return _CACHE[key]
    os.makedirs(tmp,exist_ok=True)
    h=hashlib.md5((latex+sz).encode()).hexdigest()[:10]
    md=os.path.join(tmp,h+'.md'); dx=os.path.join(tmp,h+'.docx')
    open(md,'w').write('$'+latex+'$\n')
    subprocess.run(['pandoc',md,'-o',dx],check=True,capture_output=True)
    subprocess.run(['unzip','-qo',dx,'-d',os.path.join(tmp,h)],check=True,capture_output=True)
    x=open(os.path.join(tmp,h,'word','document.xml')).read()
    frag=re.search(r'<m:oMath>.*?</m:oMath>', x, re.S).group()
    RPR=('<w:rPr><w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math" w:cs="Times New Roman"/>'
         + RED + '<w:sz w:val="'+sz+'"/><w:szCs w:val="'+sz+'"/></w:rPr>')
    CTRL=('<m:ctrlPr><w:rPr><w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math" w:cs="Times New Roman"/><w:i/>'
         + RED + '<w:sz w:val="'+sz+'"/><w:szCs w:val="'+sz+'"/></w:rPr></m:ctrlPr>')
    frag=frag.replace('<m:r><m:t>', '<m:r>'+RPR+'<m:t>')
    frag=frag.replace('<m:fPr><m:type m:val="bar" /></m:fPr>', '<m:fPr><m:type m:val="bar" />'+CTRL+'</m:fPr>')
    frag=frag.replace('<m:grow /></m:dPr>', '<m:grow />'+CTRL+'</m:dPr>')
    # Word rejects pandoc's <m:nor/> before <m:sty/>; match the document's own convention
    frag=frag.replace('<m:rPr><m:nor /><m:sty m:val="p" /></m:rPr>', '<m:rPr><m:sty m:val="p"/></m:rPr>')
    frag=frag.replace('<m:rPr><m:nor /></m:rPr>', '<m:rPr><m:sty m:val="p"/></m:rPr>')
    frag=frag.replace('−','-')
    _CACHE[key]=frag; return frag

BORDERS=('<w:tblBorders>'+''.join('<w:%s w:val="single" w:sz="4" w:space="0" w:color="FF0000"/>'%s
        for s in ['top','left','bottom','right','insideH','insideV'])+'</w:tblBorders>')

def para(inner, sz='20', after='40'):
    return ('<w:p><w:pPr><w:spacing w:after="%s"/><w:rPr><w:rFonts w:ascii="Times New Roman" '
            'w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:color w:val="FF0000"/>'
            '<w:sz w:val="%s"/><w:szCs w:val="%s"/></w:rPr></w:pPr>'%(after,sz,sz))+inner+'</w:p>'

def box(paras, width=9350, shade='FDF2F2'):
    shd='<w:shd w:val="clear" w:color="auto" w:fill="%s"/>'%shade if shade else ''
    return ('<w:tbl><w:tblPr><w:tblStyle w:val="TableNormal"/><w:tblW w:w="%d" w:type="dxa"/>'%width+BORDERS+
            '<w:tblLook w:val="04A0"/></w:tblPr><w:tblGrid><w:gridCol w:w="%d"/></w:tblGrid>'%width+
            '<w:tr><w:tc><w:tcPr><w:tcW w:w="%d" w:type="dxa"/>%s</w:tcPr>'%(width,shd)+''.join(paras)+'</w:tc></w:tr></w:tbl>')

def cell(paras, w, shade=None):
    shd='<w:shd w:val="clear" w:color="auto" w:fill="%s"/>'%shade if shade else ''
    return '<w:tc><w:tcPr><w:tcW w:w="%d" w:type="dxa"/>%s</w:tcPr>%s</w:tc>'%(w,shd,''.join(paras))

def table(rows, widths):
    grid=''.join('<w:gridCol w:w="%d"/>'%w for w in widths); total=sum(widths)
    trs=''.join('<w:tr>'+''.join(r)+'</w:tr>' for r in rows)
    return ('<w:tbl><w:tblPr><w:tblStyle w:val="TableNormal"/><w:tblW w:w="%d" w:type="dxa"/>'%total+BORDERS+
            '<w:tblLook w:val="04A0"/></w:tblPr><w:tblGrid>'+grid+'</w:tblGrid>'+trs+'</w:tbl>')

class Doc:
    def __init__(self, path):
        self.path=path; self.d=open(path,encoding='utf-8').read(); self.log=[]
    def save(self):
        open(self.path,'w',encoding='utf-8').write(self.d)
        print('SAVED', self.path)
        for l in self.log: print('   *', l)
```

Sizes are half-points: `'19'` = 9.5pt (his usual body size), `'20'` = 10pt. Check the surrounding
runs before choosing.

