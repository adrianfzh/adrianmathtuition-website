// A visual text of OUR OWN (lib/english-own VisualBlock): a poster, a webpage or a post,
// drawn from its blocks — no picture file. A "picture" block says in words what the
// picture shows, so a question can still ask about it.
import type { VisualBlock, VisualTheme } from '@/lib/english-own';

const THEME: Record<VisualTheme, { band: string; soft: string; ink: string; line: string }> = {
  teal: { band: 'bg-teal-700', soft: 'bg-teal-50', ink: 'text-teal-800', line: 'border-teal-200' },
  amber: { band: 'bg-amber-600', soft: 'bg-amber-50', ink: 'text-amber-800', line: 'border-amber-200' },
  rose: { band: 'bg-rose-700', soft: 'bg-rose-50', ink: 'text-rose-800', line: 'border-rose-200' },
  indigo: { band: 'bg-indigo-700', soft: 'bg-indigo-50', ink: 'text-indigo-800', line: 'border-indigo-200' },
  green: { band: 'bg-green-700', soft: 'bg-green-50', ink: 'text-green-800', line: 'border-green-200' },
};
const FORMAT: Record<string, string> = { poster: 'Poster', webpage: 'Webpage', post: 'Post' };

function Block({ b, c }: { b: VisualBlock; c: (typeof THEME)[VisualTheme] }) {
  if (b.t === 'box') {
    return (
      <div className={`rounded-2xl border ${c.line} ${c.soft} px-3.5 py-3`}>
        {b.title && <p className={`text-[12px] font-bold uppercase tracking-wide ${c.ink} mb-1.5`}>{b.title}</p>}
        <ul className="space-y-1">{b.items.map((x, i) => <li key={i} className="text-[14px] leading-snug text-gray-900">{x}</li>)}</ul>
      </div>
    );
  }
  switch (b.t) {
    case 'tagline': return <p className={`text-[15px] font-semibold leading-snug ${c.ink}`}>{b.text}</p>;
    case 'picture': return (
      <div className={`rounded-2xl ${c.soft} border ${c.line} px-3.5 py-4`}>
        <p className={`text-[11px] font-bold uppercase tracking-wide ${c.ink}`}>Picture</p>
        <p className="text-[14px] leading-snug text-gray-700 italic mt-0.5">{b.text}</p>
      </div>
    );
    case 'quote': return <p className={`border-l-4 ${c.line} pl-3 text-[15px] leading-snug text-gray-800 italic`}>{b.text}</p>;
    case 'button': return <p className={`rounded-xl ${c.band} text-white text-center text-[14px] font-bold px-3 py-2.5`}>{b.text}</p>;
    case 'small': return <p className="text-[12.5px] leading-snug text-gray-600">{b.text}</p>;
    default: return <p className="text-[15px] leading-relaxed text-gray-900">{b.text}</p>;
  }
}

export default function VisualText({ format, theme, blocks }: { format: string; theme: VisualTheme; blocks: VisualBlock[] }) {
  const c = THEME[theme] ?? THEME.teal;
  const kicker = blocks.find(b => b.t === 'kicker');
  const headline = blocks.find(b => b.t === 'headline');
  const rest = blocks.filter(b => b !== kicker && b !== headline);
  return (
    <article aria-label={FORMAT[format] ?? 'Text'} className="bg-white rounded-3xl border border-black/5 shadow-sm overflow-hidden">
      <header className={`${c.band} text-white px-4 pt-3.5 pb-4`}>
        {kicker && kicker.t !== 'box' && <p className="text-[11px] font-semibold tracking-wider opacity-90">{kicker.text}</p>}
        {headline && headline.t !== 'box' && <h2 className="text-[22px] font-extrabold leading-tight mt-1">{headline.text}</h2>}
      </header>
      <div className="p-4 space-y-3">{rest.map((b, i) => <Block key={i} b={b} c={c} />)}</div>
    </article>
  );
}
