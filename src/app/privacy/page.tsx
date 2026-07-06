// Privacy policy for the AdrianMath student portal. The consent checkbox at
// account activation references this page; POLICY_VERSION in
// src/lib/portal-consent.ts must be bumped when this materially changes.
import Link from 'next/link';

export const metadata = {
  title: 'Privacy Policy — AdrianMath',
  description: 'How AdrianMath collects, uses, and protects student data.',
};

const POLICY_VERSION_LABEL = 'Version 1 · July 2026';

export default function PrivacyPage() {
  const h2 = 'text-lg font-bold text-navy mt-8 mb-2';
  const p = 'text-[15px] leading-relaxed text-gray-700 mb-3';

  return (
    <main className="min-h-screen bg-[hsl(45,100%,98%)]">
      <div className="max-w-2xl mx-auto px-5 py-12">
        <h1 className="text-2xl font-bold text-navy mb-1">Privacy Policy</h1>
        <p className="text-sm text-gray-500 mb-8">{POLICY_VERSION_LABEL} · Adrian&apos;s Math Tuition, Singapore</p>

        <p className={p}>
          This policy explains what personal data the AdrianMath student portal collects, why,
          and the rights parents and students have over it. Most portal users are under 18, so
          accounts are created only with a parent or guardian&apos;s explicit consent, given at
          account setup via an invite sent to the parent&apos;s email.
        </p>

        <h2 className={h2}>What we collect</h2>
        <ul className="list-disc pl-5 space-y-1.5 text-[15px] text-gray-700 mb-3">
          <li><strong>Account details</strong> — the student&apos;s name, school level, login email, and the parent&apos;s email and consent record.</li>
          <li><strong>Practice work</strong> — answers and working the student submits for feedback, the AI feedback given, scores, and topic/error tags.</li>
          <li><strong>Lesson information</strong> — schedule and progress records Adrian already keeps as your tutor, shown to the student in their dashboard.</li>
        </ul>

        <h2 className={h2}>Why we collect it</h2>
        <p className={p}>
          Solely to run the portal: grading practice work, showing progress over time, and
          personalising feedback to the student&apos;s recurring weak spots. We do not sell data,
          use it for advertising, or share it beyond the processors listed below.
        </p>

        <h2 className={h2}>Who processes it</h2>
        <ul className="list-disc pl-5 space-y-1.5 text-[15px] text-gray-700 mb-3">
          <li><strong>Anthropic</strong> (Claude API) — grades submitted work. Submissions are sent without the student&apos;s name, and Anthropic does not train on this data.</li>
          <li><strong>Supabase</strong> — database and login system (data encrypted at rest).</li>
          <li><strong>Vercel</strong> — website hosting.</li>
          <li><strong>Resend</strong> — transactional email (invites, password resets).</li>
        </ul>

        <h2 className={h2}>How it&apos;s protected</h2>
        <p className={p}>
          Each student&apos;s data is isolated at the database level — an account can only ever read
          its own records. Access from our systems uses least-privilege credentials, traffic is
          encrypted in transit, and student work is never written to server logs.
        </p>

        <h2 className={h2}>Your rights</h2>
        <p className={p}>
          From the portal&apos;s Settings page you can <strong>download all of the student&apos;s data</strong> or{' '}
          <strong>delete the account</strong> — deletion permanently removes the account, all practice
          work, and feedback. You can also email us to access, correct, or delete data, or to withdraw
          consent (which ends portal use). Inactive practice data is periodically purged.
        </p>

        <h2 className={h2}>Contact</h2>
        <p className={p}>
          Data protection is handled by Adrian Fong (tutor and data protection officer).
          Questions, corrections, or complaints: message Adrian directly or email{' '}
          <a href="mailto:ablnon@hotmail.com" className="text-navy underline underline-offset-2">ablnon@hotmail.com</a>.
          If we ever become aware of a data breach affecting your child, we will notify you and,
          where required, the PDPC.
        </p>

        <p className="text-sm text-gray-400 mt-10">
          <Link href="/" className="underline underline-offset-2">← adrianmathtuition.com</Link>
        </p>
      </div>
    </main>
  );
}
