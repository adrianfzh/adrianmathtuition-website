import PDFKit
import PencilKit
import UIKit

enum PDFExporter {
    /// Writes the pages (paper or the imported PDF page, then ink) to a PDF in the temporary
    /// folder and returns its URL. An imported page stays sharp: it is copied as vectors, not a picture.
    @MainActor
    static func export(title: String, paper: PaperStyle, pages: [(PKDrawing, PDFPage?, PageCheck?)]) -> URL? {
        let pageRect = CGRect(origin: .zero, size: PageGeometry.pageSize)
        let safe = title.components(separatedBy: CharacterSet(charactersIn: "/\\:?%*|\"<>")).joined(separator: "-")
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent((safe.isEmpty ? "Notebook" : safe) + ".pdf")
        let format = UIGraphicsPDFRendererFormat()
        format.documentInfo = [kCGPDFContextTitle as String: title, kCGPDFContextCreator as String: AppBrand.name]
        let renderer = UIGraphicsPDFRenderer(bounds: pageRect, format: format)
        var result: URL?
        UITraitCollection(userInterfaceStyle: .light).performAsCurrent {
            do {
                try renderer.writePDF(to: url) { ctx in
                    for (drawing, pdfPage, check) in pages {
                        ctx.beginPage()
                        if let pdfPage {
                            PDFPages.draw(pdfPage, in: PDFPages.placement(for: PDFPages.displaySize(pdfPage)), context: ctx.cgContext)
                        } else {
                            PaperPattern.draw(paper, in: ctx.cgContext)
                        }
                        let ink = drawing.image(from: pageRect, scale: 3)
                        ink.draw(in: pageRect)
                        RedPen.render(check, in: ctx.cgContext)
                    }
                }
                result = url
            } catch {
                result = nil
            }
        }
        return result
    }
}

/// Opens the system share sheet (AirDrop, Save to Files, Mail…) for a file.
@MainActor
enum ShareSheet {
    static func present(_ url: URL) {
        guard let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first,
              let root = scene.keyWindow?.rootViewController else { return }
        var top = root
        while let next = top.presentedViewController { top = next }
        let vc = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        if let pop = vc.popoverPresentationController {
            pop.sourceView = top.view
            pop.sourceRect = CGRect(x: top.view.bounds.maxX - 60, y: top.view.safeAreaInsets.top + 8, width: 1, height: 1)
            pop.permittedArrowDirections = [.up]
        }
        top.present(vc, animated: true)
    }
}
