// 💡 Suggestions in the top bar — the same pill as Invite beside it (Adrian, 7 Oct
// 2026: "can suggestions stand out a little more?" → a yellow pill with a dot →
// "Nah, do something like the invite").
import Link from 'next/link';

export default function SuggestLink() {
  return (
    <Link href="/app/suggestions"
      className="flex items-center gap-1 rounded-full border border-navy/20 bg-white px-2 sm:px-2.5 py-1 text-xs font-semibold text-navy hover:bg-navy/5 active:scale-95 transition">
      <span aria-hidden>💡</span>Suggestions
    </Link>
  );
}
