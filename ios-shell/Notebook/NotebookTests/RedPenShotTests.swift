import XCTest
import UIKit
@testable import NotebookApp

/// Draws a page's red pen (tick, cross with the correct line, "?") to a picture, so a change
/// to RedPen can be looked at. Writes only when RED_PEN_SHOT names a file.
@MainActor
final class RedPenShotTests: XCTestCase {
    func testDrawsEveryMark() throws {
        let marks: [PageCheck.LineMark] = [
            .init(box: [110, 200, 300, 40], mark: .tick, note: ""),
            .init(box: [110, 290, 200, 40], mark: .unsure, note: "check this line"),
            .init(box: [110, 380, 160, 40], mark: .cross, note: "3x + 2x = 5x", correct: "10 > 5x"),
            .init(box: [110, 470, 160, 40], mark: .cross, note: "divide by 5", correct: "x < 2"),
        ]
        let check = PageCheck(verdict: .wrong, summary: "", marks: marks, questions: [])
        let image = UIGraphicsImageRenderer(size: CGSize(width: 820, height: 600)).image { ctx in
            UIColor.white.setFill(); ctx.fill(CGRect(x: 0, y: 0, width: 820, height: 600))
            UIColor.systemGray4.setFill()
            for m in marks { ctx.fill(m.rect) }
            RedPen.render(check, in: ctx.cgContext)
        }
        XCTAssertNotNil(image.pngData())
        if let path = ProcessInfo.processInfo.environment["RED_PEN_SHOT"] {
            try image.pngData()!.write(to: URL(fileURLWithPath: path))
        }
    }
}
