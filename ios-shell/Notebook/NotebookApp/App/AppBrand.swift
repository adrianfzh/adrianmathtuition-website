import Foundation

/// The brand is not decided yet (31 Oct 2026). The home-screen name lives in ONE place —
/// `INFOPLIST_KEY_CFBundleDisplayName` in project.yml — and the app reads it from there.
enum AppBrand {
    /// Our website. A debug build talks to the test site; `-apiBase <url>` overrides (tests).
    static var apiBase: URL {
        let args = ProcessInfo.processInfo.arguments
        if let i = args.firstIndex(of: "-apiBase"), args.indices.contains(i + 1), let u = URL(string: args[i + 1]) { return u }
        #if DEBUG
        return URL(string: "https://adrianmath-dev.vercel.app")!
        #else
        return URL(string: "https://www.adrianmathtuition.com")!
        #endif
    }

    static var name: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String ?? "Notebook"
    }
}

/// Switches for work that is designed for but not built yet. Nothing behind a `false`
/// flag is visible to users.
enum FeatureFlags {
    /// "Check this page": sends the page on screen to our marking and draws the red pen on it
    /// (Adrian, 31 Oct 2026: "Yes, build it"). Needs the student to sign in.
    static let checkPage = true
    /// Lined / grid / dotted paper. Off: every page is a blank canvas, like Notability
    /// (Adrian, 31 Oct 2026: "Just have blank canvas, like notability").
    static let paperStyles = false
}
