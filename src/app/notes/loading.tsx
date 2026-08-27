// Instant skeleton for every /notes navigation (level index, topic, subgroup)
// — the pages are cookie-gated force-dynamic, so without this a tap shows
// nothing until the full server render returns (Adrian, 2026-08-28: "still
// feels a little slow when i tap A Math or E Math").
export default function NotesLoading() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 pb-24 sm:pb-6" aria-busy>
      <div className="h-3 w-16 rounded bg-black/10 animate-pulse" />
      <div className="mt-3 h-9 w-64 rounded-lg bg-black/10 animate-pulse" />
      <div className="mt-6 space-y-3">
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} className="h-16 rounded-2xl border border-black/5 bg-white shadow-sm animate-pulse" />
        ))}
      </div>
    </div>
  );
}
