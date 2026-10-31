import SwiftUI

/// One page of a notebook. Its ink lives in its own file (`<id>.drawing`).
/// Later versions add marking state here (e.g. when it was last checked).
struct Page: Codable, Hashable, Identifiable, Sendable {
    var id: UUID = UUID()
    /// A page of an imported PDF (a worksheet, a past paper) drawn under the ink. Nil = blank.
    var background: PageBackground?
    /// The last "Check this page" result: the red pen drawn over the page. Nil = never checked.
    var check: PageCheck?
}

/// Which PDF, and which page of it, sits under a notebook page. The PDF is kept once
/// per notebook (`documents/<documentID>.pdf`) however many pages use it.
struct PageBackground: Codable, Hashable, Sendable {
    var documentID: UUID
    var pageIndex: Int
}

struct Notebook: Codable, Hashable, Identifiable, Sendable {
    static let currentFormatVersion = 1

    var id: UUID = UUID()
    var title: String
    var cover: CoverColor = .blue
    var paper: PaperStyle = .blank
    var folderID: UUID?
    var pages: [Page] = [Page()]
    var createdAt: Date = Date()
    var updatedAt: Date = Date()
    var formatVersion: Int = Notebook.currentFormatVersion

    var pageCountLabel: String { pages.count == 1 ? "1 page" : "\(pages.count) pages" }

    @discardableResult
    mutating func addPage(at index: Int? = nil) -> Page {
        let page = Page()
        let i = min(max(index ?? pages.count, 0), pages.count)
        pages.insert(page, at: i)
        return page
    }

    /// Puts pages in at `index` (clamped). A notebook that is still one untouched blank
    /// page has that page replaced, so importing a PDF into a new notebook starts on page 1 of it.
    mutating func insertPages(_ new: [Page], at index: Int, replacingLoneBlank: Bool) {
        if replacingLoneBlank, pages.count == 1, pages[0].background == nil {
            pages = new
            return
        }
        pages.insert(contentsOf: new, at: min(max(index, 0), pages.count))
    }

    /// The imported PDFs this notebook still uses.
    var documentIDs: Set<UUID> { Set(pages.compactMap { $0.background?.documentID }) }

    /// Removes a page. A notebook always keeps at least one page.
    mutating func removePage(id: UUID) {
        pages.removeAll { $0.id == id }
        if pages.isEmpty { pages = [Page()] }
    }

    mutating func movePage(from source: Int, to destination: Int) {
        guard pages.indices.contains(source) else { return }
        let page = pages.remove(at: source)
        pages.insert(page, at: min(max(destination, 0), pages.count))
    }
}

struct Folder: Codable, Hashable, Identifiable, Sendable {
    var id: UUID = UUID()
    var name: String
    var createdAt: Date = Date()
}

enum PaperStyle: String, Codable, CaseIterable, Identifiable, Sendable {
    case blank, lined, grid, dotted
    var id: String { rawValue }
    var title: String {
        switch self {
        case .blank: "Blank"
        case .lined: "Lined"
        case .grid: "Grid"
        case .dotted: "Dotted"
        }
    }
    var symbol: String {
        switch self {
        case .blank: "doc"
        case .lined: "line.3.horizontal"
        case .grid: "squareshape.split.3x3"
        case .dotted: "circle.grid.3x3"
        }
    }
}

enum CoverColor: String, Codable, CaseIterable, Identifiable, Sendable {
    case blue, indigo, teal, green, yellow, orange, red, pink, purple, graphite
    var id: String { rawValue }
    var color: Color {
        switch self {
        case .blue: Color(red: 0.16, green: 0.45, blue: 0.96)
        case .indigo: Color(red: 0.35, green: 0.34, blue: 0.84)
        case .teal: Color(red: 0.19, green: 0.65, blue: 0.70)
        case .green: Color(red: 0.20, green: 0.66, blue: 0.40)
        case .yellow: Color(red: 0.96, green: 0.74, blue: 0.16)
        case .orange: Color(red: 0.97, green: 0.53, blue: 0.20)
        case .red: Color(red: 0.92, green: 0.30, blue: 0.29)
        case .pink: Color(red: 0.93, green: 0.36, blue: 0.58)
        case .purple: Color(red: 0.62, green: 0.38, blue: 0.86)
        case .graphite: Color(red: 0.36, green: 0.38, blue: 0.43)
        }
    }
    var name: String { rawValue.capitalized }
}

enum LibrarySort: String, CaseIterable, Identifiable, Sendable {
    case recent, title, created
    var id: String { rawValue }
    var title: String {
        switch self {
        case .recent: "Last Edited"
        case .title: "Title"
        case .created: "Date Created"
        }
    }
}
