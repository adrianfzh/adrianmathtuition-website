import PencilKit
import UIKit

/// The writing surface: ONE PKCanvasView holding every page of the notebook, stacked
/// top to bottom (continuous scroll, like Notability). The paper — white pages with
/// lines, grid or dots — sits underneath the ink as plain layers and zooms with it.
/// A page made from an imported PDF shows that PDF page under the ink, drawn only
/// while it is on screen (nearby pages too) and redrawn sharper after a zoom.
@MainActor
final class PaperCanvasView: UIView, PKCanvasViewDelegate, PKToolPickerObserver {
    let canvas = PKCanvasView()
    let toolPicker = PKToolPicker()

    var onDrawingChanged: ((PKDrawing) -> Void)?
    var onCurrentPageChanged: ((Int) -> Void)?
    var onNeedsNewPage: (() -> Void)?

    private(set) var pageCount = 1
    private(set) var paper: PaperStyle = .blank
    private let paperLayer = CALayer()
    private var pageLayers: [CALayer] = []
    /// One per page: the PDF page under the ink, or nil for a blank page.
    private(set) var backgrounds: [PageBackground?] = []
    var documents: PDFDocuments?
    private var pdfLayers: [Int: CALayer] = [:]
    private var pdfRenderedScale: [Int: CGFloat] = [:]
    /// The red pen from "Check this page", one per page; drawn ABOVE the ink.
    private(set) var checks: [PageCheck?] = []
    private let marksLayer = CALayer()
    private var fitScale: CGFloat = 0
    private var lastWidth: CGFloat = 0
    private var applyingDrawing = false
    private var reportedPage = -1

    private var sideInset: CGFloat {
        traitCollection.horizontalSizeClass == .compact ? 10 : 28
    }

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .systemGroupedBackground

        canvas.backgroundColor = .clear
        canvas.isOpaque = false
        // Paper is always white, so ink keeps its true colours (black stays black) in dark mode.
        canvas.overrideUserInterfaceStyle = .light
        canvas.delegate = self
        canvas.alwaysBounceVertical = true
        canvas.showsHorizontalScrollIndicator = false
        canvas.contentInsetAdjustmentBehavior = .never
        canvas.drawing = PKDrawing()
        addSubview(canvas)

        paperLayer.anchorPoint = .zero
        paperLayer.position = .zero
        canvas.layer.insertSublayer(paperLayer, at: 0)

        marksLayer.anchorPoint = .zero
        marksLayer.position = .zero
        canvas.layer.addSublayer(marksLayer)

