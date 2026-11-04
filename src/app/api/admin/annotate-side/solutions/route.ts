// GET /api/admin/annotate-side/solutions?runId=&page=<photoIndex> — the worked solutions for
// the questions on one marked page, as a page the ✏️ Annotate side panel shows in a frame.
// `page=all` (3 Nov 2026) is the WHOLE paper in one document, a hidden section per marked
// page, and the panel tells the frame which page to show (postMessage {type:'show-page'}):
// the frame used to load a fresh document for every page scrolled past — each with its own
// KaTeX, fonts and model calls in flight — and an iPad scrolling through 17 pages died of it.
// The house solutions layout (lib/render-solutions-pdf: one step a line, a bold Answer per
// part, mark codes small and grey, KaTeX), sized for a half-screen panel. A question with
// no figure of its own gets a slot the page fills, without waiting, with a diagram drawn by
// the figure library when one would help (POST …/diagram). Admin only. SPEC-ANNOTATE §21.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { loadSideRun, sideInfo, sideSolutionItems, readSideExtras } from '@/lib/annotate-side-store';
import type { SolutionsItem } from '@/lib/render-solutions-pdf';
import { applyExtras } from '@/lib/annotate/side-extras';
import { buildSolutionsHTML } from '@/lib/render-solutions-pdf';

export const runtime = 'nodejs';

const SCREEN_CSS = `
  /* overscroll-behavior none: a swipe past the top of the solutions stays in this frame
     instead of bouncing the page under the pen, which iPad Safari reads as pull-to-refresh
     (4 Nov 2026). */
  html,body{touch-action:pan-x pan-y;overscroll-behavior:none}
  /* A narrow panel (paper and solutions side by side, 2 Nov 2026): a long line scrolls
     sideways on its own instead of widening the whole page and cutting it off. */
  body{overflow-x:hidden}
  .sol-line,.sol-align,.sol-sub{max-width:100%;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;padding:2px 0}
  /* iPad Safari squashed the "=" rows that hold a tall vector or fraction — the cells line
     up by baseline and WebKit sizes such a grid row too short, so the row above and below
     ate into it (Adrian, 4 Nov 2026: "the lines eat into each other"). Centred cells size
     by content, and a short "cos θ" centred on a tall fraction is how display maths sits
     anyway. The PDF (Chrome) keeps its baseline rows. */
  .sol-align{align-items:center;row-gap:8px}
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
    .sol-ptitle{font-size:12px;font-weight:700;color:#6b7280;letter-spacing:.04em;text-transform:uppercase;margin:0 0 10px}
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
</script>` + DIAGRAM_ZOOM_SCRIPT();

// Two fingers zoom the solutions; the browser's own pinch stays off.
/**
 * The fence against Safari's pull-to-refresh, inside the frame (4 Nov 2026): a one-finger move
 * that this document, or a scroller under the finger, cannot take is cancelled before it can
 * reach the marking page underneath and bounce it. Two fingers are the zoom's.
 */
const BOUNCE_GUARD_SCRIPT = `<script>
(function(){
  var y0 = 0;
  function scroller(el, dy){
    while (el && el !== document.body && el !== document.documentElement) {
      var cs = getComputedStyle(el);
      if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) {
        var atTop = el.scrollTop <= 0, atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
        return (dy > 0 && !atTop) || (dy < 0 && !atBottom);
      }
      el = el.parentElement;
    }
    var d = document.scrollingElement || document.documentElement;
    var top = d.scrollTop <= 0, bottom = d.scrollTop + d.clientHeight >= d.scrollHeight - 1;
    return (dy > 0 && !top) || (dy < 0 && !bottom);
  }
  document.addEventListener('touchstart', function(e){ y0 = e.touches[0] ? e.touches[0].clientY : 0; }, { passive: true });
  document.addEventListener('touchmove', function(e){
    if (e.touches.length !== 1) return;
    if (scroller(e.target, e.touches[0].clientY - y0)) return;
    if (e.cancelable) e.preventDefault();
  }, { passive: false });
})();
</script>`;

