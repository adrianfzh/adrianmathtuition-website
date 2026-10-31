import CoreGraphics
import UIKit

/// The lines, squares or dots printed on a page. One source for the screen,
/// the thumbnails and the exported PDF, so they always match.
enum PaperPattern {
    static let lineColor = UIColor(red: 0.64, green: 0.76, blue: 0.90, alpha: 1)
    static let gridColor = UIColor(red: 0.78, green: 0.84, blue: 0.92, alpha: 1)
    static let dotColor = UIColor(red: 0.62, green: 0.67, blue: 0.75, alpha: 1)
    static let marginColor = UIColor(red: 0.94, green: 0.62, blue: 0.62, alpha: 1)
    static let paperColor = UIColor.white
    static let edgeColor = UIColor(white: 0.84, alpha: 1)

    static let lineSpacing: CGFloat = 34
    static let lineTop: CGFloat = 112
    static let gridSpacing: CGFloat = 24
    static let marginX: CGFloat = 88

    /// Ruled lines / grid lines for one page with its top-left corner at the origin.
    static func linesPath(_ style: PaperStyle, size: CGSize = PageGeometry.pageSize) -> CGPath? {
        let path = CGMutablePath()
        switch style {
        case .blank, .dotted:
            return nil
        case .lined:
            var y = lineTop
            while y < size.height - 30 {
                path.move(to: CGPoint(x: 0, y: y))
                path.addLine(to: CGPoint(x: size.width, y: y))
                y += lineSpacing
            }
        case .grid:
            var x = gridSpacing
            while x < size.width {
                path.move(to: CGPoint(x: x, y: 0))
                path.addLine(to: CGPoint(x: x, y: size.height))
                x += gridSpacing
            }
            var y = gridSpacing
            while y < size.height {
                path.move(to: CGPoint(x: 0, y: y))
                path.addLine(to: CGPoint(x: size.width, y: y))
                y += gridSpacing
            }
        }
        return path
    }

    static func marginPath(_ style: PaperStyle, size: CGSize = PageGeometry.pageSize) -> CGPath? {
        guard style == .lined else { return nil }
        let path = CGMutablePath()
        path.move(to: CGPoint(x: marginX, y: 0))
        path.addLine(to: CGPoint(x: marginX, y: size.height))
        return path
    }

    static func dotsPath(_ style: PaperStyle, size: CGSize = PageGeometry.pageSize) -> CGPath? {
        guard style == .dotted else { return nil }
        let path = CGMutablePath()
        let r: CGFloat = 1.3
        var y = gridSpacing
        while y < size.height {
            var x = gridSpacing
            while x < size.width {
                path.addEllipse(in: CGRect(x: x - r, y: y - r, width: 2 * r, height: 2 * r))
                x += gridSpacing
            }
            y += gridSpacing
        }
        return path
    }

    static let lineWidth: CGFloat = 0.8

    /// Draws a whole page's paper (white ground + pattern) into `ctx`, origin top-left.
    static func draw(_ style: PaperStyle, in ctx: CGContext, size: CGSize = PageGeometry.pageSize) {
        ctx.saveGState()
        ctx.setFillColor(paperColor.cgColor)
        ctx.fill(CGRect(origin: .zero, size: size))
        ctx.setLineWidth(lineWidth)
        if let lines = linesPath(style, size: size) {
            ctx.setStrokeColor((style == .grid ? gridColor : lineColor).cgColor)
            ctx.addPath(lines)
            ctx.strokePath()
        }
        if let margin = marginPath(style, size: size) {
            ctx.setStrokeColor(marginColor.cgColor)
            ctx.addPath(margin)
            ctx.strokePath()
        }
        if let dots = dotsPath(style, size: size) {
            ctx.setFillColor(dotColor.cgColor)
            ctx.addPath(dots)
            ctx.fillPath()
        }
        ctx.restoreGState()
    }
}
