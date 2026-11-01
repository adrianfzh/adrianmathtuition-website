// Why a regular lesson is cancelled, read from its Notes, for the faded
// "Cancelled · …" chip on /admin/schedule.
//
// Adrian, 1 Nov 2026: a family's year-end opt-out showed as "Cancelled ·
// holiday", which read like a public holiday. Asked whether it should say
// "skipping Nov" instead: "yes give detailed reasons". So the chip carries a
// short label, and a second line says the rest of what the note says.
//
// Note formats this reads (who writes them):
//   'Holiday opt-out — November 2026[ · by parent|Adrian …][ (auto-created)]'
//                                                        lib/holiday-optout.ts
//   'Public Holiday'                                     lib/lesson-generation.ts
//   'Cancelled 15 Oct 2026 (Adrian): tutor away … — NO make-up …; not charged …'
//                                                        hand-written by a session
//   anything mentioning revision                         Revision Sprint moves

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export type CancelReason = { label: string; detail: string | null };

export function cancelReason(notes: string | null | undefined, studentStatus?: string | null): CancelReason {
  // A student who has left: that is the reason, whatever the old note says
  // (Adrian, 1 Nov 2026: "for beryl should put her as graduated" · "for jayden,
  // he has since discontinued").
  if (studentStatus === 'Graduated') return { label: 'graduated', detail: null };
  if (studentStatus === 'Inactive') return { label: 'discontinued', detail: null };

  const n = (notes ?? '').trim();
  if (!n) return { label: 'cancelled', detail: 'No reason written down' };

  const opt = n.match(/holiday opt-out\s*[—–-]\s*([A-Za-z]+)(?:\s+(\d{4}))?/i);
  if (opt) {
    const i = MONTHS.findIndex(m => m.toLowerCase() === opt[1].toLowerCase());
    const month = i >= 0 ? MONTHS[i].slice(0, 3) : opt[1];
    const who = /by parent/i.test(n) ? 'Family pressed the opt-out button in the email'
      : /by adrian/i.test(n) ? 'You skipped it on the student page'
      : /by a claude session/i.test(n) ? 'A Claude session skipped it for you'
      : 'Holiday opt-out — not recorded whether you or the family did it';
    return { label: `skipping ${month}`, detail: who };
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
