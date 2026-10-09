/**
 * src/lib/render-brand-masthead.ts
 *
 * The brand masthead for the PDF sheet (lib/render-bot-worksheet.ts) — the
 * same pieces the Word file prints (lib/pick-worksheet-brand-docx.ts), in
 * HTML: the four-cell masthead (logo · AdrianMath/TUITION · level line ·
 * subject block), the topic in Georgia 19 pt, PRACTICE · n questions · m
 * marks, Name / Date, and Puppeteer's header/footer templates for the footer
 * "AdrianMath Tuition · adrianmathtuition.com | Page x of y" and the running
 * header from page 2. Which colours and rules each series uses is
 * lib/worksheet-brand.ts; nothing here decides a design.
 *
 * Fonts: the render lambda has no Arial or Georgia, so Arimo (metric-compatible
 * Arial) and Gelasio (metric-compatible Georgia) ride along as data URIs, the
 * way Tinos does for the body. Word units → CSS: a rule's `sz` is eighths of a
 * point, a cell margin's dxa is twentieths of a point.
 */

import fs from 'fs';
import path from 'path';
import {
  brandDesign, practiceBits, runningSmall,
  type BrandLevel, type BrandPrint, type Rule, type SeriesDesign, type Palette,
} from '@/lib/worksheet-brand';

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── fonts and the logo, inlined ─────────────────────────────────────────────

function fontDir(pkg: string, probe: string): string {
  let dir = path.join(process.cwd(), 'node_modules', '@fontsource', pkg, 'files');
  try {
    const resolved: unknown = require.resolve(`@fontsource/${pkg}/files/${probe}`);
    if (typeof resolved === 'string') dir = path.dirname(resolved);
  } catch { /* keep the cwd fallback */ }
  return dir;
}

const FACES: Array<[family: string, pkg: string, style: string, weight: number, file: string]> = [
  ['Arimo', 'arimo', 'normal', 400, 'arimo-latin-400-normal.woff2'],
  ['Arimo', 'arimo', 'normal', 700, 'arimo-latin-700-normal.woff2'],
  ['Gelasio', 'gelasio', 'normal', 700, 'gelasio-latin-700-normal.woff2'],
];
let cachedFaces: string | null = null;
/** The @font-face rules (no <style> wrapper) for Arimo 400/700 and Gelasio 700; '' when the packages are missing. */
export function brandFontFaces(): string {
  if (cachedFaces !== null) return cachedFaces;
  try {
    cachedFaces = FACES.map(([family, pkg, style, weight, file]) => {
      const b64 = fs.readFileSync(path.join(fontDir(pkg, file), file)).toString('base64');
      return `@font-face{font-family:${family};font-style:${style};font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${b64}) format("woff2")}`;
    }).join('\n');
  } catch (e) {
    console.warn('[render-brand-masthead] brand fonts not inlined:', (e as Error).message);
    cachedFaces = '';
  }
  return cachedFaces;
}

const logoCache = new Map<string, string>();
/** The triangle-A mark from public/brand/ as a data URI; '' when it cannot be read. */
export function brandLogoDataUri(file: string): string {
  const hit = logoCache.get(file);
  if (hit !== undefined) return hit;
  let uri = '';
  try {
    uri = 'data:image/png;base64,' + fs.readFileSync(path.join(process.cwd(), 'public', 'brand', file)).toString('base64');
  } catch (e) {
    console.warn('[render-brand-masthead] logo not read:', (e as Error).message);
  }
  logoCache.set(file, uri);
  return uri;
}

// ── Word units → CSS ────────────────────────────────────────────────────────

const hex = (c: string) => '#' + c;
/** A Word rule as a CSS border: sz/8 pt; a double rule needs room to show two lines. */
function cssRule(r: Rule): string {
  const pt = r.sz / 8;
  switch (r.style) {
    case 'double': return `${Math.max(pt * 3, 2.25)}pt double ${hex(r.color)}`;
    case 'dotted': return `${pt}pt dotted ${hex(r.color)}`;
    case 'dashed': return `${pt}pt dashed ${hex(r.color)}`;
    // thick-thin is drawn as two rules by the caller (CSS has no such style); the thick one here
    case 'thickThinSmallGap': return `${pt}pt solid ${hex(r.color)}`;
    default: return `${pt}pt solid ${hex(r.color)}`;
  }
}
const dxaPt = (dxa: number) => dxa / 20;

