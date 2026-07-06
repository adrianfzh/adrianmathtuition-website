// Single source of truth for the homepage FAQ — rendered by <FAQ /> (client)
// and serialized into FAQPage JSON-LD by the homepage (server). Keeping both
// on one array satisfies Google's rule that structured data must match the
// visible page content.
export const faqs = [
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
