'use client';

// Adrian's review controls, rendered only when the viewer holds the admin
// session. The buttons write through /api/admin/notes-units (cookie-authed)
// and then refresh the server-rendered page — no client state to reconcile.

import { useRouter } from 'next/navigation';
import { useState } from 'react';

async function post(body: Record<string, string>): Promise<string | null> {
  try {
    const res = await fetch('/api/admin/notes-units', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      return (data && typeof data.error === 'string' && data.error) || `HTTP ${res.status}`;
    }
    return null;
  } catch {
    return 'network error';
  }
}

/**
 * The topic review bar. Reading the page IS the review; this is where it ends:
 * one click approves every still-pending block on the topic, and from then on
 * students see the new format instead of the old sub-group list.
 */
export function ReviewBar({
  level,
  topic,
  pending,
  flagged,
}: {
  level: string;
  topic: string;
  pending: number;
  flagged: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const approveAll = async () => {
    const blocks = pending === 1 ? '1 block' : `${pending} blocks`;
    if (!window.confirm(`Approve ${blocks} on ${topic}? Students will see this topic in the new format.`)) {
      return;
    }
    setBusy(true);
    setError(null);
    const err = await post({ action: 'approve-topic', level, topic });
    setBusy(false);
    if (err) setError(err);
    else router.refresh();
  };

  return (
    <div className="nx-reviewbar" role="region" aria-label="Review">
      <span className="nx-reviewbar-title">Review</span>
      <span className="nx-reviewbar-note">
        {pending > 0
          ? `${pending} pending${flagged > 0 ? ` · ${flagged} flagged` : ''}`
          : flagged > 0
            ? `all approved · ${flagged} flagged`
            : 'all blocks approved ✓'}
      </span>
      {error && <span className="nx-reviewbar-err">{error}</span>}
      {pending > 0 && (
        <button className="nx-reviewbar-approve" onClick={approveAll} disabled={busy}>
          {busy ? 'Approving…' : `✓ Approve all ${pending}`}
        </button>
      )}
    </div>
  );
}

/**
 * Adrian's note box on a flagged block — type what's wrong right on the page.
 * Saved into the unit's payload; Claude reads the notes from there and fixes.
 */
export function NoteBox({ id, initial }: { id: string; initial: string | null }) {
  const [note, setNote] = useState(initial ?? '');
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const save = async () => {
    setState('saving');
    const err = await post({ action: 'note', id, note });
    setState(err ? 'error' : 'saved');
  };

  return (
    <div className="nx-notebox">
      <textarea
        value={note}
        onChange={e => {
          setNote(e.target.value);
          setState('idle');
        }}
        placeholder="What's wrong? Type it here — Claude reads this and fixes it."
        rows={2}
      />
      <div className="nx-notebox-row">
        <span className="nx-notebox-state">
          {state === 'saved' ? 'Saved ✓' : state === 'error' ? 'Could not save — try again' : ''}
        </span>
        <button onClick={save} disabled={state === 'saving' || (note.trim() === (initial ?? ''))}>
          {state === 'saving' ? 'Saving…' : 'Save note'}
        </button>
      </div>
    </div>
  );
}

/** Flag / unflag one block. Flagged blocks stay hidden from students. */
export function FlagButton({ id, flagged }: { id: string; flagged: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    setBusy(true);
    await post({ action: flagged ? 'unflag' : 'flag', id });
    setBusy(false);
    router.refresh();
  };

  return (
    <button
      className="nx-flagbtn"
      data-on={flagged ? 'true' : 'false'}
      onClick={toggle}
      disabled={busy}
    >
      {busy ? '…' : flagged ? '⚑ Flagged' : '⚑ Flag'}
    </button>
  );
}
