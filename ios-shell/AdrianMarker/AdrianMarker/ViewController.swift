import UIKit
import WebKit

// Mirrors every Apple Pencil touch into the page WITHOUT consuming it.
// iPadOS 26 Safari/WebKit intermittently fails to synthesize pointer/touch
// events for pencil contacts (field-proven 4 Aug 2026: strokes vanished with
// zero events at window level). UIKit's raw touch delivery to gesture
// recognizers is upstream of that synthesis and never dropped — so the page
// receives a parallel native stream (window.__nativePencil) and draws from it
// whenever its web-event streams stay silent.
final class PencilObserver: UIGestureRecognizer {
    var onBatch: (([[String: Any]]) -> Void)?
    private var buffer: [[String: Any]] = []
    private var flushScheduled = false

    private func push(_ kind: String, _ touch: UITouch, _ event: UIEvent?) {
        guard let v = view else { return }
        let touches = (kind == "m" ? event?.coalescedTouches(for: touch) : nil) ?? [touch]
        for t in touches {
            let p = t.location(in: v)
            let f = t.maximumPossibleForce > 0 ? Double(t.force / t.maximumPossibleForce) : 0.5
            buffer.append(["k": kind, "x": Double(p.x), "y": Double(p.y), "f": (f * 100).rounded() / 100])
        }
        if !flushScheduled {
            flushScheduled = true
            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                self.flushScheduled = false
                let out = self.buffer
                self.buffer = []
                if !out.isEmpty { self.onBatch?(out) }
            }
        }
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
        for t in touches where t.type == .pencil { push("d", t, event) }
    }
    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent) {
        for t in touches where t.type == .pencil { push("m", t, event) }
    }
    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent) {
        for t in touches where t.type == .pencil { push("u", t, event) }
    }
    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent) {
        // A cancel here is usually palm-rejection second-guessing — the page
        // commits what it has rather than losing ink.
        for t in touches where t.type == .pencil { push("u", t, event) }
    }
}

final class ViewController: UIViewController, WKNavigationDelegate, UIPencilInteractionDelegate {
    private var webView: WKWebView!

    override func viewDidLoad() {
        super.viewDidLoad()
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()          // persistent cookies → admin login sticks
        config.allowsInlineMediaPlayback = true

        webView = WKWebView(frame: view.bounds, configuration: config)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.navigationDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        if #available(iOS 16.4, *) { webView.isInspectable = true }   // Safari devtools from the Mac
        view.addSubview(webView)

        // The whole point of this app: Safari never hears the Pencil's double-tap,
        // a native view does. Forward it as the event the overlay already handles.
        let pencil = UIPencilInteraction()
        pencil.delegate = self
        webView.addInteraction(pencil)

        // Native pencil mirror → window.__nativePencil (see PencilObserver).
        let observer = PencilObserver()
        observer.cancelsTouchesInView = false
        observer.delaysTouchesBegan = false
        observer.delaysTouchesEnded = false
        observer.onBatch = { [weak self] batch in
            guard let data = try? JSONSerialization.data(withJSONObject: batch),
                  let json = String(data: data, encoding: .utf8) else { return }
            self?.webView.evaluateJavaScript("window.__nativePencil && window.__nativePencil(\(json))")
        }
        webView.addGestureRecognizer(observer)

        webView.load(URLRequest(url: URL(string: "https://www.adrianmathtuition.com/admin/mark-paper")!))
    }

    func pencilInteractionDidTap(_ interaction: UIPencilInteraction) {
        webView.evaluateJavaScript("window.dispatchEvent(new Event('annotate-pencil-doubletap'))")
    }

    // Keep navigation inside the app for our own site; anything external opens in Safari.
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let host = navigationAction.request.url?.host,
           !host.hasSuffix("adrianmathtuition.com"),
           navigationAction.navigationType == .linkActivated {
            UIApplication.shared.open(navigationAction.request.url!)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    override var prefersHomeIndicatorAutoHidden: Bool { true }
}
