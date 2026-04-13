'use client';

import Script from 'next/script';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    flatpickr?: (el: HTMLElement, config: Record<string, unknown>) => { destroy: () => void };
  }
}

const DAY_INDICES: Record<string, number> = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
  Thursday: 4, Friday: 5, Saturday: 6,
};

function getNextOccurrence(dayIndex: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  let daysUntil = (dayIndex - d.getDay() + 7) % 7;
  if (daysUntil === 0) daysUntil = 7;
  d.setDate(d.getDate() + daysUntil);
  return d;
}

interface SlotData {
  level: string;
  subjects: string[];
  subjectLevel: string;
  slotId: string;
  slotName: string;
  slotDay: string;
  slotTime: string;
}

function SignupContent() {
  const params = useSearchParams();
  const router = useRouter();

  const slotId       = params.get('slotId')       || '';
  const level        = params.get('level')        || '';
  const subjects     = params.get('subjects')     || '';
  const subjectLevel = params.get('subjectLevel') || '';
  const expires      = params.get('expires')      || '';
  const sig          = params.get('sig')          || '';

  const [pageState, setPageState] = useState<'loading' | 'error' | 'form'>('loading');
  const [errorMsg, setErrorMsg]   = useState('');
  const [slotData, setSlotData]   = useState<SlotData | null>(null);
  const [studentName, setStudentName] = useState('');
  const [howHeard, setHowHeard]   = useState('');
  const [showReferral, setShowReferral] = useState(false);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [fpReady, setFpReady]     = useState(false);
  const [datePick, setDatePick]   = useState('');

  const dateInputRef = useRef<HTMLInputElement>(null);
  const fpRef        = useRef<{ destroy: () => void } | null>(null);
  const savedSlotTimeRef = useRef('');

  // Add flatpickr CSS dynamically
  useEffect(() => {
    const link = document.createElement('link');
    link.rel  = 'stylesheet';
    link.href = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css';
    document.head.appendChild(link);
    return () => { document.head.removeChild(link); };
  }, []);

  // Validate link and load slot data
  useEffect(() => {
    if (!slotId || !level || !expires || !sig) {
      setErrorMsg('This registration link is invalid. Please contact Adrian for a new link.');
      setPageState('error');
      return;
    }
    const qs = new URLSearchParams({ slotId, level, subjects, subjectLevel, expires, sig });
    fetch('/api/signup-data?' + qs.toString())
      .then(r => r.json().then(d => ({ ok: r.ok, data: d })))
      .then(({ ok, data }) => {
        if (!ok) {
          const expired = data.error?.includes('used') || data.error?.includes('expired');
          setErrorMsg(expired
            ? 'This registration link has expired or has already been used. Please contact Adrian for a new link.'
            : 'This registration link is invalid. Please contact Adrian for a new link.'
          );
          setPageState('error');
          return;
        }
        setSlotData(data);
        savedSlotTimeRef.current = (data.slotTime || '').replace(/^\d+\s/, '').trim();
        setPageState('form');
      })
      .catch(() => {
        setErrorMsg('Something went wrong loading your registration link. Please contact Adrian directly via WhatsApp.');
        setPageState('error');
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Init flatpickr when ready
  useEffect(() => {
    if (!fpReady || pageState !== 'form' || !slotData || !dateInputRef.current) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const maxDate = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    const dayName  = (slotData.slotDay || '').replace(/^\d+\s*/, '');
    const dayIndex = DAY_INDICES[dayName];

    const config: Record<string, unknown> = {
      dateFormat:    'Y-m-d',
      minDate:       today,
      maxDate:       maxDate,
      allowInput:    false,
      disableMobile: true,
      showMonths:    2,
      onChange: (selectedDates: Date[], dateStr: string) => {
        setDatePick(dateStr);
      },
    };

    if (dayIndex !== undefined) {
      config.disable = [(date: Date) => date.getDay() !== dayIndex];
      const defaultDate = getNextOccurrence(dayIndex);
      if (defaultDate <= maxDate) {
        config.defaultDate = defaultDate;
        setDatePick(defaultDate.toISOString().split('T')[0]);
      }
    }

    if (fpRef.current) fpRef.current.destroy();
    if (window.flatpickr) {
      fpRef.current = window.flatpickr(dateInputRef.current, config);
    }

    return () => { fpRef.current?.destroy(); };
  }, [fpReady, pageState, slotData]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;

    const form = e.currentTarget;
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    if (!datePick) {
      setFormError('Please select a start date.');
      return;
    }

    // Validate the selected date falls on the correct day of the week
    if (slotData) {
      const dayName = (slotData.slotDay || '').replace(/^\d+\s*/, '');
      const expectedDay = DAY_INDICES[dayName];
      if (expectedDay !== undefined) {
        const picked = new Date(datePick + 'T00:00:00');
        if (picked.getDay() !== expectedDay) {
          setFormError(`The start date must be a ${dayName}. Please select a valid date.`);
          return;
        }
      }
    }

    setSubmitting(true);
    setFormError('');

    const fd = new FormData(form);
    const payload = {
      slotId, expires, sig, level, subjects, subjectLevel,
      studentName:    fd.get('studentName'),
      school:         fd.get('school'),
      studentContact: fd.get('studentContact'),
      parentName:     fd.get('parentName'),
      parentContact:  fd.get('parentContact'),
      parentEmail:    fd.get('parentEmail'),
      startDate:      datePick,
      howHeard:       fd.get('howHeard'),
      referralType:   fd.get('referralType') || '',
      referredBy:     fd.get('referredBy')   || '',
    };

    try {
      const resp = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await resp.json();
      if (resp.ok && data.success) {
        const subjectsDisplay = slotData?.subjects.join(', ') || '';
        router.push(
          `/thankyou?name=${encodeURIComponent(data.studentName)}&date=${encodeURIComponent(data.startDate || '')}&time=${encodeURIComponent(savedSlotTimeRef.current)}&token=${encodeURIComponent(data.registrationToken || '')}&subjects=${encodeURIComponent(subjectsDisplay)}`
        );
      } else {
        setFormError(data.error || 'Something went wrong. Please try again or contact Adrian directly via WhatsApp.');
        setSubmitting(false);
      }
    } catch {
      setFormError('Something went wrong. Please try again or contact Adrian directly via WhatsApp.');
      setSubmitting(false);
    }
  }

  return (
    <>
      <Script
        src="https://cdn.jsdelivr.net/npm/flatpickr"
        strategy="afterInteractive"
        onLoad={() => setFpReady(true)}
      />

      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md border-b border-border">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 no-underline">
            <span className="font-display font-bold text-[18px] tracking-tight text-navy">ADRIAN&apos;S</span>
            <span className="text-muted-foreground text-sm">math tuition</span>
          </a>
          <a href="/" className="inline-flex items-center gap-1.5 text-muted-foreground text-sm font-medium hover:text-navy transition-colors no-underline">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back to website
          </a>
        </div>
      </nav>

      <main className="pt-20 pb-16 min-h-screen">
        <div className="max-w-[600px] mx-auto px-6 py-12">

          {/* Loading */}
          {pageState === 'loading' && (
            <div className="text-center py-20">
              <div className="w-9 h-9 border-[3px] border-border border-t-navy rounded-full animate-spin mx-auto mb-5" />
              <p className="text-muted-foreground text-[15px]">Validating your registration link…</p>
            </div>
          )}

          {/* Error */}
          {pageState === 'error' && (
            <div className="text-center py-20">
              <div className="bg-card rounded-xl p-12 max-w-[480px] mx-auto shadow-sm">
                <div className="text-[48px] mb-4">🔗</div>
                <h2 className="font-display text-[1.5rem] text-navy mb-3">Link Unavailable</h2>
                <p className="text-muted-foreground mb-7 leading-[1.6]">{errorMsg}</p>
                <a
                  href="https://wa.me/6591397985"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-[#25D366] text-white px-6 py-3 rounded-full font-semibold text-[15px] hover:opacity-90 transition-opacity no-underline"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  WhatsApp Adrian
                </a>
              </div>
            </div>
          )}

          {/* Form */}
          {pageState === 'form' && slotData && (
            <>
              <div className="mb-8">
                <h1 className="font-display text-[2rem] text-navy mb-2">Complete Registration</h1>
                <p className="text-muted-foreground text-[15px]">Fill in your details below to confirm your slot.</p>
              </div>

              {/* Summary card */}
              <div className="bg-amber-light border-[1.5px] border-amber rounded-xl px-6 py-5 mb-8">
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[hsl(40,80%,35%)] mb-3">
                  You are registering for
                </div>
                {[
                  { label: 'Level', value: slotData.level },
                  { label: 'Subject(s)', value: slotData.subjects.join(', ') },
                  { label: 'Slot', value: slotData.slotName },
                ].map(r => (
                  <div key={r.label} className="flex items-baseline gap-2.5 mb-1.5 last:mb-0 text-sm">
                    <span className="text-[hsl(40,60%,40%)] min-w-[72px] text-[13px]">{r.label}</span>
                    <span className="font-semibold text-[hsl(220,60%,20%)]">{r.value || '—'}</span>
                  </div>
                ))}
              </div>

              <form onSubmit={handleSubmit} noValidate>
                {/* Lesson Details (pre-filled, display only) */}
                <div className="mb-7">
                  <div className="text-[13px] font-bold uppercase tracking-[0.06em] text-muted-foreground mb-4 pb-2 border-b border-border">
                    Lesson Details
                  </div>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <div className="flex items-center gap-2 text-[15px] font-medium mb-1.5">
                        Level <span className="text-[10px] font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded uppercase tracking-[0.05em]">Pre-filled</span>
                      </div>
                      <input type="text" className="sg-input sg-prefilled" value={slotData.level} readOnly tabIndex={-1} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 text-[15px] font-medium mb-1.5">
                        Subject(s) <span className="text-[10px] font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded uppercase tracking-[0.05em]">Pre-filled</span>
                      </div>
                      <input type="text" className="sg-input sg-prefilled" value={slotData.subjects.join(', ')} readOnly tabIndex={-1} />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 text-[15px] font-medium mb-1.5">
                      Weekly Slot <span className="text-[10px] font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded uppercase tracking-[0.05em]">Pre-filled</span>
                    </div>
                    <input type="text" className="sg-input sg-prefilled" value={slotData.slotName} readOnly tabIndex={-1} />
                  </div>
                </div>

                {/* Student Details */}
                <div className="mb-7">
                  <div className="text-[13px] font-bold uppercase tracking-[0.06em] text-muted-foreground mb-4 pb-2 border-b border-border">
                    Student Details
                  </div>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label htmlFor="studentName" className="block text-[15px] font-medium mb-1.5">
                        Student Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text" id="studentName" name="studentName"
                        className="sg-input" placeholder="e.g. Ahmad Bin Ismail"
                        required autoComplete="name"
                        value={studentName} onChange={e => setStudentName(e.target.value)}
                      />
                    </div>
                    <div>
                      <label htmlFor="school" className="block text-[15px] font-medium mb-1.5">School</label>
                      <input
                        type="text" id="school" name="school"
                        className="sg-input" placeholder="e.g. Raffles Institution"
                        autoComplete="organization"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="studentContact" className="block text-[15px] font-medium mb-1.5">
                      Student Number
                    </label>
                    <input
                      type="tel" id="studentContact" name="studentContact"
                      className="sg-input" placeholder="e.g. 81234567"
                      autoComplete="tel"
                    />
                    <p className="text-[12px] text-muted-foreground mt-1.5">
                      Singapore number, without +65. Leave blank if student uses parent&apos;s number.
                    </p>
                  </div>
                </div>

                {/* Parent Details */}
                <div className="mb-7">
                  <div className="text-[13px] font-bold uppercase tracking-[0.06em] text-muted-foreground mb-4 pb-2 border-b border-border">
                    Parent / Guardian Details
                  </div>
                  <div className="mb-4">
                    <label htmlFor="parentName" className="block text-[15px] font-medium mb-1.5">
                      Parent Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text" id="parentName" name="parentName"
                      className="sg-input"
                      placeholder={studentName ? `${studentName}'s Parent` : "e.g. Ahmad's Parent"}
                      required autoComplete="off"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="parentContact" className="block text-[15px] font-medium mb-1.5">
                        Parent Number <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="tel" id="parentContact" name="parentContact"
                        className="sg-input" placeholder="e.g. 91234567"
                        required autoComplete="tel"
                      />
                      <p className="text-[12px] text-muted-foreground mt-1.5">Singapore number, without +65</p>
                    </div>
                    <div>
                      <label htmlFor="parentEmail" className="block text-[15px] font-medium mb-1.5">
                        Email Address <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="email" id="parentEmail" name="parentEmail"
                        className="sg-input" placeholder="e.g. parent@email.com"
                        required autoComplete="email"
                      />
                    </div>
                  </div>
                </div>

                {/* Start date & referral */}
                <div className="mb-7">
                  <div className="text-[13px] font-bold uppercase tracking-[0.06em] text-muted-foreground mb-4 pb-2 border-b border-border">
                    A Few More Details
                  </div>
                  <div className="mb-4">
                    <label htmlFor="startDate" className="block text-[15px] font-medium mb-1.5">
                      Preferred Start Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text" id="startDate" name="startDate"
                      className="sg-input cursor-pointer"
                      placeholder="Select a date…"
                      readOnly autoComplete="off"
                      ref={dateInputRef}
                    />
                    <p className="text-[12px] text-muted-foreground mt-1.5" id="date-hint">
                      {slotData.slotDay
                        ? `Only ${(slotData.slotDay || '').replace(/^\d+\s*/, '')}s are available for your slot (next 4 weeks).`
                        : 'When would you like your first lesson to be?'}
                    </p>
                  </div>
                  <div className="mb-4">
                    <label htmlFor="howHeard" className="block text-[15px] font-medium mb-1.5">
                      How did you hear about us? <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="howHeard" name="howHeard"
                      className="sg-input"
                      required
                      value={howHeard}
                      onChange={e => {
                        setHowHeard(e.target.value);
                        setShowReferral(e.target.value === 'Referral');
                      }}
                    >
                      <option value="" disabled>Select one…</option>
                      <option value="Referral">Referral</option>
                      <option value="Google Search">Google Search</option>
                      <option value="Social Media">Social Media</option>
                      <option value="Walked Past">Walked Past</option>
                      <option value="School Friend">School Friend</option>
                      <option value="Others">Others</option>
                    </select>
                  </div>
                  {showReferral && (
                    <>
                      <div className="mb-4">
                        <label htmlFor="referralType" className="block text-[15px] font-medium mb-1.5">
                          Referral Type <span className="text-red-500">*</span>
                        </label>
                        <select id="referralType" name="referralType" className="sg-input" required>
                          <option value="" disabled>Select one…</option>
                          <option value="Current Student">Current Student</option>
                          <option value="Past Student">Past Student</option>
                          <option value="Parent">Parent</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                      <div className="mb-4">
                        <label htmlFor="referredBy" className="block text-[15px] font-medium mb-1.5">
                          Referred by (name) <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text" id="referredBy" name="referredBy"
                          className="sg-input" placeholder="Who referred you?"
                          required
                        />
                      </div>
                    </>
                  )}
                </div>

                {/* Terms */}
                <div className="flex items-start gap-3 p-4 bg-card border-[1.5px] border-border rounded-lg mb-6">
                  <input type="checkbox" id="termsCheck" required className="w-[18px] h-[18px] mt-0.5 flex-shrink-0 cursor-pointer accent-navy" />
                  <label htmlFor="termsCheck" className="text-sm text-muted-foreground leading-[1.5] cursor-pointer">
                    I have read and agree to{' '}
                    <a href="/terms" target="_blank" className="text-navy font-medium hover:underline">
                      How Things Work
                    </a>{' '}
                    — Adrian&apos;s lesson policies on fees, replacements, and more.
                  </label>
                </div>

                {/* Form error */}
                {formError && (
                  <div className="bg-[hsl(0,80%,97%)] border border-[hsl(0,70%,85%)] text-[hsl(0,55%,38%)] px-4 py-3 rounded-lg text-sm mb-4 leading-[1.5]">
                    {formError}
                  </div>
                )}

                <p className="text-[12px] text-muted-foreground mb-2">
                  Your information is used only to manage your tuition. Email us to access or delete your data.
                </p>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3.5 px-6 bg-navy text-[hsl(45,100%,96%)] rounded-full text-[16px] font-bold cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-55 disabled:cursor-not-allowed flex items-center justify-center gap-2.5 border-none"
                >
                  {submitting ? (
                    <>
                      <span className="w-[18px] h-[18px] border-2 border-[hsla(45,100%,96%,0.4)] border-t-[hsl(45,100%,96%)] rounded-full animate-spin flex-shrink-0" />
                      Submitting…
                    </>
                  ) : (
                    'Complete Registration'
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </main>

      <footer className="bg-navy text-[hsl(45,100%,96%)] py-12 px-6 text-center">
        <p className="text-[hsl(45,100%,96%)] opacity-40 text-sm">
          &copy; {new Date().getFullYear()}{' '}Adrian&apos;s Math Tuition. All rights reserved.
        </p>
      </footer>
      <footer className="bg-[#111827] text-[#9ca3af] text-[0.8rem] py-6 px-6 text-center leading-relaxed">
        <p className="mb-1">&copy; {new Date().getFullYear()} Adrian&apos;s Math Tuition &middot; Singapore</p>
        <p className="text-[0.75rem]">
          Questions about your data?{' '}
          <a href="mailto:adrian@adrianmathtuition.com" className="text-[#818cf8] no-underline">
            adrian@adrianmathtuition.com
          </a>
        </p>
      </footer>
    </>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-9 h-9 border-[3px] border-border border-t-navy rounded-full animate-spin" />
      </div>
    }>
      <SignupContent />
    </Suspense>
  );
}