// ── the masthead + title block ──────────────────────────────────────────────

export type BrandMastheadInput = {
  mode: BrandPrint; lv: BrandLevel; topic: string; subtitle: string; nQuestions: number; marks: number | null;
};

/** `{ css, html }` — the stylesheet rules and the markup that replace the regular title block. */
export function brandMastheadHtml(input: BrandMastheadInput): { css: string; html: string } {
  const { cfg, k } = brandDesign(input.lv.series, input.mode);
  const band = cfg.style === 'band';
  const ground = cfg.ground;
  const pad = dxaPt(ground ? 170 : 110);
  const sideL = dxaPt(ground ? 160 : cfg.style === 'edge' ? 200 : 0);
  const sideR = dxaPt(ground ? 160 : 0);
  const frame = cfg.frame.map((f) => `border-${f.side}:${cssRule(f)}`).join(';');
  const blockBorders = cfg.blockRules
    ? (['top', 'left', 'bottom', 'right'] as const).filter((s) => cfg.blockRules![s]).map((s) => `border-${s}:${cssRule({ ...cfg.blockRules![s]!, color: cfg.tagInk })}`).join(';')
    : '';
  const bar = cfg.titleBar ? `border-left:4.5pt solid ${hex(cfg.titleBar)};padding-left:8pt` : '';
  const logo = brandLogoDataUri(band ? k.bandMark : k.mark);
  const bits = practiceBits(input.nQuestions, input.marks);

  const css = `
  /* The brand masthead (lib/render-brand-masthead.ts): Word's 2.0 / 4.5 / 6.1 / 3.4 cm cells. */
  .bm{width:160mm;table-layout:fixed;border-collapse:collapse;margin:0;font-family:Arimo,Arial,Helvetica,sans-serif;line-height:1.15;${frame}}
  .bm td{padding:${pad}pt 0;vertical-align:middle;border:none;${ground ? `background:${hex(ground)};` : ''}}
  .bm td:first-child{padding-left:${sideL}pt}
  .bm td:last-child{padding-right:${sideR}pt}
  .bm-logo img{display:block;width:13.5mm;height:13.5mm}
  .bm-name{font-size:17pt;font-weight:700;color:${hex(band ? 'FFFFFF' : k.ink)}}
  .bm-name span{color:${hex(band ? k.bandMath : k.math)}}
  .bm-tuition{font-size:7.5pt;font-weight:700;letter-spacing:3pt;color:${hex(band ? k.pale : k.grey)}}
  .bm-level{text-align:right;padding-right:3.5mm !important}
  .bm-level-line{font-size:${input.lv.levelLine.length <= 22 ? 10 : 9}pt;font-weight:700;color:${hex(band ? 'FFFFFF' : k.ink)}}
  .bm-site{font-size:8pt;color:${hex(band ? k.pale : k.grey)}}
  .bm-block{text-align:center;${cfg.block ? `background:${hex(cfg.block)} !important;` : ''}${blockBorders}}
  .bm-tag{font-size:17pt;font-weight:700;letter-spacing:0.5pt;color:${hex(cfg.tagInk)}}
  .bm-small{font-size:7pt;font-weight:700;letter-spacing:2pt;color:${hex(cfg.tagInk)}}
  .bm-topic{font-family:Gelasio,Georgia,serif;font-size:19pt;font-weight:700;line-height:1.15;color:${hex(k.ink)};margin:12pt 0 1pt;${bar}}
  .bm-practice{font-family:Arimo,Arial,Helvetica,sans-serif;font-size:9pt;line-height:1.15;color:${hex(k.grey)};margin:0 0 ${input.subtitle ? 1 : 4}pt;${bar}}
  .bm-practice b{color:${hex(cfg.accent)};letter-spacing:1pt}
  .bm-subtitle{font-family:Arimo,Arial,Helvetica,sans-serif;font-size:9pt;line-height:1.15;color:${hex(k.grey)};margin:0 0 4pt;${bar}}
  .bm-name-date{font-family:Arimo,Arial,Helvetica,sans-serif;font-size:8.5pt;line-height:1.15;color:${hex(k.grey)};border-bottom:0.5pt solid ${hex(k.rule)};padding-bottom:6pt;margin-bottom:8pt}
  .bm-name-date span{color:${hex(k.rule)}}
  `;
  const html = `
  <table class="bm"><tr>
    <td class="bm-logo" style="width:20mm">${logo ? `<img src="${logo}" alt="">` : ''}</td>
    <td class="bm-word" style="width:45mm"><div class="bm-name">Adrian<span>Math</span></div><div class="bm-tuition">TUITION</div></td>
    <td class="bm-level" style="width:61mm"><div class="bm-level-line">${esc(input.lv.levelLine)}</div><div class="bm-site">adrianmathtuition.com</div></td>
    <td class="bm-block" style="width:34mm"><div class="bm-tag">${esc(cfg.tag)}</div><div class="bm-small">${esc(input.lv.small)}</div></td>
  </tr></table>
  <div class="bm-topic">${esc(input.topic)}</div>
  <div class="bm-practice"><b>PRACTICE</b>${bits.length ? `&nbsp;&nbsp;&nbsp;·&nbsp;&nbsp;&nbsp;${bits.map(esc).join('&nbsp;&nbsp;&nbsp;·&nbsp;&nbsp;&nbsp;')}` : ''}</div>
  ${input.subtitle ? `<div class="bm-subtitle">${esc(input.subtitle)}</div>` : ''}
  <div class="bm-name-date">Name <span>${'_'.repeat(38)}</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Date <span>${'_'.repeat(16)}</span></div>
  `;
  return { css, html };
}

