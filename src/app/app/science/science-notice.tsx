'use client';
// The "science marking is open" notice at the top of the Science tab (Adrian,
// 24 Sep 2026): shown for one day from the first time this device opens the
// tab, then gone by itself — no ✕. Starts hidden and appears after the
// localStorage check, like PortalAnnouncementCard, so a device past its day
// never sees a flash. The rule and the wording live in lib/science-notice.ts.
import { useEffect, useState } from 'react';
import { SCIENCE_NOTICE_KEY, SCIENCE_OPEN_NOTICE, scienceNoticeState } from '@/lib/science-notice';

export default function ScienceOpenNotice() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let stored: string | null = null;
    try { stored = window.localStorage.getItem(SCIENCE_NOTICE_KEY); } catch { stored = null; }
    const state = scienceNoticeState(stored);
    if (state.stamp) {
      try { window.localStorage.setItem(SCIENCE_NOTICE_KEY, state.stamp); } catch { /* private mode — shows on every visit, which is fine */ }
    }
    setShow(state.show);
  }, []);

  if (!show) return null;
  const n = SCIENCE_OPEN_NOTICE;
  return (
    <section
      className="rounded-3xl border border-teal-200 bg-teal-50 px-4 py-3.5 text-[13px] text-teal-950 space-y-2"
      data-science-open-notice
      role="note"
    >
      <p className="font-bold">{n.greeting}</p>
      <p className="font-semibold">{n.lead}</p>
      {n.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
      <p className="font-semibold">{n.limit}</p>
    </section>
  );
}
