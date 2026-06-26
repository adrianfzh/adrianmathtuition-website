'use client';

import { useState } from 'react';

const faqs = [
  {
    q: 'Are there material fees?',
    a: 'No material fees at all. Our materials are comprehensive and up-to-date — we take great pride in providing high quality learning resources.',
  },
  {
    q: 'Is there homework?',
    a: 'Homework is provided but optional. We encourage students to practice, but we respect different schedules.',
  },
  {
    q: 'Can students ask questions outside of lessons?',
    a: "Absolutely! Students can WhatsApp Adrian their questions anytime between lessons. We highly encourage this self-directed learning.",
  },
  {
    q: 'What if my child misses a lesson?',
    a: 'No worries — students can do a replacement lesson at any other available time slot.',
  },
  {
    q: 'What are the payment options?',
    a: 'Payment is made through PayNow.',
  },
];

export default function FAQ() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="flex flex-col gap-3">
      {faqs.map((faq, i) => (
        <div key={i} className="bg-card border border-border rounded-xl overflow-hidden">
          <button
            className="w-full text-left px-6 py-5 text-sm font-semibold text-navy flex justify-between items-center hover:opacity-80 transition-opacity"
            onClick={() => setOpen(open === i ? null : i)}
          >
            {faq.q}
            <span className={`transition-transform duration-200 ${open === i ? 'rotate-180' : ''}`}>&#9660;</span>
          </button>
          {open === i && (
            <div className="px-6 pb-5">
              <p className="text-sm text-muted-foreground leading-relaxed">{faq.a}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
