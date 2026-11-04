'use client';

// 👪 "Weekly report for a parent" on /app/settings (SPEC-PARENT-REPORT.md). The
// student makes a 7-day link and sends it (WhatsApp share or copy); the parent
// confirms on their phone. The card always says plainly when a parent is linked.
// Shown only when lib/portal-beta parentReportVisible is true for this student.
import { useEffect, useState } from 'react';
import { portalFetch, portalMessage } from '@/lib/portal-fetch';

const card = 'bg-white rounded-2xl border border-black/5 shadow-sm p-5';
const btn = 'bg-navy text-[hsl(45,100%,96%)] rounded-xl px-4 py-2 text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50';

type Link = { id: string; status: 'pending' | 'active'; since: string; url: string | null; expires: string | null };

const day = (iso: string) => new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' });

export default function ParentLinkCard() {
  const [links, setLinks] = useState<Link[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function load() {
    const j = await portalFetch<{ open?: boolean; links?: Link[] }>('/api/portal/parent-link');
    setLinks(j.open ? (j.links ?? []) : null);
  }
  useEffect(() => { load().catch(() => setLinks(null)); }, []);

  async function make() {
    setBusy(true); setMsg('');
    try { await portalFetch('/api/portal/parent-link', { method: 'POST', fallback: 'Could not make a link just now.' }); }
    catch (e) { setBusy(false); return setMsg(portalMessage(e)); }
    setBusy(false);
    await load();
  }
  async function cancel(id: string) {
    setBusy(true);
    try { await portalFetch('/api/portal/parent-link', { method: 'DELETE', json: { id } }); }
    catch (e) { setMsg(portalMessage(e)); }
    setBusy(false);
    await load();
  }
  async function copy(url: string) {
    try { await navigator.clipboard.writeText(url); setMsg('Link copied.'); } catch { setMsg(url); }
  }

  if (!links) return null;
  const active = links.filter(l => l.status === 'active');
  const pending = links.find(l => l.status === 'pending');
  const share = (url: string) => `https://wa.me/?text=${encodeURIComponent(`Please confirm my weekly maths report: ${url}`)}`;

  return (
    <div className={card}>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Weekly report for a parent</p>
      {active.length > 0 && (
        <p className="text-sm text-gray-700 mb-3">
          👪 {active.length === 1 ? 'A parent is linked' : `${active.length} parents are linked`} (since {day(active[0].since)}).
          Every Sunday evening they get a short report on your practice and marked papers.
        </p>
      )}
      {!active.length && !pending && (
        <p className="text-sm text-gray-600 mb-3">
          Send a parent a link. After they confirm, they get a short report every Sunday evening: what you practised, how your papers went, and one thing to work on.
        </p>
      )}
      {pending?.url ? (
        <div className="space-y-2">
          <p className="text-sm text-gray-600">Waiting for your parent to confirm. The link works until {day(pending.expires!)}.</p>
          <a href={share(pending.url)} className="block w-full text-center rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white">Send on WhatsApp</a>
          <div className="flex gap-3 text-sm">
            <button type="button" onClick={() => copy(pending.url!)} className="text-navy underline">Copy link</button>
            <button type="button" disabled={busy} onClick={() => cancel(pending.id)} className="text-gray-400 underline">Cancel</button>
          </div>
        </div>
      ) : (
        <button type="button" className={btn} disabled={busy} onClick={make}>{busy ? 'Making…' : active.length ? 'Link another parent' : 'Make a link for my parent'}</button>
      )}
      {msg && <p className="text-sm text-gray-600 mt-2 break-all">{msg}</p>}
    </div>
  );
}
