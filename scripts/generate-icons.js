const sharp = require('sharp');
const path = require('path');

const icons = [
  { letter: 'A', bg: '#1a365d', fg: '#FFF8E7', name: 'admin' },
  { letter: 'S', bg: '#F59E0B', fg: '#1a365d', name: 'schedule' },
  { letter: 'P', bg: '#15803D', fg: '#FFF8E7', name: 'progress' },
];

const sizes = [180, 192, 512];

const outDir = path.join(__dirname, '..', 'public', 'icons');

async function main() {
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