        toolPicker.colorUserInterfaceStyle = .light
        toolPicker.addObserver(canvas)
        toolPicker.addObserver(self)
        canvas.tool = PKInkingTool(.pen, color: .black, width: 3)
    }

    required init?(coder: NSCoder) { fatalError("not used") }

    // MARK: Showing

    func configure(drawing: PKDrawing, pageCount: Int, paper: PaperStyle, backgrounds: [PageBackground?]) {
        self.pageCount = max(pageCount, 1)
        self.paper = paper
        self.backgrounds = backgrounds
        rebuildPaper()
        setDrawing(drawing, clearUndo: true)
        updateContentSize()
    }

    func setDrawing(_ drawing: PKDrawing, clearUndo: Bool) {
        applyingDrawing = true
        canvas.drawing = drawing
        applyingDrawing = false
        if clearUndo { canvas.undoManager?.removeAllActions() }
    }

    func setPages(count n: Int, backgrounds: [PageBackground?]) {
        guard n != pageCount || backgrounds != self.backgrounds else { return }
        pageCount = max(n, 1)
        self.backgrounds = backgrounds
        rebuildPaper()
        updateContentSize()
    }

    func setPaper(_ style: PaperStyle) {
        guard style != paper else { return }
        paper = style
        rebuildPaper()
    }

    var allowsFingerDrawing: Bool = false {
        didSet { canvas.drawingPolicy = allowsFingerDrawing ? .anyInput : .pencilOnly }
    }

    func showToolPicker() {
        guard window != nil else { return }
        toolPicker.setVisible(true, forFirstResponder: canvas)
        canvas.becomeFirstResponder()
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        if window != nil {
            DispatchQueue.main.async { [weak self] in self?.showToolPicker() }
        }
    }

    // MARK: Layout & zoom

    override func layoutSubviews() {
        super.layoutSubviews()
        canvas.frame = bounds
        guard bounds.width > 0, bounds.width != lastWidth else { return }
        let oldFit = fitScale
        let relative = oldFit > 0 ? canvas.zoomScale / oldFit : 1
        lastWidth = bounds.width
        fitScale = (bounds.width - 2 * sideInset) / PageGeometry.width
        canvas.minimumZoomScale = fitScale
        canvas.maximumZoomScale = fitScale * 4
        canvas.zoomScale = fitScale * relative
        updateInsets()
        updateContentSize()
        if oldFit == 0 {
            canvas.contentOffset = CGPoint(x: -canvas.contentInset.left, y: -canvas.contentInset.top)
        }
        refreshPDFPictures()
    }

    private func updateInsets() {
        let obscured = toolPicker.isVisible ? toolPicker.frameObscured(in: self).height : 0
        canvas.contentInset = UIEdgeInsets(top: 20, left: sideInset, bottom: max(obscured, 0) + 60, right: sideInset)
        canvas.verticalScrollIndicatorInsets.bottom = max(obscured, 0)
    }

    private func updateContentSize() {
        let z = canvas.zoomScale
        canvas.contentSize = CGSize(width: PageGeometry.width * z,
                                    height: PageGeometry.totalHeight(pageCount: pageCount) * z)
        layoutPaper()
    }

    private func layoutPaper() {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        let z = canvas.zoomScale
        paperLayer.bounds = CGRect(x: 0, y: 0, width: PageGeometry.width,
                                   height: PageGeometry.totalHeight(pageCount: pageCount))
        paperLayer.position = .zero
        paperLayer.setAffineTransform(CGAffineTransform(scaleX: z, y: z))
        marksLayer.bounds = paperLayer.bounds
        marksLayer.position = .zero
        marksLayer.setAffineTransform(CGAffineTransform(scaleX: z, y: z))
        marksLayer.zPosition = 10
        // Keep the line art sharp at the current zoom.
        let scale = (window?.screen.scale ?? 2) * z
        for page in pageLayers {
            for sub in page.sublayers ?? [] { sub.contentsScale = scale }
        }
        for sub in marksLayer.sublayers ?? [] {
            sub.contentsScale = scale
            for t in sub.sublayers ?? [] { t.contentsScale = scale }
        }
        CATransaction.commit()
    }

    private func rebuildPaper() {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        pageLayers.forEach { $0.removeFromSuperlayer() }
        pdfLayers = [:]
        pdfRenderedScale = [:]
        pageLayers = (0..<pageCount).map { i in
            let page = CALayer()
            page.frame = PageGeometry.pageRect(i)
            page.backgroundColor = PaperPattern.paperColor.cgColor
            page.borderColor = PaperPattern.edgeColor.cgColor
            page.borderWidth = 0.5
            page.cornerRadius = 3
            page.shadowColor = UIColor.black.cgColor
            page.shadowOpacity = 0.08
            page.shadowRadius = 6
            page.shadowOffset = CGSize(width: 0, height: 2)
            page.shadowPath = UIBezierPath(rect: page.bounds).cgPath
            if let bg = background(i), let pdfPage = documents?.page(bg) {
                // A PDF page replaces the paper pattern; its picture is filled in when it nears the screen.
                let l = CALayer()
                l.frame = PDFPages.placement(for: PDFPages.displaySize(pdfPage))
                l.contentsGravity = .resize
                page.addSublayer(l)
                pdfLayers[i] = l
                paperLayer.addSublayer(page)
                return page
            }
            if let lines = PaperPattern.linesPath(paper) {
                page.addSublayer(shape(lines, stroke: paper == .grid ? PaperPattern.gridColor : PaperPattern.lineColor))
            }
            if let margin = PaperPattern.marginPath(paper) {
                page.addSublayer(shape(margin, stroke: PaperPattern.marginColor))
            }
            if let dots = PaperPattern.dotsPath(paper) {
                let s = CAShapeLayer()
                s.frame = page.bounds
                s.path = dots
                s.fillColor = PaperPattern.dotColor.cgColor
                page.addSublayer(s)
            }
            paperLayer.addSublayer(page)
            return page
        }
        CATransaction.commit()
        layoutPaper()
        refreshPDFPictures()
    }

    // MARK: Red pen

    func setChecks(_ checks: [PageCheck?]) {
        self.checks = checks
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        marksLayer.sublayers?.forEach { $0.removeFromSuperlayer() }
        for (i, check) in checks.enumerated() {
            guard let check else { continue }
            let page = CALayer()
            page.frame = PageGeometry.pageRect(i)
            RedPen.draw(check.marks, into: page)
            marksLayer.addSublayer(page)
        }
        CATransaction.commit()
        layoutPaper()
    }

    private func background(_ i: Int) -> PageBackground? {
        backgrounds.indices.contains(i) ? backgrounds[i] : nil
    }

    /// Draws the PDF pages on or next to the screen at the current zoom, and lets go of
    /// the pictures of pages far away (a 40-page paper would otherwise fill the memory).
    func refreshPDFPictures() {
        guard !pdfLayers.isEmpty, let documents else { return }
        let z = max(canvas.zoomScale, 0.01)
        let top = canvas.contentOffset.y / z
        let first = PageGeometry.pageIndex(forY: top, pageCount: pageCount)
        let last = PageGeometry.pageIndex(forY: top + canvas.bounds.height / z, pageCount: pageCount)
        let near = Set(max(first - 1, 0)...min(last + 1, pageCount - 1))
        // Sharp at this zoom, capped so one page's picture stays a reasonable size.
        let want = min((window?.screen.scale ?? 2) * z, 3)
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        for (i, layer) in pdfLayers {
            if near.contains(i) {
                let have = pdfRenderedScale[i] ?? 0
                guard have < want * 0.9 || have > want * 1.6,
                      let bg = background(i), let pdfPage = documents.page(bg) else { continue }
                layer.contents = PDFPages.image(of: pdfPage, pixelsPerPoint: want).cgImage
                pdfRenderedScale[i] = want
            } else if layer.contents != nil {
                layer.contents = nil
                pdfRenderedScale[i] = nil
            }
        }
        CATransaction.commit()
    }

    private func shape(_ path: CGPath, stroke: UIColor) -> CAShapeLayer {
        let s = CAShapeLayer()
        s.frame = CGRect(origin: .zero, size: PageGeometry.pageSize)
        s.path = path
        s.strokeColor = stroke.cgColor
        s.fillColor = nil
        s.lineWidth = PaperPattern.lineWidth
        return s
    }

    // MARK: Pages

    var currentPage: Int {
        let z = max(canvas.zoomScale, 0.01)
        let midY = (canvas.contentOffset.y + canvas.bounds.height * 0.4) / z
        return PageGeometry.pageIndex(forY: midY, pageCount: pageCount)
    }

    func scrollToPage(_ index: Int, animated: Bool) {
        let z = canvas.zoomScale
        let y = PageGeometry.originY(ofPage: index) * z - canvas.contentInset.top
        let maxY = max(canvas.contentSize.height + canvas.contentInset.bottom - canvas.bounds.height, -canvas.contentInset.top)
        canvas.setContentOffset(CGPoint(x: canvas.contentOffset.x, y: min(y, maxY)), animated: animated)
    }

    // MARK: Delegates

    func canvasViewDrawingDidChange(_ canvasView: PKCanvasView) {
        guard !applyingDrawing else { return }
        let drawing = canvasView.drawing
        onDrawingChanged?(drawing)
        let b = drawing.bounds
        if !b.isNull, !b.isEmpty,
           b.maxY > PageGeometry.originY(ofPage: pageCount - 1) + PageGeometry.height * 0.72 {
            onNeedsNewPage?()
        }
    }

    func scrollViewDidZoom(_ scrollView: UIScrollView) {
        updateContentSize()
    }

    func scrollViewDidEndZooming(_ scrollView: UIScrollView, with view: UIView?, atScale scale: CGFloat) {
        refreshPDFPictures()
    }

    func scrollViewDidScroll(_ scrollView: UIScrollView) {
        let p = currentPage
        if p != reportedPage {
            reportedPage = p
            onCurrentPageChanged?(p)
            refreshPDFPictures()
        }
    }

    nonisolated func toolPickerFramesObscuredDidChange(_ toolPicker: PKToolPicker) {
        MainActor.assumeIsolated { self.updateInsets() }
    }

    nonisolated func toolPickerVisibilityDidChange(_ toolPicker: PKToolPicker) {
        MainActor.assumeIsolated { self.updateInsets() }
    }
}

