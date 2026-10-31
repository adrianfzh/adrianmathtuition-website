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
        // Keep the line art sharp at the current zoom.
        let scale = (window?.screen.scale ?? 2) * z
        for page in pageLayers {
            for sub in page.sublayers ?? [] { sub.contentsScale = scale }
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
