import UIKit
import WebKit

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
