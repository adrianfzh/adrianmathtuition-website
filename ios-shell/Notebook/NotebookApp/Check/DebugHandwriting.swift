#if DEBUG
import CoreText
import PencilKit
import UIKit

/// UI tests only: writes lines of text as pen strokes (letter outlines in a handwriting font),
/// because a test cannot write neat maths with a finger. `-seedHandwriting "a|b|c"`.
enum DebugHandwriting {
    static func drawing(_ lines: [String], origin: CGPoint, lineHeight: CGFloat, size: CGFloat = 30) -> PKDrawing {
        let font = CTFontCreateWithName("Noteworthy-Bold" as CFString, size, nil)
        var strokes: [PKStroke] = []
        let ink = PKInk(.pen, color: UIColor(red: 0.1, green: 0.15, blue: 0.4, alpha: 1))
        for (row, text) in lines.enumerated() {
            let attr = NSAttributedString(string: text, attributes: [NSAttributedString.Key(kCTFontAttributeName as String): font])
            let line = CTLineCreateWithAttributedString(attr)
            let baseline = origin.y + CGFloat(row) * lineHeight + size
            for run in (CTLineGetGlyphRuns(line) as! [CTRun]) {
                let n = CTRunGetGlyphCount(run)
                var glyphs = [CGGlyph](repeating: 0, count: n)
                var positions = [CGPoint](repeating: .zero, count: n)
                CTRunGetGlyphs(run, CFRange(location: 0, length: n), &glyphs)
                CTRunGetPositions(run, CFRange(location: 0, length: n), &positions)
                let runFont = (CTRunGetAttributes(run) as NSDictionary)[kCTFontAttributeName] as! CTFont
                for (g, p) in zip(glyphs, positions) {
                    guard let path = CTFontCreatePathForGlyph(runFont, g, nil) else { continue }
                    // Glyph space is y-up; the page is y-down.
                    var t = CGAffineTransform(a: 1, b: 0, c: 0, d: -1, tx: origin.x + p.x, ty: baseline)
                    guard let placed = path.copy(using: &t) else { continue }
                    strokes += self.strokes(placed, ink: ink)
                }
            }
        }
        return PKDrawing(strokes: strokes)
    }

    private static func quad(_ a: CGPoint, _ c: CGPoint, _ b: CGPoint, _ t: CGFloat) -> CGPoint {
        let u: CGFloat = 1 - t
        let w0: CGFloat = u * u, w1: CGFloat = 2 * u * t, w2: CGFloat = t * t
        return CGPoint(x: w0 * a.x + w1 * c.x + w2 * b.x, y: w0 * a.y + w1 * c.y + w2 * b.y)
    }

    private static func cubic(_ a: CGPoint, _ c1: CGPoint, _ c2: CGPoint, _ b: CGPoint, _ t: CGFloat) -> CGPoint {
        let u: CGFloat = 1 - t
        let w0: CGFloat = u * u * u, w1: CGFloat = 3 * u * u * t, w2: CGFloat = 3 * u * t * t, w3: CGFloat = t * t * t
        let x: CGFloat = w0 * a.x + w1 * c1.x + w2 * c2.x + w3 * b.x
        let y: CGFloat = w0 * a.y + w1 * c1.y + w2 * c2.y + w3 * b.y
        return CGPoint(x: x, y: y)
    }

    private static func strokes(_ path: CGPath, ink: PKInk) -> [PKStroke] {
        var out: [[CGPoint]] = []
        var cur: [CGPoint] = []
        var last = CGPoint.zero
        path.applyWithBlock { el in
            let e = el.pointee
            switch e.type {
            case .moveToPoint:
                if cur.count > 1 { out.append(cur) }
                cur = [e.points[0]]; last = e.points[0]
            case .addLineToPoint:
                cur.append(e.points[0]); last = e.points[0]
            case .addQuadCurveToPoint:
                let c = e.points[0], end = e.points[1]
                for i in 1...6 {
                    let t = CGFloat(i) / 6
                    cur.append(quad(last, c, end, t))
                }
                last = end
            case .addCurveToPoint:
                let c1 = e.points[0], c2 = e.points[1], end = e.points[2]
                for i in 1...8 {
                    let t = CGFloat(i) / 8
                    cur.append(cubic(last, c1, c2, end, t))
                }
                last = end
            case .closeSubpath:
                if let f = cur.first { cur.append(f) }
            @unknown default: break
            }
        }
        if cur.count > 1 { out.append(cur) }
        return out.map { pts in
            let points = pts.enumerated().map { i, p in
                PKStrokePoint(location: p, timeOffset: Double(i) * 0.005, size: CGSize(width: 3.2, height: 3.2),
                              opacity: 1, force: 1, azimuth: 0, altitude: .pi / 2)
            }
            return PKStroke(ink: ink, path: PKStrokePath(controlPoints: points, creationDate: Date()))
        }
    }
}
#endif
