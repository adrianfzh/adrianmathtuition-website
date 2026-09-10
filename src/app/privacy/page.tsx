// Privacy page for the AdrianMath app — the SHORT, parent-facing version
// (docs/PRIVACY-DRAFT-2026-09.md, live since 11 Sep 2026). Adrian: "can you
// don't reveal the stack?" — no service is named here; the processor list is
// internal reference only (that doc's foot). The consent checkbox at account
// activation references this page; POLICY_VERSION in src/lib/portal-consent.ts
// must be bumped when what is collected or why materially changes.
import Link from 'next/link';

export const metadata = {
  title: 'Privacy — AdrianMath',
  description: 'What the AdrianMath app keeps about your child, why, for how long, and what you can ask us to do.',
};

const POLICY_VERSION_LABEL = 'Version 2 · September 2026';
const CONTACT_EMAIL = 'adrianmathtuition@gmail.com';

export default function PrivacyPage() {
  const h2 = 'text-lg font-bold text-navy mt-8 mb-2';
  const p = 'text-[15px] leading-relaxed text-gray-700 mb-3';
  const li = 'text-[15px] leading-relaxed text-gray-700 mb-2';

  return (
    <main className="min-h-screen bg-[hsl(45,100%,98%)]">
      <div className="max-w-2xl mx-auto px-5 py-12">
        <h1 className="text-2xl font-bold text-navy mb-1">Privacy at AdrianMath</h1>
        <p className="text-sm text-gray-500 mb-8">{POLICY_VERSION_LABEL} · Adrian&apos;s Math Tuition, Singapore</p>

        <p className={p}>
          This page explains what the AdrianMath app keeps about your child, why, how long, and
          what you can ask us to do. Accounts are opened only with a parent&apos;s or guardian&apos;s
          consent, given through the invite sent to the parent&apos;s email.
        </p>

        <h2 className={h2}>What we keep and why</h2>
        <ul className="list-disc pl-5">
          <li className={li}>
            <strong>Contact and account details</strong> — your child&apos;s name and school level, the
            email used to sign in, and your contact details as the parent, so we know whose work is
            whose and can reach you.
          </li>
          <li className={li}>
            <strong>Your child&apos;s schoolwork and our feedback on it</strong> — the work handed in, our
            marking and comments, practice done in the app, and questions asked, so we can mark the
            work, return it, and choose what to practise next.
          </li>
          <li className={li}>
            <strong>Tuition records</strong> — lessons, attendance and invoices, which Adrian already
            keeps as your tutor.
          </li>
          <li className={li}>
            <strong>App usage</strong> — when the app was last used and which parts, so we can keep it
            working and notice who needs a nudge.
          </li>
        </ul>
        <p className={p}>
          We do not sell your child&apos;s data, show advertising, or use it for anything other than
          tuition. Marking and feedback are produced with the help of AI tools that Adrian checks;
          these tools are not permitted to train on your child&apos;s work.
        </p>

        <h2 className={h2}>Who else handles it</h2>
        <p className={p}>
          We use a small number of trusted service providers for hosting, storage, email and AI
          processing, under terms that limit them to our purposes. Some of them process data outside
          Singapore; we only use providers that protect data to a standard comparable to Singapore&apos;s
          Personal Data Protection Act. Work is sent for AI processing without your child&apos;s name
          attached.
        </p>

        <h2 className={h2}>How long we keep it</h2>
        <p className={p}>
          While your child is a student with Adrian, and for up to 12 months after the account goes
          quiet. Marked papers are Adrian&apos;s teaching record and are kept for as long as that record
          is needed. If you ask us to remove anything earlier, we will, unless we must keep it for a
          legal or accounting reason.
        </p>

        <h2 className={h2}>Your choices</h2>
        <ul className="list-disc pl-5">
          <li className={li}>
            In the app&apos;s Settings you can download everything the app holds about your child, or
            delete the account.
          </li>
          <li className={li}>
            You can ask Adrian at any time to see, correct or delete data, or to withdraw consent.
            Withdrawing consent closes the account.
          </li>
          <li className={li}>Notifications and the messaging helper are optional.</li>
        </ul>

        <h2 className={h2}>How it is protected</h2>
        <p className={p}>
          Each account can only ever see its own records, and connections are encrypted. If we ever
          learn of a data breach affecting your child, we will tell you, and the Personal Data
          Protection Commission where the law requires it.
        </p>

        <h2 className={h2}>Contact</h2>
        <p className={p}>
          Adrian Fong is the tutor and the data protection officer. Message him directly or email{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="underline">{CONTACT_EMAIL}</a> for questions,
          corrections or complaints.
        </p>

        <p className="text-sm text-gray-500 mt-10">
          <Link href="/" className="underline">← adrianmathtuition.com</Link>
        </p>
      </div>
    </main>
  );
}