// ── Puppeteer header / footer templates ─────────────────────────────────────

function templateShell(inner: string, k: Palette): string {
  // Templates get no page CSS: fonts and colours go in here. The page's own
  // left/right margins (25 mm) are repeated so the line sits over the text.
  return `<style>${brandFontFaces()}</style>
<div style="width:100%;margin:0 25mm;padding:0;font-family:Arimo,Arial,Helvetica,sans-serif;font-size:8pt;line-height:1.2;color:#${k.grey};-webkit-print-color-adjust:exact">${inner}</div>`;
}

/** Every page: AdrianMath Tuition · adrianmathtuition.com | Page x of y, over a hairline. */
export function brandFooterTemplate(mode: BrandPrint, lv: BrandLevel): string {
  const { k } = brandDesign(lv.series, mode);
  return templateShell(
    `<div style="display:flex;justify-content:space-between;border-top:0.5pt solid #${k.rule};padding-top:2.5pt">` +
    `<div><b style="color:#${k.ink}">AdrianMath Tuition</b>&nbsp;&nbsp;·&nbsp;&nbsp;adrianmathtuition.com</div>` +
    `<div>Page <span class="pageNumber"></span> of <span class="totalPages"></span></div></div>`, k);
}

/** Page 2 onward: AdrianMath · topic | SERIES · level, over the series' rule. */
export function brandHeaderTemplate(mode: BrandPrint, lv: BrandLevel, topic: string): string {
  const { cfg, k } = brandDesign(lv.series, mode);
  const small = runningSmall(lv.small);
  const r = cfg.runRule;
  const thin = r.style === 'thickThinSmallGap' ? `<div style="border-top:${r.sz / 16}pt solid #${r.color};margin-top:1.5pt"></div>` : '';
  return templateShell(
    `<div style="padding-top:9mm"><div style="display:flex;justify-content:space-between;border-bottom:${cssRule(r)};padding-bottom:2.5pt">` +
    `<div><b style="color:#${k.ink}">Adrian</b><b style="color:#${k.math}">Math</b>&nbsp;&nbsp;·&nbsp;&nbsp;${esc(topic)}</div>` +
    `<div><b style="color:#${cfg.accent};font-size:8.5pt;letter-spacing:0.5pt">${esc(cfg.tag)}</b>${small ? `&nbsp;&nbsp;·&nbsp;&nbsp;${esc(small)}` : ''}</div></div>${thin}</div>`, k);
}

/** An empty header template (the title page has no running header). */
export const EMPTY_TEMPLATE = '<span></span>';

/** The design's palette, for the stylesheet's answer colour (mono drains it). */
export function brandPalette(mode: BrandPrint, lv: BrandLevel): { cfg: SeriesDesign; k: Palette } {
  return brandDesign(lv.series, mode);
}
