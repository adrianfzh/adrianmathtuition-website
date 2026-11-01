// Why a regular lesson is cancelled, read from its Notes, for the faded
// "Cancelled · …" chip on /admin/schedule.
//
// Adrian, 1 Nov 2026: a family's year-end opt-out showed as "Cancelled ·
// holiday", which read like a public holiday. Asked whether it should say
// "skipping Nov" instead: "yes give detailed reasons". So the chip carries a
// short label, and a second line says the rest of what the note says.
//
// Note formats this reads (who writes them):
//   'Holiday opt-out — November 2026[ (auto-created)]'  lib/holiday-optout.ts
//   'Public Holiday'                                     lib/lesson-generation.ts
//   'Cancelled 15 Oct 2026 (Adrian): tutor away … — NO make-up …; not charged …'
//                                                        hand-written by a session
//   anything mentioning revision                         Revision Sprint moves

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export type CancelReason = { label: string; detail: string | null };

export function cancelReason(notes: string | null | undefined): CancelReason {
  const n = (notes ?? '').trim();
  if (!n) return { label: 'cancelled', detail: 'No reason written down' };

  const opt = n.match(/holiday opt-out\s*[—–-]\s*([A-Za-z]+)(?:\s+(\d{4}))?/i);
  if (opt) {
    const i = MONTHS.findIndex(m => m.toLowerCase() === opt[1].toLowerCase());
    const month = i >= 0 ? MONTHS[i].slice(0, 3) : opt[1];
    return { label: `skipping ${month}`, detail: 'Year-end holiday opt-out (family skipping this month or date)' };
  }

  if (/public holiday/i.test(n)) return { label: 'public holiday', detail: null };

  if (/revision/i.test(n)) return { label: 'on revision', detail: n === 'Revision makeup' ? null : n };

  // "Cancelled 15 Oct 2026 (Adrian): tutor away 28 Oct–1 Nov — NO make-up …"
  const by = n.match(/^cancelled\b[^:]*:\s*(.+)$/i);
  const body = by ? by[1].trim() : n;
  const cut = body.search(/\s[—–]\s|;\s/);
  const head = (cut > 0 ? body.slice(0, cut) : body).trim();
  const rest = cut > 0 ? body.slice(cut).replace(/^\s*[—–;]\s*/, '').trim() : '';
  if (head.length <= 32) return { label: head, detail: rest || null };
  return { label: 'cancelled', detail: body };
}
