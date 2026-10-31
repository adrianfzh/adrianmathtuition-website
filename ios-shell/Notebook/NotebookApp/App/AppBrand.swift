import Foundation

/// The brand is not decided yet (31 Oct 2026). The home-screen name lives in ONE place —
/// `INFOPLIST_KEY_CFBundleDisplayName` in project.yml — and the app reads it from there.
enum AppBrand {
    static var name: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String ?? "Notebook"
    }
}

/// Switches for work that is designed for but not built yet. Nothing behind a `false`
/// flag is visible to users.
enum FeatureFlags {
    /// "Check this page": sends the current page to the marking service (a later version).
    static let checkPage = false
    /// Lined / grid / dotted paper. Off: every page is a blank canvas, like Notability
    /// (Adrian, 31 Oct 2026: "Just have blank canvas, like notability").
    static let paperStyles = false
}
