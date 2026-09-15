// /holiday-optout?t=… — the page behind the "Choose which months to skip"
// button in the Oct–Dec invoice email. No login: the signed token in the link
// is the whole of the auth (lib/holiday-optout-token.ts).
//
// Nothing is written until Confirm is pressed. The load is a plain read, so a
// mail scanner opening this URL changes nothing.
import { Suspense } from 'react';
import type { Metadata } from 'next';
import OptOutClient from './OptOutClient';

export const metadata: Metadata = {
  title: 'Choose your holiday months · AdrianMath',
  robots: { index: false, follow: false },   // a signed link, not a public page
};

export default function HolidayOptOutPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-500">Loading…</div>}>
      <OptOutClient />
    </Suspense>
  );
}
