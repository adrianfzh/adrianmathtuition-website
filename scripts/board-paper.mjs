// 🧑‍🏫 The shared board's page templates (SPEC-TUTOR-TOOLS §8 — Adrian, 5 Nov 2026: "do the 4 different
// kinds of templates you suggested + the paper types and the math pages"). Each is a 1000 × 1414 page
// (A4, the ink's default box), drawn here as SVG and written to public/board/<key>.png.
// The list the app shows is BOARD_PAPERS in src/lib/shared-board.ts — keep the keys the same.
// Run: node scripts/board-paper.mjs
import sharp from 'sharp';
const W = 1000, H = 1414;
const LINE = '#dbe3ec', SOFT = '#e8edf3', INK = '#64748b', TXT = '#94a3b8';
const F = 'font-family="Helvetica, Arial, sans-serif"';
const grid = (s, c = SOFT, x0 = 0, y0 = 0, x1 = W, y1 = H) => {
  let l = '';
  for (let x = x0 + s; x < x1; x += s) l += `<line x1="${x}" y1="${y0}" x2="${x}" y2="${y1}"/>`;
  for (let y = y0 + s; y < y1; y += s) l += `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}"/>`;
  return `<g stroke="${c}" stroke-width="1.2">${l}</g>`;
};
const text = (x, y, t, size = 22, fill = TXT, anchor = 'start', weight = 'normal') => `<text x="${x}" y="${y}" ${F} font-size="${size}" fill="${fill}" text-anchor="${anchor}" font-weight="${weight}">${t}</text>`;
const arrow = (x1, y1, x2, y2) => {
  const a = Math.atan2(y2 - y1, x2 - x1), s = 16;
  const p = (d) => `${x2 - s * Math.cos(a + d)},${y2 - s * Math.sin(a + d)}`;
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${INK}" stroke-width="2.4"/><polygon points="${x2},${y2} ${p(0.45)} ${p(-0.45)}" fill="${INK}"/>`;
};

