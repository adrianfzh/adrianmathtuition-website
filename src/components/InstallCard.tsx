'use client';

// "Put AdrianMath on your Home Screen" — the install nudge, in two places
// with ONE set of instructions:
//   · variant="home"      a slim card near the top of /app. Students only
//                         (never Adrian's admin view), phones only, once per
//                         page load, hidden when installed, ✕ = 14-day snooze.
//   · variant="settings"  the always-there row on /app/settings (replaced the
//                         static "Add to Home Screen" paragraph, 2026-09-03).
//                         Shows on every platform with platform-aware content,
//                         says ✓ once installed, ignores the snooze.
// PushToggle's "install first" prose is the same <InstallSteps> too.
//
// Platform truth comes from components/portal-install-store.ts (UA, touch,
// standalone, Chrome's captured beforeinstallprompt); the decisions are the
// tested pure functions in lib/install-prompt.ts — read that file's decision
// table before changing what shows where.
import { useEffect, useState } from 'react';
import { claimHomeInstall, promptInstall, snoozeInstall, useInstallStore, type InstallSnapshot } from './portal-install-store';
import { logPortalEvent } from '@/lib/portal-event';

// Home's `card` (page.tsx keeps it as a local const) at !p-4, and the Settings card.
const HOME_CARD = 'bg-white rounded-3xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_6px_16px_-4px_rgba(15,23,42,0.08)] p-4';
const SETTINGS_CARD = 'bg-white rounded-2xl border border-black/5 shadow-sm p-5';
const BTN = 'inline-flex items-center gap-1.5 text-[13px] font-bold bg-navy text-[hsl(45,100%,96%)] rounded-xl px-3.5 py-2 active:scale-[0.98] transition disabled:opacity-60';

// ── Glyphs (inline — PortalIcon has no share/phone/plus-square) ─────────────

const svgProps = {
  viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true,
};

/** iOS Share — the box with the arrow leaving the top. */
export function ShareIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg {...svgProps} className={className}>
      <path d="M12 15V3" />
      <path d="m8 7 4-4 4 4" />
      <path d="M8 11H6a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-2" />
    </svg>
  );
}

/** iOS "Add to Home Screen" — the rounded square with a plus. */
export function AddToHomeIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg {...svgProps} className={className}>
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

function PhoneIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg {...svgProps} className={className}>
      <rect x="5" y="2" width="14" height="20" rx="2.5" />
      <path d="M11 18h2" />
    </svg>
  );
}

function StepNo({ n }: { n: number }) {
  return (
    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-navy/10 text-navy text-[11px] font-bold shrink-0">{n}</span>
  );
}
/** An inline glyph inside a step's text run — wraps with the words, never on its own line. */
function Glyph({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center justify-center align-middle w-6 h-6 mx-1 rounded-md bg-slate-100 text-navy">{children}</span>;
}
/** One numbered step: the number hangs left, the words wrap as a paragraph beside it. */
function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <StepNo n={n} />
      <span className="leading-6 min-w-0">{children}</span>
    </li>
  );
}

// ── The instructions (shared by both variants + PushToggle) ─────────────────

/** iPhone/iPad: Share → Add to Home Screen, with where the Share button is. */
export function IosInstallSteps({ hint }: { hint: string }) {
  return (
    <ol className="mt-2 space-y-1 text-[13px] text-slate-700" aria-label="How to add AdrianMath to your Home Screen">
      <Step n={1}>
        Tap<Glyph><ShareIcon /></Glyph><span className="font-semibold text-navy">Share</span>
        {hint && <span className="text-slate-500"> {hint}</span>}
      </Step>
      <Step n={2}>
        Tap<Glyph><AddToHomeIcon /></Glyph><span className="font-semibold text-navy">Add to Home Screen</span>
      </Step>
    </ol>
  );
}

/** Android without a captured install prompt (Firefox, Samsung Internet, or Chrome before it fires). */
function AndroidMenuSteps() {
  return (
    <ol className="mt-2 space-y-1 text-[13px] text-slate-700" aria-label="How to add AdrianMath to your home screen">
      <Step n={1}>
        In Chrome, tap<Glyph><span className="text-base font-bold leading-none">⋮</span></Glyph>
        <span className="text-slate-500">at the top right</span>
      </Step>
      <Step n={2}>
        Tap <span className="font-semibold text-navy">Add to Home screen</span>
        <span className="text-slate-500"> (or Install app)</span>
      </Step>
    </ol>
  );
}

/**
 * Platform-aware "how to install" — the one source of truth for the words.
 * Android with Chrome's prompt captured renders the Install button (the only
 * platform with an API); iOS and prompt-less Android get their two steps;
 * desktop gets the phone hint.
 */
