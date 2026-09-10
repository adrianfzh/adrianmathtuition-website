'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowser } from '@/lib/supabase-client';
import { PORTAL_TOUR_KEY } from '@/lib/portal-tour';
import { portalFetch, portalMessage } from '@/lib/portal-fetch';
import PushToggle from './PushToggle';
import PrefToggle from './PrefToggle';
import { ASK_SIGNAL_MIN, ASK_SIGNAL_PREF } from '@/lib/ask-signal';
import { EXAM_COUNTDOWN_NOTICE_PREF, EXAM_COUNTDOWN_PREF, RESURFACE_PREF, SAVE_ANSWERS_PREF } from '@/lib/portal-prefs';
import InstallCard from '@/components/InstallCard';
import TelegramLinkCard from '@/components/TelegramLinkCard';

const card = 'bg-white rounded-2xl border border-black/5 shadow-sm p-5';
const input = 'w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy/30';
const btn = 'bg-navy text-[hsl(45,100%,96%)] rounded-xl px-4 py-2 text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50';

export default function SettingsClient({
  email, displayName, level, telegramChatId, telegramLinked, askSignal, examCountdown, saveAnswers, resurface,
}: {
  email: string; displayName: string; level: string; telegramChatId: string; telegramLinked: boolean; askSignal: boolean; examCountdown: boolean; saveAnswers: boolean; resurface: boolean;
}) {
  const router = useRouter();
  const [pw, setPw] = useState({ next: '', confirm: '', msg: '', busy: false });
  const [del, setDel] = useState({ confirm: '', msg: '', busy: false });
  const [nm, setNm] = useState({ value: displayName, msg: '', busy: false });

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pw.next.length < 8) return setPw(s => ({ ...s, msg: 'At least 8 characters.' }));
    if (pw.next !== pw.confirm) return setPw(s => ({ ...s, msg: 'Passwords do not match.' }));
    setPw(s => ({ ...s, busy: true, msg: '' }));
    const { error } = await getSupabaseBrowser().auth.updateUser({ password: pw.next });
    setPw({ next: '', confirm: '', busy: false, msg: error ? 'Could not update password.' : '✓ Password updated.' });
  }

  // Preferred name — what the app calls the student everywhere (Adrian,
  // 2026-08-28: tuition students should get to pick a name too, same as
  // outside students). The registered name in Adrian's records is untouched.
  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    const value = nm.value.trim();
    if (value.length < 2) return setNm(s => ({ ...s, msg: 'At least 2 characters.' }));
    setNm(s => ({ ...s, busy: true, msg: '' }));
    try {
      await portalFetch('/api/portal/settings', { json: { display_name: value } });
      setNm(s => ({ ...s, busy: false, msg: '✓ Saved — the app will call you this.' }));
      router.refresh();
    } catch {
      setNm(s => ({ ...s, busy: false, msg: 'Could not save.' }));
    }
  }

  // Replay the first-login tour: clear the once-per-device flag and go back to
  // the dashboard, where PortalTour picks it up on mount.
  function replayTour() {
    try { window.localStorage.removeItem(PORTAL_TOUR_KEY); } catch { /* private mode */ }
    router.push('/app');
  }

  async function deleteAccount(e: React.FormEvent) {
    e.preventDefault();
    if (del.confirm !== 'DELETE') return setDel(s => ({ ...s, msg: 'Type DELETE (in capitals) to confirm.' }));
    if (!window.confirm('This permanently deletes the account and ALL practice history. There is no undo. Continue?')) return;
    setDel(s => ({ ...s, busy: true, msg: '' }));
    try {
      await portalFetch('/api/portal/delete-account', {
        json: { confirm: del.confirm },
        fallback: 'Could not delete — contact Adrian.',
      });
      await getSupabaseBrowser().auth.signOut();
      router.replace('/');
    } catch (e) {
      setDel(s => ({ ...s, busy: false, msg: portalMessage(e) }));
    }
  }

  return (
    <div className="space-y-4 pb-20 sm:pb-4">
      <h1 className="text-xl font-bold text-navy pt-1">Settings</h1>

      <div className={card}>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Account</p>
        <div className="text-sm text-gray-700 space-y-1">
          <form onSubmit={saveName} className="flex items-center gap-2">
            <span className="text-gray-400 shrink-0">Name:</span>
            <input
              value={nm.value}
              onChange={e => setNm(s => ({ ...s, value: e.target.value }))}
              maxLength={80}
              className="flex-1 min-w-0 rounded-lg border border-black/10 px-2.5 py-1.5 text-sm"
              placeholder="What should we call you?"
            />
            {nm.value.trim() !== displayName && (
              <button disabled={nm.busy} className="shrink-0 text-xs font-semibold bg-navy text-[hsl(45,100%,96%)] rounded-lg px-3 py-1.5 disabled:opacity-60">
                {nm.busy ? '…' : 'Save'}
              </button>
            )}
          </form>
          {nm.msg && <p className="text-xs text-gray-500">{nm.msg}</p>}
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

      {/* In-app Telegram linking (8 Sep 2026): one tap, no chat IDs to paste;
          the card shows ✓ Linked + Unlink once portal_accounts.telegram_chat_id
          is set (or inherited from Airtable — lib/telegram-link-state.ts). */}
      <TelegramLinkCard variant="settings" linked={telegramLinked} chatId={telegramChatId} />

      <PushToggle />

      {/* Opt-in switches (SPEC-NOTEBOOK-V2 §0: off by default, one each) —
          prefs.* through /api/portal/settings, whitelist in lib/portal-prefs. */}
      <PrefToggle
        pref={EXAM_COUNTDOWN_PREF}
        also={{ [EXAM_COUNTDOWN_NOTICE_PREF]: true }}
        heading="Home"
        label="📅 Show my exam countdown at the top of Home"
        description={<>Counts the days to your next exam or test (the ones Adrian has on record — WA3, prelims, EOY) and lists the topics it tests. It sits above everything else on Home while it&apos;s on.</>}
        onMessage="✓ On — your next exam now sits at the top of Home."
        offMessage="Off — Home shows no countdown."
        initial={examCountdown}
      />
      <PrefToggle
        pref={RESURFACE_PREF}
        heading="Home"
        label="🔁 One thing a day from my notebook"
        description={<>Each day Home shows one small card from your notebook — a mistake still on your list, or an answer you saved — with a line on why it&apos;s worth thirty seconds. One card, never a list; it changes daily and comes back later, which is how it sticks.</>}
        onMessage="✓ On — one card a day on Home from tomorrow (today's appears on your next visit)."
        offMessage="Off — Home shows nothing from your notebook."
        initial={resurface}
      />
      <PrefToggle
        pref={SAVE_ANSWERS_PREF}
        heading="My Notebook"
        label="💾 Save answers to my notebook"
        description={<>Adds a &ldquo;Save to my notebook&rdquo; button under every answer in Ask. A saved answer keeps the question and the full working in My Notebook, filed under its topic and tagged with the skill, and you can name the card yourself.</>}
        onMessage="✓ On — look for 💾 under your next answer in Ask."
        offMessage="Off — answers stay in the chat only."
        initial={saveAnswers}
      />
      <PrefToggle
        pref={ASK_SIGNAL_PREF}
        heading="My Notebook"
        label="💬 Show skills I keep asking about"
        description={<>When this is on, My Notebook adds a &ldquo;Keeps coming up&rdquo; line for any skill you ask the app about{' '}
          {ASK_SIGNAL_MIN}{' '}or more times in two weeks — for example &ldquo;Proofs using the Pythagorean identity&rdquo;, not just
          &ldquo;Trigonometry&rdquo;. It&apos;s a nudge, not a mark: asking isn&apos;t a mistake. The line fades by itself when you stop asking.</>}
        onMessage="✓ On — skills you keep asking about will show in My Notebook."
        offMessage="Off — My Notebook only counts your marked papers and practice."
        initial={askSignal}
      />

      <div className={card}>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Show me around</p>
        <p className="text-sm text-gray-600 mb-3">
          The quick tour of the app — practice, handing a paper in, and where the marks land.
          Takes about half a minute.
        </p>
        <button
          type="button"
          onClick={replayTour}
          className="inline-block text-sm font-semibold text-navy border border-navy/30 rounded-xl px-4 py-2 hover:bg-navy/5 transition-colors"
        >
          ↺ Replay the tour
        </button>
      </div>

      {/* Platform-aware install row (components/InstallCard.tsx) — the same
          instructions as the Home card and PushToggle's install-first line;
          says ✓ once the portal is running as an installed app. */}
      <InstallCard variant="settings" />

      <div className={card}>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Your data</p>
        <p className="text-sm text-gray-600 mb-3">
          Download a copy of everything the app stores about you — account details, every practice
          attempt and its marking, your marked papers, work from Adrian, and your Learn activity — as one
          JSON file. Or permanently delete the account. Details in the{' '}
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
          record — permanently. Lessons and billing with Adrian are unaffected (those live outside the app).
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