const DIAGRAM_ZOOM_SCRIPT = () => `<script>
(function(){
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
  // A visual scale (transform), NOT CSS zoom (4 Nov 2026). Under CSS zoom, iPad Safari sized
  // the "=" rows that hold a tall vector or fraction too short, so the rows ate into each
  // other ("the lines eat into each other") — the Mac's Chrome, at zoom 1, never showed it.
  // A transform leaves the layout at its natural size and only scales the picture.
  function setZoom(v){
    z = Math.min(2.5, Math.max(0.6, v));
    var b = document.body, big = z > 1, w = document.documentElement.clientWidth;
    b.style.boxSizing = 'border-box';
    b.style.zoom = '';
    b.style.transformOrigin = '0 0';
    b.style.transform = z === 1 ? '' : 'scale(' + z + ')';
    // zoomed in: keep the width, grow past the frame (slide sideways); zoomed out: re-wrap to use the room
    b.style.width = z === 1 ? '' : (big ? w : w / z) + 'px';
    b.style.overflowX = big ? 'visible' : '';
    window.__solZoom = z;
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

// The whole paper in one frame: show the page the panel names, and only then make THAT page's
// diagrams and extras (two jobs at a time, each page once). A page's work carries on in the
// background if the pen scrolls away; nothing is reloaded.
const PAGES_SCRIPT = (runId: string) => `<script>
(function(){
  var RUN = ${JSON.stringify(runId)};
  var sections = Array.prototype.slice.call(document.querySelectorAll('section.sol-page'));
  var none = document.querySelector('[data-none]');
  var queue = [], busy = 0, started = {};
  function pump(){
    while (busy < 2 && queue.length) { busy++; queue.shift()().catch(function(){}).then(function(){ busy--; pump(); }); }
  }
  function diagramJob(el){
    return function(){
      var q = el.getAttribute('data-gen');
      var t = setTimeout(function(){ el.innerHTML = '<div class="drawing">drawing a diagram…</div>'; }, 3000);
      return fetch('/api/admin/annotate-side/diagram', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ runId: RUN, q: q }) })
        .then(function(r){ return r.json(); })
        .then(function(d){
          clearTimeout(t);
          if (d && d.status === 'ok' && d.url) el.innerHTML = '<figure><img alt="diagram" src="' + d.url.replace(/"/g, '&quot;') + '"><figcaption>Diagram drawn for this solution</figcaption></figure>';
          else el.innerHTML = '';
        })
        .catch(function(){ clearTimeout(t); el.innerHTML = ''; });
    };
  }
  function extrasJob(sec, q){
    return function(){
      return fetch('/api/admin/annotate-side/extras', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ runId: RUN, q: q }) })
        .then(function(r){ return r.json(); })
        .then(function(d){
          if (!d || !d.itemHtml) return;
          var old = sec.querySelector('li.sol-q[data-q="' + q.replace(/"/g, '') + '"]');
          if (!old) return;
          var box = document.createElement('div'); box.innerHTML = d.itemHtml.trim();
          var li = box.querySelector('li'); if (!li) return;
          var num = old.querySelector('.sol-qnum'); var newNum = li.querySelector('.sol-qnum');
          if (num && newNum) newNum.textContent = num.textContent;
          var gen = old.querySelector('.sol-gen'); var slot = li.querySelector('.sol-gen');
          if (gen && slot) slot.replaceWith(gen);
          old.replaceWith(li);
          try { renderMathInElement(li, { delimiters: [{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false},{left:'\\(',right:'\\)',display:false},{left:'\\[',right:'\\]',display:true}], throwOnError: false, strict: false, trust: true }); } catch (e) {}
        })
        .catch(function(){});
    };
  }
  var typesetDone = {};
  // 📏 What the rows look like ON THIS DEVICE (4 Nov 2026: Adrian's iPad showed rows eating
  // into each other that the Mac's Chrome did not). For the page just shown: each line's box
  // against the maths it holds; posted to annotate_ink_log as kind 'log' so the next fix is
  // measured, not guessed. Only rows whose maths sticks out, plus the zoom and the widths.
  function reportLayout(sec, key){
    try {
      var rows = [], over = 0;
      Array.prototype.forEach.call(sec.querySelectorAll('.sol-line, .sol-align, .sol-check, .sol-final'), function(el){
        var b = el.getBoundingClientRect(), top = Infinity, bottom = -Infinity, n = 0;
        Array.prototype.forEach.call(el.querySelectorAll('.katex'), function(k){
          Array.prototype.forEach.call(k.querySelectorAll('.vlist-t, .base'), function(part){ var r = part.getBoundingClientRect(); if (r.height) { top = Math.min(top, r.top); bottom = Math.max(bottom, r.bottom); n++; } });
        });
        var out = n ? Math.max(0, b.top - top, bottom - b.bottom) : 0;
        if (out > 3) over++;
        if (out > 3 || rows.length < 3) rows.push({ cls: el.className, h: Math.round(b.height), mathTop: n ? Math.round(top - b.top) : null, mathH: n ? Math.round(bottom - top) : null, out: Math.round(out), text: (el.textContent || '').trim().slice(0, 30) });
      });
      var cs = getComputedStyle(document.body);
      fetch('/api/admin/annotate-log', { method: 'POST', credentials: 'include', keepalive: true, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId: ${JSON.stringify(runId)}, kind: 'log', ua: navigator.userAgent, payload: { solutionsLayout: { page: key, zoom: window.__solZoom || 1, transform: cs.transform, bodyZoom: cs.zoom, width: document.documentElement.clientWidth, inner: window.innerWidth + 'x' + window.innerHeight, dpr: window.devicePixelRatio, fontsReady: !!(document.fonts && document.fonts.check('12px KaTeX_Main')), rowsOver: over, rows: rows.slice(0, 12) } } }) }).catch(function(){});
    } catch (e) {}
  }
  function showPage(n){
    var key = String(n), sec = null;
    sections.forEach(function(s){ var on = s.getAttribute('data-page') === key; s.hidden = !on; if (on) sec = s; });
    if (none) none.hidden = !!sec;
    window.scrollTo(0, 0);
    // The maths of a page is typeset the first time the page is shown (4 Nov 2026) — the
    // whole paper at load was 17 pages of KaTeX on the iPad before the first one appeared.
    if (sec && !typesetDone[key]) {
      typesetDone[key] = true;
      try { renderMathInElement(sec, { delimiters: [{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false},{left:'\\(',right:'\\)',display:false},{left:'\\[',right:'\\]',display:true}], throwOnError: false, strict: false, trust: true }); } catch (e) {}
      setTimeout(function(){ reportLayout(sec, key); }, 700);
    }
    if (!sec || started[key]) return;
    started[key] = true;
    Array.prototype.forEach.call(sec.querySelectorAll('.sol-gen[data-gen]'), function(el){ queue.push(diagramJob(el)); });
    (sec.getAttribute('data-make') || '').split(',').filter(Boolean).forEach(function(q){ queue.push(extrasJob(sec, q)); });
    pump();
  }
  window.addEventListener('message', function(e){
    if (e.origin !== location.origin || !e.data || e.data.type !== 'show-page') return;
    showPage(Number(e.data.page));
  });
  window.__showPage = showPage;
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
  const pageParam = req.nextUrl.searchParams.get('page');
  const page = Number(pageParam);
  const all = pageParam === 'all';
  if (!/^[0-9a-f-]{36}$/i.test(runId) || (!all && (!Number.isInteger(page) || page < 0))) return new NextResponse('runId and page required', { status: 400 });
  const run = await loadSideRun(runId);
  if (!run) return new NextResponse('run not found', { status: 404 });
  if (all) {
    const pageIdxs = Object.keys(sideInfo(run).byPage).map(Number).filter((n) => Number.isInteger(n) && n >= 0).sort((a, b) => a - b);
    const sections: { page: number; title: string; make: string[]; items: SolutionsItem[] }[] = [];
    // eight pages at a time (was four, 4 Nov 2026 — a 17-page paper took five rounds of
    // bank reads, 1–2 s before the first byte): each one reads the bank
    for (let i = 0; i < pageIdxs.length; i += 8) {
      const built = await Promise.all(pageIdxs.slice(i, i + 8).map(async (p) => {
        const raw = await sideSolutionItems(run, p);
        const kept = await Promise.all(raw.items.map((it) => (it.qnum ? readSideExtras(runId, it.qnum) : Promise.resolve(null))));
        const items = raw.items.map((it, j) => applyExtras(it, kept[j]));
        const make = raw.items.filter((it, j) => it.qnum && !kept[j]).map((it) => it.qnum as string);
        const title = raw.questions.length ? `Page ${p + 1} · Q${raw.questions.join(', Q')}` : `Page ${p + 1}`;
        return { page: p, title, make, items };
      }));
      sections.push(...built.filter((b) => b.items.length));
    }
    const html = buildSolutionsHTML({ title: run.paper_name || 'This paper', items: [], sections, meta: 'Worked solutions', screen: true, screenCss: SCREEN_CSS, extraBody: BOUNCE_GUARD_SCRIPT + DIAGRAM_ZOOM_SCRIPT() + PAGES_SCRIPT(runId) });
    return new NextResponse(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
  }
  const raw = await sideSolutionItems(run, page);
  const { questions } = raw;
  // The typeset question + the marks on the lines, where already made; the rest are made
  // by the page script below and swapped in (2 Nov 2026).
  const kept = await Promise.all(raw.items.map((it) => (it.qnum ? readSideExtras(runId, it.qnum) : Promise.resolve(null))));
  const items = raw.items.map((it, i) => applyExtras(it, kept[i]));
  const toMake = raw.items.filter((it, i) => it.qnum && !kept[i]).map((it) => it.qnum as string);
  const title = questions.length ? `Page ${page + 1} · Q${questions.join(', Q')}` : `Page ${page + 1}`;
  const html = items.length
    ? buildSolutionsHTML({ title, items, meta: 'Worked solutions', screen: true, screenCss: SCREEN_CSS, extraBody: BOUNCE_GUARD_SCRIPT + DIAGRAM_SCRIPT(runId) + EXTRAS_SCRIPT(runId, toMake) })
    : buildSolutionsHTML({ title, items: [], meta: '', screen: true, screenCss: SCREEN_CSS, extraBody: BOUNCE_GUARD_SCRIPT + '<div class="sol-empty">No question was marked on this page.</div>' });
  return new NextResponse(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}
