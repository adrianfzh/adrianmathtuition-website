const sharp = require('sharp');
const path = require('path');

const icons = [
  { letter: 'A', bg: '#1a365d', fg: '#FFF8E7', name: 'admin' },
  { letter: 'S', bg: '#F59E0B', fg: '#1a365d', name: 'schedule' },
  { letter: 'P', bg: '#15803D', fg: '#FFF8E7', name: 'progress' },
  { letter: '$', bg: '#9F1239', fg: '#FFF8E7', name: 'invoices' },
];

const sizes = [180, 192, 512];

// Pictorial icons (not a letter): each is a function of size returning SVG.
// mark-paper (3 Sep 2026, Adrian: "a better icon for web app for mark paper") —
// the admin navy "A" was shared by three tiles on his phone. This one is the
// marking pen: a cream sheet with a folded corner, ruled lines, and a bold red
// tick, on the red of the marker's own ink.
const pictorial = {
  'mark-paper': (size) => {
    const s = size, u = s / 100;
    const px = 24 * u, py = 14 * u, pw = 52 * u, ph = 72 * u, fold = 12 * u, r = 3 * u;
    const lines = [30, 40, 50].map(y => `<rect x="${px + 8 * u}" y="${y * u}" width="${pw - 16 * u}" height="${2.2 * u}" rx="${1.1 * u}" fill="#D6CBB5"/>`).join('');
    return `
      <svg width="${s}" height="${s}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${s}" height="${s}" fill="#C4342C"/>
        <path d="M${px + r},${py} H${px + pw - fold} L${px + pw},${py + fold} V${py + ph - r} a${r},${r} 0 0 1 -${r},${r} H${px + r} a${r},${r} 0 0 1 -${r},-${r} V${py + r} a${r},${r} 0 0 1 ${r},-${r} Z" fill="#FFF8E7"/>
        <path d="M${px + pw - fold},${py} V${py + fold} H${px + pw}" fill="#E8DFC8"/>
        ${lines}
        <path d="M${36 * u},${64 * u} L${46 * u},${76 * u} L${68 * u},${50 * u}" fill="none" stroke="#C4342C" stroke-width="${8.5 * u}" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
  },
};

const outDir = path.join(__dirname, '..', 'public', 'icons');

async function main() {
  for (const [name, draw] of Object.entries(pictorial)) {
    for (const size of sizes) {
      const outPath = path.join(outDir, `${name}-${size}.png`);
      await sharp(Buffer.from(draw(size))).png().toFile(outPath);
      console.log('wrote', outPath);
    }
  }
  if (process.argv.includes('--pictorial-only')) return;
  for (const icon of icons) {
    for (const size of sizes) {
      const fontSize = Math.round(size * 0.55);
      const svg = `
        <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
          <rect width="${size}" height="${size}" fill="${icon.bg}"/>
          <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central"
            font-family="system-ui,-apple-system,Helvetica,sans-serif"
            font-weight="700" font-size="${fontSize}" fill="${icon.fg}">${icon.letter}</text>
        </svg>`;
      const outPath = path.join(outDir, `${icon.name}-${size}.png`);
      await sharp(Buffer.from(svg)).png().toFile(outPath);
      console.log('wrote', outPath);
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
