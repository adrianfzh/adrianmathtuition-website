import os, uno
from com.sun.star.beans import PropertyValue
def pv(n, v):
    p = PropertyValue(); p.Name = n; p.Value = v; return p
def main(*a):
    log = open(os.environ['LOPDF_LOG'], 'w')
    try:
        desk = XSCRIPTCONTEXT.getDesktop()
        doc = desk.loadComponentFromURL(uno.systemPathToFileUrl(os.environ['LOPDF_SRC']), '_blank', 0, (pv('Hidden', True),))
        n = lead = 0
        objs = doc.getEmbeddedObjects()
        for i in range(objs.getCount()):
            m = objs.getByIndex(i).getEmbeddedObject()
            try:
                m.BaseFontHeight = int(os.environ['LOPDF_SIZE']); n += 1
            except Exception as e:
                pass
            # A formula that opens on a relation ("Total amount = P(...)", "... = 4/3 h")
            # is valid in Word, but LibreOffice's maths engine wants a left operand and
            # draws a red inverted question mark in its place: give it an empty one.
            # The same on the right: "... - 2 h 1 min =" followed by prose.
            try:
                f = m.Formula
                toks = f.split()
                rel = ('=', '<', '>', '<>', 'approx', 'leslant', 'geslant', 'le', 'ge')
                if toks and toks[0] in rel or f.lstrip().startswith(('=', '<', '>')):
                    f = '{} ' + f; lead += 1
                if toks and toks[-1] in rel or f.rstrip().endswith(('=', '<', '>')):
                    f = f + ' {}'; lead += 1
                if f != m.Formula:
                    m.Formula = f
            except Exception as e:
                pass
        log.write(f'formulas resized {n} of {objs.getCount()}; {lead} open or close on a relation\n')
        doc.storeToURL(uno.systemPathToFileUrl(os.environ['LOPDF_DST']), (pv('FilterName', 'writer_pdf_Export'),))
        doc.close(True); log.write('ok\n')
    except Exception as e:
        log.write('ERR ' + repr(e) + '\n')
    log.close()
    try: XSCRIPTCONTEXT.getDesktop().terminate()
    except Exception: pass
g_exportedScripts = (main,)
