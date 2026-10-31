import PencilKit
import SwiftUI
import os

/// Owns one open notebook: its details, its ink per page, the canvas, and autosave.
@MainActor
@Observable
final class EditorController {
    private(set) var notebook: Notebook
    private(set) var pageDrawings: [PKDrawing]
    private(set) var currentPage = 0
    private(set) var canUndo = false
    private(set) var canRedo = false

    @ObservationIgnored private let store: NotebookStore
    @ObservationIgnored let documents: PDFDocuments
    @ObservationIgnored private weak var library: LibraryModel?
    @ObservationIgnored private(set) weak var canvasView: PaperCanvasView?
    @ObservationIgnored private var savedData: [UUID: Data] = [:]
    @ObservationIgnored private var saveTask: Task<Void, Never>?
    @ObservationIgnored private var dirty = false
    @ObservationIgnored private let log = Logger(subsystem: "com.adrianmath.notebook", category: "editor")

    init(notebook: Notebook, store: NotebookStore, library: LibraryModel?) {
        self.notebook = notebook
        self.store = store
        self.library = library
        documents = PDFDocuments(notebookID: notebook.id, store: store)
        var drawings: [PKDrawing] = []
        for page in notebook.pages {
            let data = (try? store.loadPageData(notebookID: notebook.id, pageID: page.id)) ?? nil
            if let data { savedData[page.id] = data }
            drawings.append(data.flatMap { try? PKDrawing(data: $0) } ?? PKDrawing())
        }
        pageDrawings = drawings
    }

    // MARK: Canvas

