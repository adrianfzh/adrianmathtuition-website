// GET /api/admin/annotate-side/solutions?runId=&page=<photoIndex> — the worked solutions for
// the questions on one marked page, as a page the ✏️ Annotate side panel shows in a frame.
// The house solutions layout (lib/render-solutions-pdf: one step a line, a bold Answer per
// part, mark codes small and grey, KaTeX), sized for a half-screen panel. A question with
// no figure of its own gets a slot the page fills, without waiting, with a diagram drawn by
// the figure library when one would help (POST …/diagram). Admin only. SPEC-ANNOTATE §21.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { loadSideRun, sideSolutionItems, readSideExtras } from '@/lib/annotate-side-store';
import { applyExtras } from '@/lib/annotate/side-extras';
import { buildSolutionsHTML } from '@/lib/render-solutions-pdf';

export const runtime = 'nodejs';

const SCREEN_CSS = `
  html,body{touch-action:pan-x pan-y}
  /* A narrow panel (paper and solutions side by side, 2 Nov 2026): a long line scrolls
     sideways on its own instead of widening the whole page and cutting it off. */
  body{overflow-x:hidden}
  .sol-line,.sol-align,.sol-sub{max-width:100%;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch}
  @media screen {
    /* A little smaller (Adrian, 3 Nov 2026: "fonts for solutions can be slightly smaller"); two fingers zoom it. */
    body{font-size:14px;line-height:1.55;padding:12px 14px 40px}
    .sol-list{padding-left:30px}
    .sol-qnum{left:-30px}
    .sol-q{margin-bottom:18px;padding-bottom:12px}
    .sol-stem,.sol-pstem{font-size:13.5px}
    .sol-check,.sol-note,.sol-al-lead{font-size:13.5px}
    /* The scheme marks are for Adrian here, not a student (2 Nov 2026: "where is A1, M1"): readable, the red pen's colour. */
    .sol-mk{font-size:12.5px;font-weight:700;color:#c0392b;margin-left:8px;letter-spacing:.02em}
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
  // A pinch in this frame would zoom the whole marking page on the iPad (2 Nov 2026), so the
  // browser's own pinch stays off and two fingers zoom just the solutions instead (Adrian,
  // 3 Nov 2026: "allow pinch to zoom in/out"). The size is kept for the next page.
  document.addEventListener('gesturestart', function(e){ e.preventDefault(); }, { passive: false });
  document.addEventListener('gesturechange', function(e){ e.preventDefault(); }, { passive: false });
  var KEY = 'annotate-solutions-zoom', z = 1;
  try { z = Math.min(2.5, Math.max(0.6, Number(localStorage.getItem(KEY)) || 1)); } catch (e) {}
  // Zoomed in, the page keeps its width and grows past the frame (slide sideways), like a
  // real pinch; re-wrapping into the narrow panel squashed every vector row. Zoomed out it
  // re-wraps to use the room.
  function setZoom(v){
    z = Math.min(2.5, Math.max(0.6, v));
    var b = document.body, big = z > 1;
    b.style.boxSizing = 'border-box';
    b.style.width = big ? document.documentElement.clientWidth + 'px' : '';
    b.style.overflowX = big ? 'visible' : '';
    b.style.zoom = String(z);
  }
  setZoom(z);
  var start = null;
  function gap(t){ return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY); }
  function mid(t, k){ return (t[0][k] + t[1][k]) / 2; }
  document.addEventListener('touchstart', function(e){
    if (e.touches.length !== 2) return;
    var cx = mid(e.touches, 'clientX'), cy = mid(e.touches, 'clientY');
    start = { d: gap(e.touches), z: z, x: (window.scrollX + cx) / z, y: (window.scrollY + cy) / z, cx: cx, cy: cy };
  }, { passive: true });
  document.addEventListener('touchmove', function(e){
    if (!start || e.touches.length !== 2) return;
    e.preventDefault();
    setZoom(start.z * gap(e.touches) / start.d);
    // the spot between the fingers stays under the fingers
    window.scrollTo(start.x * z - start.cx, start.y * z - start.cy);
  }, { passive: false });
  function end(e){ if (start && e.touches.length < 2) { start = null; try { localStorage.setItem(KEY, String(Math.round(z * 100) / 100)); } catch (err) {} } }
  document.addEventListener('touchend', end, { passive: true });
  document.addEventListener('touchcancel', end, { passive: true });
})();
</script>`;

// Makes the missing extras one question at a time and swaps each question's block in place,
// keeping a diagram already drawn in it, then typesets the new block.
const EXTRAS_SCRIPT = (runId: string, qs: string[]) => qs.length ? `<script>
(function(){
  var qs = ${JSON.stringify(qs)}, i = 0;
  function next(){
    if (i >= qs.length) return;
    var q = qs[i++];
    fetch('/api/admin/annotate-side/extras', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ runId: ${JSON.stringify(runId)}, q: q }) })
      .then(function(r){ return r.json(); })
      .then(function(d){
        if (!d || !d.itemHtml) return;
        var old = document.querySelector('li.sol-q[data-q="' + q.replace(/"/g, '') + '"]');
        if (!old) return;
        var box = document.createElement('div'); box.innerHTML = d.itemHtml.trim();
        var li = box.querySelector('li'); if (!li) return;
        var num = old.querySelector('.sol-qnum'); var newNum = li.querySelector('.sol-qnum');
        if (num && newNum) newNum.textContent = num.textContent;
        var gen = old.querySelector('.sol-gen'); var slot = li.querySelector('.sol-gen');
        if (gen && slot) slot.replaceWith(gen);
        old.replaceWith(li);
        try { renderMathInElement(li, { delimiters: [{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false},{left:'\\\\(',right:'\\\\)',display:false},{left:'\\\\[',right:'\\\\]',display:true}], throwOnError: false, strict: false, trust: true }); } catch (e) {}
      })
      .catch(function(){})
      .then(next);
  }
  next();
})();
</script>` : '';

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return new NextResponse('Unauthorized', { status: 401 });
  const runId = req.nextUrl.searchParams.get('runId') || '';
  const page = Number(req.nextUrl.searchParams.get('page'));
  if (!/^[0-9a-f-]{36}$/i.test(runId) || !Number.isInteger(page) || page < 0) return new NextResponse('runId and page required', { status: 400 });
  const run = await loadSideRun(runId);
  if (!run) return new NextResponse('run not found', { status: 404 });
  const raw = await sideSolutionItems(run, page);
  const { questions } = raw;
  // The typeset question + the marks on the lines, where already made; the rest are made
  // by the page script below and swapped in (2 Nov 2026).
  const kept = await Promise.all(raw.items.map((it) => (it.qnum ? readSideExtras(runId, it.qnum) : Promise.resolve(null))));
  const items = raw.items.map((it, i) => applyExtras(it, kept[i]));
  const toMake = raw.items.filter((it, i) => it.qnum && !kept[i]).map((it) => it.qnum as string);
  const title = questions.length ? `Page ${page + 1} · Q${questions.join(', Q')}` : `Page ${page + 1}`;
  const html = items.length
    ? buildSolutionsHTML({ title, items, meta: 'Worked solutions', screenCss: SCREEN_CSS, extraBody: DIAGRAM_SCRIPT(runId) + EXTRAS_SCRIPT(runId, toMake) })
    : buildSolutionsHTML({ title, items: [], meta: '', screenCss: SCREEN_CSS, extraBody: '<div class="sol-empty">No question was marked on this page.</div>' });
  return new NextResponse(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}
