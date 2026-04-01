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
