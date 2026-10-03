// The qualitative-analysis page, drawn (3 Oct 2026, Adrian: "do a page that
// helps student remember instead — with diagrams arrows all that stuff").
// Server-rendered inline SVG: test tubes with the precipitate in its colour,
// an arrow for every reagent, a three-step route to the cation. Data and the
// colours: lib/qa-visual.ts (pinned to the scheme's wording by its test).
import type { ReactNode } from 'react';
import { QA_CARDS, QA_GROUP_LABEL, type QaGroup } from '@/lib/qa-cards';
import {
  ANION_ROWS, CATION_ROWS, GAS_ROWS, PPT_FILL, SOLUTION_FILL,
  type CationRow, type PptColour, type Reaction, type ResultPicture, type TestRow,
} from '@/lib/qa-visual';

const CARD = 'bg-white rounded-3xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_6px_16px_-4px_rgba(15,23,42,0.08)]';
const INK = '#334155';

// ── drawings ────────────────────────────────────────────────────────────────

/** A test tube: the liquid, and a precipitate settled in it. */
function Tube({ liquid = SOLUTION_FILL.clear, ppt, faint, bubbles, label }: {
  liquid?: string; ppt?: PptColour; faint?: boolean; bubbles?: boolean; label: string;
}) {
  return (
    <svg viewBox="0 0 44 84" className="w-10 h-[76px] shrink-0" role="img" aria-label={label}>
      <path d="M9.5 26 H34.5 V62 a12.5 12.5 0 0 1 -25 0 Z" fill={liquid} />
      {ppt && (
        <g opacity={faint ? 0.45 : 1}>
          <path d={faint ? 'M9.5 66 H34.5 a12.5 12.5 0 0 1 -25 0 Z' : 'M9.5 50 H34.5 V62 a12.5 12.5 0 0 1 -25 0 Z'}
            fill={PPT_FILL[ppt]} stroke={ppt === 'white' ? '#94a3b8' : 'none'} strokeWidth="1" />
          {!faint && [[15, 46], [22, 43], [29, 46], [18, 40], [26, 39]].map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" fill={PPT_FILL[ppt]} stroke={ppt === 'white' ? '#94a3b8' : 'none'} strokeWidth="0.7" />
          ))}
        </g>
      )}
      {bubbles && [[16, 60, 2.6], [26, 52, 2], [20, 42, 2.4], [29, 36, 1.8], [15, 30, 2], [24, 20, 2.2], [18, 11, 1.8]].map(([x, y, r]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill="#fff" stroke="#64748b" strokeWidth="1" />
      ))}
      <path d="M8 4 V62 a14 14 0 0 0 28 0 V4" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />
      <path d="M4 4 H40" stroke={INK} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** A strip of litmus paper changing colour. */
function Litmus({ from, to }: { from: 'red' | 'blue'; to: 'blue' | 'white' }) {
  const fill = { red: '#e5484d', blue: '#3b6fe0', white: '#ffffff' };
  return (
    <svg viewBox="0 0 64 84" className="w-[58px] h-[76px] shrink-0" role="img" aria-label={`damp ${from} litmus paper turns ${to === 'white' ? 'white (bleached)' : to}`}>
      <rect x="4" y="18" width="16" height="48" rx="2" fill={fill[from]} stroke={INK} strokeWidth="1.5" />
      <path d="M25 42 H37 M33 37 L38 42 L33 47" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="44" y="18" width="16" height="48" rx="2" fill={fill[to]} stroke={INK} strokeWidth="1.5" strokeDasharray={to === 'white' ? '3 2' : undefined} />
    </svg>
  );
}

