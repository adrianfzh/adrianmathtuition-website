#!/usr/bin/env node
// Student-app icon + iOS splash generator (item 14 of the "professional app"
// list, 7 Sep 2026). Draws the AdrianMath student icon as SVG in code and
// renders it with sharp into:
//   public/icons/app-180.png          apple-touch-icon (iOS masks it itself)
//   public/icons/app-192.png, -512    manifest "any" icons (rounded square)
//   public/icons/app-maskable-512.png manifest "maskable" (full bleed, safe zone)
//   public/splash/app-<w>x<h>.png     apple-touch-startup-image per device
//   src/lib/app-splash.ts             the startupImage list the /app layout uses
// Re-run after changing the drawing:  node scripts/app-icons/generate.mjs
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ICONS = join(ROOT, 'public', 'icons');
const SPLASH = join(ROOT, 'public', 'splash');
mkdirSync(ICONS, { recursive: true });
mkdirSync(SPLASH, { recursive: true });

// Brand colours — the same navy/amber/cream as src/app/globals.css and the
// student manifest (theme_color #142952, background_color #fffcf5).
const NAVY = '#142952';
const NAVY_DEEP = '#0e1f40';
const AMBER = '#f4c025';
const CREAM = '#fffcf5';

// The drawing on a 1024 canvas. `scale` grows the motif for icons iOS/Android
// show unmasked; the maskable variant keeps everything inside the 80% safe
// circle. `radius` rounds the background (0 = full bleed).
function iconSvg({ scale = 1, radius = 0 } = {}) {
  const s = scale;
  const t = (x, y) => `translate(${512 - 512 * s} ${512 - 512 * s}) scale(${s})`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${NAVY}"/>
      <stop offset="1" stop-color="${NAVY_DEEP}"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#000" flood-opacity="0.28"/>
    </filter>
  </defs>
  <rect width="1024" height="1024" rx="${radius}" ry="${radius}" fill="url(#bg)"/>
  <g transform="${t()}">
    <!-- the paper: a cream sheet, slightly tilted, with three lines of working -->
    <g transform="rotate(-7 512 512)" filter="url(#shadow)">
      <rect x="292" y="212" width="440" height="560" rx="34" fill="${CREAM}"/>
      <g stroke="${NAVY}" stroke-width="22" stroke-linecap="round" opacity="0.28">
        <line x1="352" y1="316" x2="600" y2="316"/>
        <line x1="352" y1="396" x2="668" y2="396"/>
        <line x1="352" y1="476" x2="560" y2="476"/>
      </g>
    </g>
    <!-- the tick: amber over a navy keyline so it stays crisp across the paper -->
    <g fill="none" stroke-linecap="round" stroke-linejoin="round">
      <path d="M318 572 L462 716 L776 352" stroke="${NAVY}" stroke-width="176"/>
      <path d="M318 572 L462 716 L776 352" stroke="${AMBER}" stroke-width="118"/>
    </g>
  </g>
</svg>`;
}

async function png(svg, size, out) {
  await sharp(Buffer.from(svg), { density: 300 }).resize(size, size).png({ compressionLevel: 9 }).toFile(out);
}

// Devices whose Safari shows a startup image (portrait). CSS points × DPR.
// Order does not matter — iOS picks the first media query that matches.
const DEVICES = [
  // iPhone
  { w: 440, h: 956, dpr: 3, name: 'iPhone 16 Pro Max / 17 Pro Max' },
  { w: 402, h: 874, dpr: 3, name: 'iPhone 16 Pro / 17 / 17 Pro' },
  { w: 420, h: 912, dpr: 3, name: 'iPhone Air' },
  { w: 430, h: 932, dpr: 3, name: 'iPhone 14 Pro Max / 15 Pro Max / 15 Plus / 16 Plus' },
  { w: 393, h: 852, dpr: 3, name: 'iPhone 14 Pro / 15 / 15 Pro / 16' },
  { w: 428, h: 926, dpr: 3, name: 'iPhone 12 Pro Max / 13 Pro Max / 14 Plus' },
  { w: 390, h: 844, dpr: 3, name: 'iPhone 12 / 13 / 14' },
  { w: 375, h: 812, dpr: 3, name: 'iPhone X / XS / 11 Pro / 12 mini / 13 mini' },
  { w: 414, h: 896, dpr: 3, name: 'iPhone XS Max / 11 Pro Max' },
  { w: 414, h: 896, dpr: 2, name: 'iPhone XR / 11' },
  { w: 414, h: 736, dpr: 3, name: 'iPhone 6+ / 7+ / 8+' },
  { w: 375, h: 667, dpr: 2, name: 'iPhone 6 / 7 / 8 / SE 2 / SE 3' },
  // iPad
  { w: 1032, h: 1376, dpr: 2, name: 'iPad Pro 13 (M4)' },
  { w: 1024, h: 1366, dpr: 2, name: 'iPad Pro 12.9' },
  { w: 834, h: 1210, dpr: 2, name: 'iPad Pro 11 (M4)' },
  { w: 834, h: 1194, dpr: 2, name: 'iPad Pro 11' },
  { w: 820, h: 1180, dpr: 2, name: 'iPad Air 4/5/11", iPad 10th/11th' },
  { w: 834, h: 1112, dpr: 2, name: 'iPad Pro 10.5 / Air 3' },
  { w: 810, h: 1080, dpr: 2, name: 'iPad 7/8/9 (10.2")' },
  { w: 768, h: 1024, dpr: 2, name: 'iPad 9.7 / mini 5' },
  { w: 744, h: 1133, dpr: 2, name: 'iPad mini 6/7' },
];

// Splash: cream page, the icon as an iOS-style rounded tile, the wordmark
// beneath. Everything is sized from the shorter side so iPhone and iPad agree.
function splashSvg(pw, ph, dpr) {
  const short = Math.min(pw, ph);
  const tile = Math.round(short * 0.30);
  const r = Math.round(tile * 0.225);
  const cx = pw / 2;
  const cy = ph * 0.44;
  const font = Math.round(short * 0.085);
  const sub = Math.round(short * 0.038);
  const x0 = cx - tile / 2;
  const y0 = cy - tile / 2;
  const k = tile / 1024;
  // The icon drawing inlined at tile scale (no <image>, so it is one raster pass).
  const inner = iconSvg({ scale: 1.1, radius: 0 })
    .replace(/^[\s\S]*?<rect width="1024"[^>]*\/>/, '')
    .replace(/<\/svg>\s*$/, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${pw} ${ph}" width="${pw * dpr}" height="${ph * dpr}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${NAVY}"/>
      <stop offset="1" stop-color="${NAVY_DEEP}"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#000" flood-opacity="0.28"/>
    </filter>
    <clipPath id="tile"><rect x="${x0}" y="${y0}" width="${tile}" height="${tile}" rx="${r}" ry="${r}"/></clipPath>
    <filter id="tileShadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="${Math.round(tile * 0.04)}" stdDeviation="${Math.round(tile * 0.05)}" flood-color="${NAVY}" flood-opacity="0.22"/>
    </filter>
  </defs>
  <rect width="${pw}" height="${ph}" fill="${CREAM}"/>
  <rect x="${x0}" y="${y0}" width="${tile}" height="${tile}" rx="${r}" ry="${r}" fill="url(#bg)" filter="url(#tileShadow)"/>
  <g clip-path="url(#tile)">
    <g transform="translate(${x0} ${y0}) scale(${k})">${inner}</g>
  </g>
  <text x="${cx}" y="${Math.round(cy + tile / 2 + font * 1.35)}" text-anchor="middle" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-weight="800" font-size="${font}" fill="${NAVY}" letter-spacing="-0.5">AdrianMath</text>
  <text x="${cx}" y="${Math.round(cy + tile / 2 + font * 1.35 + sub * 1.9)}" text-anchor="middle" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-weight="500" font-size="${sub}" fill="${NAVY}" opacity="0.62">Hand in · get it back marked · practise</text>
</svg>`;
}

