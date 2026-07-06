'use client';

import { useState } from 'react';
import { faqs } from '@/lib/faqs';

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