/** A wooden splint: a pop for hydrogen, a flame come back for oxygen. */
function Splint({ lit }: { lit: 'pop' | 'relights' }) {
  return (
    <svg viewBox="0 0 64 84" className="w-[58px] h-[76px] shrink-0" role="img" aria-label={lit === 'pop' ? 'a lighted splint goes out with a pop' : 'a glowing splint relights'}>
      <path d="M10 78 L34 36" stroke="#a16207" strokeWidth="4" strokeLinecap="round" />
      {lit === 'relights' ? (
        <>
          <path d="M36 34 C26 24 34 16 37 6 C42 16 50 24 40 34 Z" fill="#f59e0b" stroke="#b45309" strokeWidth="1.5" />
          <path d="M37 32 C33 27 36 23 38 18 C40 23 43 27 39 32 Z" fill="#fde68a" />
        </>
      ) : (
        <>
          {[[36, 20, 36, 8], [46, 24, 55, 15], [50, 34, 62, 33], [26, 24, 18, 14], [46, 44, 55, 52]].map(([x1, y1, x2, y2]) => (
            <path key={`${x2}-${y2}`} d={`M${x1} ${y1} L${x2} ${y2}`} stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" />
          ))}
          <circle cx="36" cy="33" r="5" fill="#f59e0b" />
          <text x="44" y="76" fontSize="14" fontWeight="700" fill="#b45309" textAnchor="middle" fontFamily="system-ui, sans-serif">pop!</text>
        </>
      )}
    </svg>
  );
}