    func attach(_ view: PaperCanvasView) {
        canvasView = view
        view.documents = documents
        view.configure(drawing: PageInk.combine(pageDrawings), pageCount: notebook.pages.count,
                       paper: notebook.paper, backgrounds: backgrounds)
        view.onDrawingChanged = { [weak self] drawing in self?.drawingChanged(drawing) }
        view.onNeedsNewPage = { [weak self] in self?.addPage(scroll: false) }
        view.onCurrentPageChanged = { [weak self] page in self?.currentPage = page }
        NotificationCenter.default.addObserver(forName: .NSUndoManagerDidCloseUndoGroup, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.refreshUndo() }
        }
        refreshUndo()
    }

    private func drawingChanged(_ drawing: PKDrawing) {
        pageDrawings = PageInk.split(drawing, pageCount: notebook.pages.count)
        refreshUndo()
        scheduleSave()
    }

    func refreshUndo() {
        let um = canvasView?.canvas.undoManager
        canUndo = um?.canUndo ?? false
        canRedo = um?.canRedo ?? false
    }

    func undo() { canvasView?.canvas.undoManager?.undo(); refreshUndo() }
    func redo() { canvasView?.canvas.undoManager?.redo(); refreshUndo() }

    // MARK: Notebook details

    func rename(_ title: String) {
        let clean = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty, clean != notebook.title else { return }
        notebook.title = clean
        scheduleSave()
    }

    func setPaper(_ style: PaperStyle) {
        notebook.paper = style
        canvasView?.setPaper(style)
        scheduleSave()
    }

    // MARK: Pages

    func addPage(scroll: Bool = true, after index: Int? = nil) {
        let at = (index ?? notebook.pages.count - 1) + 1
        notebook.addPage(at: at)
        pageDrawings.insert(PKDrawing(), at: min(at, pageDrawings.count))
        reloadCanvas(keepUndo: at == notebook.pages.count - 1)
        if scroll { canvasView?.scrollToPage(at, animated: true) }
        scheduleSave()
    }

    func deletePage(at index: Int) {
        guard notebook.pages.indices.contains(index) else { return }
        notebook.removePage(id: notebook.pages[index].id)
        pageDrawings.remove(at: index)
        if pageDrawings.isEmpty { pageDrawings = [PKDrawing()] }
        reloadCanvas(keepUndo: false)
        scheduleSave()
    }

    func movePage(from source: Int, to destination: Int) {
        guard source != destination, pageDrawings.indices.contains(source) else { return }
        notebook.movePage(from: source, to: destination)
        let d = pageDrawings.remove(at: source)
        pageDrawings.insert(d, at: min(max(destination, 0), pageDrawings.count))
        reloadCanvas(keepUndo: false)
        scheduleSave()
    }

    /// Puts every page of a PDF in after `index` (default: the page on screen) and shows the first.
    func insertPDF(at url: URL, after index: Int? = nil) throws {
        let new = try PDFPages.importPDF(at: url, notebookID: notebook.id, store: store)
        let at = (index ?? currentPage) + 1
        let wasLoneBlank = notebook.pages.count == 1 && notebook.pages[0].background == nil && !pageHasInk(0)
        notebook.insertPages(new, at: at, replacingLoneBlank: wasLoneBlank)
        if wasLoneBlank {
            pageDrawings = new.map { _ in PKDrawing() }
        } else {
            pageDrawings.insert(contentsOf: new.map { _ in PKDrawing() }, at: min(at, pageDrawings.count))
        }
        reloadCanvas(keepUndo: false)
        let first = wasLoneBlank ? 0 : min(at, notebook.pages.count - 1)
        canvasView?.scrollToPage(first, animated: true)
        scheduleSave()
        saveNow()
    }

    var backgrounds: [PageBackground?] { notebook.pages.map(\.background) }

    func goToPage(_ index: Int) {
        canvasView?.scrollToPage(index, animated: false)
        currentPage = index
    }

    func pageHasInk(_ index: Int) -> Bool {
        pageDrawings.indices.contains(index) && !pageDrawings[index].strokes.isEmpty
    }

    private func reloadCanvas(keepUndo: Bool) {
        guard let v = canvasView else { return }
        v.setPages(count: notebook.pages.count, backgrounds: backgrounds)
        if !keepUndo {
            v.setDrawing(PageInk.combine(pageDrawings), clearUndo: true)
            refreshUndo()
        }
    }

    // MARK: Pictures

    func thumbnail(page index: Int, width: CGFloat) -> UIImage {
        let scale = width / PageGeometry.width
        let size = CGSize(width: width, height: PageGeometry.height * scale)
        let drawing = pageDrawings.indices.contains(index) ? pageDrawings[index] : PKDrawing()
        let paper = notebook.paper
        let pdfPage = notebook.pages.indices.contains(index) ? notebook.pages[index].background.flatMap(documents.page) : nil
        var image = UIImage()
        UITraitCollection(userInterfaceStyle: .light).performAsCurrent {
            let ink = drawing.image(from: CGRect(origin: .zero, size: PageGeometry.pageSize), scale: scale * 2)
            image = UIGraphicsImageRenderer(size: size).image { ctx in
                ctx.cgContext.scaleBy(x: scale, y: scale)
                if let pdfPage {
                    UIColor.white.setFill()
                    ctx.cgContext.fill(CGRect(origin: .zero, size: PageGeometry.pageSize))
                    PDFPages.draw(pdfPage, in: PDFPages.placement(for: PDFPages.displaySize(pdfPage)), context: ctx.cgContext)
                } else {
                    PaperPattern.draw(paper, in: ctx.cgContext)
                }
                ink.draw(in: CGRect(origin: .zero, size: PageGeometry.pageSize))
            }
        }
        return image
    }

    func exportPDF(pages indices: [Int]) -> URL? {
        let valid = indices.filter { pageDrawings.indices.contains($0) }
        return PDFExporter.export(title: notebook.title, paper: notebook.paper,
                                  pages: valid.map { (pageDrawings[$0], notebook.pages[$0].background.flatMap(documents.page)) })
    }

    // MARK: Saving

    func scheduleSave() {
        dirty = true
        saveTask?.cancel()
        saveTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(800))
            guard !Task.isCancelled else { return }
            self?.saveNow()
        }
    }

    func saveNow() {
        saveTask?.cancel()
        guard dirty else { return }
        dirty = false
        notebook.updatedAt = Date()
        do {
            for (page, drawing) in zip(notebook.pages, pageDrawings) {
                let data = drawing.dataRepresentation()
                if savedData[page.id] != data {
                    try store.savePageData(data, notebookID: notebook.id, pageID: page.id)
                    savedData[page.id] = data
                }
            }
            try store.saveNotebook(notebook)
            let live = Set(notebook.pages.map(\.id))
            savedData = savedData.filter { live.contains($0.key) }
            library?.didSave(notebook)
        } catch {
            dirty = true
            log.error("save failed: \(error.localizedDescription)")
        }
    }
}
