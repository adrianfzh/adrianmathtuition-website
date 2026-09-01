// Render the worked-solutions booklet to one tall PNG, for the back of the 🖼
// photos PDF.
//
// Kept apart from lib/solutions-booklet-html.ts (pure and tested) because this
// half touches the shared headless browser, and from the PDF route because that
// route must not grow another reason to fail. Same contract as
// lib/render-front-page.ts: FAIL SOFT — a marked paper without its booklet still
// has the -sol twins to fall back to (the route decides), and a paper that never
// assembled is a student left with nothing.
import { getBrowser } from './generate-pdf';
import { solutionsBookletHtml, type BookletInput } from './solutions-booklet-html';

/** A4 at 96dpi × 2 for print-sharp maths. */
const WIDTH = 794;
const SCALE = 2;

/**
 * The booklet as one tall PNG (the caller slices it into A4 chunks), or null if
 * anything at all goes wrong. Never throws.
 */
export async function renderSolutionsBookletPng(input: BookletInput): Promise<Buffer | null> {
  let page = null;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setViewport({ width: WIDTH, height: 1123, deviceScaleFactor: SCALE });
    // 'load', not networkidle0: idle tracking is unreliable against current local
    // Chrome (times out with zero requests pending — probed 2 Sep 2026), and the
    // real readiness gates are below anyway — the KaTeX poll and fonts.ready.
    // Deferred CDN scripts have executed by 'load', so auto-render can run.
    await page.setContent(solutionsBookletHtml(input), { waitUntil: 'load', timeout: 25_000 });
    // Wait for KaTeX auto-render to finish (the page sets window.__katexRendered) —
    // same poll as lib/render-marking.ts, because a screenshot taken mid-typeset
    // ships literal `$...$` to a student.
    await page.evaluate(() => {
      return new Promise<void>((resolve) => {
        if ((window as unknown as { __katexRendered?: boolean }).__katexRendered) return resolve();
        const start = Date.now();
        const iv = setInterval(() => {
          if ((window as unknown as { __katexRendered?: boolean }).__katexRendered || Date.now() - start > 8000) {
            clearInterval(iv);
            resolve();
          }
        }, 50);
      });
    });
    // Fonts: the files load lazily after first paint, so wait for the fontset
    // and then a short settle for the re-layout.
    await page.evaluate(() => (document as unknown as { fonts?: { ready?: Promise<unknown> } }).fonts?.ready);
    await new Promise((r) => setTimeout(r, 500));
    const shot = await page.screenshot({ type: 'png', fullPage: true });
    return Buffer.from(shot);
  } catch (e) {
    console.warn('[solutions-booklet] render skipped:', (e as Error).message);
    return null;
  } finally {
    if (page) { try { await page.close(); } catch { /* the browser is shared; a stuck page is not fatal */ } }
  }
}
