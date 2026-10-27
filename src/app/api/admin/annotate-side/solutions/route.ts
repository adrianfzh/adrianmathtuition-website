// GET /api/admin/annotate-side/solutions?runId=&page=<photoIndex> — the worked solutions for
// the questions on one marked page, as a page the ✏️ Annotate side panel shows in a frame.
// The house solutions layout (lib/render-solutions-pdf: one step a line, a bold Answer per
// part, mark codes small and grey, KaTeX), sized for a half-screen panel. A question with
// no figure of its own gets a slot the page fills, without waiting, with a diagram drawn by
// the figure library when one would help (POST …/diagram). Admin only. SPEC-ANNOTATE §21.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { loadSideRun, sideSolutionItems } from '@/lib/annotate-side-store';
import { buildSolutionsHTML } from '@/lib/render-solutions-pdf';

export const runtime = 'nodejs';

const SCREEN_CSS = `
  @media screen {
    body{font-size:16px;line-height:1.6;padding:14px 16px 40px}
    .sol-list{padding-left:30px}
    .sol-qnum{left:-30px}
    .sol-q{margin-bottom:18px;padding-bottom:12px}
    .sol-stem,.sol-pstem{font-size:13.5px}
    .sol-check,.sol-note,.sol-al-lead{font-size:13.5px}
    .sol-mk{font-size:10.5px}
    .sol-part{padding-left:40px;margin-top:12px}
    .sol-title{font-size:16px}
    .sol-gen figure{margin:6px 0 10px}
    .sol-gen img{display:block;max-width:100%;max-height:300px;border:1px solid #eef0f3;border-radius:6px;background:#fff}
    .sol-gen figcaption{font-size:11px;color:#9a9a9a;margin-top:3px}
    .sol-gen .drawing{font-size:12px;color:#9a9a9a;font-style:italic}
    .sol-empty{color:#6E6E6E;font-size:14px;margin-top:20px;text-align:center}
  }`;

// Fills each empty diagram slot without holding the page: two at a time, quiet on "none".
const DIAGRAM_SCRIPT = (runId: string) => `<script>
(function(){
  var slots = Array.prototype.slice.call(document.querySelectorAll('.sol-gen[data-gen]'));
  var made = 0, i = 0;
  function next(){
    if (i >= slots.length) return;
    var el = slots[i++], q = el.getAttribute('data-gen');
    var t = setTimeout(function(){ el.innerHTML = '<div class="drawing">drawing a diagram…</div>'; }, 3000);
    fetch('/api/admin/annotate-side/diagram', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ runId: ${JSON.stringify(runId)}, q: q }) })
      .then(function(r){ return r.json(); })
      .then(function(d){
        clearTimeout(t);
        if (d && d.status === 'ok' && d.url) {
          made++;
          el.innerHTML = '<figure><img alt="diagram" src="' + d.url.replace(/"/g, '&quot;') + '"><figcaption>Diagram drawn for this solution</figcaption></figure>';
        } else el.innerHTML = '';
      })
      .catch(function(){ clearTimeout(t); el.innerHTML = ''; })
      .then(function(){ document.body.setAttribute('data-diagrams', String(made)); next(); });
  }
  next(); next();
})();
</script>`;

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return new NextResponse('Unauthorized', { status: 401 });
  const runId = req.nextUrl.searchParams.get('runId') || '';
  const page = Number(req.nextUrl.searchParams.get('page'));
  if (!/^[0-9a-f-]{36}$/i.test(runId) || !Number.isInteger(page) || page < 0) return new NextResponse('runId and page required', { status: 400 });
  const run = await loadSideRun(runId);
  if (!run) return new NextResponse('run not found', { status: 404 });
  const { items, questions } = await sideSolutionItems(run, page);
  const title = questions.length ? `Page ${page + 1} · Q${questions.join(', Q')}` : `Page ${page + 1}`;
  const html = items.length
    ? buildSolutionsHTML({ title, items, meta: 'Worked solutions', screenCss: SCREEN_CSS, extraBody: DIAGRAM_SCRIPT(runId) })
    : buildSolutionsHTML({ title, items: [], meta: '', screenCss: SCREEN_CSS, extraBody: '<div class="sol-empty">No question was marked on this page.</div>' });
  return new NextResponse(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}
