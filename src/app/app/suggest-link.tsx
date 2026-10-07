// 💡 Suggestions in the top bar — the same pill as Invite beside it (Adrian, 7 Oct
// 2026: "can suggestions stand out a little more?" → a yellow pill with a dot →
// "Nah, do something like the invite" … "And a better icon?" → seven drawn options → "G").
import Link from 'next/link';

export default function SuggestLink() {
  return (
    <Link href="/app/suggestions"
      className="flex items-center gap-1 rounded-full border border-navy/20 bg-white px-2 sm:px-2.5 py-1 text-xs font-semibold text-navy hover:bg-navy/5 active:scale-95 transition">
      {/* The sparkle — "something new" (his pick of seven, "G", 7 Oct 2026). */}
      <svg viewBox="0 0 24 24" className="w-4 h-4 -ml-0.5" aria-hidden>
        <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" fill="#FDB913" stroke="#B77A00" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" fill="#FDB913" stroke="#B77A00" strokeWidth="1" strokeLinejoin="round" />
      </svg>
      Suggestions
    </Link>
  );
}
