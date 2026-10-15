// A real photograph a Geography question shows (SPEC-HUMANITIES.md §B, 15 Oct 2026), with its credit
// line in small grey under it, linking to where the photo comes from. Kept out of sources.tsx because
// that file also reaches a client page (the timed paper) and this one reads the photo bank.
import { photoByKey, photoCredit } from '@/lib/humanities-questions';

export function PhotoCard({ photo }: { photo: { key: string; caption: string } }) {
  const p = photoByKey(photo.key);
  if (!p) return null;
  return (
    <figure className="bg-white rounded-3xl p-4 border border-black/5 shadow-sm">
      <figcaption className="text-sm font-bold text-navy">{photo.caption}</figcaption>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/humanities/photos/${p.file}`} alt={p.title} className="w-full h-auto mt-2 rounded-xl" />
      <p className="mt-1.5 text-[11px] leading-snug text-gray-400">
        <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">{photoCredit(p)}</a>
      </p>
    </figure>
  );
}
