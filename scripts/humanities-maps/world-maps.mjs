// Draw the Geography world maps (SPEC-HUMANITIES.md §B maps, 7 Oct 2026) from
// Natural Earth land outlines (public domain, via the `world-atlas` package).
// Run where world-atlas, topojson-client and d3-geo are installed:
//   node scripts/humanities-maps/world-maps.mjs <out dir>
// It writes plain SVG files; the website needs none of these packages at run time.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(path.join(process.cwd(), 'x.js'));
const { feature } = require('topojson-client');
const { geoNaturalEarth1, geoPath } = require('d3-geo');
const land = feature(require('world-atlas/land-110m.json'), require('world-atlas/land-110m.json').objects.land);

const W = 340, H = 196, NAVY = '#1e2a4a', SEA = '#9cc7e0', LAND = '#cdb58a';
const FONT = 'font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif"';
const proj = geoNaturalEarth1().fitExtent([[4, 6], [W - 4, H - 6]], { type: 'Sphere' });
const gp = geoPath(proj);
const P = (lon, lat) => proj([lon, lat]).map(v => v.toFixed(1)).join(',');
/** A line of latitude, as an SVG path. */
const parallel = lat => 'M' + Array.from({ length: 73 }, (_, i) => P(-180 + i * 5, lat)).join('L');
/** A band between two latitudes across the whole map. */
const band = (a, b) => 'M' + [...Array.from({ length: 73 }, (_, i) => P(-180 + i * 5, a)), ...Array.from({ length: 73 }, (_, i) => P(180 - i * 5, b))].join('L') + 'Z';
/** A box of ocean between two longitudes and two latitudes (lon2 may pass 180). */
const box = (lon1, lon2, lat1, lat2) => {
  const xs = []; for (let l = lon1; l <= lon2; l += 5) xs.push(l > 180 ? l - 360 : l);
  // A box that crosses the date line is drawn as two pieces.
  if (lon2 > 180) return box(lon1, 180, lat1, lat2) + box(-180, lon2 - 360, lat1, lat2);
  const top = xs.map(l => P(l, lat2)), bot = xs.slice().reverse().map(l => P(l, lat1));
  return 'M' + [...top, ...bot].join('L') + 'Z';
};
const letter = (lon, lat, ch, dx = 0, dy = 0) => { const [x, y] = proj([lon, lat]); return `<circle cx="${(x + dx).toFixed(1)}" cy="${(y + dy).toFixed(1)}" r="8" fill="${NAVY}"/><text x="${(x + dx).toFixed(1)}" y="${(y + dy + 3.6).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="700" fill="#fff" ${FONT}>${ch}</text>`; };
const lineLabel = (lat, text, lon = -176) => { const [x, y] = proj([lon, lat]); return `<text x="${(x + 2).toFixed(1)}" y="${(y - 2).toFixed(1)}" font-size="10" font-weight="600" fill="${NAVY}" stroke="#fff" stroke-width="2.6" paint-order="stroke" ${FONT}>${text}</text>`; };
const track = pts => `<polyline points="${pts.map(([a, b]) => P(a, b)).join(' ')}" fill="none" stroke="${NAVY}" stroke-width="1.3" marker-end="url(#ah)"/>`;
const head = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="${NAVY}"/></marker><clipPath id="globe"><path d="${gp({ type: 'Sphere' })}"/></clipPath></defs><rect width="${W}" height="${H}" fill="#fff"/>`;
const sphere = fill => `<path d="${gp({ type: 'Sphere' })}" fill="${fill}" stroke="${NAVY}" stroke-width="1"/>`;
const landPath = `<path d="${gp(land)}" fill="${LAND}" stroke="${NAVY}" stroke-width="0.35"/>`;
const dashed = lat => `<path d="${parallel(lat)}" fill="none" stroke="${NAVY}" stroke-width="0.6" stroke-dasharray="3 2"/>`;

const maps = {
  // 1. The plain base map: land, sea, the Equator and the two Tropics.
  'world-base': head + sphere(SEA) + landPath + `<path d="${parallel(0)}" fill="none" stroke="${NAVY}" stroke-width="0.8"/>` + dashed(23.5) + dashed(-23.5)
    + lineLabel(0, 'Equator') + lineLabel(23.5, 'Tropic of Cancer') + lineLabel(-23.5, 'Tropic of Capricorn') + '</svg>',

  // 2. The three temperature zones by latitude. A = between the Tropics, B = between a Tropic and a polar circle, C = beyond a polar circle.
  'world-latitude-zones': head + sphere('#fff') + `<g clip-path="url(#globe)">`
    + `<path d="${band(-23.5, 23.5)}" fill="#f3c9a0"/><path d="${band(23.5, 66.5)}" fill="#dfe9c9"/><path d="${band(-66.5, -23.5)}" fill="#dfe9c9"/><path d="${band(66.5, 90)}" fill="#d5e3ee"/><path d="${band(-90, -66.5)}" fill="#d5e3ee"/></g>`
    + `<path d="${gp(land)}" fill="none" stroke="${NAVY}" stroke-width="0.5"/>` + `<path d="${gp({ type: 'Sphere' })}" fill="none" stroke="${NAVY}" stroke-width="1"/>`
    + `<path d="${parallel(0)}" fill="none" stroke="${NAVY}" stroke-width="0.8"/>` + [23.5, -23.5, 66.5, -66.5].map(dashed).join('')
    + lineLabel(0, 'Equator') + lineLabel(23.5, 'Tropic of Cancer') + lineLabel(-23.5, 'Tropic of Capricorn') + lineLabel(66.5, 'Arctic Circle', -176) + lineLabel(-66.5, 'Antarctic Circle', -176)
    + letter(-30, 10, 'A') + letter(-30, 45, 'B') + letter(-30, -45, 'B') + letter(60, 77, 'C') + letter(60, -78, 'C') + '</svg>',

  // 3. Where tropical cyclones form (shaded sea) and the paths they usually take (arrows). None form within about 5 degrees of the Equator.
  'world-cyclone-zones': head + sphere(SEA) + `<g clip-path="url(#globe)" fill="#c0442d" fill-opacity="0.45">`
    + [box(-95, -20, 8, 30), box(-140, -92, 8, 24), box(118, 180, 6, 30), box(52, 96, 6, 22), box(40, 100, -25, -6), box(104, 210, -25, -6)].map(d => `<path d="${d}"/>`).join('') + '</g>'
    + landPath + `<path d="${parallel(0)}" fill="none" stroke="${NAVY}" stroke-width="0.8"/>` + dashed(23.5) + dashed(-23.5)
    + lineLabel(0, 'Equator') + lineLabel(23.5, 'Tropic of Cancer') + lineLabel(-23.5, 'Tropic of Capricorn')
    + track([[-35, 13], [-55, 16], [-70, 22], [-76, 31]]) + track([[160, 11], [140, 15], [128, 22], [128, 31]]) + track([[-100, 12], [-112, 16], [-118, 21]])
    + track([[91, 7], [88, 13], [89, 20]]) + track([[80, -10], [62, -14], [52, -20], [50, -27]]) + track([[175, -10], [160, -14], [154, -20], [158, -28]])
    + letter(-38, 26, 'A', 0, -9) + letter(165, 27, 'B', 0, -9) + letter(78, -24, 'C', 0, 12) + '</svg>',
};
// 4. The plate boundaries (optional third argument: the path to PB2002_boundaries.json —
//    Peter Bird's 2003 model as GeoJSON, from github.com/fraxen/tectonicplates, Open Data Commons
//    Attribution licence; the credit line is printed on the map).
const platesFile = process.argv[3];
if (platesFile) {
  const pb = JSON.parse(fs.readFileSync(platesFile, 'utf8'));
  // Every second point is plenty at this size.
  const thin = { type: 'FeatureCollection', features: pb.features.map(f => ({ ...f, geometry: { ...f.geometry, coordinates: f.geometry.coordinates.filter((_, i, a) => i % 2 === 0 || i === a.length - 1) } })) };
  maps['world-plate-boundaries'] = head + sphere(SEA) + landPath
    + `<path d="${gp(thin)}" fill="none" stroke="#c0442d" stroke-width="1.3" stroke-linejoin="round"/>`
    + `<path d="${gp({ type: 'Sphere' })}" fill="none" stroke="${NAVY}" stroke-width="1"/>`
    + letter(-140, 5, 'A') + letter(85, 52, 'B') + letter(125, -32, 'C', 0, -4) + letter(-43, 16, 'D')
    + `<text x="${W - 6}" y="${H - 2}" text-anchor="end" font-size="7" fill="${NAVY}" ${FONT}>Plate boundaries: P. Bird (2003), via H. Ahlenius, Nordpil</text>` + '</svg>';
}
const out = process.argv[2] || '.';
for (const [k, svg] of Object.entries(maps)) { fs.writeFileSync(path.join(out, `${k}.svg`), svg); console.log(k, (svg.length / 1024).toFixed(0) + ' KB'); }
