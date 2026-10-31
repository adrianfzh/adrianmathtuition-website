import PDFKit
import PencilKit
import XCTest
@testable import NotebookApp

/// Importing a worksheet PDF: one notebook page per PDF page, the file kept once,
/// the page drawn the right way up, and the export keeping it.
@MainActor
final class PDFImportTests: XCTestCase {
    private var root: URL!
    private var store: FileNotebookStore!

    override func setUpWithError() throws {
        root = FileManager.default.temporaryDirectory.appendingPathComponent("pdf-\(UUID().uuidString)")
        store = FileNotebookStore(root: root)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: root)
    }

    /// An A4 PDF of `pages` pages, each with a black square in its top-left corner.
    private func worksheet(pages: Int) throws -> URL {
        let url = root.appendingPathComponent("Worksheet 3.pdf")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let a4 = CGRect(x: 0, y: 0, width: 595, height: 842)
        try UIGraphicsPDFRenderer(bounds: a4).writePDF(to: url) { ctx in
            for _ in 0..<pages {
                ctx.beginPage()
                UIColor.black.setFill()
                ctx.fill(CGRect(x: 0, y: 0, width: 150, height: 150))
            }
        }
        return url
    }

    func testImportMakesOnePagePerPDFPageAndKeepsTheFileOnce() throws {
        let library = LibraryModel(store: store)
        let nb = try library.importPDF(at: worksheet(pages: 3), folderID: nil)
        XCTAssertEqual(nb.title, "Worksheet 3")
        XCTAssertEqual(nb.pages.compactMap(\.background?.pageIndex), [0, 1, 2])
        XCTAssertEqual(nb.documentIDs.count, 1)
        let doc = try XCTUnwrap(nb.documentIDs.first)
        XCTAssertTrue(FileManager.default.fileExists(atPath: store.documentURL(notebookID: nb.id, documentID: doc).path))

        // Reopened after a restart, the pages still point at the PDF.
        let loaded = try XCTUnwrap(FileNotebookStore(root: root).loadNotebooks().first)
        XCTAssertEqual(loaded.pages, nb.pages)

        // Delete every PDF page: the stored PDF goes too.
        var edited = loaded
        for p in loaded.pages { edited.removePage(id: p.id) }
        try store.saveNotebook(edited)
        XCTAssertFalse(FileManager.default.fileExists(atPath: store.documentURL(notebookID: nb.id, documentID: doc).path))
    }

    func testNotAPDFIsRefused() throws {
        let bad = root.appendingPathComponent("photo.pdf")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        try Data("not a pdf".utf8).write(to: bad)
        XCTAssertThrowsError(try LibraryModel(store: store).importPDF(at: bad, folderID: nil))
    }

    func testInsertIntoANotebookGoesAfterTheCurrentPageOrReplacesALoneBlank() throws {
        // A brand-new notebook (one blank page): the PDF replaces it.
        let fresh = Notebook(title: "Fresh")
        try store.saveNotebook(fresh)
        let c1 = EditorController(notebook: fresh, store: store, library: nil)
        try c1.insertPDF(at: worksheet(pages: 2))
        XCTAssertEqual(c1.notebook.pages.map { $0.background?.pageIndex }, [0, 1])
        XCTAssertEqual(c1.pageDrawings.count, 2)

        // A notebook with pages already: inserted after page 1, nothing replaced.
        var used = Notebook(title: "Used")
        used.addPage()
        try store.saveNotebook(used)
        let c2 = EditorController(notebook: used, store: store, library: nil)
        try c2.insertPDF(at: worksheet(pages: 2), after: 0)
        XCTAssertEqual(c2.notebook.pages.map { $0.background?.pageIndex }, [nil, 0, 1, nil])
        XCTAssertEqual(c2.pageDrawings.count, 4)
    }

    func testPDFPageIsDrawnTheRightWayUpAndFillsAnA4Page() throws {
        let doc = try XCTUnwrap(PDFDocument(url: worksheet(pages: 1)))
        let page = try XCTUnwrap(doc.page(at: 0))
        let rect = PDFPages.placement(for: PDFPages.displaySize(page))
        XCTAssertEqual(rect.minY, 0)
        XCTAssertEqual(rect.width, PageGeometry.width, accuracy: 3, "A4 fills the page width")
        XCTAssertEqual(rect.height, PageGeometry.height, accuracy: 3)

        let img = try XCTUnwrap(PDFPages.image(of: page, pixelsPerPoint: 1).cgImage)
        XCTAssertLessThan(brightness(img, x: 20, y: 20), 0.2, "the square is at the top left")
        XCTAssertGreaterThan(brightness(img, x: img.width - 20, y: img.height - 20), 0.8, "bottom right is white")
    }

    func testExportKeepsThePDFPageUnderTheInk() throws {
        let nb = try LibraryModel(store: store).importPDF(at: worksheet(pages: 2), folderID: nil)
        let c = EditorController(notebook: nb, store: store, library: nil)
        let url = try XCTUnwrap(c.exportPDF(pages: [0, 1]))
        let out = try XCTUnwrap(PDFDocument(url: url))
        XCTAssertEqual(out.pageCount, 2)
        let thumb = try XCTUnwrap(out.page(at: 0)?.thumbnail(of: CGSize(width: 410, height: 580), for: .mediaBox).cgImage)
        XCTAssertLessThan(brightness(thumb, x: 10, y: 10), 0.3, "the worksheet is in the export")
    }

    private func brightness(_ img: CGImage, x: Int, y: Int) -> CGFloat {
        var px = [UInt8](repeating: 0, count: 4)
        let ctx = CGContext(data: &px, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4,
                            space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        ctx.draw(img, in: CGRect(x: -x, y: y - img.height + 1, width: img.width, height: img.height))
        return CGFloat(Int(px[0]) + Int(px[1]) + Int(px[2])) / (3 * 255)
    }
}
