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
