import CoreGraphics
import PencilKit

/// Pages are laid out top to bottom in one tall canvas, like Notability.
/// All numbers are in "page points" — the canvas scales them to fit the screen.
/// The page is A4-shaped (1 : √2), the paper Singapore schools use.
enum PageGeometry {
    static let width: CGFloat = 820
    static let height: CGFloat = 1160
    static let gap: CGFloat = 28

    static var pageSize: CGSize { CGSize(width: width, height: height) }

    static func originY(ofPage index: Int) -> CGFloat {
        CGFloat(index) * (height + gap)
    }

    static func pageRect(_ index: Int) -> CGRect {
        CGRect(x: 0, y: originY(ofPage: index), width: width, height: height)
    }

    static func totalHeight(pageCount: Int) -> CGFloat {
        let n = CGFloat(max(pageCount, 1))
        return n * height + (n - 1) * gap
    }

    /// Which page a y position belongs to (a point in a gap counts for the page above).
    static func pageIndex(forY y: CGFloat, pageCount: Int) -> Int {
        let i = Int(floor(y / (height + gap)))
        return min(max(i, 0), max(pageCount - 1, 0))
    }
}

/// Moves ink between the one tall canvas and the one-file-per-page storage.
/// A stroke belongs to the page that holds its centre; it is never cut in two.
enum PageInk {
    static func split(_ drawing: PKDrawing, pageCount: Int) -> [PKDrawing] {
        var buckets = Array(repeating: [PKStroke](), count: max(pageCount, 1))
        for stroke in drawing.strokes {
            let i = PageGeometry.pageIndex(forY: stroke.renderBounds.midY, pageCount: buckets.count)
            buckets[i].append(stroke)
        }
        return buckets.enumerated().map { i, strokes in
            PKDrawing(strokes: strokes).transformed(
                using: CGAffineTransform(translationX: 0, y: -PageGeometry.originY(ofPage: i)))
        }
    }

    static func combine(_ pages: [PKDrawing]) -> PKDrawing {
        var all: [PKStroke] = []
        for (i, page) in pages.enumerated() {
            let moved = page.transformed(
                using: CGAffineTransform(translationX: 0, y: PageGeometry.originY(ofPage: i)))
            all.append(contentsOf: moved.strokes)
        }
        return PKDrawing(strokes: all)
    }
}
