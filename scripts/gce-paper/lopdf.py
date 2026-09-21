import os, uno
from com.sun.star.beans import PropertyValue
def pv(n, v):
    p = PropertyValue(); p.Name = n; p.Value = v; return p
def main(*a):
    log = open(os.environ['LOPDF_LOG'], 'w')
    try:
        desk = XSCRIPTCONTEXT.getDesktop()
        doc = desk.loadComponentFromURL(uno.systemPathToFileUrl(os.environ['LOPDF_SRC']), '_blank', 0, (pv('Hidden', True),))
        n = 0
        objs = doc.getEmbeddedObjects()
        for i in range(objs.getCount()):
            m = objs.getByIndex(i).getEmbeddedObject()
            try:
                m.BaseFontHeight = int(os.environ['LOPDF_SIZE']); n += 1
            except Exception as e:
                pass
        log.write(f'formulas resized {n} of {objs.getCount()}\n')
        doc.storeToURL(uno.systemPathToFileUrl(os.environ['LOPDF_DST']), (pv('FilterName', 'writer_pdf_Export'),))
        doc.close(True); log.write('ok\n')
    except Exception as e:
        log.write('ERR ' + repr(e) + '\n')
    log.close()
    try: XSCRIPTCONTEXT.getDesktop().terminate()
    except Exception: pass
g_exportedScripts = (main,)
