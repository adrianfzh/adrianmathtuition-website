'use client';

// The leaver's Delete account door (2 Oct 2026). A deactivated student cannot
// reach Settings, where the button lives — so the same erasure
// (POST /api/portal/delete-account) is offered here, folded behind one link.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowser } from '@/lib/supabase-client';
import { portalFetch, portalMessage } from '@/lib/portal-fetch';

export default function DeleteAccount() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (confirm !== 'DELETE') return setMsg('Type DELETE (in capitals) to confirm.');
    if (!window.confirm('This permanently deletes your account and everything in it. There is no undo. Continue?')) return;
    setBusy(true); setMsg('');
    try {
      await portalFetch('/api/portal/delete-account', { json: { confirm }, fallback: 'Could not delete — contact Adrian.' });
      await getSupabaseBrowser().auth.signOut();
      router.replace('/');
    } catch (err) {
      setBusy(false); setMsg(portalMessage(err));
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="block mx-auto text-xs text-gray-500 underline underline-offset-2 mt-4">
        Delete my account
      </button>
    );
  }
  return (
    <form onSubmit={submit} className="mt-4 pt-4 border-t border-black/5 space-y-2">
      <p className="text-sm font-semibold text-red-700">Delete my account</p>
      <p className="text-sm text-gray-600">Download your papers first.</p>
      <p className="text-sm text-gray-600">This removes your login and everything in the app, for good.</p>
      <div className="flex gap-2">
        <input
          value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Type DELETE to confirm"
          className="flex-1 min-w-0 border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
        />
        <button disabled={busy} className="shrink-0 bg-red-600 text-white rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50">
          {busy ? 'Deleting…' : 'Delete'}
        </button>
      </div>
      {msg && <p className="text-sm text-red-600">{msg}</p>}
    </form>
  );
}