const pages = {
  blank: '',
  squared: grid(40),
  lined: (() => { let l = ''; for (let y = 160; y < H - 40; y += 48) l += `<line x1="0" y1="${y}" x2="${W}" y2="${y}"/>`; return `<g stroke="${LINE}" stroke-width="1.4">${l}</g><line x1="110" y1="0" x2="110" y2="${H}" stroke="#f3b4b4" stroke-width="1.6"/>`; })(),
  dotted: (() => { let d = ''; for (let x = 40; x < W; x += 40) for (let y = 40; y < H; y += 40) d += `<circle cx="${x}" cy="${y}" r="1.9"/>`; return `<g fill="#c4ceda">${d}</g>`; })(),
  axes: grid(40) + arrow(60, 707, 950, 707) + arrow(500, 1340, 500, 70) + text(955, 742, 'x', 26, INK) + text(520, 80, 'y', 26, INK) + text(478, 735, 'O', 22, INK),
  coordinate: (() => {
    const u = 42, cx = 500, cy = 500, n = 10;
    let s = grid(u, '#e2e8f0', cx - n * u, cy - n * u, cx + n * u, cy + n * u);
    s += `<rect x="${cx - n * u}" y="${cy - n * u}" width="${2 * n * u}" height="${2 * n * u}" fill="none" stroke="${LINE}" stroke-width="1.4"/>`;
    s += arrow(cx - n * u - 10, cy, cx + n * u + 30, cy) + arrow(cx, cy + n * u + 10, cx, cy - n * u - 30);
    for (let i = -n; i <= n; i++) {
      if (!i) continue;
      s += `<line x1="${cx + i * u}" y1="${cy - 6}" x2="${cx + i * u}" y2="${cy + 6}" stroke="${INK}" stroke-width="1.6"/>` + text(cx + i * u, cy + 26, i, 15, INK, 'middle');
      s += `<line x1="${cx - 6}" y1="${cy - i * u}" x2="${cx + 6}" y2="${cy - i * u}" stroke="${INK}" stroke-width="1.6"/>` + text(cx - 12, cy - i * u + 5, i, 15, INK, 'end');
    }
    s += text(cx + n * u + 36, cy + 8, 'x', 24, INK) + text(cx + 10, cy - n * u - 30, 'y', 24, INK) + text(cx - 10, cy + 24, 'O', 16, INK, 'end');
    let l = ''; for (let y = 1010; y < H - 40; y += 48) l += `<line x1="40" y1="${y}" x2="${W - 40}" y2="${y}"/>`;
    return s + `<g stroke="${LINE}" stroke-width="1.4">${l}</g>`;
  })(),
  numberline: (() => {
    let s = '';
    for (let r = 0; r < 6; r++) {
      const y = 170 + r * 215, x0 = 70, x1 = 930, u = (x1 - x0) / 20;
      s += arrow(x0 - 30, y, x1 + 40, y) + `<line x1="${x0 - 30}" y1="${y}" x2="${x0 - 50}" y2="${y}" stroke="${INK}" stroke-width="2.4"/>`;
      for (let i = 0; i <= 20; i++) {
        const x = x0 + i * u, v = i - 10;
        s += `<line x1="${x}" y1="${y - (v % 5 ? 8 : 14)}" x2="${x}" y2="${y + (v % 5 ? 8 : 14)}" stroke="${INK}" stroke-width="1.8"/>` + text(x, y + 38, v, 17, INK, 'middle');
      }
    }
    return s;
  })(),
  geometry: (() => {
    let s = (() => { let d = ''; for (let x = 40; x < W; x += 40) for (let y = 40; y < H; y += 40) d += `<circle cx="${x}" cy="${y}" r="1.7"/>`; return `<g fill="#d5dde7">${d}</g>`; })();
    s += `<polygon points="200,600 800,600 420,160" fill="none" stroke="${INK}" stroke-width="2.4"/>` + text(180, 635, 'A', 26, INK) + text(805, 635, 'B', 26, INK) + text(410, 145, 'C', 26, INK);
    s += `<circle cx="500" cy="1030" r="260" fill="none" stroke="${INK}" stroke-width="2.4"/><circle cx="500" cy="1030" r="4" fill="${INK}"/>` + text(512, 1022, 'O', 24, INK);
    return s;
  })(),
  table: (() => {
    const x0 = 50, x1 = 950, y0 = 120, rows = 24, rh = 52, cols = 4, cw = (x1 - x0) / cols;
    let s = `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${rh}" fill="#f1f5f9"/>`;
    for (let r = 0; r <= rows; r++) s += `<line x1="${x0}" y1="${y0 + r * rh}" x2="${x1}" y2="${y0 + r * rh}" stroke="${LINE}" stroke-width="${r <= 1 ? 2 : 1.3}"/>`;
    for (let c = 0; c <= cols; c++) s += `<line x1="${x0 + c * cw}" y1="${y0}" x2="${x0 + c * cw}" y2="${y0 + rows * rh}" stroke="${LINE}" stroke-width="1.6"/>`;
    return s;
  })(),
  cornell: (() => {
    let s = text(50, 80, 'Topic:', 24, TXT) + `<line x1="130" y1="86" x2="640" y2="86" stroke="${LINE}" stroke-width="1.4"/>` + text(680, 80, 'Date:', 24, TXT) + `<line x1="750" y1="86" x2="950" y2="86" stroke="${LINE}" stroke-width="1.4"/>`;
    s += `<line x1="0" y1="120" x2="${W}" y2="120" stroke="${INK}" stroke-width="2"/><line x1="300" y1="120" x2="300" y2="1130" stroke="${INK}" stroke-width="2"/><line x1="0" y1="1130" x2="${W}" y2="1130" stroke="${INK}" stroke-width="2"/>`;
    let l = ''; for (let y = 210; y < 1130; y += 48) l += `<line x1="320" y1="${y}" x2="${W - 30}" y2="${y}"/>`;
    s += `<g stroke="${LINE}" stroke-width="1.3">${l}</g>`;
    s += text(30, 165, 'Key words &amp; questions', 22, TXT, 'start', 'bold') + text(330, 165, 'Notes', 22, TXT, 'start', 'bold') + text(30, 1175, 'Summary — in your own words', 22, TXT, 'start', 'bold');
    let m = ''; for (let y = 1225; y < H - 30; y += 48) m += `<line x1="30" y1="${y}" x2="${W - 30}" y2="${y}"/>`;
    return s + `<g stroke="${LINE}" stroke-width="1.3">${m}</g>`;
  })(),
  planner: (() => {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    let s = text(50, 80, 'Week of', 28, INK, 'start', 'bold') + `<line x1="175" y1="86" x2="560" y2="86" stroke="${LINE}" stroke-width="1.4"/>` + text(600, 80, 'Goal:', 24, TXT) + `<line x1="670" y1="86" x2="950" y2="86" stroke="${LINE}" stroke-width="1.4"/>`;
    const y0 = 120, h = (H - 60 - y0) / 7;
    days.forEach((d, i) => {
      const y = y0 + i * h;
      s += `<rect x="50" y="${y}" width="900" height="${h - 12}" rx="14" fill="none" stroke="${LINE}" stroke-width="1.6"/>` + text(70, y + 34, d, 22, INK, 'start', 'bold');
      for (let k = 1; k <= 2; k++) s += `<line x1="70" y1="${y + 34 + k * 46}" x2="930" y2="${y + 34 + k * 46}" stroke="${SOFT}" stroke-width="1.3"/>`;
    });
    return s;
  })(),
  checklist: (() => {
    let s = text(50, 90, 'To do', 34, INK, 'start', 'bold') + `<line x1="50" y1="110" x2="950" y2="110" stroke="${INK}" stroke-width="2"/>`;
    for (let y = 165; y < H - 40; y += 56) s += `<rect x="60" y="${y - 26}" width="30" height="30" rx="6" fill="none" stroke="${INK}" stroke-width="2"/><line x1="115" y1="${y + 6}" x2="950" y2="${y + 6}" stroke="${LINE}" stroke-width="1.3"/>`;
    return s;
  })(),
};

for (const [key, body] of Object.entries(pages)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#fff"/>${body}</svg>`;
  const info = await sharp(Buffer.from(svg)).png({ palette: true }).toFile(`public/board/${key}.png`);
  console.log(key, info.size);
}
