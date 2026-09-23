import os, sys, time, uno
from com.sun.star.beans import PropertyValue
def pv(n, v):
    p = PropertyValue(); p.Name = n; p.Value = v; return p
def convert(desk):
    log = open(os.environ['LOPDF_LOG'], 'w')
    try:
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
    try: desk.terminate()
    except Exception: pass
def main(*a):
    convert(XSCRIPTCONTEXT.getDesktop())
g_exportedScripts = (main,)
# The pipe route (lo-pdf.sh's fallback): `python lopdf.py <pipe name>` with a
# Python that has LibreOffice's uno module, against `soffice --accept=pipe,...`.
if __name__ == '__main__':
    local = uno.getComponentContext()
    resolver = local.ServiceManager.createInstanceWithContext('com.sun.star.bridge.UnoUrlResolver', local)
    for _ in range(120):
        try:
            ctx = resolver.resolve(f'uno:pipe,name={sys.argv[1]};urp;StarOffice.ComponentContext'); break
        except Exception:
            time.sleep(0.5)
    else:
        sys.exit('lopdf: LibreOffice did not answer on the pipe')
    convert(ctx.ServiceManager.createInstanceWithContext('com.sun.star.frame.Desktop', ctx))
