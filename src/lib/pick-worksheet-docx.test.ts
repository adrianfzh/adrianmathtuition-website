// @vitest-environment jsdom
// The picker's Word file, measured against the create-worksheet house file
// (worksheet_lib.py): the same numbers in document.xml / numbering.xml /
// styles.xml that a sheet built by the Python library carries.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import JSZip from 'jszip';
import { deflateSync } from 'node:zlib';
import { buildPickWorksheetDocx, imageSize, figureWidthCm, labelFormat, LAYOUT } from './pick-worksheet-docx';
import { fromDetail } from './pick-worksheet';
import { blobToArrayBuffer } from './lesson-docx';

/** A real (if dull) PNG of the given size: one grey row repeated. */
function png(w: number, h: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((w + 1) * h, 0x80); for (let y = 0; y < h; y++) raw[y * (w + 1)] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const FIG = 'https://x.test/fig.png';
const FIG_PX = { w: 2560, h: 2472 };   // the AM twin figure used for the side-by-side check

const questions = [
  fromDetail({
    id: '11111111-1111-1111-1111-111111111111', level: 'JC2', marks: 4,
    questionMd: 'A plane $\\pi_1$ contains two vectors $\\begin{pmatrix} 1 \\\\ 1 \\\\ 0 \\end{pmatrix}$ and $\\begin{pmatrix} 1 \\\\ -5 \\\\ -2 \\end{pmatrix}$.',
    parts: [
      { label: 'i', text: 'Find a vector normal to $\\pi_1$.', marks: 2, answer: '$\\begin{pmatrix} 1 \\\\ -1 \\\\ 3 \\end{pmatrix}$' },
      { label: 'ii', text: 'Find the equation of $\\pi_1$.', marks: 2, answer: '$x - y + 3z = 0$' },
    ],
  }),
  fromDetail({
    id: '22222222-2222-2222-2222-222222222222', level: 'AM', marks: 7, questionMd: '', images: [FIG],
    parts: [
      { label: 'a', text: 'Find $\\dfrac{d}{dx}[\\ln(\\cos 2x)]$.', marks: 2, answer: '$-2\\tan 2x$' },
      { label: 'b', text: 'The diagram shows the curve.', subparts: [
        { label: 'i', text: 'Write down the coordinates of $Q$.', marks: 1, answer: '$(\\frac{\\pi}{8}, -2)$' },
        { label: 'ii', text: 'Find the area of the shaded region.', marks: 4, answer: '$\\frac{1}{2}$' },
      ] },
    ],
  }),
  fromDetail({ id: '33333333-3333-3333-3333-333333333333', level: 'JC2', marks: 5, questionMd: 'Find the values of $\\alpha$ and $\\beta$.', parts: [], answer: '$\\alpha = 4$, $\\beta = 10$' }),
  // no stem, no figure: "1.  (a) …" rides the number's line
  fromDetail({ id: '44444444-4444-4444-4444-444444444444', level: 'EM', marks: 3, questionMd: '', parts: [
    { label: 'a', text: 'Simplify $3x/2$.', marks: 1, answer: '$\\frac{3x}{2}$' },
    { label: 'b', text: 'Expand $(x+1)^2$.', marks: 2, answer: '$x^2+2x+1$' },
  ] }),
  // labels that are not a sequence: typed labels, never a Word list that disagrees
  fromDetail({ id: '55555555-5555-5555-5555-555555555555', level: 'EM', marks: 2, questionMd: 'Odd labels.', parts: [
    { label: 'a', text: 'First.', marks: 1, answer: '1' },
    { label: 'c', text: 'Third.', marks: 1, answer: '3' },
  ] }),
];

let docXml = '';
let numberingXml = '';
let stylesXml = '';
let paras: string[] = [];
const text = (p: string) => (p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, '')).join('');
const para = (needle: string) => { const p = paras.find((x) => text(x).includes(needle)); if (!p) throw new Error(`no paragraph with ${needle}`); return p; };
const after = (needle: string, n: number) => { const i = paras.findIndex((x) => text(x).includes(needle)); return paras.slice(i + 1, i + 1 + n); };
const numId = (p: string) => /<w:numId w:val="(\d+)"\/>/.exec(p)?.[1] ?? null;
const abstractOf = (p: string) => {
  const id = numId(p)!;
  const num = new RegExp(`<w:num w:numId="${id}">[\\s\\S]*?<w:abstractNumId w:val="(\\d+)"\\/>`).exec(numberingXml)!;
  return new RegExp(`<w:abstractNum w:abstractNumId="${num[1]}"[\\s\\S]*?<\\/w:abstractNum>`).exec(numberingXml)![0];
};

