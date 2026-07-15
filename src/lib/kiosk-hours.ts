// Kiosk opening hours + open/closed computation.
// Master control is kiosk_config.mode (closed | open | scheduled):
//   closed    → always closed (default)
//   open      → always open (manual override)
//   scheduled → open only within OPENING_HOURS (below)
// Admin callers bypass all of this (see the API routes).

// Opening hours in Asia/Singapore, per weekday, as [openMin, closeMin] from midnight.
// Adrian's centre: Mon/Tue/Fri 3–7pm, Sat/Sun 9am–7pm, closed Wed/Thu — with a
// ±30-min buffer applied (2:30–7:30pm / 8:30am–7:30pm). Weekday: 0=Sun … 6=Sat.
const WK = 14 * 60 + 30; // 14:30
const WKEND = 8 * 60 + 30; // 08:30
const CLOSE = 19 * 60 + 30; // 19:30
export const OPENING_HOURS: Record<number, [number, number][]> = {
  0: [[WKEND, CLOSE]], // Sun 08:30–19:30
  1: [[WK, CLOSE]],    // Mon 14:30–19:30
  2: [[WK, CLOSE]],    // Tue
  3: [],               // Wed closed
  4: [],               // Thu closed
  5: [[WK, CLOSE]],    // Fri
  6: [[WKEND, CLOSE]], // Sat 08:30–19:30
};

const DAY_LABEL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Current weekday + minutes-since-midnight in Singapore time, from server UTC.
function sgtNow(): { weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Singapore', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const wd = parts.find(p => p.type === 'weekday')?.value ?? 'Sun';
  const hh = Number(parts.find(p => p.type === 'hour')?.value ?? '0');
  const mm = Number(parts.find(p => p.type === 'minute')?.value ?? '0');
  return { weekday: DAY_LABEL.indexOf(wd === 'Sun' ? 'Sun' : wd), minutes: (hh % 24) * 60 + mm };
}

export function isWithinHours(): boolean {
  const { weekday, minutes } = sgtNow();
  return (OPENING_HOURS[weekday] || []).some(([o, c]) => minutes >= o && minutes < c);
}

// Human label for the next opening (for the "closed" screen). Simple scan of the
// next 7 days for the first future open window.
export function nextOpenLabel(): string {
  const { weekday, minutes } = sgtNow();
  for (let d = 0; d < 8; d++) {
    const wd = (weekday + d) % 7;
    for (const [o] of OPENING_HOURS[wd] || []) {
      if (d === 0 && minutes >= o) continue; // already past today's opening
      const h = Math.floor(o / 60), m = o % 60;
      const hh = ((h + 11) % 12) + 1, ap = h < 12 ? 'am' : 'pm';
      const when = d === 0 ? 'today' : d === 1 ? 'tomorrow' : DAY_LABEL[wd];
      return `${when} at ${hh}${m ? ':' + String(m).padStart(2, '0') : ''}${ap}`;
    }
  }
  return 'soon';
}

// A readable summary of the week's hours (for the admin panel).
export const HOURS_SUMMARY = 'Mon/Tue/Fri 2:30–7:30pm · Sat/Sun 8:30am–7:30pm · closed Wed/Thu (incl. ±30min buffer)';

export type KioskMode = 'closed' | 'open' | 'scheduled';

// Given the stored mode, is the kiosk open right now (for non-admin callers)?
export function kioskOpenForMode(mode: KioskMode): boolean {
  if (mode === 'open') return true;
  if (mode === 'closed') return false;
  return isWithinHours();
}
