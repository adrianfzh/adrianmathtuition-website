// 💡 Suggestions (5 Oct 2026) — the quiet row on Home and in Settings that opens
// /app/suggestions. Rendered only when suggestionsOpen() (lib/portal-beta).
import Link from 'next/link';

export default function SuggestCard({ variant = 'home' }: { variant?: 'home' | 'settings' }) {
  const row = variant === 'home'
    ? 'flex items-center gap-3 bg-white rounded-2xl px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:bg-slate-50 active:scale-[0.99] transition'
    : 'flex items-center gap-3 bg-white rounded-2xl border border-black/5 shadow-sm px-5 py-4 hover:bg-slate-50 transition';
  return (
    <Link href="/app/suggestions" className={row}>
      <span aria-hidden className="text-lg shrink-0">💡</span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-navy">Suggestions</span>
        <span className="block text-xs text-slate-500">What would help you for your exams?</span>
      </span>
      <span aria-hidden className="shrink-0 text-slate-400">›</span>
    </Link>
  );
}
