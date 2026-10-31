import PencilKit
import XCTest
@testable import NotebookApp

final class StoreTests: XCTestCase {
    private var root: URL!
    private var store: FileNotebookStore!

    override func setUpWithError() throws {
        root = FileManager.default.temporaryDirectory.appendingPathComponent("store-\(UUID().uuidString)")
        store = FileNotebookStore(root: root)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: root)
    }

    private func drawing(y: CGFloat) -> PKDrawing {
        let points = (0..<5).map { i in
            PKStrokePoint(location: CGPoint(x: 100 + CGFloat(i) * 20, y: y), timeOffset: TimeInterval(i) * 0.01,
                          size: CGSize(width: 3, height: 3), opacity: 1, force: 1, azimuth: 0, altitude: .pi / 2)
        }
        let path = PKStrokePath(controlPoints: points, creationDate: Date())
        return PKDrawing(strokes: [PKStroke(ink: PKInk(.pen, color: .black), path: path)])
    }

    func testRoundTripNotebookAndInk() throws {
        var nb = Notebook(title: "A Math", cover: .teal, paper: .grid)
        nb.addPage()
        let ink = drawing(y: 200).dataRepresentation()
        try store.saveNotebook(nb)
        try store.savePageData(ink, notebookID: nb.id, pageID: nb.pages[1].id)

        // A fresh store on the same folder = the app after a restart.
        let reopened = FileNotebookStore(root: root)
        let loaded = try XCTUnwrap(reopened.loadNotebooks().first)
        XCTAssertEqual(loaded, nb)
        XCTAssertEqual(loaded.paper, .grid)
        XCTAssertEqual(loaded.cover, .teal)
        XCTAssertNil(try reopened.loadPageData(notebookID: nb.id, pageID: nb.pages[0].id))
        let data = try XCTUnwrap(reopened.loadPageData(notebookID: nb.id, pageID: nb.pages[1].id))
        XCTAssertEqual(try PKDrawing(data: data).strokes.count, 1)
    }

    func testAddDeleteReorderPages() throws {
        var nb = Notebook(title: "Physics")
        let first = nb.pages[0]
        let second = nb.addPage()
        let third = nb.addPage()
        XCTAssertEqual(nb.pages.map(\.id), [first.id, second.id, third.id])

        nb.movePage(from: 2, to: 0)
        XCTAssertEqual(nb.pages.map(\.id), [third.id, first.id, second.id])

        try store.saveNotebook(nb)
        try store.savePageData(Data([1, 2, 3]), notebookID: nb.id, pageID: second.id)
        nb.removePage(id: second.id)
        try store.saveNotebook(nb)
        XCTAssertNil(try store.loadPageData(notebookID: nb.id, pageID: second.id), "deleted page's ink file is removed")
        XCTAssertEqual(try store.loadNotebooks().first?.pages.map(\.id), [third.id, first.id])

        nb.removePage(id: third.id)
        nb.removePage(id: first.id)
        XCTAssertEqual(nb.pages.count, 1, "a notebook always keeps one page")
    }

    func testDeleteNotebookAndFolders() throws {
        let nb = Notebook(title: "Chem")
        try store.saveNotebook(nb)
        try store.saveFolders([Folder(name: "A Math"), Folder(name: "Physics")])
        XCTAssertEqual(try store.loadFolders().map(\.name), ["A Math", "Physics"])
        try store.deleteNotebook(id: nb.id)
        XCTAssertTrue(try store.loadNotebooks().isEmpty)
    }

    func testSplitAndCombineInkAcrossPages() {
        let onPage0 = drawing(y: 300)
        let onPage2 = drawing(y: PageGeometry.originY(ofPage: 2) + 500)
        let all = PKDrawing(strokes: onPage0.strokes + onPage2.strokes)
        let pages = PageInk.split(all, pageCount: 3)
        XCTAssertEqual(pages.map { $0.strokes.count }, [1, 0, 1])
        XCTAssertEqual(pages[2].bounds.midY, 500, accuracy: 1, "ink is stored relative to its own page")
        let back = PageInk.combine(pages)
        XCTAssertEqual(back.bounds.minY, all.bounds.minY, accuracy: 1)
        XCTAssertEqual(back.bounds.maxY, all.bounds.maxY, accuracy: 1)
        // Reordering pages moves the ink with them.
        let reordered = PageInk.combine([pages[2], pages[0], pages[1]])
        XCTAssertEqual(PageInk.split(reordered, pageCount: 3).map { $0.strokes.count }, [1, 1, 0])
    }
}