beforeAll(async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.startsWith(FIG)) return new Response(new Uint8Array(png(FIG_PX.w, FIG_PX.h)), { status: 200, headers: { 'content-type': 'image/png' } });
    return new Response('nope', { status: 404 });
  }));
  const blob = await buildPickWorksheetDocx({ title: 'Vectors and Trigonometry', subtitle: 'JC2 / Sec 4 A Math', questions });
  const zip = await JSZip.loadAsync(await blobToArrayBuffer(blob));
  docXml = await zip.file('word/document.xml')!.async('string');
  numberingXml = await zip.file('word/numbering.xml')!.async('string');
  stylesXml = await zip.file('word/styles.xml')!.async('string');
  paras = docXml.match(/<w:p\b[\s\S]*?<\/w:p>/g) ?? [];
}, 20_000);

describe('page and body (worksheet_lib _setup_page / _setup_styles)', () => {
  it('A4 with 2 / 1 / 2.5 / 2.5 cm margins', () => {
    expect(docXml).toMatch(/<w:pgSz w:w="11906" w:h="16838"/);
    expect(docXml).toMatch(/<w:pgMar [^>]*w:top="1134"/);
    expect(docXml).toMatch(/<w:pgMar [^>]*w:bottom="567"/);
    expect(docXml).toMatch(/<w:pgMar [^>]*w:left="1417"/);
    expect(docXml).toMatch(/<w:pgMar [^>]*w:right="1417"/);
  });
  it('Times New Roman 9.5 pt, 1.5 lines, nothing before or after', () => {
    expect(stylesXml).toMatch(/<w:rFonts [^>]*w:ascii="Times New Roman"/);
    expect(stylesXml).toMatch(/<w:sz w:val="19"\/>/);
    expect(stylesXml).toMatch(/<w:spacing [^>]*w:line="360"/);
    expect(para('Find a vector normal')).toMatch(/<w:spacing [^>]*w:line="360"/);
  });
  it('title 12 pt bold navy with 6 pt after; subtitle 10 pt italic with 8 pt after', () => {
    const t = para('Vectors and Trigonometry');
    expect(t).toMatch(/<w:jc w:val="center"\/>/);
    expect(t).toMatch(/<w:spacing [^>]*w:after="120"/);
    expect(t).toMatch(/<w:b\/>/);
    expect(t).toMatch(/<w:color w:val="1F4E79"\/>/);
    expect(t).toMatch(/<w:sz w:val="24"\/>/);
    const s = para('JC2 / Sec 4 A Math');
    expect(s).toMatch(/<w:spacing [^>]*w:after="160"/);
    expect(s).toMatch(/<w:i\/>/);
    expect(s).toMatch(/<w:sz w:val="20"\/>/);
  });
});

