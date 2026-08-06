// Switch the AdrianMarker shell's native Pencil mirror on and off (6 Aug 2026).
//
// The shell installs a UIGestureRecognizer that mirrors every Apple Pencil touch
// into window.__nativePencil via evaluateJavaScript (see ios-shell — it exists
// because iPadOS 26 WebKit intermittently drops pencil contacts). It ran ALWAYS:
// resting or dragging the Pencil anywhere in the app fired an async IPC into the
// web process once per frame, ~120/s, for a function that only exists while the
// ✏️ Annotate overlay is open. That is main-thread work on both sides of the
// process boundary competing with scrolling and taps — Adrian, 6 Aug 2026: "the
// ipad app is VERY laggy. not functionable".
//
// Now the page owns the switch: off on load, on while the overlay is mounted.
//
// Compatibility runs BOTH ways. An old shell has no `pencilBridge` handler, so
// these calls are silent no-ops and it keeps mirroring exactly as it does today.
// A new shell starts ENABLED and only ever disables itself when a page tells it
// to — so a stale cached page can never leave the mirror dead and take the
// missing-strokes fix with it. Safari (no `webkit.messageHandlers`) ignores all
// of this; it has no native mirror to begin with.
export function setNativePencilMirror(on: boolean): void {
  try {
    const w = window as unknown as {
      webkit?: { messageHandlers?: { pencilBridge?: { postMessage: (b: unknown) => void } } };
    };
    w.webkit?.messageHandlers?.pencilBridge?.postMessage(on);
  } catch { /* not in the shell — nothing to switch */ }
}
