// 💡 Suggestions in the top bar — the same pill as Invite beside it (Adrian, 7 Oct
// 2026: "can suggestions stand out a little more?" → a yellow pill with a dot →
// "Nah, do something like the invite" … "And a better icon?"). The bulb is drawn, not
// the emoji: the emoji is pale on white and all but vanished at this size.
import Link from 'next/link';

export default function SuggestLink() {
  return (
    <Link href="/app/suggestions"
      className="flex items-center gap-1 rounded-full border border-navy/20 bg-white px-2 sm:px-2.5 py-1 text-xs font-semibold text-navy hover:bg-navy/5 active:scale-95 transition">
      <svg viewBox="0 0 24 24" className="w-4 h-4 -ml-0.5" aria-hidden>
        {/* the glass, lit */}
        <path d="M12 2.5a6.5 6.5 0 0 0-3.9 11.7c.6.5 1 1.2 1 2V17h5.8v-.8c0-.8.4-1.5 1-2A6.5 6.5 0 0 0 12 2.5z" fill="#FDB913" stroke="#B77A00" strokeWidth="1.2" strokeLinejoin="round" />
        {/* the cap */}
        <path d="M9.6 19.2h4.8M10.4 21.4h3.2" stroke="#1B2A4E" strokeWidth="1.6" strokeLinecap="round" fill="none" />
        {/* a glint */}
        <path d="M9.3 8.2a3 3 0 0 1 2.2-2.4" stroke="#FFF3C4" strokeWidth="1.3" strokeLinecap="round" fill="none" />
      </svg>
      Suggestions
    </Link>
  );
}
