'use client';
// 🔍 Search the papers in one tab (17 Sep 2026: "the search is also good").
// Every entry is rendered on the server and handed here with the words a
// student might type (the paper's name, its date, its score); this only
// decides which entries stay visible. The box appears once a tab holds
// SEARCH_FROM papers or more — below that, the list is already one screen.
import { useState, type ReactNode } from 'react';

export const SEARCH_FROM = 8;

export interface SearchEntry { key: string; haystack: string; node: ReactNode }

export default function PaperSearch({ entries }: { entries: SearchEntry[] }) {
  const [q, setQ] = useState('');
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = words.length ? entries.filter(e => words.every(w => e.haystack.includes(w))) : entries;
  return (
    <div className="space-y-2.5">
      {entries.length >= SEARCH_FROM && (
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search your papers — 2023, paper 2, prelim…" aria-label="Search papers"
          className="w-full text-sm bg-white border border-black/10 rounded-2xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-navy/20" data-paper-search />
      )}
      {shown.length === 0 && <p className="text-sm text-gray-500 px-1">No paper matches. Try another word.</p>}
      {shown.map(e => <div key={e.key}>{e.node}</div>)}
    </div>
  );
}