describe('numbering (worksheet_lib NUMBERING_XML)', () => {
  it('"1." at the margin, text at 1.0 cm — one continuous list', () => {
    const q1 = para('A plane');
    const abs = abstractOf(q1);
    expect(abs).toMatch(/<w:numFmt w:val="decimal"\/>/);
    expect(abs).toMatch(/<w:lvlText w:val="%1\."\/>/);
    expect(abs).toMatch(/<w:ind w:left="567" w:hanging="567"\/>/);
    const q3 = para('Find the values of');
    expect(numId(q1)).not.toBeNull();
    expect(numId(q3)).toBe(numId(q1));
  });
  it('parts are real Word numbering under the question TEXT: (i) at 1.0 cm, text at 2.0 cm', () => {
    const p = para('Find a vector normal');
    expect(numId(p)).not.toBeNull();
    expect(numId(p)).not.toBe(numId(para('A plane')));
    const abs = abstractOf(p);
    expect(abs).toMatch(/<w:numFmt w:val="lowerRoman"\/>/);
    expect(abs).toMatch(/<w:lvlText w:val="\(%1\)"\/>/);
    expect(abs).toMatch(/<w:ind w:left="1134" w:hanging="567"\/>/);
    expect(p).not.toMatch(/<w:t[^>]*>\(i\)/);
  });
  it('a sub-part (i) under (b) sits one tab further: label at 2.0 cm, text at 3.0 cm, its own restarted list', () => {
    const sub = para('coordinates of');
    expect(numId(sub)).not.toBeNull();
    expect(numId(sub)).not.toBe(numId(para('Find a vector normal')));
    const abs = abstractOf(sub);
    expect(abs).toMatch(/<w:numFmt w:val="lowerRoman"\/>/);
    expect(abs).toMatch(/<w:ind w:left="1701" w:hanging="567"\/>/);
  });
  it('a question with no stem puts "(a)" on the number\'s line: tabs at 1.0 and 2.0 cm, hanging 2.0 cm; the list below starts at (b)', () => {
    const p = para('Simplify');
    expect(numId(p)).toBe(numId(para('A plane')));
    expect(p).toMatch(/<w:t[^>]*>\(a\)<\/w:t>/);
    expect(p).toMatch(/<w:tab w:val="left" w:pos="567"\/>/);
    expect(p).toMatch(/<w:tab w:val="left" w:pos="1134"\/>/);
    expect(p).toMatch(/<w:ind [^>]*w:left="1134"/);
    expect(p).toMatch(/<w:ind [^>]*w:hanging="1134"/);
    const abs = abstractOf(para('Expand'));
    expect(abs).toMatch(/<w:start w:val="2"\/>/);
    expect(abs).toMatch(/<w:numFmt w:val="lowerLetter"\/>/);
  });
  it('labels that are not a sequence print as typed text', () => {
    const p = para('Third.');
    expect(numId(p)).toBeNull();
    expect(p).toMatch(/<w:t[^>]*>\(c\)<\/w:t><w:tab\/>/);
    expect(labelFormat(['a', 'c'])).toBeNull();
    expect(labelFormat(['i', 'ii', 'iii'])).toBe('roman');
    expect(labelFormat(['a', 'b'])).toBe('letter');
  });
});

