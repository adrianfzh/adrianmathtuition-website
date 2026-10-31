import CoreGraphics
import PDFKit
import PencilKit
import UIKit

/// One line of the student's handwriting on a page, numbered top to bottom.
struct HandwritingLine: Hashable, Sendable {
    var number: Int
    var rect: CGRect
}

/// Groups the pen strokes of one page into lines of writing, so the marker can answer
/// "line 4 is wrong" and the app knows exactly where line 4 is. Pure geometry, no model.
enum HandwritingLines {
    /// A stroke taller than this is a drawing (a graph, a diagram): it is a "line" of its own.
    static let figureHeight: CGFloat = 150

    /// A flat stroke (a fraction bar, a minus) reaches this far up and down when lines are
    /// formed, so a stacked fraction stays one line. Its drawn box is not changed.
    static let barReach: CGFloat = 18

    static func group(_ rects: [CGRect]) -> [HandwritingLine] {
        // Each line keeps two boxes: `reach` decides what joins it, `ink` is where it really is.
        var lines: [(reach: CGRect, ink: CGRect)] = []
        var figures: [CGRect] = []
        for r in rects.filter({ !$0.isNull }).sorted(by: { $0.midY < $1.midY }) {
            if r.height > figureHeight { figures.append(r); continue }
            let reach = (r.height < 10 && r.width > 20) ? r.insetBy(dx: 0, dy: -barReach) : r
            if let i = lines.firstIndex(where: { sameLine($0.reach, reach) }) {
                lines[i] = (lines[i].reach.union(reach), lines[i].ink.union(r))
            } else {
                lines.append((reach, r))
            }
        }
        // A line that grew (a fraction, a tall bracket) may now overlap its neighbour: merge again.
        var merged = true
        while merged {
            merged = false
            outer: for i in lines.indices {
                for j in lines.indices where j > i && sameLine(lines[i].reach, lines[j].reach) {
                    lines[i] = (lines[i].reach.union(lines[j].reach), lines[i].ink.union(lines[j].ink))
                    lines.remove(at: j)
                    merged = true
                    break outer
                }
            }
        }
        return (lines.map(\.ink) + figures)
            .sorted { $0.minY == $1.minY ? $0.minX < $1.minX : $0.minY < $1.minY }
            .enumerated()
            .map { HandwritingLine(number: $0.offset + 1, rect: $0.element.integral) }
    }

    /// Two boxes are on the same line when they share a fifth of the shorter one's height.
    /// (Lines of writing have a gap between them; a fraction or a bracket overlaps a little.)
    static func sameLine(_ a: CGRect, _ b: CGRect) -> Bool {
        let overlap = min(a.maxY, b.maxY) - max(a.minY, b.minY)
        return overlap > 0 && overlap >= 0.2 * max(min(a.height, b.height), 1)
    }

    static func group(_ drawing: PKDrawing) -> [HandwritingLine] {
        group(drawing.strokes.map(\.renderBounds))
    }
}

/// The picture of one page that is sent for checking: the worksheet (if any), the ink,
/// and a small red number at the left of every handwriting line.
enum PageSnapshot {
    @MainActor
    static func jpeg(drawing: PKDrawing, pdfPage: PDFPage?, lines: [HandwritingLine], scale: CGFloat = 1.5) -> Data? {
        let size = PageGeometry.pageSize
        let format = UIGraphicsImageRendererFormat()
        format.scale = scale
        format.opaque = true
        var data: Data?
        UITraitCollection(userInterfaceStyle: .light).performAsCurrent {
            let ink = drawing.image(from: CGRect(origin: .zero, size: size), scale: scale)
            let image = UIGraphicsImageRenderer(size: size, format: format).image { ctx in
                UIColor.white.setFill()
                ctx.fill(CGRect(origin: .zero, size: size))
                if let pdfPage {
                    PDFPages.draw(pdfPage, in: PDFPages.placement(for: PDFPages.displaySize(pdfPage)), context: ctx.cgContext)
                }
                ink.draw(in: CGRect(origin: .zero, size: size))
                let font = UIFont.systemFont(ofSize: 11, weight: .bold)
                for line in lines {
                    let d: CGFloat = 17
                    let x = max(line.rect.minX - d - 4, 2)
                    let circle = CGRect(x: x, y: line.rect.midY - d / 2, width: d, height: d)
                    UIColor(red: 0.85, green: 0.12, blue: 0.10, alpha: 1).setFill()
                    UIBezierPath(ovalIn: circle).fill()
                    let text = "\(line.number)" as NSString
                    let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: UIColor.white]
                    let t = text.size(withAttributes: attrs)
                    text.draw(at: CGPoint(x: circle.midX - t.width / 2, y: circle.midY - t.height / 2), withAttributes: attrs)
                }
            }
            data = image.jpegData(compressionQuality: 0.72)
        }
        return data
    }
}