/// Draws a tick or a cross at the end of a line of writing, a short note beside a cross,
/// and the line as it should read in red under a wrong line.
@MainActor
enum RedPen {
    static let red = UIColor(red: 0.86, green: 0.13, blue: 0.11, alpha: 1)
    static let noteFont = UIFont(name: "Noteworthy-Bold", size: 21) ?? .systemFont(ofSize: 20, weight: .semibold)

    /// The red pen of one page, drawn into a page-sized context (thumbnails, PDF export).
    static func render(_ check: PageCheck?, in ctx: CGContext) {
        guard let check, !check.marks.isEmpty else { return }
        let page = CALayer()
        page.frame = CGRect(origin: .zero, size: PageGeometry.pageSize)
        draw(check.marks, into: page)
        page.render(in: ctx)
    }

    /// Every mark of one page. The correct line needs to see the other lines, to find the gap
    /// under the wrong line.
    static func draw(_ marks: [PageCheck.LineMark], into page: CALayer) {
        for m in marks { draw(m, others: marks.map(\.rect), into: page) }
    }

    private static let crossSize: CGFloat = 30

    private static func draw(_ m: PageCheck.LineMark, others: [CGRect], into page: CALayer) {
        let r = m.rect
        let size = crossSize
        let x = min(r.maxX + 12, PageGeometry.width - size - 8)
        let box = CGRect(x: x, y: r.midY - size / 2, width: size, height: size)
        let path = UIBezierPath()
        if m.mark == .tick {
            path.move(to: CGPoint(x: box.minX, y: box.midY + 1))
            path.addLine(to: CGPoint(x: box.minX + size * 0.36, y: box.maxY))
            path.addLine(to: CGPoint(x: box.maxX, y: box.minY))
        } else {
            path.move(to: CGPoint(x: box.minX + 3, y: box.minY + 3)); path.addLine(to: CGPoint(x: box.maxX - 3, y: box.maxY - 3))
            path.move(to: CGPoint(x: box.maxX - 3, y: box.minY + 3)); path.addLine(to: CGPoint(x: box.minX + 3, y: box.maxY - 3))
        }
        let shape = CAShapeLayer()
        shape.frame = CGRect(origin: .zero, size: PageGeometry.pageSize)
        shape.path = path.cgPath
        shape.strokeColor = red.cgColor
        shape.fillColor = nil
        shape.lineWidth = 3.2
        shape.lineCap = .round
        shape.lineJoin = .round
        page.addSublayer(shape)

        guard m.mark == .cross else { return }
        let correct = placeCorrect(m, others: others, besideX: box.maxX + 8)
        if let correct { page.addSublayer(correct.layer) }

        guard !m.note.isEmpty else { return }
        let note = text(m.note, font: noteFont)
        // Beside the cross when it fits, otherwise under the line (under the correct line when
        // that is there).
        var origin = CGPoint(x: box.maxX + 8, y: r.midY - note.height / 2)
        if correct?.beside == true || origin.x + note.width > PageGeometry.width - 12 {
            let below = correct.map { $0.beside ? r.maxY + 2 : $0.layer.frame.maxY } ?? r.maxY + 2
            origin = CGPoint(x: max(min(r.minX, PageGeometry.width - 12 - note.width), 12), y: below)
        }
        page.addSublayer(textLayer(note, at: origin))
    }

