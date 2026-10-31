import PDFKit
import UIKit

enum PDFImportError: LocalizedError {
    case unreadable, locked, empty
    var errorDescription: String? {
        switch self {
        case .unreadable: "This file couldn’t be opened as a PDF."
        case .locked: "This PDF is password-protected."
        case .empty: "This PDF has no pages."
        }
    }
}

/// Imported PDFs: reading the file in, and drawing one of its pages onto a notebook page.
enum PDFPages {
    /// Reads a PDF (from Files, another app's share sheet, or a test), keeps a copy in the
    /// notebook's folder, and returns one notebook page per PDF page. The caller inserts them.
    static func importPDF(at url: URL, notebookID: UUID, store: NotebookStore) throws -> [Page] {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        let data = try Data(contentsOf: url)
        return try importPDF(data: data, notebookID: notebookID, store: store)
    }

    static func importPDF(data: Data, notebookID: UUID, store: NotebookStore) throws -> [Page] {
        guard let doc = PDFDocument(data: data) else { throw PDFImportError.unreadable }
        if doc.isLocked && !doc.unlock(withPassword: "") { throw PDFImportError.locked }
        guard doc.pageCount > 0 else { throw PDFImportError.empty }
        let documentID = UUID()
        try store.saveDocument(data, notebookID: notebookID, documentID: documentID)
        return (0..<doc.pageCount).map { Page(background: PageBackground(documentID: documentID, pageIndex: $0)) }
    }

    /// The PDF page's size as it is meant to be read (its rotation applied).
    static func displaySize(_ page: PDFPage) -> CGSize {
        let b = page.bounds(for: .cropBox)
        return page.rotation % 180 == 0 ? b.size : CGSize(width: b.height, height: b.width)
    }

    /// Where a PDF page sits on a notebook page: as large as fits, centred across, from the top.
    /// An A4 worksheet fills the page exactly (notebook pages are A4-shaped).
    static func placement(for size: CGSize) -> CGRect {
        guard size.width > 0, size.height > 0 else { return .zero }
        let s = min(PageGeometry.width / size.width, PageGeometry.height / size.height)
        let w = size.width * s, h = size.height * s
        return CGRect(x: (PageGeometry.width - w) / 2, y: 0, width: w, height: h)
    }

    /// Draws a PDF page into `rect` of a top-left-origin context (UIKit), as vectors.
    static func draw(_ page: PDFPage, in rect: CGRect, context ctx: CGContext) {
        let size = displaySize(page)
        guard size.width > 0, size.height > 0 else { return }
        ctx.saveGState()
        ctx.setFillColor(UIColor.white.cgColor)
        ctx.fill(rect)
        ctx.translateBy(x: rect.minX, y: rect.maxY)
        ctx.scaleBy(x: rect.width / size.width, y: -rect.height / size.height)
        page.draw(with: .cropBox, to: ctx)
        ctx.restoreGState()
    }

    /// A picture of the PDF page at `pixelsPerPoint` (notebook-page points), for the canvas.
    static func image(of page: PDFPage, pixelsPerPoint: CGFloat) -> UIImage {
        let rect = placement(for: displaySize(page))
        let format = UIGraphicsImageRendererFormat()
        format.scale = pixelsPerPoint
        format.opaque = true
        return UIGraphicsImageRenderer(size: rect.size, format: format).image { ctx in
            draw(page, in: CGRect(origin: .zero, size: rect.size), context: ctx.cgContext)
        }
    }
}

/// Opens each imported PDF once and hands out its pages. One per open notebook.
@MainActor
final class PDFDocuments {
    private let notebookID: UUID
    private let store: NotebookStore
    private var open: [UUID: PDFDocument] = [:]

    init(notebookID: UUID, store: NotebookStore) {
        self.notebookID = notebookID
        self.store = store
    }

    func page(_ bg: PageBackground) -> PDFPage? {
        if open[bg.documentID] == nil {
            let url = store.documentURL(notebookID: notebookID, documentID: bg.documentID)
            guard let doc = PDFDocument(url: url) else { return nil }
            if doc.isLocked { _ = doc.unlock(withPassword: "") }
            open[bg.documentID] = doc
        }
        return open[bg.documentID]?.page(at: bg.pageIndex)
    }
}
