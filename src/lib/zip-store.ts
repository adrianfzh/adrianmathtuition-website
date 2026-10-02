// A zip written one file at a time, nothing compressed (STORE).
//
// Why our own: "Download all my marked papers" (2 Oct 2026) can be hundreds of
// megabytes of PDFs. jszip holds every file in memory before it writes a byte;
// this hands each entry to the response as soon as it is read, so the function
// only ever holds ONE paper. PDFs are already compressed, so STORE loses nothing.
// Sizes and the CRC go in the local header (no data descriptors — macOS Archive
// Utility is unreliable with a stored entry that carries one).
//
// Pure, tested (zip-store.test.ts reads the output back with jszip).
// No zip64: entries past ~4 GB in total are refused by `fits()`.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** DOS date + time for a zip header, in the given instant's UTC fields. */
function dosStamp(at: Date): { time: number; date: number } {
  const y = Math.max(1980, at.getUTCFullYear());
  return {
    time: (at.getUTCHours() << 11) | (at.getUTCMinutes() << 5) | (at.getUTCSeconds() >> 1),
    date: ((y - 1980) << 9) | ((at.getUTCMonth() + 1) << 5) | at.getUTCDate(),
  };
}

/** A name safe inside a zip, made unique against the names already used. */
export function uniqueZipName(name: string, used: Set<string>): string {
  const clean = String(name || '').replace(/[\\/:*?"<>|\r\n]+/g, '-').replace(/\s+/g, ' ').trim() || 'file';
  const dot = clean.lastIndexOf('.');
  const stem = dot > 0 ? clean.slice(0, dot) : clean;
  const ext = dot > 0 ? clean.slice(dot) : '';
  let out = clean;
  for (let n = 2; used.has(out.toLowerCase()); n++) out = `${stem} (${n})${ext}`;
  used.add(out.toLowerCase());
  return out;
}

const MAX_TOTAL = 0xf0000000; // stay clear of the 4 GB zip32 ceiling

export class ZipStoreWriter {
  private offset = 0;
  private central: Uint8Array[] = [];
  private count = 0;

  /** Whether another entry of this size still fits a plain (non-zip64) archive. */
  fits(size: number): boolean {
    return this.count < 0xffff && this.offset + size + 4096 < MAX_TOTAL;
  }

  /** The bytes to send for one file: its local header followed by the data. */
  entry(name: string, data: Uint8Array, at: Date = new Date()): Uint8Array {
    const nameBytes = new TextEncoder().encode(name);
    const crc = crc32(data);
    const { time, date } = dosStamp(at);

    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);        // version needed
    lv.setUint16(6, 0x0800, true);    // UTF-8 names
    lv.setUint16(8, 0, true);         // STORE
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);

    const cen = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cen.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, this.offset, true);
    cen.set(nameBytes, 46);
    this.central.push(cen);

    this.offset += local.length;
    this.count++;
    return local;
  }

  /** The central directory + end record — send last. */
  finish(): Uint8Array {
    const size = this.central.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(size + 22);
    let p = 0;
    for (const c of this.central) { out.set(c, p); p += c.length; }
    const v = new DataView(out.buffer);
    v.setUint32(p, 0x06054b50, true);
    v.setUint16(p + 8, this.count, true);
    v.setUint16(p + 10, this.count, true);
    v.setUint32(p + 12, size, true);
    v.setUint32(p + 16, this.offset, true);
    return out;
  }
}
