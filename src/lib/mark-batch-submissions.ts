// Airtable lookup for a batch's Submissions rows ({Batches} linked-record field).
//
// ⚠ ARRAYJOIN on a linked-record field yields the linked rows' PRIMARY-FIELD
// TEXT — for {Batches} that is the app-level `batch_<ts>_<rand>` Batch ID —
// never record ids, so `FIND("recXXX", ARRAYJOIN({Batches}))` matches NOTHING
// (CLAUDE.md "Linked record filtering"; this exact formula left all three
// mark-batch submission readers returning zero Airtable rows until 2026-09-02).
//
// Correct pattern: narrow server-side by the Batch ID text, then confirm the
// actual record link in JS — FIND is a substring match, so the JS confirm also
// guards the (rare) short `Math.random().toString(36)` suffix being a prefix
// of another batch's.

export function batchSubmissionsFormula(batchId: string): string {
  const safe = String(batchId).replace(/["\\]/g, '');
  return `FIND("${safe}", ARRAYJOIN({Batches}))`;
}

interface LinkedRecord {
  fields?: Record<string, unknown>;
}

export function submissionsLinkedToBatch<T extends LinkedRecord>(
  records: T[],
  batchAirtableId: string
): T[] {
  return records.filter(r => {
    const links = r.fields?.['Batches'];
    return Array.isArray(links) && links.includes(batchAirtableId);
  });
}