export function InstallSteps({ snap, onInstalled }: { snap: InstallSnapshot; onInstalled?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  async function install() {
    setBusy(true);
    const outcome = await promptInstall();
    setBusy(false);
    if (outcome === 'accepted') {
      logPortalEvent('install:accepted');
      setNote('✓ Installed — open AdrianMath from your home screen.');
      onInstalled?.();
    } else if (outcome === 'dismissed') {
      setNote('No worries — you can install it any time from Settings.');
    } else {
      setNote('Use the ⋮ menu in Chrome → Add to Home screen.');
    }
  }

  if (snap.platform === 'ios') return <IosInstallSteps hint={snap.shareHint} />;
  if (snap.platform === 'android') {
    if (!snap.deferredPrompt) return <AndroidMenuSteps />;
    return (
      <div className="mt-2.5">
        <button type="button" onClick={install} disabled={busy} className={BTN}>
          <PhoneIcon className="w-4 h-4" /> {busy ? 'Installing…' : 'Install'}
        </button>
        {note && <p className={`text-[13px] mt-1.5 ${note.startsWith('✓') ? 'text-green-700' : 'text-slate-600'}`}>{note}</p>}
      </div>
    );
  }
  return (
    <p className="text-sm text-gray-600 mt-1">
      On your phone, open this site — iPhone: Safari → <span className="font-semibold">Share</span> →{' '}
      <span className="font-semibold">Add to Home Screen</span>. Android: Chrome → ⋮ →{' '}
      <span className="font-semibold">Add to Home screen</span>. The portal then opens like a normal app.
    </p>
  );
}

// ── The card ────────────────────────────────────────────────────────────────

export const INSTALL_CARD_TITLE = 'Put AdrianMath on your Home Screen';
export const INSTALL_CARD_BODY = 'Opens like an app — and it’s how you get a ping when your paper is marked.';

export default function InstallCard({ variant, adminViewer = false }: {
  variant: 'home' | 'settings';
  /** Adrian's admin cookie, not "viewing as student" — the Home card is for students only. */
  adminViewer?: boolean;
}) {
  const snap = useInstallStore();
  // This instance's claim token — stable for its life, new on every mount.
  const [token] = useState(() => ({}));
  const mine = snap.homeInstallOwner === token;

  // Home: iOS, or Android once Chrome has handed us its prompt (a button that
  // can't prompt is worse than no card); never installed/desktop/snoozed.
  const eligible =
    variant === 'home' && !adminViewer && snap.ready &&
    (snap.state === 'ios' || (snap.state === 'android' && snap.deferredPrompt !== null));

  // Claim the once-per-page-load slot. The store is the external system: the
  // claim re-renders us with `mine` true, so nothing is set in the effect
  // itself, and the server never renders the card (no hydration flash).
  useEffect(() => {
    if (!eligible || snap.homeInstallOwner !== null) return;
    claimHomeInstall(token);
    logPortalEvent(snap.state === 'ios' ? 'install:ios-shown' : 'install:shown');
  }, [eligible, snap.homeInstallOwner, snap.state, token]);

  if (variant === 'settings') {
    return (
      <div className={SETTINGS_CARD} data-install-row={snap.ready ? snap.state : 'ssr'}>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Add to Home Screen</p>
        {!snap.ready ? (
          <p className="text-sm text-gray-400">…</p>
        ) : snap.state === 'installed' ? (
          <p className="text-sm text-gray-600">✓ You’re using AdrianMath as an app on this device.</p>
        ) : (
          <>
            {snap.platform !== 'desktop' && (
              <p className="text-sm text-gray-600">
                {snap.platform === 'ios'
                  ? 'Opens like an app, with no browser bar — and on iPhone it’s the only way to get notifications.'
                  : 'Opens like an app from your home screen, and you’ll get a ping when your paper is marked.'}
              </p>
            )}
            <InstallSteps snap={snap} />
          </>
        )}
      </div>
    );
  }

  if (!mine || !eligible) return null;

  function dismiss() {
    logPortalEvent('install:dismissed');
    snoozeInstall(); // → state 'snoozed' → not eligible → gone
  }

  return (
    <div className={`${HOME_CARD} flex items-start gap-3`} role="status" data-install-card={snap.platform}>
      <span aria-hidden className="flex items-center justify-center w-10 h-10 rounded-2xl bg-navy text-[hsl(43,90%,60%)] shrink-0">
        <PhoneIcon />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-navy leading-tight">{INSTALL_CARD_TITLE}</p>
        <p className="text-[12px] text-slate-500 mt-0.5 leading-snug">{INSTALL_CARD_BODY}</p>
        <InstallSteps snap={snap} />
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Not now"
        title="Not now"
        className="shrink-0 -mt-1 -mr-1 text-slate-400 hover:text-navy px-2 py-1 text-sm"
      >
        ✕
      </button>
    </div>
  );
}