describe('marks and working space (worksheet_lib _add / workspace)', () => {
  it('"\\t[n]" on a right tab at 15.5 cm, the paragraph 1.4 cm short of the right edge', () => {
    const p = para('Find a vector normal');
    expect(p).toMatch(/<w:tab w:val="right" w:pos="8787"\/>/);
    expect(p).toMatch(/<w:ind [^>]*w:right="794"/);
    expect(p).toMatch(/<w:tab\/><w:t[^>]*>\[2\]<\/w:t>/);
    expect(LAYOUT.marksTab).toBe(8787);
  });
  it('an unmarked stem keeps the full width (no tab, no right indent)', () => {
    const p = para('A plane');
    expect(p).not.toMatch(/w:pos="8787"/);
    expect(p).not.toMatch(/w:right="794"/);
  });
  it('4 blank lines a mark, 5 for a [1]; the part and ALL its lines travel together (ac56ad3b)', () => {
    const p = para('Find a vector normal');
    expect(p).toMatch(/<w:keepNext\/>/);
    const blanks = after('Find a vector normal', 9);
    expect(blanks.slice(0, 8).every((b) => text(b) === '')).toBe(true);
    expect(text(blanks[8])).toContain('Find the equation');
    expect(blanks.slice(0, 7).every((b) => /<w:keepNext\/>/.test(b))).toBe(true);
    expect(blanks[7]).not.toMatch(/<w:keepNext\/>/);
    const one = after('Write down the coordinates', 6);
    expect(one.slice(0, 5).every((b) => text(b) === '')).toBe(true);
    expect(text(one[5])).toContain('Find the area');
  });
  it('with working space every question after the first starts on a fresh page; a compact sheet flows on', async () => {
    expect(para('A plane')).not.toMatch(/<w:pageBreakBefore\/>/);
    expect(para('Find the values of')).toMatch(/<w:pageBreakBefore\/>/);
    expect(para('Simplify')).toMatch(/<w:pageBreakBefore\/>/);
    const blob = await buildPickWorksheetDocx({ title: 'T', subtitle: '', questions: questions.slice(0, 2), workingSpace: false });
    const zip = await JSZip.loadAsync(await blobToArrayBuffer(blob));
    expect(await zip.file('word/document.xml')!.async('string')).not.toContain('pageBreakBefore');
  });
  it('no blank lines when working space is off', async () => {
    const blob = await buildPickWorksheetDocx({ title: 'T', subtitle: '', questions: [questions[0]], workingSpace: false });
    const zip = await JSZip.loadAsync(await blobToArrayBuffer(blob));
    const xml = await zip.file('word/document.xml')!.async('string');
    const ps = xml.match(/<w:p\b[\s\S]*?<\/w:p>/g) ?? [];
    expect(ps.filter((p) => text(p) === '').length).toBe(0);
  });
});

describe('answer line and figures', () => {
  it('ONE orange right-aligned [Ans: (i) …; (ii) …] line per question, glued to the line above', () => {
    const a = para('[Ans: ');
    expect(a).toMatch(/<w:jc w:val="right"\/>/);
    expect(a).toMatch(/<w:color w:val="843C0C"\/>/);
    expect(text(a)).toMatch(/^\[Ans: \(i\) .*; \(ii\) .*\]$/);
    const i = paras.indexOf(a);
    expect(paras[i - 1]).toMatch(/<w:keepNext\/>/);
    expect(a).not.toMatch(/<w:keepNext\/>/);
    expect(paras.filter((p) => text(p).startsWith('[Ans:')).length).toBe(questions.length);
  });
  it('a figure prints centred at most 10.5 cm wide and 8 cm tall, never upscaled, 4 pt above and below, glued both ways', () => {
    expect(figureWidthCm(2560, 2472)).toBe(8.28);     // tall: the 8 cm height cap decides
    expect(figureWidthCm(1200, 400)).toBe(10.5);      // wide: the width cap
    expect(figureWidthCm(200, 100)).toBe(5.29);       // small: its natural 96-dpi size
    const fig = paras.find((p) => p.includes('<w:drawing>'))!;
    expect(fig).toMatch(/<w:jc w:val="center"\/>/);
    expect(fig).toMatch(/<w:spacing [^>]*w:before="80"/);
    expect(fig).toMatch(/<w:spacing [^>]*w:after="80"/);
    expect(fig).toMatch(/<w:keepNext\/>/);
    const cx = Number(/<wp:extent cx="(\d+)"/.exec(fig)![1]);
    expect(Math.abs(cx / 360000 - 8.28)).toBeLessThan(0.03);
    const i = paras.indexOf(fig);
    expect(paras[i - 1]).toMatch(/<w:keepNext\/>/);   // the number line above keeps with it
    expect(imageSize(new Uint8Array(png(640, 480)).buffer)).toEqual({ w: 640, h: 480 });
  });
  it('equations are native Word maths: a column vector with growing brackets', () => {
    expect(docXml).toContain('<m:oMath>');
    expect(docXml).toContain('<m:begChr m:val="("/>');
    expect(docXml).not.toContain('MMLTOKEN');
  });
});

