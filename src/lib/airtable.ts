export async function airtableRequest(
  tableName: string,
  path: string,
  options: RequestInit = {}
): Promise<any> {
  const token = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable error [${tableName}]: ${text}`);
  }
  return res.json();
}

/**
 * Paginated GET that transparently walks Airtable's `offset` cursor and
 * returns every matching record. Airtable caps each page at 100 records —
 * using airtableRequest() alone silently truncates large result sets.
 *
 * Use this for ANY "list everything matching X" query (Enrollments, Invoices,
 * Students, etc.). Single-record paths like `/recXXX` should keep using
 * airtableRequest().
 *
 * `path` is the query string (e.g. `?filterByFormula=...&sort[0][field]=...`).
 * An empty string is fine for "fetch all rows in the table".
 */
export async function airtableRequestAll(
  tableName: string,
  path: string = ''
): Promise<{ records: any[] }> {
  const records: any[] = [];
  let offset: string | undefined;
  let pages = 0;
  do {
    const sep = path.includes('?') ? '&' : '?';
    const pageQuery = offset
      ? `${path}${path ? sep : '?'}offset=${encodeURIComponent(offset)}`
      : path;
    const data = await airtableRequest(tableName, pageQuery);
    records.push(...(data.records || []));
    offset = data.offset;
    pages++;
    // Belt-and-braces: Airtable won't serve more than ~100k records this way
    // in practice, but guard against a malformed cursor loop.
    if (pages > 500) {
      console.error(`[airtableRequestAll] ${tableName} pagination exceeded 500 pages — aborting`);
      break;
    }
  } while (offset);
  return { records };
}

/**
 * Narrow a linked-`{Student}` table to ONE student by display name.
 *
 * A formula cannot match a record id on a linked field (`ARRAYJOIN({Student})`
 * yields the linked DISPLAY NAME — CLAUDE.md Gotchas), but the display name
 * itself is fair game once the caller holds the student's record: for a
 * single-link field `ARRAYJOIN({Student})='<name>'` is an exact match. This only
 * trims what Airtable sends — callers MUST still match `fields.Student[0] ===
 * id` in JS, so a namesake merely over-fetches and never mis-attributes.
 * A blank name returns '' (no narrowing) so callers degrade to the full pull.
 *
 * Why (12 Sep 2026): /admin/students/[id] pulled six months of EVERY student's
 * lessons — 2,751 rows, 28 pages, ~11.5 s of a 12.5 s load — to keep 45.
 */
export function linkedStudentNameFilter(studentName: string | null | undefined, field = 'Student'): string {
  const name = String(studentName || '').trim();
  if (!name) return '';
  const escaped = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return `ARRAYJOIN({${field}})='${escaped}'`;
}

/** AND a formula with linkedStudentNameFilter(); passes the formula through when the name is blank. */
export function narrowToStudent(formula: string, studentName: string | null | undefined): string {
  const by = linkedStudentNameFilter(studentName);
  return by ? `AND(${formula}, ${by})` : formula;
}
