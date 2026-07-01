// Single source of truth for no-lesson dates across the website.
//
// Policy: lessons run as usual on Singapore public holidays EXCEPT Chinese New
// Year and Christmas Day. This must stay in sync with the bot's NO_LESSON_DATES
// (lib/helpers.js) and the Terms page ("Lessons run as usual on public
// holidays"). Do NOT re-add general SG public holidays here — see the slot-switch
// holiday incident (National Day lessons were wrongly cancelled).
export const NO_LESSON_DATES: string[] = [
  // Chinese New Year
  '2026-02-17', '2026-02-18',
  '2027-02-06', '2027-02-07',
  '2028-01-26', '2028-01-27',
  // Christmas Day
  '2026-12-25', '2027-12-25', '2028-12-25',
];
