import XCTest
@testable import NotebookApp

/// "Check this page": handwriting split into numbered lines, and the marker's answer
/// (by line number) turned back into places on the page.
final class CheckPageTests: XCTestCase {
    private func r(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat) -> CGRect { CGRect(x: x, y: y, width: w, height: h) }

    func testStrokesOnOneRowAreOneLine() {
        // "2x + 3 = 7" written as five strokes on one row, then "x = 2" below it.
        let row1 = [r(100, 200, 30, 36), r(140, 205, 25, 30), r(175, 210, 20, 20), r(205, 202, 22, 34), r(240, 214, 25, 12)]
        let row2 = [r(100, 270, 25, 30), r(135, 280, 22, 12), r(170, 268, 20, 34)]
        let lines = HandwritingLines.group(row1 + row2)
        XCTAssertEqual(lines.map(\.number), [1, 2])
        XCTAssertEqual(lines[0].rect.minY, 200)
        XCTAssertEqual(lines[1].rect.minY, 268)
    }

    func testAFractionStaysOneLine() {
        // Numerator, bar, denominator, and "x =" written at the bar's height.
        let lines = HandwritingLines.group([r(160, 300, 40, 28), r(150, 334, 60, 4), r(160, 342, 40, 28), r(100, 322, 40, 26)])
        XCTAssertEqual(lines.count, 1)
        // …and without anything beside it, the bar still holds the two halves together.
        XCTAssertEqual(HandwritingLines.group([r(160, 300, 40, 28), r(150, 334, 60, 4), r(160, 342, 40, 28)]).count, 1)
        // Two rows of writing with an ordinary gap stay two lines.
        XCTAssertEqual(HandwritingLines.group([r(100, 200, 200, 34), r(100, 252, 200, 34)]).count, 2)
    }

    func testADrawingIsItsOwnLine() {
        let lines = HandwritingLines.group([r(100, 200, 200, 30), r(400, 150, 300, 260)])
        XCTAssertEqual(lines.count, 2)
    }

    func testReplyByLineNumberLandsOnThatLine() throws {
        let sent = [HandwritingLine(number: 1, rect: r(100, 200, 300, 40)), HandwritingLine(number: 2, rect: r(100, 260, 280, 40))]
        let json = """
        {"verdict":"partial","summary":"One thing to fix","lines":[{"n":2,"mark":"cross","note":"should be ≤"},{"n":7,"mark":"tick","note":""}],
         "questions":[{"label":"Q3","verdict":"partial","wrong":"Sign kept.","fix":"Flip it.","answer":"−1 ≤ k ≤ 4"}]}
        """
        let reply = try JSONDecoder().decode(CheckPageReply.self, from: Data(json.utf8))
        let check = reply.pageCheck(lines: sent)
        XCTAssertEqual(check.marks.count, 1, "a line the app never sent is dropped")
        XCTAssertEqual(check.marks[0].rect, sent[1].rect)
        XCTAssertEqual(check.marks[0].mark, .cross)
        XCTAssertEqual(check.questions.first?.answer, "−1 ≤ k ≤ 4")
    }

    func testCheckIsSavedWithThePage() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("chk-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        let store = FileNotebookStore(root: root)
        var nb = Notebook(title: "A Math")
        nb.pages[0].check = PageCheck(verdict: .wrong, summary: "Not right yet",
                                      marks: [.init(box: [1, 2, 3, 4], mark: .cross, note: "x")], questions: [])
        try store.saveNotebook(nb)
        let loaded = try XCTUnwrap(FileNotebookStore(root: root).loadNotebooks().first)
        XCTAssertEqual(loaded.pages[0].check?.marks.first?.note, "x")
        XCTAssertEqual(loaded.pages[0].check?.verdict, .wrong)
    }
}