// ── the brand header switch (ADRIAN-STYLE.md §9; lib/worksheet-brand, lib/pick-worksheet-brand-docx) ──
import { readFileSync } from 'node:fs';
import { brandForLevels, SERIES, SERIES_MONO, LEVELS } from './worksheet-brand';

const parts3 = (xml: string) => xml.match(/<w:p\b[\s\S]*?<\/w:p>/g) ?? [];
async function build(brand: 'off' | 'colour' | 'mono' | undefined, qs = questions.slice(0, 3)) {
  const blob = await buildPickWorksheetDocx({ title: 'Vectors and Trigonometry', subtitle: 'JC2 / Sec 4 A Math', questions: qs, ...(brand ? { brand } : {}) });
  const zip = await JSZip.loadAsync(await blobToArrayBuffer(blob));
  const names = Object.keys(zip.files).filter((n) => /^word\/(document|styles|numbering|header\d*|footer\d*)\.xml$/.test(n)).sort();
  const files: Record<string, string> = {};
  for (const n of names) files[n] = await zip.file(n)!.async('string');
  return files;
}
const colourVals = (xml: string) => [...xml.matchAll(/<w:(?:color|shd)[^>]*w:(?:val|fill)="([0-9A-Fa-f]{6})"/g)].map((m) => m[1].toUpperCase());
const isGrey = (v: string) => v.slice(0, 2) === v.slice(2, 4) && v.slice(2, 4) === v.slice(4, 6);

