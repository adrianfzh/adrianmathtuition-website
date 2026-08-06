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
  fixed = 0,
}: {
  level: string;
  topic: string;
  pending: number;
  flagged: number;
  fixed?: number;
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
        {[
          pending > 0 ? `${pending} pending` : 'all blocks approved ✓',
          flagged > 0 ? `${flagged} flagged` : null,
          // Points at the green strips below — each one is a fix to glance at.
          fixed > 0 ? `${fixed} fixed ✓ (green strips)` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
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
function NoteBox({
  id,
  initial,
  autoFocus = false,
}: {
  id: string;
  initial: string | null;
  autoFocus?: boolean;
}) {
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
        autoFocus={autoFocus}
        onChange={e => {
          setNote(e.target.value);
          setState('idle');
        }}
        placeholder="What's wrong? Type it here — Claude reads this and fixes it."
        // Grow with the saved note — a 2-row box hid everything below the fold.
        rows={Math.min(8, Math.max(2, note.split('\n').length + 1))}
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

/**
 * One block's review controls, one component owning all three states:
 *
 *   fixed  — the green receipt on a block Claude fixed: one line saying what
 *            changed (payload.fixed_note), so a fixed flag is something Adrian
 *            can SEE, not just trust. OK accepts it; ⚑ Flag disputes it and
 *            drops straight into the flagged state.
 *   flagged — the rose strip with the note box.
 *   quiet  — just the flag pill.
 *
 * Every transition renders instantly and POSTs in the background (the old flow
 * waited on router.refresh() before showing the note box, which read as "the
 * button is broken" on a slow connection). Flag rolls back if the POST fails;
 * the server render agrees on the next navigation.
 */
export function BlockReview({
  id,
  flagged: initialFlagged,
  note,
  fixedNote = null,
  inline = false,
}: {
  id: string;
  flagged: boolean;
  note: string | null;
  fixedNote?: string | null;
  inline?: boolean;
}) {
  const [flagged, setFlagged] = useState(initialFlagged);
  const [fixedGone, setFixedGone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const toggle = async (on: boolean) => {
    setFlagged(on);
    // Flagging a fixed block disputes the fix — the server clears the receipt
    // on `flag`, so the strip must not come back when he unflags again.
    if (on) setFixedGone(true);
    setError(false);
    setBusy(true);
    const err = await post({ action: on ? 'flag' : 'unflag', id });
    setBusy(false);
    if (err) {
      setFlagged(!on);
      setError(true);
    }
  };

  if (flagged) {
    return (
      <div className="nx-u-reviewrow">
        <div className="nx-u-flagstrip">
          <span>⚑ Flagged — hidden from students until fixed</span>
          <button
            className="nx-flagbtn"
            data-on="true"
            disabled={busy}
            onClick={() => toggle(false)}
          >
            Unflag
          </button>
        </div>
        <NoteBox id={id} initial={note} autoFocus={!initialFlagged} />
      </div>
    );
  }

  if (fixedNote && !fixedGone) {
    const ack = async () => {
      setFixedGone(true);
      post({ action: 'ack', id });
    };
    return (
      <div className="nx-u-fixedstrip">
        <span>✓ Fixed — {fixedNote}</span>
        <button className="nx-fixedbtn-flag" disabled={busy} onClick={() => toggle(true)}>
          ⚑ Flag
        </button>
        <button disabled={busy} onClick={ack}>
          OK
        </button>
      </div>
    );
  }

  return (
    <button
      className={inline ? 'nx-flagbtn nx-flagbtn-inline' : 'nx-flagbtn nx-flagbtn-abs'}
      data-on="false"
      disabled={busy}
      onClick={() => toggle(true)}
    >
      {error ? '⚑ Flag (retry)' : '⚑ Flag'}
    </button>
  );
}
