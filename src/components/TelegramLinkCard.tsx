'use client';
// In-app Telegram linking (Adrian, 8 Sep 2026): one tap opens Telegram on the
// bot with a signed /start payload; the bot binds the chat; this card polls
// and disappears. No chat IDs to paste (that form survives under a fold on
// Settings, for a phone where the t.me link cannot open).
//
//   · variant="home"      a slim nudge near the top of /app, students only,
//                         rendered only when the server says 'unlinked'.
//   · variant="settings"  the Telegram card on /app/settings — the linked
//                         state with Unlink, or the same Link button.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { portalFetch } from '@/lib/portal-fetch';

const HOME_CARD = 'bg-white rounded-3xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_6px_16px_-4px_rgba(15,23,42,0.08)] p-4';
const SETTINGS_CARD = 'bg-white rounded-2xl border border-black/5 shadow-sm p-5';
const BTN = 'inline-flex items-center gap-1.5 bg-[#229ED9] text-white rounded-xl px-4 py-2 text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50';

function TelegramGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M9.04 15.47 8.7 19.8c.49 0 .7-.21.96-.46l2.3-2.2 4.76 3.49c.87.48 1.5.23 1.72-.81l3.12-14.63c.28-1.3-.47-1.8-1.32-1.49L2.8 10.83c-1.25.49-1.23 1.19-.21 1.5l4.7 1.47 10.9-6.88c.51-.33.98-.15.6.2" />
    </svg>
  );
}

export default function TelegramLinkCard({ variant, adminViewer = false, linked = false, chatId = '' }: {
  variant: 'home' | 'settings';
  adminViewer?: boolean;
  linked?: boolean;
  chatId?: string;
}) {
  const router = useRouter();
  const [url, setUrl] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [manual, setManual] = useState('');
  const pollRef = useRef<number | null>(null);

  // Mint the link up front so the button is a plain <a> — Safari blocks a
  // window.open after an await, and a plain href hands off to the Telegram app.
  useEffect(() => {
    if (linked || (variant === 'home' && adminViewer)) return;
    let alive = true;
    portalFetch<{ url: string }>('/api/portal/telegram-link')
      .then(d => { if (alive) setUrl(d.url); })
      .catch(() => { if (alive) setMsg('Linking is not available right now — try again later.'); });
    return () => { alive = false; };
  }, [linked, variant, adminViewer]);

  useEffect(() => () => { if (pollRef.current) window.clearInterval(pollRef.current); }, []);

  function startPolling() {
    setWaiting(true);
    if (pollRef.current) window.clearInterval(pollRef.current);
    const started = Date.now();
    pollRef.current = window.setInterval(async () => {
      if (Date.now() - started > 3 * 60_000) { window.clearInterval(pollRef.current!); pollRef.current = null; setWaiting(false); return; }
      try {
        const d = await portalFetch<{ linked: boolean }>('/api/portal/telegram-link?check=1');
        if (d.linked) {
          window.clearInterval(pollRef.current!); pollRef.current = null;
          setWaiting(false); setMsg('✓ Linked — you’ll get a Telegram message when marking is ready.');
          router.refresh();
        }
      } catch { /* keep polling */ }
    }, 4000);
  }

  async function unlink() {
    setBusy(true); setMsg('');
    try {
      await portalFetch('/api/portal/settings', { json: { telegram_chat_id: null } });
      setMsg('Unlinked.');
      router.refresh();
    } catch { setMsg('Could not unlink — try again.'); }
    setBusy(false);
  }

  async function saveManual(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg('');
    try {
      await portalFetch('/api/portal/settings', { json: { telegram_chat_id: manual.trim() } });
      setMsg('✓ Saved.');
      router.refresh();
    } catch { setMsg('Could not save — check the ID.'); }
    setBusy(false);
  }

  if (variant === 'home') {
    if (adminViewer || linked) return null;
    return (
      <div className={`${HOME_CARD} flex items-center gap-3`} role="status" data-telegram-link>
        <span aria-hidden className="flex items-center justify-center w-10 h-10 rounded-2xl bg-[#229ED9]/10 text-[#229ED9] shrink-0">
          <TelegramGlyph className="w-5 h-5" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold text-navy">Get a Telegram message when your marking is ready</span>
          <span className="block text-xs text-slate-500">{waiting ? 'Waiting for Telegram… tap Start in the chat.' : msg || 'One tap — it opens the AdrianMath bot for you.'}</span>
        </span>
        {url && !msg.startsWith('✓') && (
          <a href={url} target="_blank" rel="noopener noreferrer" onClick={startPolling} className={`${BTN} shrink-0`}>Link</a>
        )}
      </div>
    );
  }

  return (
    <div className={SETTINGS_CARD}>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Telegram</p>
      {linked ? (
        <>
          <p className="text-sm text-gray-700 flex items-center gap-2">
            <span className="text-green-700 font-semibold">✓ Linked</span>
            <span className="text-gray-400">· you get a message the moment a marked paper or Practice Again sheet is ready</span>
          </p>
          {chatId && <p className="text-[11px] text-gray-400 mt-1">Chat ID ending …{chatId.slice(-4)}</p>}
          <button type="button" onClick={unlink} disabled={busy} className="mt-3 text-sm font-semibold text-gray-600 border border-gray-300 rounded-xl px-3.5 py-1.5 hover:bg-gray-50 disabled:opacity-50">
            {busy ? '…' : 'Unlink'}
          </button>
          {msg && <p className="text-xs text-gray-500 mt-2">{msg}</p>}
        </>
      ) : (
        <>
          <p className="text-sm text-gray-600 mb-3">
            Link your Telegram to get a message the moment a marked paper is ready for you
            (and so practice you do with the AdrianMath bot shows up here too).
          </p>
          {url ? (
            <a href={url} target="_blank" rel="noopener noreferrer" onClick={startPolling} className={BTN}>
              <TelegramGlyph className="w-4 h-4" /> Link Telegram
            </a>
          ) : (
            <span className={`${BTN} opacity-50`}><TelegramGlyph className="w-4 h-4" /> Link Telegram</span>
          )}
          {waiting && <p className="text-xs text-gray-500 mt-2">Waiting for Telegram… tap Start in the chat, then come back here.</p>}
          {msg && <p className={`text-sm mt-2 ${msg.startsWith('✓') ? 'text-green-700' : 'text-red-600'}`}>{msg}</p>}
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-gray-400 select-none">Link won’t open? Paste your chat ID instead</summary>
            <p className="text-xs text-gray-500 mt-1.5 mb-2">Send <code className="bg-gray-100 px-1.5 py-0.5 rounded">/start</code> to @AdrianMathBot and it replies with your chat ID.</p>
            <form onSubmit={saveManual} className="flex gap-2">
              <input inputMode="numeric" placeholder="Telegram chat ID" value={manual} onChange={e => setManual(e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy/30" />
              <button className="bg-navy text-[hsl(45,100%,96%)] rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50" disabled={busy || !manual.trim()}>{busy ? '…' : 'Save'}</button>
            </form>
          </details>
        </>
      )}
    </div>
  );
}