describe('brand header switch (worksheet_brand.py port)', () => {
  beforeAll(() => {
    // the logos come from public/brand/ in the browser; serve them here too
    const prev = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const m = /^\/brand\/(mark_\w+\.png)$/.exec(url);
      if (m) return new Response(new Uint8Array(readFileSync(`public/brand/${m[1]}`)), { status: 200, headers: { 'content-type': 'image/png' } });
      return prev(url);
    }));
  });
  it('off (and absent) = the regular sheet, byte for byte in every XML part', async () => {
    const plain = await build(undefined);
    const off = await build('off');
    expect(Object.keys(off)).toEqual(Object.keys(plain));
    // docx-js numbers its lists from one process-wide counter, so the numId
    // values move between two builds in one run; everything else is identical.
    const norm = (x: string) => x.replace(/w:(numId|abstractNumId) w:val="\d+"/g, 'w:$1 w:val="N"').replace(/<w:num w:numId="\d+">/g, '<w:num w:numId="N">').replace(/<w:abstractNum w:abstractNumId="\d+"/g, '<w:abstractNum w:abstractNumId="N"').replace(/(<wp:docPr|<pic:cNvPr) id="\d+"/g, '$1 id="N"').replace(/r:embed="rId\d+"/g, 'r:embed="rIdN"');   // the figure's ids count up the same way
    for (const n of Object.keys(plain)) {
      const [p2, o2] = [norm(plain[n]), norm(off[n])];
      let i = 0; while (i < p2.length && p2[i] === o2[i]) i++;
      expect(o2.slice(Math.max(0, i - 120), i + 120), `${n} differs at ${i}`).toBe(p2.slice(Math.max(0, i - 120), i + 120));
      expect(o2.length).toBe(p2.length);
    }
    expect(Object.keys(plain)).not.toContain('word/header1.xml');
    expect(plain['word/document.xml']).not.toContain('<w:tbl>');
  }, 20_000);
  it('the series comes from the picked levels, the most common one wins, an unknown level has none', () => {
    expect(brandForLevels(['JC2', 'AM', 'JC2'])?.series).toBe('JC');
    expect(brandForLevels(['S3_EM'])?.levelLine).toBe('Sec 3 Mathematics');
    expect(brandForLevels(['IB', null, 'X'])).toBeNull();
    expect(brandForLevels(['AM'])?.small).toBe('SEC 4');
    for (const k of Object.keys(SERIES)) expect(Object.keys(SERIES_MONO)).toContain(k);
    expect(new Set(Object.values(LEVELS).map((l) => l[0]))).toEqual(new Set(Object.keys(SERIES)));
  });
  it('colour: masthead table, Georgia 19 pt topic, PRACTICE · n questions · m marks, Name / Date, footer with Page x of y, running header from page 2', async () => {
    const f = await build('colour');   // JC2 ×2 + AM → the JC series
    const doc = f['word/document.xml'];
    const ps = parts3(doc);
    const t = (p: string) => (p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) ?? []).map((x) => x.replace(/<[^>]+>/g, '')).join('');
    // the masthead is the first thing in the body: logo, AdrianMath / TUITION, the level line + site, the block
    expect(doc.indexOf('<w:tbl>')).toBeLessThan(doc.indexOf('Vectors and Trigonometry'));
    expect(doc).toContain('<w:drawing>');
    expect(ps.some((p) => t(p) === 'AdrianMath')).toBe(true);
    expect(ps.some((p) => t(p) === 'TUITION' && /w:spacing w:val="60"/.test(p))).toBe(true);
    expect(ps.some((p) => t(p) === 'JC2 H2 Mathematics')).toBe(true);
    expect(ps.some((p) => t(p) === 'adrianmathtuition.com')).toBe(true);
    expect(ps.some((p) => t(p) === 'JC H2' && /w:sz w:val="34"/.test(p) && /w:color w:val="FFFFFF"/.test(p))).toBe(true);
    expect(doc).toMatch(/<w:shd [^>]*w:fill="7A1F3D"/);              // the burgundy block
    expect(doc).toMatch(/<w:tblBorders>[\s\S]*?<w:left w:val="single" w:color="7A1F3D" w:sz="36"/);  // the bar down the left edge
    expect(doc).toMatch(/<w:gridCol w:w="1134"\/><w:gridCol w:w="2551"\/><w:gridCol w:w="3458"\/><w:gridCol w:w="1928"\/>/);
    // no title / subtitle paragraphs; the topic in Georgia 19 pt navy with the title bar
    const topic = ps.find((p) => t(p) === 'Vectors and Trigonometry')!;
    expect(topic).toMatch(/w:ascii="Georgia"/);
    expect(topic).toMatch(/<w:sz w:val="38"\/>/);
    expect(topic).toMatch(/<w:color w:val="1B2A4A"\/>/);
    expect(topic).toMatch(/<w:left w:val="single" w:color="7A1F3D" w:sz="36" w:space="8"\/>/);
    expect(topic).not.toMatch(/<w:jc w:val="center"\/>/);
    const practice = ps.find((p) => t(p).startsWith('PRACTICE'))!;
    expect(t(practice)).toBe('PRACTICE   ·   3 questions   ·   16 marks');
    expect(practice).toMatch(/<w:color w:val="7A1F3D"\/>/);
    expect(ps.some((p) => t(p) === 'JC2 / Sec 4 A Math')).toBe(true);      // the subtitle rides under PRACTICE
    const name = ps.find((p) => t(p).startsWith('Name '))!;
    expect(name).toMatch(/<w:bottom w:val="single" w:color="BEC6D2" w:sz="4" w:space="6"\/>/);
    // page furniture: a title page with a blank header, the running header, the footer on both
    expect(doc).toMatch(/<w:titlePg\/>/);
    expect(doc).toMatch(/<w:pgMar [^>]*w:bottom="964"/);
    const headers = Object.keys(f).filter((n) => /header/.test(n)).map((n) => f[n]);
    const running = headers.find((h) => h.includes('Adrian'))!;
    expect(running).toBeTruthy();
    expect(running).toMatch(/<w:t[^>]*>JC H2<\/w:t>/);
    expect(running).toMatch(/<w:tblBorders>[\s\S]*?<w:bottom w:val="single" w:color="7A1F3D" w:sz="8"/);
    expect(headers.some((h) => !h.includes('Adrian'))).toBe(true);          // the title page's blank header
    const footers = Object.keys(f).filter((n) => /footer/.test(n)).map((n) => f[n]);
    expect(footers.length).toBe(2);
    for (const ft of footers) {
      expect(ft).toContain('AdrianMath Tuition');
      expect(ft).toContain('adrianmathtuition.com');
      expect(ft).toMatch(/<w:instrText[^>]*>\s*PAGE\s*<\/w:instrText>/);
      expect(ft).toMatch(/<w:instrText[^>]*>\s*NUMPAGES\s*<\/w:instrText>/);
      expect(ft).not.toContain('Adrian Fong');
    }
    // the orange [Ans:] line is still orange in colour
    expect(doc).toMatch(/<w:color w:val="843C0C"\/>/);
  }, 20_000);
  it('black and white: no coloured fill or ink anywhere, the outlined logo, the [Ans:] line drained to 404040, a box instead of a block', async () => {
    const f = await build('mono');
    const doc = f['word/document.xml'];
    for (const n of Object.keys(f).filter((x) => !/styles/.test(x))) for (const v of colourVals(f[n])) expect(isGrey(v), `${n}: ${v}`).toBe(true);   // styles.xml keeps docx-js's unused hyperlink blue
    expect(doc).not.toMatch(/<w:shd [^>]*w:fill="(?!FFFFFF|F2F2F2)/);
    expect(doc).toMatch(/<w:color w:val="404040"\/>/);
    expect(doc).not.toMatch(/<w:color w:val="843C0C"\/>/);
    expect(doc).toMatch(/<w:tcBorders>[\s\S]*?<w:left w:val="single" w:color="1A1A1A" w:sz="24"/);    // the JC box's heavy left rule
    const running = Object.keys(f).filter((n) => /header/.test(n)).map((n) => f[n]).find((h) => h.includes('Adrian'))!;
    expect(running).toMatch(/<w:bottom w:val="thickThinSmallGap" w:color="1A1A1A" w:sz="12"/);
  }, 20_000);
  it('every series builds in both modes with its own header shape', async () => {
    const one = (level: string) => [fromDetail({ id: '66666666-6666-6666-6666-666666666666', level, marks: 2, questionMd: 'Solve $x^2=4$.', parts: [], answer: '$\\pm 2$' })];
    const am = await build('colour', one('AM'));
    expect(am['word/document.xml']).toMatch(/<w:shd [^>]*w:fill="1B2A4A"/);          // the navy band
    expect(am['word/document.xml']).toMatch(/<w:t[^>]*>A MATH<\/w:t>/);
    const em = await build('colour', one('S3_EM'));
    expect(em['word/document.xml']).toMatch(/<w:tblBorders>[\s\S]*?<w:bottom w:val="single" w:color="0E8A7D" w:sz="18"/);
    expect(em['word/document.xml']).toMatch(/<w:t[^>]*>SEC 3<\/w:t>/);
    const s1 = await build('mono', one('S1'));
    expect(s1['word/document.xml']).toMatch(/<w:shd [^>]*w:fill="F2F2F2"/);
    expect(s1['word/document.xml']).toMatch(/<w:tcBorders>[\s\S]*?<w:top w:val="double" w:color="1A1A1A" w:sz="6"/);
    const s2 = await build('colour', one('S2'));
    expect(s2['word/document.xml']).toMatch(/<w:tblBorders>[\s\S]*?<w:top w:val="single" w:color="1F74D6" w:sz="36"/);
    const none = await build('colour', one('IB'));                                    // no design → regular
    expect(none['word/document.xml']).not.toContain('<w:tbl>');
    expect(none['word/document.xml']).toMatch(/<w:color w:val="1F4E79"\/>/);
  }, 40_000);
});