/** An arrow with the reagent written on it. */
function Arrow({ children, down }: { children?: ReactNode; down?: boolean }) {
  if (down) {
    return (
      <svg viewBox="0 0 20 26" className="w-5 h-6 mx-auto" aria-hidden>
        <path d="M10 2 V22 M4 16 L10 23 L16 16" fill="none" stroke="#7c3aed" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <span className="flex flex-col items-center shrink-0 min-w-[52px] max-w-[84px]">
      <span className="text-[11px] leading-tight font-semibold text-purple-700 text-center">{children}</span>
      <svg viewBox="0 0 52 12" className="w-[52px] h-3" aria-hidden>
        <path d="M2 6 H48 M42 1.5 L49 6 L42 10.5" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function Shot({ children, words }: { children: ReactNode; words: ReactNode }) {
  return (
    <span className="flex flex-col items-center w-[74px] shrink-0">
      {children}
      <span className="mt-0.5 text-[11px] leading-tight text-center text-gray-600">{words}</span>
    </span>
  );
}

function Ion({ children }: { children: ReactNode }) {
  return <strong className="inline-block rounded-lg bg-purple-600 text-white px-2 py-0.5 text-[15px] font-bold whitespace-nowrap">{children}</strong>;
}

// ── the cation finder: three steps ──────────────────────────────────────────

function Branch({ children, last }: { children: ReactNode; last?: boolean }) {
  return <li className={`flex items-center gap-2 py-1.5 ${last ? '' : 'border-b border-gray-100'}`}>{children}</li>;
}

function Step({ n, title, children }: { n: number; title: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-purple-200 bg-purple-50/40 px-3 py-2.5">
      <p className="flex items-center gap-2 text-[14px] font-bold text-navy">
        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-purple-600 text-white text-[12px] shrink-0">{n}</span>
        <span>{title}</span>
      </p>
      <ul className="mt-1">{children}</ul>
    </div>
  );
}

function GoOn() {
  return <span className="text-[12px] font-semibold text-purple-700 whitespace-nowrap">go on ↓</span>;
}

function CationFinder() {
  return (
    <section className={`${CARD} p-4 space-y-1.5`} aria-label="Find the cation in three steps">
      <h2 className="text-[17px] font-bold text-navy">Find the cation in three steps</h2>
      <Step n={1} title={<>Add a few drops of NaOH(aq). What do you see?</>}>
        <Branch><Tube ppt="light blue" label="light blue precipitate" /><span className="flex-1 text-[13px] text-gray-700">light blue precipitate</span><Arrow /><Ion>Cu²⁺</Ion></Branch>
        <Branch><Tube ppt="green" label="green precipitate" /><span className="flex-1 text-[13px] text-gray-700">green precipitate</span><Arrow /><Ion>Fe²⁺</Ion></Branch>
        <Branch><Tube ppt="red-brown" label="red-brown precipitate" /><span className="flex-1 text-[13px] text-gray-700">red-brown precipitate</span><Arrow /><Ion>Fe³⁺</Ion></Branch>
        <Branch><Tube label="no precipitate" /><span className="flex-1 text-[13px] text-gray-700">no precipitate.<br />Warm: ammonia produced</span><Arrow /><Ion>NH₄⁺</Ion></Branch>
        <Branch last><Tube ppt="white" label="white precipitate" /><span className="flex-1 text-[13px] text-gray-700">white precipitate.<br />Al³⁺, Ca²⁺ or Zn²⁺</span><GoOn /></Branch>
      </Step>
      <Arrow down />
      <Step n={2} title={<>White? Add NaOH(aq) in excess.</>}>
        <Branch><Tube ppt="white" label="white precipitate stays" /><span className="flex-1 text-[13px] text-gray-700">precipitate stays</span><Arrow /><Ion>Ca²⁺</Ion></Branch>
        <Branch last><Tube label="colourless solution" /><span className="flex-1 text-[13px] text-gray-700">dissolves, colourless solution.<br />Al³⁺ or Zn²⁺</span><GoOn /></Branch>
      </Step>
      <Arrow down />
      <Step n={3} title={<>Fresh sample. Add NH₃(aq) in excess.</>}>
        <Branch><Tube ppt="white" label="white precipitate stays" /><span className="flex-1 text-[13px] text-gray-700">precipitate stays</span><Arrow /><Ion>Al³⁺</Ion></Branch>
        <Branch last><Tube label="colourless solution" /><span className="flex-1 text-[13px] text-gray-700">dissolves, colourless solution</span><Arrow /><Ion>Zn²⁺</Ion></Branch>
      </Step>
    </section>
  );
}

// ── every cation, both reagents ─────────────────────────────────────────────

function Lane({ reagent, r }: { reagent: string; r: Reaction | null }) {
  let body: ReactNode;
  if (!r) body = <span className="text-[12px] text-gray-400">not tested with this</span>;
  else if (r.kind === 'ammonia') {
    body = (<>
      <Shot words="no precipitate"><Tube label="no precipitate" /></Shot>
      <Arrow>warm</Arrow>
      <Shot words="ammonia produced"><Litmus from="red" to="blue" /></Shot>
    </>);
  } else if (r.kind === 'slight') {
    body = <Shot words={<>no precipitate, or very slight white</>}><Tube ppt="white" faint label="no precipitate, or a very slight white precipitate" /></Shot>;
  } else {
    const dissolves = r.excess === 'soluble';
    body = (<>
      <Shot words={`${r.colour} precipitate`}><Tube ppt={r.colour} label={`${r.colour} precipitate`} /></Shot>
      <Arrow>excess</Arrow>
      {dissolves
        ? <Shot words={<><b className="text-emerald-700">dissolves</b><br />{r.solution} solution</>}><Tube liquid={SOLUTION_FILL[r.solution ?? 'colourless']} label={`${r.solution} solution`} /></Shot>
        : <Shot words={<b className="text-rose-700">stays</b>}><Tube ppt={r.colour} label={`${r.colour} precipitate, insoluble in excess`} /></Shot>}
    </>);
  }
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-[62px] shrink-0 text-[12px] font-bold text-navy leading-tight">{reagent}</span>
      {body}
    </div>
  );
}

function CationCard({ row }: { row: CationRow }) {
  return (
    <section className={`${CARD} p-4`} aria-label={`${row.ion} ${row.name}`}>
      <p className="flex items-baseline gap-2"><Ion>{row.ion}</Ion><span className="text-[14px] font-semibold text-navy">{row.name}</span></p>
      <p className="mt-1 text-[13px] text-gray-600">{row.hook}</p>
      <div className="mt-2 space-y-2">
        <Lane reagent="NaOH(aq)" r={row.naoh} />
        <Lane reagent="NH₃(aq)" r={row.nh3} />
      </div>
    </section>
  );
}

// ── anions and gases: reagent arrows, then what you see ─────────────────────

function Picture({ p, words }: { p: ResultPicture; words: string }) {
  if (p.kind === 'ppt') return <Tube ppt={p.colour} label={words} />;
  if (p.kind === 'bubbles') return <Tube bubbles label={words} />;
  if (p.kind === 'litmus') return <Litmus from={p.from} to={p.to} />;
  if (p.kind === 'splint') return <Splint lit={p.lit} />;
  return (
    <span className="flex items-center shrink-0" role="img" aria-label={words}>
      <Tube liquid={SOLUTION_FILL.purple} label="purple" />
      <svg viewBox="0 0 16 12" className="w-4 h-3" aria-hidden><path d="M1 6 H13 M9 2 L14 6 L9 10" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      <Tube label="colourless" />
    </span>
  );
}

function TestCard({ row }: { row: TestRow }) {
  return (
    <section className={`${CARD} p-4`} aria-label={`${row.symbol} ${row.name}`}>
      <p className="flex items-baseline gap-2"><Ion>{row.symbol}</Ion><span className="text-[14px] font-semibold text-navy">{row.name}</span></p>
      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
        {row.steps.map((s, i) => <Arrow key={s}>{i > 0 ? `then ${s}` : s}</Arrow>)}
        <Picture p={row.picture} words={row.see} />
        <span className="flex-1 min-w-[96px] text-[13px] font-semibold text-gray-800 leading-snug">{row.see}</span>
      </div>
    </section>
  );
}

function Remember({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 text-[13.5px] leading-relaxed text-gray-800">
      <p className="font-bold text-amber-800 text-[12px] uppercase tracking-wide">Remember</p>
      {children}
    </div>
  );
}

const GROUPS: QaGroup[] = ['cation', 'anion', 'gas'];

export default function QaVisual() {
  return (
    <div className="space-y-6">
      <nav className="flex gap-2 text-[13px] font-semibold" aria-label="Jump to">
        {[['#cations', 'Cations'], ['#anions', 'Anions'], ['#gases', 'Gases'], ['#words', 'Exact words']].map(([href, label]) => (
          <a key={href} href={href} className="rounded-full bg-white border border-gray-200 px-3 py-1.5 text-navy">{label}</a>
        ))}
      </nav>

      <div id="cations" className="space-y-3 scroll-mt-20">
        <CationFinder />
        <Remember>
          <p><b>Zinc</b> dissolves in excess of both.</p>
          <p><b>Aluminium</b> dissolves in excess NaOH only.</p>
          <p><b>Calcium</b> dissolves in neither.</p>
          <p>Blue is copper. Green is iron(II). Red-brown is iron(III).</p>
        </Remember>
        <h2 className="text-[17px] font-bold text-navy pt-1">Each cation, both reagents</h2>
        <div className="grid gap-3 sm:grid-cols-2">{CATION_ROWS.map(r => <CationCard key={r.key} row={r} />)}</div>
      </div>

      <div id="anions" className="space-y-3 scroll-mt-20">
        <h2 className="text-[17px] font-bold text-navy">Anions</h2>
        <Remember>
          <p>Acidify with <b>dilute nitric acid</b> first.</p>
          <p><b>Silver nitrate</b>: chloride white, iodide yellow.</p>
          <p><b>Barium nitrate</b>: sulfate white.</p>
        </Remember>
        <div className="grid gap-3 sm:grid-cols-2">{ANION_ROWS.map(r => <TestCard key={r.id} row={r} />)}</div>
      </div>

      <div id="gases" className="space-y-3 scroll-mt-20">
        <h2 className="text-[17px] font-bold text-navy">Gases</h2>
        <Remember>
          <p>Hydrogen <b>pops</b>. Oxygen <b>relights</b>.</p>
          <p>Ammonia is the only gas here that turns damp red litmus <b>blue</b>.</p>
        </Remember>
        <div className="grid gap-3 sm:grid-cols-2">{GAS_ROWS.map(r => <TestCard key={r.id} row={r} />)}</div>
      </div>

      <details id="words" className={`${CARD} p-4 scroll-mt-20`}>
        <summary className="text-[15px] font-bold text-navy cursor-pointer">The exact words to write in the exam</summary>
        {GROUPS.map(g => (
          <div key={g} className="mt-3">
            <p className="text-[12px] font-bold uppercase tracking-wide text-gray-500">{QA_GROUP_LABEL[g]}</p>
            <ul className="mt-1 divide-y divide-gray-100">
              {QA_CARDS.filter(c => c.group === g).map(c => (
                <li key={c.id} className="py-1.5 text-[13px] leading-snug">
                  <span className="font-semibold text-navy">{c.subject}</span>
                  <span className="text-gray-500"> · {c.test}</span>
                  <br /><span className="text-gray-800">{c.result}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </details>
    </div>
  );
}