async function main() {
  // Icons
  await png(iconSvg({ scale: 1.12, radius: 0 }), 180, join(ICONS, 'app-180.png'));
  await png(iconSvg({ scale: 1.12, radius: 200 }), 192, join(ICONS, 'app-192.png'));
  await png(iconSvg({ scale: 1.12, radius: 200 }), 512, join(ICONS, 'app-512.png'));
  await png(iconSvg({ scale: 1.0, radius: 0 }), 512, join(ICONS, 'app-maskable-512.png'));
  // A big preview for eyeballing
  await png(iconSvg({ scale: 1.12, radius: 200 }), 1024, join(ICONS, 'app-1024.png'));

  // Splash images
  const entries = [];
  for (const d of DEVICES) {
    const W = d.w * d.dpr, H = d.h * d.dpr;
    const file = `app-${W}x${H}.png`;
    await sharp(Buffer.from(splashSvg(d.w, d.h, d.dpr)), { density: 72 * d.dpr })
      .resize(W, H)
      .png({ compressionLevel: 9, palette: true })
      .toFile(join(SPLASH, file));
    entries.push({
      url: `/splash/${file}`,
      media: `screen and (device-width: ${d.w}px) and (device-height: ${d.h}px) and (-webkit-device-pixel-ratio: ${d.dpr}) and (orientation: portrait)`,
      name: d.name,
    });
    process.stdout.write(`  splash ${file}  (${d.name})\n`);
  }

  // The list the /app layout reads — generated, committed, tested.
  const ts = `// GENERATED by scripts/app-icons/generate.mjs — do not edit by hand.
// iOS shows one of these behind the student app while it launches from the
// Home Screen; Safari picks the first media query that matches the device.
export type StartupImage = { url: string; media: string };

export const APP_STARTUP_IMAGES: StartupImage[] = [
${entries.map((e) => `  // ${e.name}\n  { url: '${e.url}', media: '${e.media}' },`).join('\n')}
];
`;
  writeFileSync(join(ROOT, 'src', 'lib', 'app-splash.ts'), ts);
  process.stdout.write(`done: 5 icons, ${entries.length} splash images, src/lib/app-splash.ts\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