    /// The correct line, in the gap under the wrong line: as large as the gap allows (never
    /// smaller than readable). With no room under it, beside the cross; only when neither
    /// fits does it sit under the line at a readable size.
    private static func placeCorrect(_ m: PageCheck.LineMark, others: [CGRect], besideX: CGFloat)
        -> (layer: CATextLayer, beside: Bool)? {
        guard let s = m.correct?.trimmingCharacters(in: .whitespaces), !s.isEmpty else { return nil }
        let r = m.rect
        let maxWidth = PageGeometry.width - 24
        // The next line of writing that sits under this one (overlapping it left to right).
        let nextTop = others
            .filter { $0.minY > r.midY && $0.maxX > r.minX && $0.minX < r.maxX + 200 }
            .map(\.minY).min() ?? (PageGeometry.height - 16)
        let gap = nextTop - r.maxY
        let x = max(min(r.minX, PageGeometry.width - 12 - 40), 12)
        for size in stride(from: CGFloat(24), through: 15, by: -1) {
            let t = text(s, font: noteFont.withSize(size))
            if t.height <= gap - 1, x + t.width <= PageGeometry.width - 12 {
                return (textLayer(t, at: CGPoint(x: x, y: r.maxY + max((gap - t.height) / 2 - 2, 0))), false)
            }
        }
        let beside = text(s, font: noteFont)
        if besideX + beside.width <= PageGeometry.width - 12 {
            return (textLayer(beside, at: CGPoint(x: besideX, y: r.midY - beside.height / 2)), true)
        }
        let under = text(s, font: noteFont.withSize(18), maxWidth: maxWidth)
        return (textLayer(under, at: CGPoint(x: max(min(x, PageGeometry.width - 12 - under.width), 12), y: r.maxY + 1)), false)
    }

    private struct Text { var string: NSAttributedString; var width: CGFloat; var height: CGFloat }

    private static func text(_ s: String, font: UIFont, maxWidth: CGFloat = PageGeometry.width - 40) -> Text {
        let a = NSAttributedString(string: s, attributes: [.font: font, .foregroundColor: red])
        let size = a.boundingRect(with: CGSize(width: maxWidth, height: 400), options: [.usesLineFragmentOrigin], context: nil).integral.size
        return Text(string: a, width: size.width, height: size.height)
    }

    private static func textLayer(_ t: Text, at origin: CGPoint) -> CATextLayer {
        let l = CATextLayer()
        l.string = t.string
        l.isWrapped = true
        l.frame = CGRect(origin: origin, size: CGSize(width: t.width + 4, height: t.height + 2))
        return l
    }
}
