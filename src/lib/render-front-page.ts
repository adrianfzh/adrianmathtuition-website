// Render the front-page analysis to a PNG, for prepending to the marked PDF.
//
// Kept apart from lib/front-page-html.ts (which is pure and tested) because this
// half touches the shared headless browser, and from the PDF route because that
// route must not grow a second reason to fail. The contract here is the whole
// point: FAIL SOFT. A marked paper without its front page is still a marked
// paper; a marked paper that never assembled because the analysis timed out is a
// student left with nothing.
import { getBrowser } from './generate-pdf';
import { frontPageHtml, type FrontPageInput } from './front-page-html';

/** A4 at 96dpi × 2 for print-sharp text. */
const WIDTH = 794;
const SCALE = 2;

/**
 * The analysis as a PNG, or null if anything at all goes wrong.
 *
 * Never throws. Every caller is assembling a document a student is waiting for,
 * and none of them should have to decide what to do about a missing cover.
 */
export async function renderFrontPagePng(input: FrontPageInput): Promise<Buffer | null> {
  let page = null;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setViewport({ width: WIDTH, height: 1123, deviceScaleFactor: SCALE });
    await page.setContent(frontPageHtml(input), { waitUntil: 'networkidle0', timeout: 20_000 });
    // The page is one flex column with min-height 297mm, so a short analysis
    // still fills an A4 sheet and a long one grows past it rather than clipping.
    const shot = await page.screenshot({ type: 'png', fullPage: true });
    return Buffer.from(shot);
  } catch (e) {
    console.warn('[front-page] render skipped:', (e as Error).message);
    return null;
  } finally {
    if (page) { try { await page.close(); } catch { /* the browser is shared; a stuck page is not fatal */ } }
  }
}
