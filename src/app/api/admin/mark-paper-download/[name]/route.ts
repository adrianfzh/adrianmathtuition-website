// Filename-carrying variant of mark-paper-download: Safari's share sheet titles an
// inline-viewed PDF from the URL's LAST PATH SEGMENT and ignores Content-Disposition,
// so /api/admin/mark-paper-download/<Real Name>.pdf?url=… is what makes "Import to
// Notability" default to the student's name instead of "mark-paper-download"
// (Adrian, 2 Aug 2026). The segment itself is decorative — the parent handler reads
// only the query params, so we simply re-export it.
export { GET } from '../route';
export const dynamic = 'force-dynamic';
