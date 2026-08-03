// AdrianMarker — the ~100-line WKWebView shell around adrianmathtuition.com's
// mark-paper page. Exists for exactly two things Safari cannot give a web page:
//   1. Apple Pencil double-tap → forwarded to the page as the
//      'annotate-pencil-doubletap' window event the annotate overlay already
//      listens for (it toggles pen ⇄ eraser).
//   2. App-grade full-screen with no browser chrome.
// Cookies persist in the default WKWebsiteDataStore, so the admin login sticks.
import UIKit

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let w = UIWindow(frame: UIScreen.main.bounds)
        w.rootViewController = ViewController()
        w.makeKeyAndVisible()
        window = w
        return true
    }
}
