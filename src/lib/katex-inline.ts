/**
 * src/lib/katex-inline.ts
 *
 * Self-contained KaTeX for Puppeteer renderers — no network fetch for maths.
 *
 * render-paper-pdf.ts and render-solutions-pdf.ts used to point Puppeteer at
 * jsDelivr for katex.min.css / katex.min.js / auto-render.min.js and then wait
 * for `networkidle0` before printing. That's a real network dependency inside
 * a cold serverless function (a jsDelivr blip = a broken PDF) and `networkidle0`
 * is also the wrong signal — it only means "no requests in flight", not "KaTeX
 * has actually finished typesetting the page".
 *
 * This module inlines the installed `katex` npm package (0.16.45) straight
 * into the page: the stylesheet with every font base64-embedded (so the CSS
 * never issues a font `url()` fetch either), then the katex.min.js and
 * auto-render.min.js sources verbatim. `waitForPageReady` replaces
 * `networkidle0` with the real readiness signal: the auto-render pass has run
 * (`window.__katexDone`), the fonts are loaded (`document.fonts.ready`), and
 * every `<img>` on the page has settled (loaded or errored).
 */
import fs from 'fs';
import path from 'path';
import type { Page } from 'puppeteer-core';

/** Built once per process — reading + base64-inlining the fonts is not free. */
let cachedHead: string | null = null;

/**
 * katex.min.js / auto-render.min.js are inlined verbatim inside a `<script>`
 * tag. Neither currently contains the literal `</script`, but if a future
 * katex version ever did, it would prematurely close the tag and truncate the
 * page. Split it defensively so that can never happen.
 */
function escapeScriptClose(js: string): string {
  return js.replace(/<\/script/gi, '<\\/script');
}

function buildHead(): string {
  // Inside a webpack bundle `require.resolve` returns a module ID (a number), not
  // a path — katex is listed in next.config serverExternalPackages so it stays a
  // real Node require on Vercel, and this guard keeps a bundled build from taking
  // the whole route down (5 Sep 2026: every /api/admin/questions action 500'd).
  const resolved: unknown = require.resolve('katex/package.json');
  const pkgDir = typeof resolved === 'string' ? path.dirname(resolved) : path.join(process.cwd(), 'node_modules', 'katex');
  const distDir = path.join(pkgDir, 'dist');
  const fontsDir = path.join(distDir, 'fonts');

  let css = fs.readFileSync(path.join(distDir, 'katex.min.css'), 'utf8');

  // Inline every woff2 referenced by url(fonts/<name>.woff2) as a base64 data
  // URI — nothing needs to load over the wire, and headless Chrome always
  // prefers woff2 when it's offered first anyway.
  css = css.replace(/url\(fonts\/([^)]+\.woff2)\)/g, (_match, filename: string) => {
    const b64 = fs.readFileSync(path.join(fontsDir, filename)).toString('base64');
    return `url(data:font/woff2;base64,${b64})`;
  });
  // Drop the woff/truetype fallback entries from each src: list — the woff2
  // entry above is now a data URI, so these are dead weight (and would be
  // network fetches if ever left as-is).
  css = css.replace(/,url\(fonts\/[^)]+\.woff\)\s*format\("woff"\)/g, '');
  css = css.replace(/,url\(fonts\/[^)]+\.ttf\)\s*format\("truetype"\)/g, '');

  const katexJs = escapeScriptClose(fs.readFileSync(path.join(distDir, 'katex.min.js'), 'utf8'));
  const autoRenderJs = escapeScriptClose(
    fs.readFileSync(path.join(distDir, 'contrib', 'auto-render.min.js'), 'utf8'),
  );

  return `<style>${css}</style>\n<script>${katexJs}</script>\n<script>${autoRenderJs}</script>`;
}

/** HTML for `<head>`: inlined KaTeX stylesheet (fonts embedded) + katex.min.js
 * + auto-render.min.js. Does NOT call renderMathInElement — that's
 * `katexAutoRenderScript()`, placed separately just before `</body>` so it
 * runs against a fully-parsed DOM. */
export function katexInlineHead(): string {
  if (cachedHead === null) cachedHead = buildHead();
  return cachedHead;
}

/** Inline `<script>` for just before `</body>`: runs auto-render over
 * `document.body` with the house delimiter set, then stamps
 * `window.__katexDone = true` (even on error) so `waitForPageReady` has a
 * real completion signal to poll for. */
export function katexAutoRenderScript(): string {
  return `<script>
(function () {
  function run() {
    try {
      renderMathInElement(document.body, {
        delimiters: [
          {left:'$$',right:'$$',display:true},
          {left:'$',right:'$',display:false},
          {left:'\\\\(',right:'\\\\)',display:false},
          {left:'\\\\[',right:'\\\\]',display:true}
        ],
        throwOnError: false,
        strict: false,
        trust: true
      });
    } finally {
      window.__katexDone = true;
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
</script>`;
}

/**
 * Real page-readiness wait, replacing `waitUntil: 'networkidle0'`: KaTeX has
 * finished (or timed out), web fonts are loaded, and every `<img>` has
 * settled. Call after `page.setContent(html, { waitUntil: 'load' })`.
 */
export async function waitForPageReady(
  page: Page,
  opts?: { katexTimeoutMs?: number },
): Promise<void> {
  const katexTimeoutMs = opts?.katexTimeoutMs ?? 8000;

  await page.evaluate(
    (timeoutMs) =>
      new Promise<void>((resolve) => {
        const w = window as unknown as Record<string, boolean>;
        if (w.__katexDone) return resolve();
        const t0 = Date.now();
        const iv = setInterval(() => {
          if (w.__katexDone || Date.now() - t0 > timeoutMs) {
            clearInterval(iv);
            resolve();
          }
        }, 50);
      }),
    katexTimeoutMs,
  );

  await page.evaluate(() => document.fonts?.ready);

  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const imgs = Array.from(document.querySelectorAll('img'));
        if (imgs.length === 0) return resolve();
        let remaining = imgs.length;
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        const timer = setTimeout(finish, 10000);
        const onOne = () => {
          remaining -= 1;
          if (remaining <= 0) {
            clearTimeout(timer);
            finish();
          }
        };
        imgs.forEach((el) => {
          const img = el as HTMLImageElement;
          if (img.complete) {
            onOne();
          } else {
            img.addEventListener('load', onOne, { once: true });
            img.addEventListener('error', onOne, { once: true });
          }
        });
      }),
  );
}
