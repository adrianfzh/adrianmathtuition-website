'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowser } from '@/lib/supabase-client';

const card = 'bg-white rounded-2xl border border-black/5 shadow-sm p-5';
const input = 'w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy/30';
const btn = 'bg-navy text-[hsl(45,100%,96%)] rounded-xl px-4 py-2 text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50';

export default function SettingsClient({
  email, displayName, level, telegramChatId,
}: {
  email: string; displayName: string; level: string; telegramChatId: string;
}) {
  const router = useRouter();
  const [pw, setPw] = useState({ next: '', confirm: '', msg: '', busy: false });
  const [tg, setTg] = useState({ value: telegramChatId, msg: '', busy: false });
  const [del, setDel] = useState({ confirm: '', msg: '', busy: false });

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pw.next.length < 8) return setPw(s => ({ ...s, msg: 'At least 8 characters.' }));
    if (pw.next !== pw.confirm) return setPw(s => ({ ...s, msg: 'Passwords do not match.' }));
    setPw(s => ({ ...s, busy: true, msg: '' }));
    const { error } = await getSupabaseBrowser().auth.updateUser({ password: pw.next });
    setPw({ next: '', confirm: '', busy: false, msg: error ? 'Could not update password.' : '✓ Password updated.' });
  }

  async function saveTelegram(e: React.FormEvent) {
    e.preventDefault();
    setTg(s => ({ ...s, busy: true, msg: '' }));
    const res = await fetch('/api/portal/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegram_chat_id: tg.value.trim() || null }),
    });
    setTg(s => ({ ...s, busy: false, msg: res.ok ? '✓ Saved.' : 'Could not save — check the ID.' }));
  }

  async function deleteAccount(e: React.FormEvent) {
    e.preventDefault();
    if (del.confirm !== 'DELETE') return setDel(s => ({ ...s, msg: 'Type DELETE (in capitals) to confirm.' }));
    if (!window.confirm('This permanently deletes the account and ALL practice history. There is no undo. Continue?')) return;
    setDel(s => ({ ...s, busy: true, msg: '' }));
    const res = await fetch('/api/portal/delete-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: del.confirm }),
    });
    if (res.ok) {
      await getSupabaseBrowser().auth.signOut();
      router.replace('/');
      return;
    }
    const d = await res.json().catch(() => ({}));
    setDel(s => ({ ...s, busy: false, msg: d.error || 'Could not delete — contact Adrian.' }));
  }

  return (
    <div className="space-y-4 pb-20 sm:pb-4">
      <h1 className="text-xl font-bold text-navy pt-1">Settings</h1>

      <div className={card}>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Account</p>
        <div className="text-sm text-gray-700 space-y-1">
          <p><span className="text-gray-400">Name:</span> {displayName || '—'}</p>
          <p><span className="text-gray-400">Email:</span> {email}</p>
          <p><span className="text-gray-400">Level:</span> {level || '—'}</p>
        </div>
      </div>

      <div className={card}>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Change password</p>
        <form onSubmit={changePassword} className="space-y-2.5">
          <input type="password" autoComplete="new-password" placeholder="New password (min 8 characters)"
            value={pw.next} onChange={e => setPw(s => ({ ...s, next: e.target.value }))} className={input} />
          <input type="password" autoComplete="new-password" placeholder="Repeat new password"
            value={pw.confirm} onChange={e => setPw(s => ({ ...s, confirm: e.target.value }))} className={input} />
          {pw.msg && <p className={`text-sm ${pw.msg.startsWith('✓') ? 'text-green-700' : 'text-red-600'}`}>{pw.msg}</p>}
          <button className={btn} disabled={pw.busy}>{pw.busy ? 'Saving…' : 'Update password'}</button>
        </form>
      </div>

      <div className={card}>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Telegram</p>
        <p className="text-sm text-gray-600 mb-2.5">
          Link your Telegram so practice you do with the AdrianMath bot shows up here too.
          Send <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">/start</code> to the bot and it
          replies with your chat ID.
        </p>
        <form onSubmit={saveTelegram} className="flex gap-2">
          <input inputMode="numeric" placeholder="Telegram chat ID"
            value={tg.value} onChange={e => setTg(s => ({ ...s, value: e.target.value }))} className={input} />
          <button className={btn} disabled={tg.busy}>{tg.busy ? '…' : 'Save'}</button>
        </form>
        {tg.msg && <p className={`text-sm mt-1.5 ${tg.msg.startsWith('✓') ? 'text-green-700' : 'text-red-600'}`}>{tg.msg}</p>}
      </div>

      <div className={card}>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Add to Home Screen</p>
        <p className="text-sm text-gray-600">
          iPhone: open this site in Safari → Share → <span className="font-semibold">Add to Home Screen</span>.
          Android: Chrome menu → <span className="font-semibold">Install app</span>. The portal then opens
          like a normal app.
        </p>
      </div>

      <div className={card}>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Your data</p>
        <p className="text-sm text-gray-600 mb-3">
          Download a copy of all stored data (account details, practice attempts, and feedback), or
          permanently delete the account. Details in the{' '}
          <a href="/privacy" target="_blank" className="text-navy underline underline-offset-2">privacy policy</a>.
        </p>
        <a href="/api/portal/export" className="inline-block text-sm font-semibold text-navy border border-navy/30 rounded-xl px-4 py-2 hover:bg-navy/5 transition-colors">
          ⬇️ Download my data
        </a>
      </div>

      <div className={`${card} border-red-200`}>
        <p className="text-xs font-semibold uppercase tracking-wide text-red-400 mb-2">Danger zone</p>
        <p className="text-sm text-gray-600 mb-2.5">
          Deleting the account removes the login, all practice attempts, feedback, and the consent
          record — permanently. Lessons and billing with Adrian are unaffected (those live outside the portal).
        </p>
        <form onSubmit={deleteAccount} className="flex gap-2 items-start">
          <input placeholder='Type DELETE to confirm'
            value={del.confirm} onChange={e => setDel(s => ({ ...s, confirm: e.target.value }))} className={input} />
          <button className="bg-red-600 text-white rounded-xl px-4 py-2 text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50" disabled={del.busy}>
            {del.busy ? 'Deleting…' : 'Delete account'}
          </button>
        </form>
        {del.msg && <p className="text-sm text-red-600 mt-1.5">{del.msg}</p>}
      </div>
    </div>
  );
}
