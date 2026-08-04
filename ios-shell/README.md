# AdrianMarker — the native-Pencil shell

A ~100-line native iPad app that is nothing but a full-screen browser showing
adrianmathtuition.com/admin/mark-paper — plus the one thing Safari can never do:
it hears the **Apple Pencil double-tap** and forwards it to the annotate overlay
(which already listens for `annotate-pencil-doubletap` and toggles pen ⇄ eraser).
Login cookies persist; everything else behaves exactly like the site.

## Install on the iPad (~5 minutes, one time)

1. Plug the iPad into this Mac (or be on the same Wi-Fi with the iPad paired in Xcode).
2. Open `ios-shell/AdrianMarker/AdrianMarker.xcodeproj` in Xcode.
3. Click the project (blue icon) → target **AdrianMarker** → *Signing & Capabilities*
   → tick **Automatically manage signing** → pick your **Team** (your Apple ID —
   add it under Xcode ▸ Settings ▸ Accounts if it's not listed).
4. In the toolbar device picker choose your iPad, then press **▶ Run**.
5. First run only: on the iPad, Settings ▸ General ▸ VPN & Device Management →
   trust the developer certificate. Launch AdrianMarker from the home screen.

With a free Apple ID the install expires after 7 days (re-run from Xcode to
refresh); a paid Apple Developer account ($99/yr) makes it last a year and
enables TestFlight. Worth upgrading only if the shell earns its keep.

## Why this app exists (updated 4 Aug 2026)

Two things Safari can never do:

1. **No more missing strokes.** iPadOS 26 Safari intermittently drops Apple
   Pencil strokes before the web page sees any event (field-proven via the ink
   logs — strokes vanished with zero events at window level). This app mirrors
   every pencil touch **natively** (UIKit's raw stream, upstream of the buggy
   layer) into the page via `window.__nativePencil`; the overlay draws from it
   whenever Safari's own events stay silent. Ink cannot be lost.
2. **Pencil double-tap** switches pen ⇄ eraser.

## What double-tap does

Double-tap the Pencil's flat side → pen ⇄ eraser toggle in the annotate overlay
(the same behaviour Notability users expect). If nothing happens, check
Settings ▸ Apple Pencil on the iPad — the double-tap gesture must be enabled.

## Notes

- The web page needs no changes ever — the shell just forwards one event.
- `webView.isInspectable = true` lets Safari on the Mac inspect the page
  (Develop menu) when the iPad is plugged in — useful for debugging.
- External links open in Safari; adrianmathtuition.com stays in the shell.

## Weekly re-sign (free Apple ID: installs expire after 7 days)

Plug the iPad in (or have it awake on the same Wi-Fi), then from the repo root:

```
cd ios-shell/AdrianMarker
xcodebuild -project AdrianMarker.xcodeproj -scheme AdrianMarker \
  -destination 'generic/platform=iOS' -allowProvisioningUpdates \
  -derivedDataPath /tmp/am-build DEVELOPMENT_TEAM=5F6356V2TB \
  CODE_SIGN_STYLE=Automatic build
xcrun devicectl device install app \
  --device 5A9741E7-89DE-50F2-B957-31F39B030CC4 \
  /tmp/am-build/Build/Products/Debug-iphoneos/AdrianMarker.app
```

(Adrian's iPad Pro CoreDevice id above; `xcrun devicectl list devices` to
re-discover. Or just open the project in Xcode and press ▶.)
