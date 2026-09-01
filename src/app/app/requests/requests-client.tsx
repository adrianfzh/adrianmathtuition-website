'use client';
// The "Request" tab's client half: kind chips + textarea + Send, the student's
// own list below (newest first) with status chips. POST /api/portal/requests
// does the real validation and the 2-per-day cap; this UI mirrors both so the
// happy path never bounces.
import { useState } from 'react';
import Link from 'next/link';
import { DETAIL_MAX, DETAIL_MIN, kindLabel, REQUEST_KINDS, type RequestKind } from '@/lib/requests';
import { PortalFetchError, portalFetch, portalMessage } from '@/lib/portal-fetch';

const CARD = 'bg-white rounded-2xl border border-black/5 shadow-sm';

export type RequestItem = {
  id: string;
  kind: string;
  detail: string;
  status: string;
  adminNote: string | null;
  resultUrl: string | null;
  createdAt: string;
  decidedAt: string | null;
};

function sentOn(iso: string): string {
  return new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' });
}

function StatusChip({ r }: { r: RequestItem }) {
  const [cls, label] =
    r.status === 'done' ? ['bg-emerald-50 text-emerald-800', '✅ Ready'] :
    r.status === 'rejected' ? ['bg-red-50 text-red-700', '❌ Not this time'] :
    r.status === 'approved' ? ['bg-blue-50 text-blue-700', '👍 In progress'] :
    ['bg-[hsl(45,80%,94%)] text-navy', '⏳ Waiting'];
  return <span className={`shrink-0 text-[11px] font-semibold rounded-full px-2.5 py-1 ${cls}`}>{label}</span>;
}

export default function RequestsClient({ initial, usedToday, cap }: { initial: RequestItem[]; usedToday: number; cap: number }) {
  const [requests, setRequests] = useState<RequestItem[]>(initial);
  const [used, setUsed] = useState(usedToday);
  const [kind, setKind] = useState<RequestKind>('worksheet');
  const [detail, setDetail] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sentFlash, setSentFlash] = useState(false);

  const capped = used >= cap;
  const trimmed = detail.trim();
  const canSend = !sending && !capped && trimmed.length >= DETAIL_MIN && trimmed.length <= DETAIL_MAX;

  async function send() {
    if (!canSend) return;
    setSending(true);
    setError('');
    try {
      const data = await portalFetch<{ request?: RequestItem }>('/api/portal/requests', {
        json: { kind, detail: trimmed },
        fallback: 'Something went wrong — try again in a minute.',
      });
      if (data.request) setRequests(rs => [data.request as RequestItem, ...rs]);
      setUsed(u => u + 1);
      setDetail('');
      setSentFlash(true);
      setTimeout(() => setSentFlash(false), 4000);
    } catch (e) {
      setError(portalMessage(e));
      if (e instanceof PortalFetchError && e.status === 429) setUsed(cap); // the server says today is spent
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <div className="flex items-baseline justify-between pt-1">
        <h1 className="text-xl font-bold text-navy">🙋 Request materials</h1>
        <Link href="/app" className="text-sm text-gray-500 hover:text-navy">← Home</Link>
      </div>

      <div className={`${CARD} p-4 space-y-3`}>
        <p className="text-sm text-gray-600">
          Need something? Request a worksheet, notes, or anything else — it usually comes back within a day or two.
        </p>

        <div className="flex gap-2" role="radiogroup" aria-label="What kind of thing?">
          {REQUEST_KINDS.map(k => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => setKind(k)}
              className={`text-sm font-semibold rounded-full px-3.5 py-1.5 border transition ${
                kind === k
                  ? 'bg-navy text-[hsl(45,100%,96%)] border-navy'
                  : 'bg-white text-gray-600 border-black/10 hover:border-navy/40'
              }`}
            >
              {kindLabel(k)}
            </button>
          ))}
        </div>

        <textarea
          value={detail}
          onChange={e => { setDetail(e.target.value); setError(''); }}
          rows={3}
          maxLength={DETAIL_MAX}
          disabled={capped}
          placeholder="What do you need? e.g. 'A worksheet on vectors, exam difficulty'"
          className="w-full text-sm border border-black/10 rounded-xl px-3.5 py-3 outline-none focus:border-navy/50 resize-y disabled:bg-gray-50 disabled:text-gray-400"
        />

        {error && <p className="text-sm text-red-600">{error}</p>}
        {sentFlash && !error && (
          <p className="text-sm text-emerald-700">✅ Sent — Adrian has been pinged. Watch this page for the result.</p>
        )}

        {capped ? (
          <p className="text-sm text-gray-500">
            That&apos;s your {cap} requests for today — fresh ones open at midnight. Adrian reads every single one.
          </p>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-gray-400">
              {trimmed.length > 0 && trimmed.length < DETAIL_MIN
                ? `A few more words (${DETAIL_MIN - trimmed.length} characters to go)`
                : `${cap - used} of ${cap} requests left today`}
            </span>
            <button
              type="button"
              onClick={send}
              disabled={!canSend}
              className="text-sm font-bold bg-navy text-[hsl(45,100%,96%)] rounded-xl px-5 py-2.5 disabled:opacity-40"
            >
              {sending ? 'Sending…' : 'Send request'}
            </button>
          </div>
        )}
      </div>

      {requests.length === 0 ? (
        <div className={`${CARD} p-5 text-sm text-gray-600`}>
          Nothing requested yet. Ask for your first thing above — worksheets and notes usually come back within a day or two.
        </div>
      ) : (
        <section className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Your requests</p>
          {requests.map(r => (
            <div key={r.id} className={`${CARD} p-4`}>
              <div className="flex items-start gap-3">
                <span className="text-xl leading-none mt-0.5" aria-hidden>
                  {r.kind === 'worksheet' ? '📄' : r.kind === 'notes' ? '📚' : '❓'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-800 break-words">{r.detail}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {kindLabel(r.kind)} · sent {sentOn(r.createdAt)}
                  </div>
                  {r.status === 'rejected' && r.adminNote && (
                    <p className="text-sm text-gray-700 mt-2 italic">“{r.adminNote}”</p>
                  )}
                  {r.status === 'done' && (
                    <div className="mt-2.5 flex items-center gap-3">
                      {r.resultUrl && (
                        <a
                          href={r.resultUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block text-sm font-semibold bg-navy text-[hsl(45,100%,96%)] rounded-xl px-4 py-2"
                        >
                          Get it →
                        </a>
                      )}
                      {r.adminNote && <span className="text-sm text-gray-600 italic">“{r.adminNote}”</span>}
                    </div>
                  )}
                </div>
                <StatusChip r={r} />
              </div>
            </div>
          ))}
        </section>
      )}

      <p className="text-[11px] text-gray-400">
        When it&apos;s ready, the ✅ chip appears here with your download.
      </p>
    </div>
  );
}
