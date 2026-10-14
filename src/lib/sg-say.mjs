// 🇸🇬 How the recording voice should SAY Singapore words (Adrian, 14 Oct 2026: "should be able to
// pronounce singapore's words correctly. please see to that" — the voice read "Tampines" as an
// English word). Used only for the sound: the text on screen keeps the proper spelling.
// scripts/english-own/speaking-audio.mjs runs every line through sayAs() before the voice reads it.
// Adding a word: put it here, run `node scripts/english-own/speaking-audio.mjs --check-sg` and
// listen. Pure; tested (sg-say.test.ts).

/** spelling → how to say it (a respelling the voice reads naturally). Longest names first is not needed: matching is whole-word. */
export const SG_SAY = {
  // places
  'Tampines': 'Tam-pi-niss',
  'Bukit Timah': 'Boo-kit Tee-mah',
  'Bukit Batok': 'Boo-kit Bah-tok',
  'Bukit Panjang': 'Boo-kit Pahn-jahng',
  'Bukit Merah': 'Boo-kit May-rah',
  'Toa Payoh': 'Toh-ah Pie-oh',
  'Ang Mo Kio': 'Ahng Moh Kee-oh',
  'Pasir Ris': 'Pah-seer Riss',
  'Pasir Panjang': 'Pah-seer Pahn-jahng',
  'Punggol': 'Pung-gol',
  'Sengkang': 'Seng-kahng',
  'Hougang': 'How-gahng',
  'Yishun': 'Yee-shoon',
  'Bishan': 'Bee-shahn',
  'Jurong': 'Joo-rong',
  'Kallang': 'Kah-lahng',
  'Geylang': 'Gay-lahng',
  'Serangoon': 'Seh-rahng-goon',
  'Choa Chu Kang': 'Choh-ah Choo Kahng',
  'Bedok': 'Beh-dok',
  'Changi': 'Chahng-ee',
  'Clementi': 'Kleh-men-tee',
  'Simei': 'See-may',
  'Tanjong Pagar': 'Tahn-jong Pah-gar',
  'Tiong Bahru': 'Tee-ong Bah-roo',
  'Sembawang': 'Sem-bah-wahng',
  'Kranji': 'Krahn-jee',
  // food and everyday words
  'nasi lemak': 'nah-see leh-mah',
  'roti prata': 'roh-tee prah-tah',
  'char kway teow': 'char kway tee-ow',
  'laksa': 'lahk-sah',
  'kaya': 'kah-yah',
  'kopi': 'koh-pee',
  'satay': 'sah-tay',
  'makan': 'mah-kahn',
  'kiasu': 'kee-ah-soo',
};

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const KEYS = Object.keys(SG_SAY).sort((a, b) => b.length - a.length);
const RE = new RegExp(`\\b(${KEYS.map(esc).join('|')})\\b`, 'gi');
const LOOKUP = new Map(KEYS.map(k => [k.toLowerCase(), SG_SAY[k]]));

/** The line as the voice should read it: every Singapore word swapped for how it sounds. */
export function sayAs(text) {
  return String(text).replace(RE, m => {
    const say = LOOKUP.get(m.toLowerCase()) ?? m;
    return m[0] === m[0].toUpperCase() ? say[0].toUpperCase() + say.slice(1) : say;
  });
}
